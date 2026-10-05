import { Injectable } from '@nestjs/common';
import { TransactionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';

/**
 * Dashboard Summary API. Metrics are deliberately limited to exactly what
 * proposal §5.6/§10 names (traffic, transaction volume, success/failed/
 * pending, partner activity, endpoint activity, error rate, latency) - no
 * KPI definitions invented beyond that list (master-task E3-11).
 */
@Injectable()
export class MonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(windowHours: number) {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const [
      totalRequests,
      errorRequests,
      latencyAgg,
      transactionTotal,
      transactionsByStatus,
      partnerActivity,
      endpointActivity,
    ] = await Promise.all([
      this.prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
      this.prisma.auditLog.count({ where: { createdAt: { gte: since }, responseStatus: { gte: 400 } } }),
      this.prisma.auditLog.aggregate({
        where: { createdAt: { gte: since }, durationMs: { not: null } },
        _avg: { durationMs: true },
      }),
      this.prisma.transaction.count({ where: { createdAt: { gte: since } } }),
      this.prisma.transaction.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['partnerId'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        orderBy: { _count: { partnerId: 'desc' } },
        take: 10,
      }),
      this.prisma.auditLog.groupBy({
        by: ['endpoint', 'method'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        orderBy: { _count: { endpoint: 'desc' } },
        take: 10,
      }),
    ]);

    const byStatus = Object.fromEntries(
      Object.values(TransactionStatus).map((status) => [status, 0]),
    ) as Record<TransactionStatus, number>;
    for (const row of transactionsByStatus) {
      byStatus[row.status] = row._count._all;
    }

    const partnerIds = partnerActivity.map((p) => p.partnerId);
    const partners = partnerIds.length
      ? await this.prisma.partner.findMany({
          where: { id: { in: partnerIds } },
          select: { id: true, code: true, name: true },
        })
      : [];
    const partnerById = new Map(partners.map((p) => [p.id, p]));

    return {
      windowHours,
      traffic: {
        totalRequests,
        errorRate: totalRequests > 0 ? errorRequests / totalRequests : 0,
        avgLatencyMs: latencyAgg._avg.durationMs ?? null,
      },
      transactions: {
        total: transactionTotal,
        byStatus,
      },
      partnerActivity: partnerActivity.map((p) => ({
        partnerId: p.partnerId,
        partnerCode: partnerById.get(p.partnerId)?.code ?? 'unknown',
        partnerName: partnerById.get(p.partnerId)?.name ?? 'unknown',
        transactionCount: p._count._all,
      })),
      endpointActivity: endpointActivity.map((e) => ({
        endpoint: e.endpoint,
        method: e.method,
        requestCount: e._count._all,
      })),
    };
  }
}
