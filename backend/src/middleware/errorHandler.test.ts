import { Request, Response, NextFunction } from 'express';
import { globalErrorHandler } from './errorHandler';
import {
  AppError,
  AuthError,
  ForbiddenError,
  ValidationError,
  FileTooLargeError,
  LinkExpiredError,
  TokenRevokedError,
  DownloadLimitReachedError,
  InvalidPasswordError,
  CryptoIntegrityError,
  RateLimitError,
} from '../errors';

// Mock the logger to prevent console output during tests
jest.mock('../lib/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

function createMockReqResNext(requestId = 'test-request-id') {
  const req = {
    id: requestId,
    headers: {},
  } as unknown as Request;
  (req as any).id = requestId;

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;

  const next: NextFunction = jest.fn();

  return { req, res, next };
}

describe('globalErrorHandler', () => {
  it('should return the correct status code and error envelope for AppError subclasses', () => {
    const { req, res, next } = createMockReqResNext('req-123');
    const error = new AuthError('Invalid credentials');

    globalErrorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'AUTH_FAILED',
      message: 'Invalid credentials',
      requestId: 'req-123',
    });
  });

  it('should handle ForbiddenError with 403 status', () => {
    const { req, res, next } = createMockReqResNext('req-456');
    const error = new ForbiddenError('Admin access required');

    globalErrorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'FORBIDDEN',
      message: 'Admin access required',
      requestId: 'req-456',
    });
  });

  it('should handle ValidationError with 422 status', () => {
    const { req, res, next } = createMockReqResNext('req-789');
    const error = new ValidationError('Email is invalid');

    globalErrorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: 'VALIDATION_FAILED',
      message: 'Email is invalid',
      requestId: 'req-789',
    });
  });

  it('should handle FileTooLargeError with 413 status', () => {
    const { req, res, next } = createMockReqResNext();
    const error = new FileTooLargeError();

    globalErrorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: 'FILE_TOO_LARGE',
      message: 'File exceeds maximum upload size',
      requestId: 'test-request-id',
    });
  });

  it('should handle LinkExpiredError with 410 status', () => {
    const { req, res, next } = createMockReqResNext();
    const error = new LinkExpiredError();

    globalErrorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith({
      error: 'LINK_EXPIRED',
      message: 'Share link has expired',
      requestId: 'test-request-id',
    });
  });

  it('should handle TokenRevokedError with 410 status', () => {
    const { req, res, next } = createMockReqResNext();
    const error = new TokenRevokedError();

    globalErrorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith({
      error: 'TOKEN_REVOKED',
      message: 'Share token has been revoked',
      requestId: 'test-request-id',
    });
  });

  it('should handle DownloadLimitReachedError with 403 status', () => {
    const { req, res, next } = createMockReqResNext();
    const error = new DownloadLimitReachedError();

    globalErrorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'DOWNLOAD_LIMIT_REACHED',
      message: 'Download limit has been reached',
      requestId: 'test-request-id',
    });
  });

  it('should handle InvalidPasswordError with 403 status', () => {
    const { req, res, next } = createMockReqResNext();
    const error = new InvalidPasswordError();

    globalErrorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'INVALID_SHARE_PASSWORD',
      message: 'Invalid share link password',
      requestId: 'test-request-id',
    });
  });

  it('should handle RateLimitError with 429 status', () => {
    const { req, res, next } = createMockReqResNext();
    const error = new RateLimitError();

    globalErrorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded',
      requestId: 'test-request-id',
    });
  });

  it('should return 500 with INTERNAL_ERROR for unknown errors', () => {
    const { req, res, next } = createMockReqResNext('req-unknown');
    const error = new Error('Something went wrong internally');

    globalErrorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: 'req-unknown',
    });
  });

  it('should log unhandled errors via Pino logger', () => {
    const { logger } = require('../lib/logger');
    const { req, res, next } = createMockReqResNext('req-log');
    const error = new Error('Unexpected crash');

    globalErrorHandler(error, req, res, next);

    expect(logger.error).toHaveBeenCalledWith(
      { err: error, requestId: 'req-log' },
      'Unhandled error'
    );
  });

  it('should NOT log AppError instances', () => {
    const { logger } = require('../lib/logger');
    jest.clearAllMocks();
    const { req, res, next } = createMockReqResNext();
    const error = new AuthError('Bad token');

    globalErrorHandler(error, req, res, next);

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should use "unknown" as requestId when req.id is not set', () => {
    const req = { headers: {} } as unknown as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;
    const next: NextFunction = jest.fn();
    const error = new Error('no id');

    globalErrorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'unknown' })
    );
  });
});
