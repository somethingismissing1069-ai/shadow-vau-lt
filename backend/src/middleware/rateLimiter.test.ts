import {
  globalRateLimiter,
  authRateLimiter,
  uploadRateLimiter,
  shareDownloadRateLimiter,
  passwordAttemptRateLimiter,
} from './rateLimiter';
import { RATE_LIMITS } from '../config/constants';
import { Request, Response, NextFunction } from 'express';

// Helper to create a mock request
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    ip: '127.0.0.1',
    headers: {},
    method: 'GET',
    url: '/test',
    path: '/test',
    originalUrl: '/test',
    app: { get: jest.fn().mockReturnValue(false) } as any,
    socket: { remoteAddress: '127.0.0.1' } as any,
    connection: { remoteAddress: '127.0.0.1' } as any,
    ...overrides,
  } as unknown as Request;
}

// Helper to create a mock response with status and json
function createMockResponse(): Response {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
  };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body: any) => {
    res.body = body;
    return res;
  });
  res.setHeader = jest.fn((name: string, value: string) => {
    res.headers[name.toLowerCase()] = value;
    return res;
  });
  res.set = jest.fn((name: string, value: string) => {
    res.headers[name.toLowerCase()] = value;
    return res;
  });
  res.header = jest.fn((name: string, value: string) => {
    res.headers[name.toLowerCase()] = value;
    return res;
  });
  res.getHeader = jest.fn((name: string) => res.headers[name.toLowerCase()]);
  res.end = jest.fn();
  res.send = jest.fn();
  return res as Response;
}

