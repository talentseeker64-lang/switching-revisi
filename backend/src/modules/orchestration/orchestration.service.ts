import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { TransactionStateService } from '../transactions/transaction-state.service.js';
import {
  TRANSACTION_ROUTED_EVENT,
  type TransactionRoutedEvent,
} from '../transactions/transaction.events.js';
import {
  GATEWAY_CLIENT,
  type GatewayStatusResponse,
  type IGatewayClient,
} from '../gateway-client/gateway-client.interface.js';
import { mapGatewayStatus } from '../gateway-client/gateway-status.util.js';

const BLOCKCHAIN_GATEWAY_TARGET = 'BLOCKCHAIN_GATEWAY';
const TERMINAL_STATUSES: TransactionStatus[] = [
  TransactionStatus.SUCCESS,
  TransactionStatus.FAILED,
  TransactionStatus.CANCELLED,
];

type TransactionWithRule = Prisma.TransactionGetPayload<{ include: { routingRule: true } }>;

/**
 * Dispatches a routed (PROCESSING) transaction to its target - the
 * Blockchain Gateway, or a generic business-service endpoint if the routing
 * rule's `targetConfig.endpointUrl` names one. Also the single place that
 * applies a Gateway-reported status (from the webhook or the fallback
 * polling job) onto a transaction, so both paths share one mapping +
 * transition implementation.
 */
