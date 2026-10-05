import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { GatewayWebhookGuard } from './guards/gateway-webhook.guard.js';
import { OrchestrationModule } from '../orchestration/orchestration.module.js';

@Module({
  imports: [OrchestrationModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, GatewayWebhookGuard],
})
export class WebhooksModule {}
