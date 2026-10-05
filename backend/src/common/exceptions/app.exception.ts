import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base exception for business/domain errors that need a stable machine
 * readable `code` in the error envelope (docs/api-contract.md), distinct
 * from the generic HttpException the framework throws for things like
 * validation failures.
 */
export class AppException extends HttpException {
  public readonly code: string;

  constructor(
    code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: unknown,
  ) {
    super({ code, message, details }, status);
    this.code = code;
  }
}
