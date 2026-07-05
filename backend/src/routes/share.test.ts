// Set environment variables before importing modules
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';
process.env.RSA_PRIVATE_KEY_PATH = './test/key.pem';
process.env.UPLOAD_DIR = './test/uploads';
process.env.JWT_ACCESS_EXPIRES_IN = '900';
process.env.JWT_REFRESH_EXPIRES_IN = '604800';

import express, { Express } from 'express';
import http from 'http';
import { createShareRouter } from './share';
import { IFileService } from '../services/interfaces/IFileService';
import { TokenNotFoundError, LinkExpiredError, InvalidPasswordError, DownloadLimitReachedError } from '../errors';

// Mock rate limiter
jest.mock('../middleware/rateLimiter', () => ({
  shareDownloadRateLimiter: (
    _req: any,
    _res: any,
    next: any
  ) => next(),
}));

function makeRequest(
  app: Express,
  method: string,
  path: string,
  options: { headers?: Record<string, string> } = {}
): Promise<{ status: number; body: any; rawBody: Buffer; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        return reject(new Error('Could not get server address'));
      }
      const port = addr.port;
      const reqOptions: http.RequestOptions = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: options.headers || {},
      };
      const req = http.request(reqOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          server.close();
          const rawBody = Buffer.concat(chunks);
          let body: any;
          try {
            body = JSON.parse(rawBody.toString());
          } catch {
            body = rawBody;
          }
          resolve({
            status: res.statusCode || 500,
            body,
            rawBody,
            headers: res.headers as Record<string, string>,
          });
        });
      });
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      req.end();
    });
  });
}

function createMockFileService(overrides: Partial<IFileService> = {}): IFileService {
  return {
    uploadFile: jest.fn(),
    downloadFile: jest.fn(),
    listFilesForUser: jest.fn(),
    deleteFile: jest.fn(),
    revokeShareLink: jest.fn(),
    burnFile: jest.fn(),
    secureDelete: jest.fn(),
    ...overrides,
  };
}

describe('Share Router - GET /api/share/:token', () => {
  let app: Express;
  let mockFileService: IFileService;

  function createApp(fileService: IFileService): Express {
    const testApp = express();
    testApp.use('/api/share', createShareRouter(fileService));
    // Error handler
    testApp.use((err: any, _req: any, res: any, _next: any) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        error: err.errorCode || 'INTERNAL_ERROR',
        message: err.message,
      });
    });
    return testApp;
  }

  it('should download a file with valid token', async () => {
    const mockPlaintext = Buffer.from('Hello, World!');
    mockFileService = createMockFileService({
      downloadFile: jest.fn().mockResolvedValue({
        plaintext: mockPlaintext,
        originalFilename: 'test-file.pdf',
        mimeType: 'application/pdf',
      }),
    });
    app = createApp(mockFileService);

    const token = 'a'.repeat(128);
    const res = await makeRequest(app, 'GET', `/api/share/${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="test-file.pdf"');
    expect(res.headers['x-shadowvault-integrity']).toBe('verified');
    expect(res.headers['cache-control']).toBe('no-store, max-age=0');
    expect(res.rawBody.toString()).toBe('Hello, World!');
    expect(mockFileService.downloadFile).toHaveBeenCalledWith({
      token,
      password: undefined,
    });
  });

  it('should pass X-Share-Password header as password', async () => {
    const mockPlaintext = Buffer.from('Secret content');
    mockFileService = createMockFileService({
      downloadFile: jest.fn().mockResolvedValue({
        plaintext: mockPlaintext,
        originalFilename: 'secret.txt',
        mimeType: 'text/plain',
      }),
    });
    app = createApp(mockFileService);

    const token = 'b'.repeat(128);
    const res = await makeRequest(app, 'GET', `/api/share/${token}`, {
      headers: { 'X-Share-Password': 'mySecretPass123' },
    });

    expect(res.status).toBe(200);
    expect(mockFileService.downloadFile).toHaveBeenCalledWith({
      token,
      password: 'mySecretPass123',
    });
  });

  it('should return 404 for invalid token', async () => {
    mockFileService = createMockFileService({
      downloadFile: jest.fn().mockRejectedValue(new TokenNotFoundError()),
    });
    app = createApp(mockFileService);

    const res = await makeRequest(app, 'GET', '/api/share/invalid_token');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('TOKEN_NOT_FOUND');
  });

  it('should return 410 for expired link', async () => {
    mockFileService = createMockFileService({
      downloadFile: jest.fn().mockRejectedValue(new LinkExpiredError()),
    });
    app = createApp(mockFileService);

    const token = 'c'.repeat(128);
    const res = await makeRequest(app, 'GET', `/api/share/${token}`);

    expect(res.status).toBe(410);
    expect(res.body.error).toBe('LINK_EXPIRED');
  });

  it('should return 403 for invalid password', async () => {
    mockFileService = createMockFileService({
      downloadFile: jest.fn().mockRejectedValue(new InvalidPasswordError()),
    });
    app = createApp(mockFileService);

    const token = 'd'.repeat(128);
    const res = await makeRequest(app, 'GET', `/api/share/${token}`, {
      headers: { 'X-Share-Password': 'wrongPassword' },
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INVALID_SHARE_PASSWORD');
  });

  it('should return 403 when download limit is reached', async () => {
    mockFileService = createMockFileService({
      downloadFile: jest.fn().mockRejectedValue(new DownloadLimitReachedError()),
    });
    app = createApp(mockFileService);

    const token = 'f'.repeat(128);
    const res = await makeRequest(app, 'GET', `/api/share/${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('DOWNLOAD_LIMIT_REACHED');
  });
});
