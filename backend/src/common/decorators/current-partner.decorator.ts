import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedPartner {
  partnerId: string;
  partnerCode: string;
}

/** Available on routes protected by ApiKeyAuthGuard (partner-facing APIs). */
export const CurrentPartner = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPartner => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.partner as AuthenticatedPartner;
  },
);

declare module 'express' {
  interface Request {
    partner?: AuthenticatedPartner;
  }
}
