import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiResponseBody } from '../interfaces/api-response.interface.js';

const DEFAULT_CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        code = typeof b.code === 'string' ? b.code : (DEFAULT_CODE_BY_STATUS[status] ?? 'ERROR');
        message = typeof b.message === 'string'
          ? b.message
          : Array.isArray(b.message)
            ? (b.message as string[]).join(', ')
            : exception.message;
        details = Array.isArray(b.message) ? b.message : b.details;
      }

      code = code === 'INTERNAL_ERROR' ? (DEFAULT_CODE_BY_STATUS[status] ?? 'ERROR') : code;
    } else {
      // Unknown/unhandled error: never leak internals to the client.
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
        undefined,
        'AllExceptionsFilter',
      );
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR && !(exception instanceof HttpException)) {
      message = 'An unexpected error occurred';
    }

    const body: ApiResponseBody = {
      success: false,
      data: null,
      meta: {},
      error: { code, message, ...(details ? { details } : {}) },
      correlationId: req.correlationId ?? 'unknown',
    };

    // Read by AuditLogMiddleware's res.on('finish') handler, which runs
    // after this filter has already sent the response.
    req.auditError = message;

    res.status(status).json(body);
  }
}
