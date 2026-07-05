import { Request, Response, NextFunction } from 'express';
import { IAuthService } from '../services/interfaces/IAuthService';
import { AuthError, ForbiddenError } from '../errors';

/**
 * Extend Express Request to include authenticated user info.
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        isAdmin: boolean;
        jti: string;
      };
    }
  }
}

/**
 * Parse cookies from the Cookie header string.
 * Returns a key-value map of cookie name to cookie value.
 */
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.split('=');
    const trimmedName = name?.trim();
    if (trimmedName) {
      cookies[trimmedName] = decodeURIComponent(rest.join('=').trim());
    }
  });

  return cookies;
}

/**
 * Authentication middleware factory.
 * Extracts JWT from HTTP-only cookie named 'access_token',
 * verifies it using authService.verifyAccessToken,
 * and attaches the user payload to req.user.
 *
 * Requirements: 2.5, 13.5
 */
export function authenticate(authService: IAuthService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract token from cookie named 'access_token'
      // Support both cookie-parser (req.cookies) and raw header parsing
      const cookies = req.cookies || parseCookies(req.headers.cookie);
      const token = cookies?.access_token;

      if (!token) {
        throw new AuthError('No authentication token provided');
      }

      // Verify the token (checks signature, expiry, JTI revocation)
      const payload = await authService.verifyAccessToken(token);

      // Attach user info to request
      req.user = {
        userId: payload.userId,
        email: payload.email,
        isAdmin: payload.isAdmin,
        jti: payload.jti,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Admin authorization middleware.
 * Must be used AFTER authenticate middleware.
 * Checks that the authenticated user has admin privileges.
 * Rejects with 403 ForbiddenError if user is not an admin.
 *
 * Requirements: 10.3
 */
export function adminMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user || !req.user.isAdmin) {
    return next(new ForbiddenError('Admin access required'));
  }
  next();
}
