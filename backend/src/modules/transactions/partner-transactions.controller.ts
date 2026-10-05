import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard.js';
import { CurrentPartner, type AuthenticatedPartner } from '../../common/decorators/current-partner.decorator.js';

@ApiTags('transactions (partner)')
@ApiSecurity('partnerApiKey')
@ApiSecurity('partnerApiSecret')
@Public()
@UseGuards(ApiKeyAuthGuard)
@Controller('api/v1/transactions')
export class PartnerTransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Submit a transaction (Merchant Transaction API)' })
  create(
    @CurrentPartner() partner: AuthenticatedPartner,
    @Body() dto: CreateTransactionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      TransactionsService.missingIdempotencyKey();
    }
    return this.transactionsService.create(partner.partnerId, dto, idempotencyKey);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a transaction this partner submitted' })
  findOne(@CurrentPartner() partner: AuthenticatedPartner, @Param('id') id: string) {
    return this.transactionsService.findForPartner(partner.partnerId, id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get the status of a transaction this partner submitted' })
  getStatus(@CurrentPartner() partner: AuthenticatedPartner, @Param('id') id: string) {
    return this.transactionsService.getStatusForPartner(partner.partnerId, id);
  }
}
