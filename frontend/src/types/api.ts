// ─── API Error Types ─────────────────────────────────────────────────────────

/**
 * Standard error response from the ShadowVault backend.
 */
export interface ApiError {
  error: string;
  message: string;
  requestId?: string;
}

/**
 * Known backend error codes for typed error handling.
 */
export type ApiErrorCode =
  | 'AUTH_FAILED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'INVALID_SHARE_PASSWORD'
  | 'DOWNLOAD_LIMIT_REACHED'
  | 'TOKEN_NOT_FOUND'
  | 'FILE_NOT_FOUND'
  | 'TOKEN_REVOKED'
  | 'LINK_EXPIRED'
  | 'FILE_BURNED'
  | 'VALIDATION_FAILED'
  | 'FILE_TOO_LARGE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'UNKNOWN_ERROR';

/**
 * Terminal error codes for the share page that cannot be retried.
 */
export const TERMINAL_SHARE_ERRORS: readonly string[] = [
  'LINK_EXPIRED',
  'TOKEN_REVOKED',
  'FILE_BURNED',
  'DOWNLOAD_LIMIT_REACHED',
  'TOKEN_NOT_FOUND',
] as const;

// ─── API Response Wrappers ───────────────────────────────────────────────────

/**
 * Wrapper for successful API responses with a typed data payload.
 */
export interface ApiSuccessResponse<T> {
  data: T;
  status: number;
}

/**
 * Wrapper for failed API responses.
 */
export interface ApiErrorResponse {
  error: ApiError;
  status: number;
}

/**
 * Discriminated union representing any API call result.
 */
export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: ApiError; status: number };

/**
 * Network-level error (timeout, no connectivity).
 */
export interface NetworkError {
  type: 'network';
  message: string;
}

/**
 * Utility type guard to check if an error is a known API error code.
 */
export function isApiErrorCode(code: string): code is ApiErrorCode {
  const knownCodes: string[] = [
    'AUTH_FAILED',
    'TOKEN_EXPIRED',
    'FORBIDDEN',
    'INVALID_SHARE_PASSWORD',
    'DOWNLOAD_LIMIT_REACHED',
    'TOKEN_NOT_FOUND',
    'FILE_NOT_FOUND',
    'TOKEN_REVOKED',
    'LINK_EXPIRED',
    'FILE_BURNED',
    'VALIDATION_FAILED',
    'FILE_TOO_LARGE',
    'RATE_LIMIT_EXCEEDED',
    'UNKNOWN_ERROR',
  ];
  return knownCodes.includes(code);
}

/**
 * Check if a share error code is terminal (not retryable).
 */
export function isTerminalShareError(errorCode: string): boolean {
  return TERMINAL_SHARE_ERRORS.includes(errorCode);
}
