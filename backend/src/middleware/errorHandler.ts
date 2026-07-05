import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { logger } from '../lib/logger';

/**
 * Consistent error response shape returned by the API.
 * Requirements: 11.5, 5.2, 5.3, 5.4, 5.5
 */
interface ErrorResponse {
  error: string;
  message: string;
  requestId: string;
}

/**
 * Global error handler middleware.
 * Maps AppError subclasses to proper HTTP status codes and error envelope.
 * Logs unhandled errors with request ID via Pino.
 * Returns consistent ErrorResponse shape: { error, message, requestId }
 */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as any).id || 'unknown';

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.errorCode,
      message: err.message,
      requestId,
    } as ErrorResponse);
  } else {
    // Unknown error — log full stack, return generic message
    logger.error({ err, requestId }, 'Unhandled error');
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    } as ErrorResponse);
  }
}
