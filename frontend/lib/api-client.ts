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

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const TOKEN_STORAGE_KEY = 'dss_access_token';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable (private browsing, etc.) - auth state just
    // won't persist across reloads. Not fatal.
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
}

export async function apiFetchEnvelope<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponseBody<T>> {
  const { body, skipAuth, headers, ...rest } = options;
  const token = skipAuth ? null : getStoredToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json().catch(() => null)) as ApiResponseBody<T> | null;

  if (!res.ok || !json || !json.success) {
    const error = json?.error;
    throw new ApiError(
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? `Request failed with status ${res.status}`,
      res.status,
      error?.details,
    );
  }

  return json;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const json = await apiFetchEnvelope<T>(path, options);
  return json.data as T;
}

/** Use for list endpoints where `meta` (pagination totals) is needed too. */
export async function apiFetchPaginated<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ items: T[]; meta: Record<string, unknown> }> {
  const json = await apiFetchEnvelope<T[]>(path, options);
  return { items: (json.data as T[]) ?? [], meta: json.meta };
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};
