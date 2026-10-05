import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { JobStatus, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { TransactionStateService } from '../transactions/transaction-state.service.js';
import { OrchestrationService } from '../orchestration/orchestration.service.js';
import { GATEWAY_CLIENT, type IGatewayClient } from '../gateway-client/gateway-client.interface.js';
import { ReconciliationService } from '../reconciliation/reconciliation.service.js';

/**
 * Background worker replacing a message broker (no Redis in this
 * environment - see docs/architecture.md §3): polls the DB-backed
 * `job_queue` table for retries, scans for transactions stuck past their
 * timeout window, and polls the Gateway for PENDING transactions as a
 * fallback to the webhook (also what drives the mock Gateway during local
 * dev/tests, see mock-gateway-client.service.ts).
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly pendingTimeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateService: TransactionStateService,
    private readonly orchestration: OrchestrationService,
    private readonly reconciliation: ReconciliationService,
    @Inject(GATEWAY_CLIENT) private readonly gatewayClient: IGatewayClient,
    config: ConfigService,
  ) {
    this.pendingTimeoutMs = config.get<number>('TRANSACTION_PENDING_TIMEOUT_MS', 60000);
  }

  @Cron('*/5 * * * * *')
  async processRetryQueue() {
    const dueJobs = await this.prisma.jobQueue.findMany({
      where: { type: 'RETRY_GATEWAY_CALL', status: JobStatus.PENDING, nextRunAt: { lte: new Date() } },
      orderBy: { nextRunAt: 'asc' },
      take: 20,
    });

    for (const job of dueJobs) {
      await this.prisma.jobQueue.update({ where: { id: job.id }, data: { status: JobStatus.PROCESSING } });
      const { transactionId } = job.payload as { transactionId: string };

      try {
        await this.orchestration.retryDispatch(transactionId);
        await this.prisma.jobQueue.update({ where: { id: job.id }, data: { status: JobStatus.DONE } });
      } catch (err) {
        this.logger.error(`Retry job ${job.id} for transaction ${transactionId} failed: ${(err as Error).message}`);
        await this.prisma.jobQueue.update({
          where: { id: job.id },
          data: { status: JobStatus.FAILED, lastError: (err as Error).message },
        });
      }
    }
  }

  @Cron('*/10 * * * * *')
  async scanStuckTransactions() {
    const threshold = new Date(Date.now() - this.pendingTimeoutMs);

    const stuck = await this.prisma.transaction.findMany({
      where: {
        status: { in: [TransactionStatus.PROCESSING, TransactionStatus.PENDING] },
        updatedAt: { lt: threshold },
      },
      select: { id: true, status: true },
    });

    for (const tx of stuck) {
      try {
        await this.stateService.transition(tx.id, tx.status, TransactionStatus.TIMEOUT, {
          reason: `No resolution within ${this.pendingTimeoutMs}ms; marked TIMEOUT by the timeout scanner`,
        });
        this.logger.warn(`Transaction ${tx.id} timed out from ${tx.status}`);
        await this.orchestration.scheduleRetryOrFail(tx.id);
      } catch (err) {
        this.logger.error(`Failed to time out transaction ${tx.id}: ${(err as Error).message}`);
      }
    }
  }

  @Cron('0 * * * *')
  async runScheduledReconciliation() {
    const result = await this.reconciliation.run(24);
    if (result.mismatched > 0) {
      this.logger.warn(`Reconciliation found ${result.mismatched} mismatch(es) out of ${result.checked} checked`);
    }
  }

  @Cron('*/5 * * * * *')
  async pollPendingGatewayTransactions() {
    const pending = await this.prisma.transaction.findMany({
      where: {
        status: TransactionStatus.PENDING,
        gatewayRequestId: { not: null },
      },
      select: { id: true, gatewayRequestId: true },
      take: 50,
    });

    for (const tx of pending) {
      try {
        const result = await this.gatewayClient.queryStatus(tx.gatewayRequestId!);
        await this.orchestration.applyGatewayStatus(tx.id, result);
      } catch (err) {
        this.logger.warn(`Gateway status poll failed for transaction ${tx.id}: ${(err as Error).message}`);
      }
    }
  }
}