@Injectable()
export class OrchestrationService {
  private readonly logger = new Logger(OrchestrationService.name);
  private readonly gatewayTimeoutMs: number;
  private readonly retryBackoffBaseMs: number;
  private readonly retryMaxAttempts: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateService: TransactionStateService,
    @Inject(GATEWAY_CLIENT) private readonly gatewayClient: IGatewayClient,
    config: ConfigService,
  ) {
    this.gatewayTimeoutMs = config.get<number>('GATEWAY_TIMEOUT_MS', 10000);
    this.retryBackoffBaseMs = config.get<number>('RETRY_BACKOFF_BASE_MS', 5000);
    this.retryMaxAttempts = config.get<number>('RETRY_MAX_ATTEMPTS', 5);
  }

  /**
   * Listens for TransactionsService's "reached PROCESSING" event instead of
   * TransactionsModule importing OrchestrationModule directly - keeps the
   * two modules decoupled (see transactions.service.ts for why). The
   * emitter awaits this handler, so the partner's HTTP response already
   * reflects the dispatch outcome.
   */
  @OnEvent(TRANSACTION_ROUTED_EVENT)
  async handleTransactionRouted(event: TransactionRoutedEvent) {
    await this.dispatch(event.transactionId);
  }

  /** First dispatch attempt, called synchronously right after a transaction reaches PROCESSING. */
  async dispatch(transactionId: string) {
    const tx = await this.loadTx(transactionId);
    if (tx.status !== TransactionStatus.PROCESSING) return tx;
    return this.runTarget(tx);
  }

  /** Re-attempt for a transaction the retry job picked up off a TIMEOUT state. */
  async retryDispatch(transactionId: string) {
    const tx = await this.loadTx(transactionId);
    if (tx.status !== TransactionStatus.TIMEOUT) return tx;
    const reProcessing = await this.stateService.transition(
      transactionId,
      TransactionStatus.TIMEOUT,
      TransactionStatus.PROCESSING,
      { reason: 'Retry attempt' },
    );
    return this.runTarget({ ...tx, ...reProcessing });
  }

  /** Applies a Gateway-reported status, from either the inbound webhook or the polling fallback. */
  async applyGatewayStatus(transactionId: string, statusResponse: GatewayStatusResponse) {
    const tx = await this.loadTx(transactionId);
    if (TERMINAL_STATUSES.includes(tx.status)) return tx;

    const mapped = mapGatewayStatus(statusResponse.status);
    if (mapped === tx.status) return tx;

    if (statusResponse.blockchainTxHash) {
      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: { blockchainTxHash: statusResponse.blockchainTxHash },
      });
    }

    try {
      return await this.stateService.transition(transactionId, tx.status, mapped, {
        reason: `Blockchain Gateway reported status=${statusResponse.status}`,
        errorCode: statusResponse.status === 'failed' ? 'GATEWAY_REPORTED_FAILURE' : undefined,
        errorMessage: statusResponse.errorMessage ?? undefined,
      });
    } catch (err) {
      this.logger.warn(
        `Ignoring out-of-order gateway status "${statusResponse.status}" for transaction ${transactionId} currently in ${tx.status}: ${(err as Error).message}`,
      );
      return tx;
    }
  }

  private async runTarget(tx: TransactionWithRule) {
    if (!tx.routingRule) {
      return this.stateService.transition(tx.id, TransactionStatus.PROCESSING, TransactionStatus.FAILED, {
        reason: 'Transaction reached PROCESSING without a routing rule attached',
        errorCode: 'NO_ROUTING_RULE',
      });
    }

    return tx.routingRule.targetService === BLOCKCHAIN_GATEWAY_TARGET
      ? this.dispatchToGateway(tx)
      : this.dispatchToBusinessService(tx);
  }

  private async dispatchToGateway(tx: TransactionWithRule) {
    try {
      const result = await this.gatewayClient.submit({
        correlationId: tx.correlationId,
        idempotencyKey: tx.idempotencyKey,
        transactionType: tx.transactionType,
        payload: (tx.transformedPayload ?? tx.payload) as Record<string, unknown>,
      });

      await this.prisma.transaction.update({
        where: { id: tx.id },
        data: { gatewayRequestId: result.gatewayRequestId },
      });

      const mapped = mapGatewayStatus(result.status);
      if (mapped === TransactionStatus.PROCESSING) {
        return this.stateService.transition(tx.id, TransactionStatus.PROCESSING, TransactionStatus.PENDING, {
          reason: `Submitted to Blockchain Gateway (gatewayRequestId=${result.gatewayRequestId})`,
        });
      }

      return this.stateService.transition(tx.id, TransactionStatus.PROCESSING, mapped, {
        reason: `Blockchain Gateway responded synchronously with status=${result.status}`,
      });
    } catch (err) {
      await this.stateService.transition(tx.id, TransactionStatus.PROCESSING, TransactionStatus.TIMEOUT, {
        reason: `Blockchain Gateway submit failed or timed out: ${(err as Error).message}`,
        errorCode: 'GATEWAY_TIMEOUT',
        errorMessage: (err as Error).message,
      });
      await this.scheduleRetryOrFail(tx.id);
      return this.loadTx(tx.id);
    }
  }

  private async dispatchToBusinessService(tx: TransactionWithRule) {
    const targetConfig = tx.routingRule!.targetConfig as { endpointUrl?: string } | null;
    const endpointUrl = targetConfig?.endpointUrl;

    if (!endpointUrl) {
      return this.stateService.transition(tx.id, TransactionStatus.PROCESSING, TransactionStatus.SUCCESS, {
        reason: 'No external endpoint configured for this routing rule; marked complete',
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.gatewayTimeoutMs);

    try {
      const res = await fetch(endpointUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx.transformedPayload ?? tx.payload),
      });

      if (res.ok) {
        return this.stateService.transition(tx.id, TransactionStatus.PROCESSING, TransactionStatus.SUCCESS, {
          reason: `Business service ${endpointUrl} accepted (HTTP ${res.status})`,
        });
      }

      return this.stateService.transition(tx.id, TransactionStatus.PROCESSING, TransactionStatus.FAILED, {
        reason: `Business service ${endpointUrl} rejected the request`,
        errorCode: 'BUSINESS_SERVICE_ERROR',
        errorMessage: `HTTP ${res.status}`,
      });
    } catch (err) {
      await this.stateService.transition(tx.id, TransactionStatus.PROCESSING, TransactionStatus.TIMEOUT, {
        reason: `Business service ${endpointUrl} call failed or timed out: ${(err as Error).message}`,
        errorCode: 'BUSINESS_SERVICE_TIMEOUT',
        errorMessage: (err as Error).message,
      });
      await this.scheduleRetryOrFail(tx.id);
      return this.loadTx(tx.id);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Called once a transaction has just been transitioned to TIMEOUT (by a
   * failed dispatch attempt above, or by JobsService's stuck-transaction
   * scanner). Caps total retry attempts per transaction by counting its
   * prior RETRY_GATEWAY_CALL jobs - once exhausted, the transaction is
   * failed outright instead of enqueueing another attempt.
   */
  async scheduleRetryOrFail(transactionId: string) {
    const priorAttempts = await this.prisma.jobQueue.count({
      where: {
        type: 'RETRY_GATEWAY_CALL',
        payload: { path: ['transactionId'], equals: transactionId },
      },
    });

    if (priorAttempts >= this.retryMaxAttempts) {
      this.logger.warn(`Retry attempts exhausted for transaction ${transactionId}`);
      await this.stateService.transition(transactionId, TransactionStatus.TIMEOUT, TransactionStatus.FAILED, {
        reason: `Retry attempts exhausted (${this.retryMaxAttempts})`,
        errorCode: 'RETRY_EXHAUSTED',
      });
      return;
    }

    const attempt = priorAttempts + 1;
    await this.prisma.jobQueue.create({
      data: {
        type: 'RETRY_GATEWAY_CALL',
        payload: { transactionId },
        attempts: attempt,
        maxAttempts: this.retryMaxAttempts,
        nextRunAt: new Date(Date.now() + this.retryBackoffBaseMs * attempt),
      },
    });
  }

  private loadTx(transactionId: string): Promise<TransactionWithRule> {
    return this.prisma.transaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: { routingRule: true },
    });
  }
}
