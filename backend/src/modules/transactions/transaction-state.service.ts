import { Injectable } from '@nestjs/common';
import { Prisma, TransactionStatus } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception.js';
import { HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

type PrismaTx = Prisma.TransactionClient;

/**
 * Single source of truth for legal Transaction status transitions
 * (docs/transaction-status-model.md). No other module writes
 * Transaction.status directly - everything goes through `transition()` so
 * the history log and the legality check can never be bypassed.
 */
const ALLOWED_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  RECEIVED: [TransactionStatus.VALIDATING, TransactionStatus.CANCELLED],
  VALIDATING: [
    TransactionStatus.ROUTING,
    TransactionStatus.FAILED,
    TransactionStatus.CANCELLED,
  ],
  ROUTING: [TransactionStatus.PROCESSING, TransactionStatus.FAILED, TransactionStatus.CANCELLED],
  PROCESSING: [
    TransactionStatus.PENDING,
    TransactionStatus.TIMEOUT,
    TransactionStatus.FAILED,
    TransactionStatus.SUCCESS,
    TransactionStatus.CANCELLED,
  ],
  PENDING: [
    TransactionStatus.SUCCESS,
    TransactionStatus.FAILED,
    TransactionStatus.TIMEOUT,
    TransactionStatus.CANCELLED,
  ],
  TIMEOUT: [
    TransactionStatus.PROCESSING,
    TransactionStatus.SUCCESS,
    TransactionStatus.FAILED,
    TransactionStatus.CANCELLED,
  ],
  SUCCESS: [],
  FAILED: [],
  CANCELLED: [],
};

@Injectable()
export class TransactionStateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Applies a status transition atomically: updates Transaction.status and
   * appends a TransactionStatusHistory row in one DB transaction. Pass an
   * existing `tx` client to compose with a caller that's already inside
   * `prisma.$transaction`.
   */
  async transition(
    transactionId: string,
    from: TransactionStatus,
    to: TransactionStatus,
    opts: { reason?: string; actor?: string; errorCode?: string; errorMessage?: string } = {},
    tx?: PrismaTx,
  ) {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new AppException(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition transaction from ${from} to ${to}`,
        HttpStatus.CONFLICT,
      );
    }

    const run = async (c: PrismaTx) => {
      const updated = await c.transaction.update({
        where: { id: transactionId },
        data: {
          status: to,
          ...(opts.errorCode !== undefined ? { errorCode: opts.errorCode } : {}),
          ...(opts.errorMessage !== undefined ? { errorMessage: opts.errorMessage } : {}),
        },
      });

      await c.transactionStatusHistory.create({
        data: {
          transactionId,
          fromStatus: from,
          toStatus: to,
          reason: opts.reason,
          actor: opts.actor ?? 'system',
        },
      });

      return updated;
    };

    return tx ? run(tx) : this.prisma.$transaction((trx) => run(trx));
  }
}
