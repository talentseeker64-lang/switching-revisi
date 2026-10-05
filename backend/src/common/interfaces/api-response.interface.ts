export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponseBody<T = unknown> {
  success: boolean;
  data: T | null;
  meta: Record<string, unknown>;
  error: ApiErrorBody | null;
  correlationId: string;
}
