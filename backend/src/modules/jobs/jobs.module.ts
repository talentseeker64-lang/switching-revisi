import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { OrchestrationModule } from '../orchestration/orchestration.module.js';
import { GatewayClientModule } from '../gateway-client/gateway-client.module.js';
import { ReconciliationModule } from '../reconciliation/reconciliation.module.js';

@Module({
  imports: [TransactionsModule, OrchestrationModule, GatewayClientModule, ReconciliationModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