describe('Rate Limiting Middleware', () => {
  describe('Module exports', () => {
    it('should export globalRateLimiter as a function', () => {
      expect(typeof globalRateLimiter).toBe('function');
    });

    it('should export authRateLimiter as a function', () => {
      expect(typeof authRateLimiter).toBe('function');
    });

    it('should export uploadRateLimiter as a function', () => {
      expect(typeof uploadRateLimiter).toBe('function');
    });

    it('should export shareDownloadRateLimiter as a function', () => {
      expect(typeof shareDownloadRateLimiter).toBe('function');
    });

    it('should export passwordAttemptRateLimiter as a function', () => {
      expect(typeof passwordAttemptRateLimiter).toBe('function');
    });
  });

  describe('RATE_LIMITS constants verification', () => {
    it('should use global limit of 100 req/min', () => {
      expect(RATE_LIMITS.global.windowMs).toBe(60_000);
      expect(RATE_LIMITS.global.max).toBe(100);
    });

    it('should use auth limit of 10 attempts/15min', () => {
      expect(RATE_LIMITS.auth.windowMs).toBe(900_000);
      expect(RATE_LIMITS.auth.max).toBe(10);
    });

    it('should use upload limit of 20 uploads/hour', () => {
      expect(RATE_LIMITS.upload.windowMs).toBe(3_600_000);
      expect(RATE_LIMITS.upload.max).toBe(20);
    });

    it('should use share download limit of 5 downloads/min', () => {
      expect(RATE_LIMITS.shareDownload.windowMs).toBe(60_000);
      expect(RATE_LIMITS.shareDownload.max).toBe(5);
    });

    it('should use password attempt limit of 5 attempts/5min', () => {
      expect(RATE_LIMITS.passwordAttempt.windowMs).toBe(300_000);
      expect(RATE_LIMITS.passwordAttempt.max).toBe(5);
    });
  });

  describe('globalRateLimiter behavior', () => {
    it('should allow the first request through', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      let nextCalled = false;

      await new Promise<void>((resolve) => {
        globalRateLimiter(req, res, () => {
          nextCalled = true;
          resolve();
        });
      });

      expect(nextCalled).toBe(true);
      expect((res.status as jest.Mock)).not.toHaveBeenCalledWith(429);
    });

    it('should return 429 with RATE_LIMIT_EXCEEDED after exceeding limit', async () => {
      // Use a unique IP so it doesn't conflict with other tests
      const uniqueIp = `192.168.1.${Math.floor(Math.random() * 254) + 1}`;
      
      // Make max requests
      for (let i = 0; i < RATE_LIMITS.global.max; i++) {
        const req = createMockRequest({ ip: uniqueIp });
        const res = createMockResponse();
        await new Promise<void>((resolve) => {
          globalRateLimiter(req, res, () => resolve());
        });
      }

      // The next request should be rate limited
      const req = createMockRequest({ ip: uniqueIp });
      const res = createMockResponse();
      await new Promise<void>((resolve) => {
        globalRateLimiter(req, res, () => resolve());
        // Give the handler time to execute
        setTimeout(resolve, 10);
      });

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
        })
      );
    });
  });

  describe('authRateLimiter behavior', () => {
    it('should return 429 after exceeding auth limit (10 attempts)', async () => {
      const uniqueIp = `10.0.1.${Math.floor(Math.random() * 254) + 1}`;

      for (let i = 0; i < RATE_LIMITS.auth.max; i++) {
        const req = createMockRequest({ ip: uniqueIp });
        const res = createMockResponse();
        await new Promise<void>((resolve) => {
          authRateLimiter(req, res, () => resolve());
        });
      }

      const req = createMockRequest({ ip: uniqueIp });
      const res = createMockResponse();
      await new Promise<void>((resolve) => {
        authRateLimiter(req, res, () => resolve());
        setTimeout(resolve, 10);
      });

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'RATE_LIMIT_EXCEEDED',
        })
      );
    });
  });

  describe('shareDownloadRateLimiter behavior', () => {
    it('should return 429 after exceeding share download limit (5 downloads/min)', async () => {
      const uniqueIp = `10.0.2.${Math.floor(Math.random() * 254) + 1}`;

      for (let i = 0; i < RATE_LIMITS.shareDownload.max; i++) {
        const req = createMockRequest({ ip: uniqueIp });
        const res = createMockResponse();
        await new Promise<void>((resolve) => {
          shareDownloadRateLimiter(req, res, () => resolve());
        });
      }

      const req = createMockRequest({ ip: uniqueIp });
      const res = createMockResponse();
      await new Promise<void>((resolve) => {
        shareDownloadRateLimiter(req, res, () => resolve());
        setTimeout(resolve, 10);
      });

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'RATE_LIMIT_EXCEEDED',
        })
      );
    });
  });

  describe('passwordAttemptRateLimiter behavior', () => {
    it('should return 429 after exceeding password attempt limit (5 attempts/5min)', async () => {
      const uniqueIp = `10.0.3.${Math.floor(Math.random() * 254) + 1}`;

      for (let i = 0; i < RATE_LIMITS.passwordAttempt.max; i++) {
        const req = createMockRequest({ ip: uniqueIp });
        const res = createMockResponse();
        await new Promise<void>((resolve) => {
          passwordAttemptRateLimiter(req, res, () => resolve());
        });
      }

      const req = createMockRequest({ ip: uniqueIp });
      const res = createMockResponse();
      await new Promise<void>((resolve) => {
        passwordAttemptRateLimiter(req, res, () => resolve());
        setTimeout(resolve, 10);
      });

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'RATE_LIMIT_EXCEEDED',
        })
      );
    });
  });

  describe('uploadRateLimiter key generation', () => {
    it('should use userId as key when user is authenticated', async () => {
      const uniqueUserId = `user-${Date.now()}`;
      const req = createMockRequest({
        ip: '10.0.4.1',
      });
      (req as any).user = { userId: uniqueUserId };
      const res = createMockResponse();

      await new Promise<void>((resolve) => {
        uploadRateLimiter(req, res, () => resolve());
      });

      // Request should pass through (first request)
      expect((res.status as jest.Mock)).not.toHaveBeenCalledWith(429);
    });

    it('should return 429 after exceeding upload limit (20 uploads/hour)', async () => {
      const uniqueUserId = `user-upload-${Date.now()}`;

      for (let i = 0; i < RATE_LIMITS.upload.max; i++) {
        const req = createMockRequest({ ip: '10.0.4.2' });
        (req as any).user = { userId: uniqueUserId };
        const res = createMockResponse();
        await new Promise<void>((resolve) => {
          uploadRateLimiter(req, res, () => resolve());
        });
      }

      const req = createMockRequest({ ip: '10.0.4.2' });
      (req as any).user = { userId: uniqueUserId };
      const res = createMockResponse();
      await new Promise<void>((resolve) => {
        uploadRateLimiter(req, res, () => resolve());
        setTimeout(resolve, 10);
      });

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'RATE_LIMIT_EXCEEDED',
        })
      );
    });
  });

  describe('Error response format', () => {
    it('should include requestId in error response when set on request', async () => {
      const uniqueIp = `10.0.5.${Math.floor(Math.random() * 254) + 1}`;

      // Exhaust the password attempt limit
      for (let i = 0; i < RATE_LIMITS.passwordAttempt.max; i++) {
        const req = createMockRequest({ ip: uniqueIp });
        const res = createMockResponse();
        await new Promise<void>((resolve) => {
          passwordAttemptRateLimiter(req, res, () => resolve());
        });
      }

      // Next request with requestId
      const req = createMockRequest({ ip: uniqueIp });
      (req as any).id = 'test-request-id-abc';
      const res = createMockResponse();
      await new Promise<void>((resolve) => {
        passwordAttemptRateLimiter(req, res, () => resolve());
        setTimeout(resolve, 10);
      });

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
          requestId: 'test-request-id-abc',
        })
      );
    });

    it('should use "unknown" as requestId when not set on request', async () => {
      const uniqueIp = `10.0.6.${Math.floor(Math.random() * 254) + 1}`;

      // Exhaust the password attempt limit
      for (let i = 0; i < RATE_LIMITS.passwordAttempt.max; i++) {
        const req = createMockRequest({ ip: uniqueIp });
        const res = createMockResponse();
        await new Promise<void>((resolve) => {
          passwordAttemptRateLimiter(req, res, () => resolve());
        });
      }

      const req = createMockRequest({ ip: uniqueIp });
      const res = createMockResponse();
      await new Promise<void>((resolve) => {
        passwordAttemptRateLimiter(req, res, () => resolve());
        setTimeout(resolve, 10);
      });

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'unknown',
        })
      );
    });
  });
});
