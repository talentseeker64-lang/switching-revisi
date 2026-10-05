import { Injectable, NotFoundException } from '@nestjs/common';
import { CredentialStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { HttpStatus } from '@nestjs/common';
import { hashSecret } from '../../common/utils/password.util.js';
import { generateApiKey, generateApiSecret } from '../../common/utils/api-credential.util.js';
import type { CreatePartnerDto } from './dto/create-partner.dto.js';
import type { UpdatePartnerDto } from './dto/update-partner.dto.js';
import type { UpdatePartnerStatusDto } from './dto/update-partner-status.dto.js';
import type { ListPartnersQueryDto } from './dto/list-partners-query.dto.js';

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePartnerDto) {
    const existing = await this.prisma.partner.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new AppException('CONFLICT', `Partner code "${dto.code}" already exists`, HttpStatus.CONFLICT);
    }

    return this.prisma.partner.create({ data: dto });
  }

  async findAll(query: ListPartnersQueryDto) {
    const where: Prisma.PartnerWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.partner.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.partner.count({ where }),
    ]);

    return {
      data: items,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async findOne(id: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id },
      include: {
        credentials: {
          select: {
            id: true,
            apiKeyPrefix: true,
            status: true,
            createdAt: true,
            revokedAt: true,
          },
        },
      },
    });

    if (!partner) {
      throw new NotFoundException(`Partner ${id} not found`);
    }

    return partner;
  }

  async update(id: string, dto: UpdatePartnerDto) {
    await this.ensureExists(id);
    return this.prisma.partner.update({ where: { id }, data: dto });
  }

  async updateStatus(id: string, dto: UpdatePartnerStatusDto) {
    await this.ensureExists(id);
    return this.prisma.partner.update({ where: { id }, data: { status: dto.status } });
  }

  /** Returns the raw secret once - it is never retrievable again. */
  async issueCredential(partnerId: string) {
    await this.ensureExists(partnerId);

    const { apiKey, apiKeyPrefix } = generateApiKey();
    const apiSecret = generateApiSecret();
    const apiSecretHash = await hashSecret(apiSecret);

    const credential = await this.prisma.apiCredential.create({
      data: { partnerId, apiKey, apiKeyPrefix, apiSecretHash },
    });

    return {
      id: credential.id,
      apiKey,
      apiSecret,
      apiKeyPrefix,
      status: credential.status,
      createdAt: credential.createdAt,
    };
  }

  async revokeCredential(partnerId: string, credentialId: string) {
    const credential = await this.prisma.apiCredential.findUnique({
      where: { id: credentialId },
    });

    if (!credential || credential.partnerId !== partnerId) {
      throw new NotFoundException(`Credential ${credentialId} not found for this partner`);
    }

    return this.prisma.apiCredential.update({
      where: { id: credentialId },
      data: { status: CredentialStatus.REVOKED, revokedAt: new Date() },
    });
  }

  private async ensureExists(id: string) {
    const partner = await this.prisma.partner.findUnique({ where: { id } });
    if (!partner) {
      throw new NotFoundException(`Partner ${id} not found`);
    }
    return partner;
  }
}
