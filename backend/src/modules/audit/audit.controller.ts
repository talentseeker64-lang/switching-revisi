import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuditService } from './audit.service.js';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('audit')
@ApiBearerAuth('jwt')
@Roles(UserRole.ADMIN, UserRole.OPERATOR)
@Controller('api/v1/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Search the audit trail' })
  findAll(@Query() query: ListAuditLogsQueryDto) {
    return this.auditService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one audit log entry' })
  findOne(@Param('id') id: string) {
    return this.auditService.findOne(id);
  }
}
