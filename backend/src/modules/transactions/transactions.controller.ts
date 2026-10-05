import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { TransactionsService } from './transactions.service.js';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('transactions (dashboard)')
@ApiBearerAuth('jwt')
@Controller('api/v1/transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Search/monitor transactions across all partners' })
  findAll(@Query() query: ListTransactionsQueryDto) {
    return this.transactionsService.findAllForDashboard(query);
  }

  @Get('by-reference/:switchingTransactionId')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get transaction detail incl. status history and routing' })
  findOne(@Param('switchingTransactionId') switchingTransactionId: string) {
    return this.transactionsService.findOneForDashboard(switchingTransactionId);
  }
}
