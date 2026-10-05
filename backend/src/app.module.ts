import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { envValidationSchema } from './config/env.validation.js';
import { PrismaModule } from './database/prisma.module.js';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './modules/auth/guards/roles.guard.js';
import { HealthModule } from './modules/health/health.module.js';
import { PartnersModule } from './modules/partners/partners.module.js';
import { RoutingModule } from './modules/routing/routing.module.js';
import { TransactionsModule } from './modules/transactions/transactions.module.js';
import { OrchestrationModule } from './modules/orchestration/orchestration.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuditLogMiddleware } from './modules/audit/audit-log.middleware.js';
import { MonitoringModule } from './modules/monitoring/monitoring.module.js';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        redact: ['req.headers.authorization', 'req.headers["x-api-secret"]'],
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    HealthModule,
    PartnersModule,
    RoutingModule,
    TransactionsModule,
    OrchestrationModule,
    WebhooksModule,
    JobsModule,
    AuditModule,
    MonitoringModule,
    ReconciliationModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware, AuditLogMiddleware).forRoutes('*');
  }
}
