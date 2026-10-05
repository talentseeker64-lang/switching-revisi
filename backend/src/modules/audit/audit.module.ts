import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { AuditLogMiddleware } from './audit-log.middleware.js';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditLogMiddleware],
  exports: [AuditLogMiddleware],
})
export class AuditModule {}
