import { Request, Response, NextFunction } from 'express';
import { requestIdMiddleware } from './requestId';

// Mock uuid to have deterministic tests
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'generated-uuid-1234'),
}));

describe('requestIdMiddleware', () => {
  function createMockReqRes(headers: Record<string, string> = {}) {
    const req = {
      headers,
    } as unknown as Request;

    const res = {
      setHeader: jest.fn(),
    } as unknown as Response;

    const next: NextFunction = jest.fn();

    return { req, res, next };
  }

  it('should generate a UUID when X-Request-ID header is not present', () => {
    const { req, res, next } = createMockReqRes();

    requestIdMiddleware(req, res, next);

    expect((req as any).id).toBe('generated-uuid-1234');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'generated-uuid-1234');
    expect(next).toHaveBeenCalled();
  });

  it('should use the X-Request-ID header value when provided', () => {
    const { req, res, next } = createMockReqRes({ 'x-request-id': 'client-provided-id' });

    requestIdMiddleware(req, res, next);

    expect((req as any).id).toBe('client-provided-id');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'client-provided-id');
    expect(next).toHaveBeenCalled();
  });

  it('should set the X-Request-ID response header', () => {
    const { req, res, next } = createMockReqRes();

    requestIdMiddleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', expect.any(String));
  });

  it('should always call next()', () => {
    const { req, res, next } = createMockReqRes();

    requestIdMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
