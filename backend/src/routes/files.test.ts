// Set environment variables before importing modules
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';
process.env.RSA_PRIVATE_KEY_PATH = './test/key.pem';
process.env.UPLOAD_DIR = './test/uploads';
process.env.JWT_ACCESS_EXPIRES_IN = '900';
process.env.JWT_REFRESH_EXPIRES_IN = '604800';

import express, { Express } from 'express';
import { createFileRoutes } from './files';
import { IFileService } from '../services/interfaces/IFileService';
import { IAuthService, JwtPayload } from '../services/interfaces/IAuthService';
import { FileNotFoundError, ValidationError, ForbiddenError } from '../errors';
import { FileDashboardItem } from '@shadowvault/shared';

// Mock file service
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

// Mock auth service
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

// Helper to create a mock JWT payload
function createMockPayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    userId: 'user-123',
    email: 'test@example.com',
    isAdmin: false,
    jti: 'jti-123',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

// Helper to create a sample file dashboard item
function createMockFileDashboardItem(overrides: Partial<FileDashboardItem> = {}): FileDashboardItem {
  return {
    fileId: 'file-001',
    originalFilename: 'test-document.pdf',
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    downloadCount: 0,
    maxDownloads: 5,
    lastAccessedAt: null,
    status: 'active',
    shareToken: 'a'.repeat(128),
    encryptionStatus: 'encrypted',
    ...overrides,
  };
}

// Create a test app with the routes
function createTestApp(
  fileService: IFileService,
  authService: IAuthService
): Express {
  const app = express();
  app.use(express.json());
  const router = createFileRoutes(fileService, authService);
  app.use('/api/files', router);

  // Error handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    const statusCode = err.statusCode || 500;
    const errorCode = err.errorCode || 'INTERNAL_ERROR';
    res.status(statusCode).json({
      error: errorCode,
      message: err.message || 'An unexpected error occurred',
    });
  });

  return app;
}

// We need to use supertest-like approach with http
import http from 'http';

function makeRequest(
  app: Express,
  method: string,
  path: string,
  options: {
    body?: any;
    headers?: Record<string, string>;
    cookie?: string;
  } = {}
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        return reject(new Error('Could not get server address'));
      }

      const port = addr.port;
      const bodyStr = options.body ? JSON.stringify(options.body) : undefined;

      const reqOptions: http.RequestOptions = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...(bodyStr ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(bodyStr).toString() } : {}),
          ...(options.cookie ? { cookie: options.cookie } : {}),
          ...(options.headers || {}),
        },
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          server.close();
          try {
            const body = data ? JSON.parse(data) : {};
            resolve({
              status: res.statusCode || 500,
              body,
              headers: res.headers as Record<string, string>,
            });
          } catch {
            resolve({
              status: res.statusCode || 500,
              body: data,
              headers: res.headers as Record<string, string>,
            });
          }
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (bodyStr) {
        req.write(bodyStr);
      }
      req.end();
    });
  });
}

