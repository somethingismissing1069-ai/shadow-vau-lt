import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { EncryptionService } from '../services/EncryptionService';
import { authenticate } from '../middleware/authenticate';
import { authRateLimiter } from '../middleware/rateLimiter';
import { registerSchema, loginSchema } from '../validation';
import { ValidationError, AuthError } from '../errors';
import prisma from '../lib/prisma';

const router = Router();

// Instantiate services
const encryptionService = new EncryptionService();
const authService = new AuthService(prisma, encryptionService);

/**
 * Cookie configuration for HTTP-only secure cookies.
 * Requirement 13.5: Store JWT tokens in HTTP-only secure cookies.
 * 
 * Note: secure is disabled when ALLOW_INSECURE_COOKIES=true (for local Docker dev on http://localhost:3000)
 */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_COOKIES !== 'true',
  sameSite: 'lax' as const,
  path: '/',
};

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Helper to set auth cookies on the response.
 */
function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie('access_token', accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  res.cookie('refresh_token', refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

/**
 * Helper to clear auth cookies on the response.
 */
function clearAuthCookies(res: Response): void {
  res.clearCookie('access_token', COOKIE_OPTIONS);
  res.clearCookie('refresh_token', COOKIE_OPTIONS);
}

/**
 * Helper to parse cookies from raw Cookie header.
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

// Apply auth rate limiter to all auth routes
router.use(authRateLimiter);

/**
 * POST /api/auth/register
 * Register a new user account.
 * Requirements: 1.1, 1.6
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request body
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      throw new ValidationError(firstError?.message || 'Validation failed');
    }

    const { email, username, password } = parseResult.data;

    // Call AuthService.register
    const { accessToken, refreshToken } = await authService.register(email, username, password);

    // Set HTTP-only cookies
    setAuthCookies(res, accessToken, refreshToken);

    // Return success response
    res.status(201).json({
      message: 'Registration successful',
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and issue tokens.
 * Requirements: 2.1
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request body
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      throw new ValidationError(firstError?.message || 'Validation failed');
    }

    const { email, password } = parseResult.data;

    // Get IP and user agent from request
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Call AuthService.login
    const { accessToken, refreshToken } = await authService.login(email, password, ip, userAgent);

    // Set HTTP-only cookies
    setAuthCookies(res, accessToken, refreshToken);

    // Return success response
    res.status(200).json({
      message: 'Login successful',
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Revoke the current session.
 * Requirements: 2.4
 */
router.post('/logout', authenticate(authService), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AuthError('Not authenticated');
    }

    // Revoke session
    await authService.logout(req.user.jti, req.user.userId);

    // Clear cookies
    clearAuthCookies(res);

    res.status(200).json({
      message: 'Logout successful',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/refresh
 * Rotate access and refresh tokens.
 * Requirements: 2.6, 2.7
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Read refresh_token from cookie
    const cookies = req.cookies || parseCookies(req.headers.cookie);
    const refreshToken = cookies?.refresh_token;

    if (!refreshToken) {
      throw new AuthError('No refresh token provided');
    }

    // Call AuthService.refreshTokens
    const tokens = await authService.refreshTokens(refreshToken);

    // Set new cookies
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    res.status(200).json({
      message: 'Token refresh successful',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Return current authenticated user profile.
 * Requirements: 13.5
 */
router.get('/me', authenticate(authService), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AuthError('Not authenticated');
    }

    // Fetch full user profile from database
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        username: true,
        emailVerified: true,
        isAdmin: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      throw new AuthError('User not found');
    }

    res.status(200).json({
      user,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
