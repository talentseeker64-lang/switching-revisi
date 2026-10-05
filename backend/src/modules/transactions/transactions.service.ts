import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, TransactionStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { generateSwitchingTransactionId } from '../../common/utils/transaction-id.util.js';
import { applyFieldMapping } from '../../common/utils/transform.util.js';
import { RoutingService } from '../routing/routing.service.js';
import { TransactionStateService } from './transaction-state.service.js';
import { TRANSACTION_ROUTED_EVENT } from './transaction.events.js';
import type { CreateTransactionDto } from './dto/create-transaction.dto.js';
import type { ListTransactionsQueryDto } from './dto/list-transactions-query.dto.js';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: RoutingService,
    private readonly stateService: TransactionStateService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Creates a transaction and synchronously runs it through
   * validation -> routing (Stage 2 scope). If a route is found, it's left
   * at PROCESSING for the orchestration layer (Stage 3) to actually dispatch
   * to the target service/Blockchain Gateway and carry it to its terminal
   * state. Idempotent per (partnerId, idempotencyKey): a replay returns the
   * original transaction unchanged rather than reprocessing it.
   */
  async create(partnerId: string, dto: CreateTransactionDto, idempotencyKey: string) {
    const existing = await this.prisma.transaction.findUnique({
      where: { partnerId_idempotencyKey: { partnerId, idempotencyKey } },
    });
    if (existing) {
      return existing;
    }

    let created;
    try {
      created = await this.prisma.transaction.create({
        data: {
          switchingTransactionId: generateSwitchingTransactionId(),
          businessTransactionId: dto.businessTransactionId,
          partnerId,
          transactionType: dto.transactionType,
          correlationId: randomUUID(),
          idempotencyKey,
          payload: dto.payload as Prisma.InputJsonValue,
          status: TransactionStatus.RECEIVED,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Race: another request with the same idempotency key created it first.
        const race = await this.prisma.transaction.findUnique({
          where: { partnerId_idempotencyKey: { partnerId, idempotencyKey } },
        });
        if (race) return race;
      }
      throw err;
    }

    return this.processNewTransaction(created.id, dto.payload, dto.transactionType, partnerId);
  }

  private async processNewTransaction(
    transactionId: string,
    payload: Record<string, unknown>,
    transactionType: string,
    partnerId: string,
  ) {
    await this.stateService.transition(transactionId, TransactionStatus.RECEIVED, TransactionStatus.VALIDATING);

    // Business validation beyond DTO shape checking: nothing further is
    // specified by the proposal for the MVP, so this stage currently only
    // confirms the payload survived VALIDATING - routing rules enforce the
    // rest. Extend here if/when concrete business rules are specified.
    await this.stateService.transition(transactionId, TransactionStatus.VALIDATING, TransactionStatus.ROUTING);

    const rule = await this.routing.findMatchingRule(transactionType, partnerId);

    if (!rule) {
      return this.stateService.transition(transactionId, TransactionStatus.ROUTING, TransactionStatus.FAILED, {
        reason: 'No active routing rule matched this transaction type/partner',
        errorCode: 'ROUTING_RULE_NOT_FOUND',
        errorMessage: `No active routing rule for transactionType=${transactionType}`,
      });
    }

    const fieldMapping = (rule.targetConfig as { fieldMapping?: Record<string, string> } | null)
      ?.fieldMapping;
    const transformedPayload = applyFieldMapping(payload, fieldMapping);

    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: { routingRuleId: rule.id, transformedPayload: transformedPayload as Prisma.InputJsonValue },
    });

    await this.stateService.transition(
      transactionId,
      TransactionStatus.ROUTING,
      TransactionStatus.PROCESSING,
      { reason: `Routed to ${rule.targetService} via rule "${rule.name}"` },
    );

    // Orchestration (Stage 3) picks this up via an event rather than a
    // direct module dependency, so TransactionsModule stays independent of
    // OrchestrationModule. emitAsync awaits the listener so the HTTP
    // response already reflects the dispatch outcome (PENDING/SUCCESS/
    // FAILED/TIMEOUT), not just PROCESSING.
    await this.events.emitAsync(TRANSACTION_ROUTED_EVENT, { transactionId });

    return this.prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
  }

  async findForPartner(partnerId: string, switchingTransactionId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { switchingTransactionId },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
    });

    if (!tx || tx.partnerId !== partnerId) {
      throw new NotFoundException(`Transaction ${switchingTransactionId} not found`);
    }

    return tx;
  }

  async getStatusForPartner(partnerId: string, switchingTransactionId: string) {
    const tx = await this.findForPartner(partnerId, switchingTransactionId);
    return {
      switchingTransactionId: tx.switchingTransactionId,
      status: tx.status,
      blockchainTxHash: tx.blockchainTxHash,
      errorCode: tx.errorCode,
      errorMessage: tx.errorMessage,
      updatedAt: tx.updatedAt,
    };
  }

  async findAllForDashboard(query: ListTransactionsQueryDto) {
    const where: Prisma.TransactionWhereInput = {
      ...(query.partnerId ? { partnerId: query.partnerId } : {}),
      ...(query.transactionType ? { transactionType: query.transactionType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { switchingTransactionId: { contains: query.search, mode: 'insensitive' } },
              { businessTransactionId: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { partner: { select: { id: true, code: true, name: true } } },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { data: items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async findOneForDashboard(switchingTransactionId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { switchingTransactionId },
      include: {
        partner: { select: { id: true, code: true, name: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        routingRule: { select: { id: true, name: true, targetService: true } },
      },
    });
    if (!tx) throw new NotFoundException(`Transaction ${switchingTransactionId} not found`);
    return tx;
  }

  /** Thrown by the controller layer when Idempotency-Key is missing. */
  static missingIdempotencyKey(): never {
    throw new AppException(
      'VALIDATION_ERROR',
      'Idempotency-Key header is required',
      HttpStatus.BAD_REQUEST,
    );
  }
}
