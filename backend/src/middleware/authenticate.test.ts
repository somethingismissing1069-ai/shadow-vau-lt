// Set environment variables before importing modules
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';
process.env.RSA_PRIVATE_KEY_PATH = './test/key.pem';
process.env.UPLOAD_DIR = './test/uploads';
process.env.JWT_ACCESS_EXPIRES_IN = '900';
process.env.JWT_REFRESH_EXPIRES_IN = '604800';

import { Request, Response, NextFunction } from 'express';
import { authenticate, adminMiddleware } from './authenticate';
import { AuthError, ForbiddenError } from '../errors';
import { IAuthService, JwtPayload } from '../services/interfaces/IAuthService';

// Helper to create a mock request
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    cookies: undefined,
    user: undefined,
    ...overrides,
  } as unknown as Request;
}

// Helper to create a mock response
function createMockResponse(): Response {
  return {} as Response;
}

// Mock AuthService
function createMockAuthService(overrides: Partial<IAuthService> = {}): IAuthService {
  return {
    register: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    verifyAccessToken: jest.fn(),
    refreshTokens: jest.fn(),
    ...overrides,
  };
}

describe('authenticate middleware', () => {
  let mockAuthService: IAuthService;
  let mockNext: NextFunction;
  let mockRes: Response;

  beforeEach(() => {
    mockAuthService = createMockAuthService();
    mockNext = jest.fn();
    mockRes = createMockResponse();
  });

  it('should call next with AuthError when no cookie header is present', async () => {
    const req = createMockRequest({ headers: {} });
    const middleware = authenticate(mockAuthService);

    await middleware(req, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    const error = (mockNext as jest.Mock).mock.calls[0][0];
    expect(error).toBeInstanceOf(AuthError);
    expect(error.message).toBe('No authentication token provided');
  });

  it('should call next with AuthError when cookie header exists but no access_token cookie', async () => {
    const req = createMockRequest({
      headers: { cookie: 'other_cookie=value' },
    });
    const middleware = authenticate(mockAuthService);

    await middleware(req, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    const error = (mockNext as jest.Mock).mock.calls[0][0];
    expect(error).toBeInstanceOf(AuthError);
    expect(error.message).toBe('No authentication token provided');
  });

  it('should call next with AuthError when access_token cookie is empty', async () => {
    const req = createMockRequest({
      headers: { cookie: 'access_token=' },
    });
    const middleware = authenticate(mockAuthService);

    await middleware(req, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    const error = (mockNext as jest.Mock).mock.calls[0][0];
    expect(error).toBeInstanceOf(AuthError);
    expect(error.message).toBe('No authentication token provided');
  });

  it('should call next with error when verifyAccessToken throws AuthError (invalid token)', async () => {
    const req = createMockRequest({
      headers: { cookie: 'access_token=invalid-token-value' },
    });
    const authError = new AuthError('Token verification failed');
    (mockAuthService.verifyAccessToken as jest.Mock).mockRejectedValue(authError);

    const middleware = authenticate(mockAuthService);
    await middleware(req, mockRes, mockNext);

    expect(mockAuthService.verifyAccessToken).toHaveBeenCalledWith('invalid-token-value');
    expect(mockNext).toHaveBeenCalledTimes(1);
    const error = (mockNext as jest.Mock).mock.calls[0][0];
    expect(error).toBeInstanceOf(AuthError);
    expect(error.message).toBe('Token verification failed');
  });

  it('should call next with error when verifyAccessToken throws (revoked session)', async () => {
    const req = createMockRequest({
      headers: { cookie: 'access_token=revoked-token' },
    });
    const authError = new AuthError('Session has been revoked');
    (mockAuthService.verifyAccessToken as jest.Mock).mockRejectedValue(authError);

    const middleware = authenticate(mockAuthService);
    await middleware(req, mockRes, mockNext);

    expect(mockAuthService.verifyAccessToken).toHaveBeenCalledWith('revoked-token');
    expect(mockNext).toHaveBeenCalledTimes(1);
    const error = (mockNext as jest.Mock).mock.calls[0][0];
    expect(error).toBeInstanceOf(AuthError);
  });

  it('should attach user to request and call next() on valid token', async () => {
    const mockPayload: JwtPayload = {
      userId: 'user-123',
      email: 'user@example.com',
      isAdmin: false,
      jti: 'jti-abc-123',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    };
    (mockAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockPayload);

    const req = createMockRequest({
      headers: { cookie: 'access_token=valid-jwt-token' },
    });

    const middleware = authenticate(mockAuthService);
    await middleware(req, mockRes, mockNext);

    expect(mockAuthService.verifyAccessToken).toHaveBeenCalledWith('valid-jwt-token');
    expect(req.user).toEqual({
      userId: 'user-123',
      email: 'user@example.com',
      isAdmin: false,
      jti: 'jti-abc-123',
    });
    expect(mockNext).toHaveBeenCalledWith(); // called without error
  });

  it('should attach admin user to request when token has isAdmin=true', async () => {
    const mockPayload: JwtPayload = {
      userId: 'admin-456',
      email: 'admin@example.com',
      isAdmin: true,
      jti: 'jti-admin-456',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    };
    (mockAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockPayload);

    const req = createMockRequest({
      headers: { cookie: 'access_token=admin-jwt-token' },
    });

    const middleware = authenticate(mockAuthService);
    await middleware(req, mockRes, mockNext);

    expect(req.user).toEqual({
      userId: 'admin-456',
      email: 'admin@example.com',
      isAdmin: true,
      jti: 'jti-admin-456',
    });
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should parse access_token from cookie header with multiple cookies', async () => {
    const mockPayload: JwtPayload = {
      userId: 'user-789',
      email: 'multi@example.com',
      isAdmin: false,
      jti: 'jti-multi-789',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    };
    (mockAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockPayload);

    const req = createMockRequest({
      headers: { cookie: 'session_id=abc; access_token=multi-token; theme=dark' },
    });

    const middleware = authenticate(mockAuthService);
    await middleware(req, mockRes, mockNext);

    expect(mockAuthService.verifyAccessToken).toHaveBeenCalledWith('multi-token');
    expect(req.user!.userId).toBe('user-789');
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should use req.cookies when cookie-parser is available', async () => {
    const mockPayload: JwtPayload = {
      userId: 'user-cp',
      email: 'cp@example.com',
      isAdmin: false,
      jti: 'jti-cp',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    };
    (mockAuthService.verifyAccessToken as jest.Mock).mockResolvedValue(mockPayload);

    const req = createMockRequest({
      cookies: { access_token: 'cookie-parser-token' },
    } as any);

    const middleware = authenticate(mockAuthService);
    await middleware(req, mockRes, mockNext);

    expect(mockAuthService.verifyAccessToken).toHaveBeenCalledWith('cookie-parser-token');
    expect(req.user!.userId).toBe('user-cp');
    expect(mockNext).toHaveBeenCalledWith();
  });
});

describe('adminMiddleware', () => {
  let mockNext: NextFunction;
  let mockRes: Response;

  beforeEach(() => {
    mockNext = jest.fn();
    mockRes = createMockResponse();
  });

  it('should call next with ForbiddenError when req.user is not set', () => {
    const req = createMockRequest({ user: undefined });

    adminMiddleware(req, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    const error = (mockNext as jest.Mock).mock.calls[0][0];
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.message).toBe('Admin access required');
    expect(error.statusCode).toBe(403);
  });

  it('should call next with ForbiddenError when user is not admin', () => {
    const req = createMockRequest({
      user: {
        userId: 'user-123',
        email: 'user@example.com',
        isAdmin: false,
        jti: 'jti-123',
      },
    } as any);

    adminMiddleware(req, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    const error = (mockNext as jest.Mock).mock.calls[0][0];
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.message).toBe('Admin access required');
  });

  it('should call next() without error when user is admin', () => {
    const req = createMockRequest({
      user: {
        userId: 'admin-456',
        email: 'admin@example.com',
        isAdmin: true,
        jti: 'jti-admin',
      },
    } as any);

    adminMiddleware(req, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(); // called without error argument
  });
});
