import { Module } from '@nestjs/common';
import { OrchestrationService } from './orchestration.service.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { GatewayClientModule } from '../gateway-client/gateway-client.module.js';

@Module({
  imports: [TransactionsModule, GatewayClientModule],
  providers: [OrchestrationService],
  exports: [OrchestrationService],
})
export class OrchestrationModule {}
