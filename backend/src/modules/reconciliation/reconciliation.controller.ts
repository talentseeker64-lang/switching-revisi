import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ReconciliationService } from './reconciliation.service.js';
import { ListReconciliationQueryDto } from './dto/list-reconciliation-query.dto.js';
import { RunReconciliationDto } from './dto/run-reconciliation.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('reconciliation')
@ApiBearerAuth('jwt')
@Roles(UserRole.ADMIN, UserRole.OPERATOR)
@Controller('api/v1/reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get()
  @ApiOperation({ summary: 'List reconciliation check results' })
  findAll(@Query() query: ListReconciliationQueryDto) {
    return this.reconciliationService.findAll(query);
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run a reconciliation pass against the Blockchain Gateway' })
  run(@Body() dto: RunReconciliationDto) {
    return this.reconciliationService.run(dto.windowHours);
  }
}
