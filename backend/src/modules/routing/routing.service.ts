import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import type { CreateRoutingRuleDto } from './dto/create-routing-rule.dto.js';
import type { UpdateRoutingRuleDto } from './dto/update-routing-rule.dto.js';
import type { ListRoutingRulesQueryDto } from './dto/list-routing-rules-query.dto.js';

@Injectable()
export class RoutingService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateRoutingRuleDto) {
    return this.prisma.routingRule.create({
      data: {
        name: dto.name,
        transactionType: dto.transactionType,
        partnerId: dto.partnerId,
        targetService: dto.targetService,
        targetConfig: dto.targetConfig as Prisma.InputJsonValue | undefined,
        priority: dto.priority,
        isActive: dto.isActive,
      },
    });
  }

  async findAll(query: ListRoutingRulesQueryDto) {
    const where: Prisma.RoutingRuleWhereInput = {
      ...(query.transactionType ? { transactionType: query.transactionType } : {}),
      ...(query.partnerId ? { partnerId: query.partnerId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.routingRule.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { partner: { select: { id: true, code: true, name: true } } },
      }),
      this.prisma.routingRule.count({ where }),
    ]);

    return { data: items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async findOne(id: string) {
    const rule = await this.prisma.routingRule.findUnique({
      where: { id },
      include: { partner: { select: { id: true, code: true, name: true } } },
    });
    if (!rule) throw new NotFoundException(`Routing rule ${id} not found`);
    return rule;
  }

  async update(id: string, dto: UpdateRoutingRuleDto) {
    await this.ensureExists(id);
    return this.prisma.routingRule.update({
      where: { id },
      data: {
        ...dto,
        targetConfig: dto.targetConfig as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.routingRule.delete({ where: { id } });
  }

  /**
   * Routing & Switching Engine core: picks the best-matching active rule for
   * a transaction. A rule scoped to this partner always outranks a
   * partner-agnostic one, regardless of priority value; among rules in the
   * same specificity tier, lower `priority` wins.
   */
  async findMatchingRule(transactionType: string, partnerId: string) {
    const candidates = await this.prisma.routingRule.findMany({
      where: {
        transactionType,
        isActive: true,
        OR: [{ partnerId }, { partnerId: null }],
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    if (candidates.length === 0) return null;

    const partnerSpecific = candidates.find((rule) => rule.partnerId === partnerId);
    return partnerSpecific ?? candidates[0];
  }

  private async ensureExists(id: string) {
    const rule = await this.prisma.routingRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException(`Routing rule ${id} not found`);
    return rule;
  }
}
