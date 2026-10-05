import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { GATEWAY_CLIENT, type IGatewayClient } from '../gateway-client/gateway-client.interface.js';
import { mapGatewayStatus } from '../gateway-client/gateway-status.util.js';
import type { ListReconciliationQueryDto } from './dto/list-reconciliation-query.dto.js';

/**
 * Proposal §5.7/§5.9: reconciliation between the Switching System's own
 * transaction records and what the Blockchain Gateway reports. Does not
 * mutate transaction state itself (that's the webhook/polling job's job in
 * the orchestration module) - purely compares and records agreement/
 * disagreement so mismatches are visible and auditable.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(GATEWAY_CLIENT) private readonly gatewayClient: IGatewayClient,
  ) {}

  async run(windowHours: number) {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const candidates = await this.prisma.transaction.findMany({
      where: { gatewayRequestId: { not: null }, updatedAt: { gte: since } },
      select: { id: true, status: true, gatewayRequestId: true },
    });

    let matched = 0;
    let mismatched = 0;

    for (const tx of candidates) {
      try {
        const gatewayResult = await this.gatewayClient.queryStatus(tx.gatewayRequestId!);
        const expectedStatus = mapGatewayStatus(gatewayResult.status);
        const isMatch = expectedStatus === tx.status;

        await this.prisma.reconciliationRecord.create({
          data: {
            transactionId: tx.id,
            switchingStatus: tx.status,
            gatewayStatus: gatewayResult.status,
            matched: isMatch,
            notes: isMatch
              ? undefined
              : `Switching has ${tx.status}, Gateway reports ${gatewayResult.status} (expected ${expectedStatus})`,
          },
        });

        if (isMatch) {
          matched++;
        } else {
          mismatched++;
        }
      } catch (err) {
        this.logger.warn(`Reconciliation check failed for transaction ${tx.id}: ${(err as Error).message}`);
      }
    }

    return { checked: candidates.length, matched, mismatched };
  }

  async findAll(query: ListReconciliationQueryDto) {
    const where: Prisma.ReconciliationRecordWhereInput =
      query.matched !== undefined ? { matched: query.matched } : {};

    const [items, total] = await Promise.all([
      this.prisma.reconciliationRecord.findMany({
        where,
        orderBy: { checkedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          transaction: {
            select: { switchingTransactionId: true, partnerId: true, transactionType: true },
          },
        },
      }),
      this.prisma.reconciliationRecord.count({ where }),
    ]);

    return { data: items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }
}
