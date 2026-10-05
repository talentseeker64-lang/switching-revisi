import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AuditActorType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';

declare module 'express' {
  interface Request {
    /** Set by AllExceptionsFilter so the audit entry can include the error message. */
    auditError?: string;
  }
}

const SKIP_PATHS = new Set(['/docs', '/docs-json', '/favicon.ico']);

/**
 * Writes one AuditLog row per request, on the Express `res.on('finish')`
 * event rather than as a NestInterceptor - interceptors run before the
 * framework actually finalizes the response status code (especially with
 * @HttpCode()), so 'finish' is the only point status/timing are guaranteed
 * accurate. Fire-and-forget: an audit-write failure must never fail the
 * request it's describing.
 */
@Injectable()
export class AuditLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuditLogMiddleware.name);

  constructor(private readonly prisma: PrismaService) {}

  use(req: Request, res: Response, next: NextFunction) {
    if (SKIP_PATHS.has(req.path) || req.path.startsWith('/docs')) {
      return next();
    }

    const startedAt = Date.now();

    res.on('finish', () => {
      const user = req.user as AuthenticatedUser | undefined;
      const actorType: AuditActorType = user
        ? AuditActorType.USER
        : req.partner
          ? AuditActorType.PARTNER
          : AuditActorType.SYSTEM;
      const actorId = user?.userId ?? req.partner?.partnerId ?? null;
      const routePath = req.route?.path ?? req.path;

      this.prisma.auditLog
        .create({
          data: {
            actorType,
            actorId,
            action: `${req.method} ${routePath}`,
            endpoint: routePath,
            method: req.method,
            requestId: req.requestId,
            correlationId: req.correlationId,
            ipAddress: req.ip,
            responseStatus: res.statusCode,
            durationMs: Date.now() - startedAt,
            errorMessage: req.auditError,
          },
        })
        .catch((err: Error) => {
          this.logger.error(`Failed to write audit log: ${err.message}`);
        });
    });

    next();
  }
}
