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
 * Global rate limiter: 100 requests per minute per IP.
 * Applied to all routes.
 * Requirement 12.1
 */
export const globalRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.global.windowMs,
  max: RATE_LIMITS.global.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/**
 * Auth rate limiter: 10 attempts per 15 minutes per IP.
 * Applied to login/register routes to prevent brute-force attacks.
 * Requirement 12.2
 */
export const authRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.auth.windowMs,
  max: RATE_LIMITS.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/**
 * Upload rate limiter: 20 uploads per hour per authenticated user.
 * Uses authenticated user ID as key when available, falls back to IP.
 * Requirement 12.3
 */
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

/**
 * Share download rate limiter: 5 downloads per minute per IP.
 * Applied to share download endpoint to prevent abuse.
 * Requirement 12.4
 */
export const shareDownloadRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.shareDownload.windowMs,
  max: RATE_LIMITS.shareDownload.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/**
 * Password attempt rate limiter: 5 attempts per 5 minutes per IP.
 * Applied to password-protected share link access to prevent brute-force.
 * Requirement 12.5
 */
export const passwordAttemptRateLimiter = rateLimit({
  windowMs: RATE_LIMITS.passwordAttempt.windowMs,
  max: RATE_LIMITS.passwordAttempt.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
