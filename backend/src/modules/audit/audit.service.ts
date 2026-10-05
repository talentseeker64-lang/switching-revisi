import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import type { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto.js';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListAuditLogsQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorType ? { actorType: query.actorType } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.correlationId ? { correlationId: query.correlationId } : {}),
      ...(query.endpoint ? { endpoint: { contains: query.endpoint, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data: items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async findOne(id: string) {
    const entry = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(`Audit log entry ${id} not found`);
    return entry;
  }
}
