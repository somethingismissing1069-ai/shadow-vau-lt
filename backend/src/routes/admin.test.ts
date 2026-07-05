import express, { Express } from 'express';
import http from 'http';
import { createAdminRouter } from './admin';
import { IAuditService } from '../services/interfaces/IAuditService';
import { IFileService } from '../services/interfaces/IFileService';
import { FileNotFoundError } from '../errors';


function makeRequest(
  app: Express,
  method: string,
  path: string,
  options: { headers?: Record<string, string> } = {}
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
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
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          server.close();
          try {
            resolve({
              status: res.statusCode || 500,
              body: data ? JSON.parse(data) : {},
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
      req.end();
    });
  });
}


describe('Admin Router', () => {
  const mockPrisma = {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  } as any;

  function createMockAuditService(): IAuditService {
    return {
      recordEvent: jest.fn(),
      getUserAuditLogs: jest.fn(),
      getAdminAuditLogs: jest.fn(),
    };
  }

  function createMockFileService(): IFileService {
    return {
      uploadFile: jest.fn(),
      downloadFile: jest.fn(),
      listFilesForUser: jest.fn(),
      deleteFile: jest.fn(),
      revokeShareLink: jest.fn(),
      burnFile: jest.fn(),
      secureDelete: jest.fn(),
    };
  }

  function createApp(
    auditService: IAuditService,
    fileService: IFileService
  ): Express {
    const app = express();
    app.use(express.json());
    // Simulate authenticated admin user
    app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
      (req as any).user = {
        userId: 'admin-user-123',
        email: 'admin@example.com',
        isAdmin: true,
        jti: 'jti-admin',
      };
      next();
    });
    app.use('/api/admin', createAdminRouter(mockPrisma, auditService, fileService));
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.statusCode || 500).json({
        error: err.errorCode || 'INTERNAL_ERROR',
        message: err.message,
      });
    });
    return app;
  }


  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/users', () => {
    it('should return all users with default pagination', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'user1@test.com',
          username: 'user1',
          emailVerified: false,
          isAdmin: false,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          lastLoginAt: null,
        },
      ];
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
      mockPrisma.user.count.mockResolvedValue(1);

      const auditSvc = createMockAuditService();
      const fileSvc = createMockFileService();
      const app = createApp(auditSvc, fileSvc);

      const res = await makeRequest(app, 'GET', '/api/admin/users');

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(50);
    });

    it('should support pagination parameters', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(100);

      const auditSvc = createMockAuditService();
      const fileSvc = createMockFileService();
      const app = createApp(auditSvc, fileSvc);

      const res = await makeRequest(app, 'GET', '/api/admin/users?page=3&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(3);
      expect(res.body.limit).toBe(10);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });
  });


  describe('GET /api/admin/audit', () => {
    it('should return all audit logs with default pagination', async () => {
      const mockResult = { logs: [], total: 0, page: 1, limit: 50 };
      const auditSvc = createMockAuditService();
      (auditSvc.getAdminAuditLogs as jest.Mock).mockResolvedValue(mockResult);
      const fileSvc = createMockFileService();
      const app = createApp(auditSvc, fileSvc);

      const res = await makeRequest(app, 'GET', '/api/admin/audit');

      expect(res.status).toBe(200);
      expect(auditSvc.getAdminAuditLogs).toHaveBeenCalledWith({}, 1, 50);
    });

    it('should pass eventType filter', async () => {
      const auditSvc = createMockAuditService();
      (auditSvc.getAdminAuditLogs as jest.Mock).mockResolvedValue({
        logs: [], total: 0, page: 1, limit: 50,
      });
      const fileSvc = createMockFileService();
      const app = createApp(auditSvc, fileSvc);

      const res = await makeRequest(app, 'GET', '/api/admin/audit?eventType=UPLOAD');

      expect(res.status).toBe(200);
      expect(auditSvc.getAdminAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'UPLOAD' }),
        1, 50
      );
    });

    it('should pass fileId and userId filters', async () => {
      const auditSvc = createMockAuditService();
      (auditSvc.getAdminAuditLogs as jest.Mock).mockResolvedValue({
        logs: [], total: 0, page: 1, limit: 50,
      });
      const fileSvc = createMockFileService();
      const app = createApp(auditSvc, fileSvc);

      const res = await makeRequest(app, 'GET', '/api/admin/audit?fileId=f1&userId=u1');

      expect(res.status).toBe(200);
      expect(auditSvc.getAdminAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ fileId: 'f1', userId: 'u1' }),
        1, 50
      );
    });
  });


  describe('DELETE /api/admin/files/:fileId', () => {
    it('should delete a file as admin', async () => {
      const auditSvc = createMockAuditService();
      const fileSvc = createMockFileService();
      (fileSvc.deleteFile as jest.Mock).mockResolvedValue(undefined);
      const app = createApp(auditSvc, fileSvc);

      const res = await makeRequest(app, 'DELETE', '/api/admin/files/file-123');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('File deleted successfully');
      expect(res.body.fileId).toBe('file-123');
      expect(fileSvc.deleteFile).toHaveBeenCalledWith('file-123', 'admin-user-123');
    });

    it('should return 404 for non-existent file', async () => {
      const auditSvc = createMockAuditService();
      const fileSvc = createMockFileService();
      (fileSvc.deleteFile as jest.Mock).mockRejectedValue(new FileNotFoundError());
      const app = createApp(auditSvc, fileSvc);

      const res = await makeRequest(app, 'DELETE', '/api/admin/files/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('FILE_NOT_FOUND');
    });
  });
});
