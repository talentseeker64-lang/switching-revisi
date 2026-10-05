import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service.js';
import { GatewayWebhookDto } from './dto/gateway-webhook.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { GatewayWebhookGuard } from './guards/gateway-webhook.guard.js';

@ApiTags('webhooks')
@ApiSecurity('partnerApiKey')
@Public()
@UseGuards(GatewayWebhookGuard)
@Controller('api/v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('gateway')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inbound status callback from the Blockchain Gateway' })
  handleGateway(@Body() dto: GatewayWebhookDto) {
    return this.webhooksService.handleGatewayWebhook(dto);
  }
}