describe('File Routes', () => {
  let mockFileService: IFileService;
  let mockAuthService: IAuthService;
  let app: Express;

  beforeEach(() => {
    mockFileService = createMockFileService();
    mockAuthService = createMockAuthService({
      verifyAccessToken: jest.fn().mockResolvedValue(createMockPayload()),
    });
    app = createTestApp(mockFileService, mockAuthService);
  });

  describe('GET /api/files', () => {
    it('should return 401 when no authentication token is provided', async () => {
      const { status, body } = await makeRequest(app, 'GET', '/api/files');
      expect(status).toBe(401);
      expect(body.error).toBe('AUTH_FAILED');
    });

    it('should return list of files for authenticated user', async () => {
      const mockFiles = [
        createMockFileDashboardItem({ fileId: 'file-1' }),
        createMockFileDashboardItem({ fileId: 'file-2', originalFilename: 'photo.png' }),
      ];
      (mockFileService.listFilesForUser as jest.Mock).mockResolvedValue(mockFiles);

      const { status, body } = await makeRequest(app, 'GET', '/api/files', {
        cookie: 'access_token=valid-token',
      });

      expect(status).toBe(200);
      expect(body.files).toHaveLength(2);
      expect(body.files[0].fileId).toBe('file-1');
      expect(body.files[1].fileId).toBe('file-2');
      expect(mockFileService.listFilesForUser).toHaveBeenCalledWith('user-123');
    });

    it('should return empty array when user has no files', async () => {
      (mockFileService.listFilesForUser as jest.Mock).mockResolvedValue([]);

      const { status, body } = await makeRequest(app, 'GET', '/api/files', {
        cookie: 'access_token=valid-token',
      });

      expect(status).toBe(200);
      expect(body.files).toEqual([]);
    });
  });

  describe('GET /api/files/:fileId', () => {
    it('should return 401 when not authenticated', async () => {
      const { status, body } = await makeRequest(app, 'GET', '/api/files/file-001');
      expect(status).toBe(401);
      expect(body.error).toBe('AUTH_FAILED');
    });

    it('should return file details for a valid fileId owned by the user', async () => {
      const mockFile = createMockFileDashboardItem({ fileId: 'file-001' });
      (mockFileService.listFilesForUser as jest.Mock).mockResolvedValue([mockFile]);

      const { status, body } = await makeRequest(app, 'GET', '/api/files/file-001', {
        cookie: 'access_token=valid-token',
      });

      expect(status).toBe(200);
      expect(body.fileId).toBe('file-001');
      expect(body.originalFilename).toBe('test-document.pdf');
    });

    it('should return 404 when file does not belong to user', async () => {
      (mockFileService.listFilesForUser as jest.Mock).mockResolvedValue([]);

      const { status, body } = await makeRequest(app, 'GET', '/api/files/nonexistent', {
        cookie: 'access_token=valid-token',
      });

      expect(status).toBe(404);
      expect(body.error).toBe('FILE_NOT_FOUND');
    });
  });

  describe('DELETE /api/files/:fileId', () => {
    it('should return 401 when not authenticated', async () => {
      const { status, body } = await makeRequest(app, 'DELETE', '/api/files/file-001');
      expect(status).toBe(401);
      expect(body.error).toBe('AUTH_FAILED');
    });

    it('should delete a file successfully', async () => {
      (mockFileService.deleteFile as jest.Mock).mockResolvedValue(undefined);

      const { status, body } = await makeRequest(app, 'DELETE', '/api/files/file-001', {
        cookie: 'access_token=valid-token',
      });

      expect(status).toBe(200);
      expect(body.message).toBe('File deleted successfully');
      expect(mockFileService.deleteFile).toHaveBeenCalledWith('file-001', 'user-123');
    });

    it('should return 404 when file does not exist', async () => {
      (mockFileService.deleteFile as jest.Mock).mockRejectedValue(new FileNotFoundError());

      const { status, body } = await makeRequest(app, 'DELETE', '/api/files/nonexistent', {
        cookie: 'access_token=valid-token',
      });

      expect(status).toBe(404);
      expect(body.error).toBe('FILE_NOT_FOUND');
    });

    it('should return 403 when user does not own the file', async () => {
      (mockFileService.deleteFile as jest.Mock).mockRejectedValue(
        new ForbiddenError('Only the file owner or an admin can delete this file')
      );

      const { status, body } = await makeRequest(app, 'DELETE', '/api/files/file-other', {
        cookie: 'access_token=valid-token',
      });

      expect(status).toBe(403);
      expect(body.error).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/files/:fileId/revoke', () => {
    it('should return 401 when not authenticated', async () => {
      const { status, body } = await makeRequest(app, 'POST', '/api/files/file-001/revoke');
      expect(status).toBe(401);
      expect(body.error).toBe('AUTH_FAILED');
    });

    it('should revoke a share link successfully', async () => {
      const mockFile = createMockFileDashboardItem({
        fileId: 'file-001',
        shareToken: 'b'.repeat(128),
      });
      (mockFileService.listFilesForUser as jest.Mock).mockResolvedValue([mockFile]);
      (mockFileService.revokeShareLink as jest.Mock).mockResolvedValue(undefined);

      const { status, body } = await makeRequest(app, 'POST', '/api/files/file-001/revoke', {
        cookie: 'access_token=valid-token',
      });

      expect(status).toBe(200);
      expect(body.message).toBe('Share link revoked successfully');
      expect(mockFileService.revokeShareLink).toHaveBeenCalledWith('b'.repeat(128), 'user-123');
    });

    it('should return 404 when file is not found for the user', async () => {
      (mockFileService.listFilesForUser as jest.Mock).mockResolvedValue([]);

      const { status, body } = await makeRequest(app, 'POST', '/api/files/nonexistent/revoke', {
        cookie: 'access_token=valid-token',
      });

      expect(status).toBe(404);
      expect(body.error).toBe('FILE_NOT_FOUND');
    });

    it('should return 422 when no active share link exists', async () => {
      const mockFile = createMockFileDashboardItem({
        fileId: 'file-001',
        shareToken: '',
      });
      (mockFileService.listFilesForUser as jest.Mock).mockResolvedValue([mockFile]);

      const { status, body } = await makeRequest(app, 'POST', '/api/files/file-001/revoke', {
        cookie: 'access_token=valid-token',
      });

      expect(status).toBe(422);
      expect(body.error).toBe('VALIDATION_FAILED');
    });
  });
});
