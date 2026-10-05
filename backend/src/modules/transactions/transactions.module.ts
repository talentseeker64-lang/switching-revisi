import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller.js';
import { PartnerTransactionsController } from './partner-transactions.controller.js';
import { TransactionsService } from './transactions.service.js';
import { TransactionStateService } from './transaction-state.service.js';
import { RoutingModule } from '../routing/routing.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [RoutingModule, AuthModule],
  controllers: [TransactionsController, PartnerTransactionsController],
  providers: [TransactionsService, TransactionStateService],
  exports: [TransactionsService, TransactionStateService],
})
export class TransactionsModule {}
