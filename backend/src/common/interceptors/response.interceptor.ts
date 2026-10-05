import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';
import type { ApiResponseBody } from '../interfaces/api-response.interface.js';

/**
 * Wraps every successful controller response in the project-wide envelope
 * (see docs/api-contract.md "Common API Response"). Controllers just return
 * plain data/DTOs; this interceptor adds success/meta/error/correlationId.
 */
@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponseBody<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponseBody<T>> {
    const req = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((payload) => {
        // Allow handlers (e.g. paginated list endpoints) to return
        // { data, meta } directly and still get enveloped correctly.
        const isShaped =
          payload &&
          typeof payload === 'object' &&
          'data' in (payload as Record<string, unknown>) &&
          'meta' in (payload as Record<string, unknown>);

        const data = isShaped
          ? (payload as unknown as { data: T }).data
          : (payload ?? null);
        const meta = isShaped
          ? (payload as unknown as { meta: Record<string, unknown> }).meta
          : {};

        return {
          success: true,
          data: data as T,
          meta,
          error: null,
          correlationId: req.correlationId,
        };
      }),
    );
  }
}
