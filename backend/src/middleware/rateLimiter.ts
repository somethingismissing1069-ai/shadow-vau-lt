import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { RATE_LIMITS } from '../config/constants';

/**
 * Custom handler that returns proper error format when rate limit is exceeded.
 * Returns 429 RATE_LIMIT_EXCEEDED as specified in requirements.
 */
const rateLimitHandler = (req: Request, res: Response): void => {
  res.status(429).json({
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later',
    requestId: (req as any).id || 'unknown',
  });
};

/**
 * Global rate limiter: configurable per IP.
 * Can be disabled via DISABLE_RATE_LIMIT=true for development.
 * Applied to all routes.
 */
export const globalRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.global.windowMs,
  max: process.env.DISABLE_RATE_LIMIT === 'true' ? 0 : RATE_LIMITS.global.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
});

export const authRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.auth.windowMs,
  max: process.env.DISABLE_RATE_LIMIT === 'true' ? 0 : RATE_LIMITS.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
});

export const uploadRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.upload.windowMs,
  max: RATE_LIMITS.upload.max,
  keyGenerator: (req: Request): string => {
    return (req as any).user?.userId || req.ip || 'unknown';
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

export const shareDownloadRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.shareDownload.windowMs,
  max: RATE_LIMITS.shareDownload.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

export const passwordAttemptRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.passwordAttempt.windowMs,
  max: RATE_LIMITS.passwordAttempt.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
