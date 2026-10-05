import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GATEWAY_CLIENT } from './gateway-client.interface.js';
import { HttpGatewayClient } from './http-gateway-client.service.js';
import { MockGatewayClient } from './mock-gateway-client.service.js';

@Module({
  imports: [ConfigModule],
  providers: [
    HttpGatewayClient,
    MockGatewayClient,
    {
      provide: GATEWAY_CLIENT,
      inject: [ConfigService, HttpGatewayClient, MockGatewayClient],
      useFactory: (config: ConfigService, http: HttpGatewayClient, mock: MockGatewayClient) =>
        config.get<boolean>('GATEWAY_USE_MOCK', true) ? mock : http,
    },
  ],
  exports: [GATEWAY_CLIENT],
})
export class GatewayClientModule {}
