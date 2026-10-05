import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { MonitoringService } from './monitoring.service.js';
import { DashboardSummaryQueryDto } from './dto/dashboard-summary-query.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('monitoring')
@ApiBearerAuth('jwt')
@Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER)
@Controller('api/v1/dashboard')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Dashboard summary metrics (traffic, transactions, partner/endpoint activity)' })
  getSummary(@Query() query: DashboardSummaryQueryDto) {
    return this.monitoringService.getSummary(query.windowHours);
  }
}
