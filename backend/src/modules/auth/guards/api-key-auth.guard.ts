import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CredentialStatus, PartnerStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import { verifySecret } from '../../../common/utils/password.util.js';

/**
 * Authenticates partner-facing API calls (Merchant Transaction API etc.)
 * using an API key + secret pair, per proposal §9 "API key/token atau
 * mekanisme yang disepakati". HMAC request signing is documented in
 * docs/api-contract.md as a future hardening option, not implemented in the
 * MVP (bcrypt-hashed secrets can't be used to verify an HMAC signature
 * without storing the raw secret, which the project treats as a secret that
 * must never be stored in reversible form).
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const apiKey = req.header('x-api-key');
    const apiSecret = req.header('x-api-secret');

    if (!apiKey || !apiSecret) {
      throw new UnauthorizedException('Missing API credentials');
    }

    const credential = await this.prisma.apiCredential.findUnique({
      where: { apiKey },
      include: { partner: true },
    });

    if (!credential || credential.status !== CredentialStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid API credentials');
    }

    if (credential.partner.status !== PartnerStatus.ACTIVE) {
      throw new UnauthorizedException('Partner is not active');
    }

    const valid = await verifySecret(apiSecret, credential.apiSecretHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid API credentials');
    }

    req.partner = { partnerId: credential.partnerId, partnerCode: credential.partner.code };
    return true;
  }
}
