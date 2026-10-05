import { Injectable, Logger } from '@nestjs/common';
import { Prisma, WebhookStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import { OrchestrationService } from '../orchestration/orchestration.service.js';
import type { GatewayWebhookDto } from './dto/gateway-webhook.dto.js';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestration: OrchestrationService,
  ) {}

  /**
   * Always acknowledges receipt (persists a WebhookEvent) even when no
   * matching transaction is found, rather than returning an HTTP error that
   * could make an upstream Gateway retry indefinitely for something that
   * will never resolve on our side. Unmatched/failed-to-apply events stay
   * inspectable via the WebhookEvent audit trail.
   */
  async handleGatewayWebhook(dto: GatewayWebhookDto) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { gatewayRequestId: dto.gatewayRequestId },
    });

    const webhookEvent = await this.prisma.webhookEvent.create({
      data: {
        source: 'BLOCKCHAIN_GATEWAY',
        eventType: 'status_update',
        payload: dto as unknown as Prisma.InputJsonValue,
        transactionId: transaction?.id,
        status: WebhookStatus.RECEIVED,
      },
    });

    if (!transaction) {
      this.logger.warn(`Webhook for unknown gatewayRequestId=${dto.gatewayRequestId}`);
      await this.prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: WebhookStatus.FAILED,
          errorMessage: 'No transaction found for this gatewayRequestId',
          processedAt: new Date(),
        },
      });
      return { received: true, applied: false };
    }

    try {
      await this.orchestration.applyGatewayStatus(transaction.id, {
        gatewayRequestId: dto.gatewayRequestId,
        status: dto.status,
        blockchainTxHash: dto.blockchainTxHash ?? null,
        errorMessage: dto.errorMessage ?? null,
      });

      await this.prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { status: WebhookStatus.PROCESSED, processedAt: new Date() },
      });
      return { received: true, applied: true };
    } catch (err) {
      await this.prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: WebhookStatus.FAILED,
          errorMessage: (err as Error).message,
          processedAt: new Date(),
        },
      });
      throw err;
    }
  }
}
