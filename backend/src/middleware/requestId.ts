import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware that assigns a unique request ID to each incoming request.
 * Uses the X-Request-ID header if provided by the client, otherwise generates a UUID v4.
 * Sets the X-Request-ID response header so clients can correlate responses.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  (req as any).id = (req.headers['x-request-id'] as string) || uuidv4();
  res.setHeader('X-Request-ID', (req as any).id);
  next();
}
