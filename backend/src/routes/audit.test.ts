import express, { Express } from 'express';
import http from 'http';
import { createAuditRouter } from './audit';
import { IAuditService } from '../services/interfaces/IAuditService';

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

describe('Audit Router - GET /api/audit', () => {
  function createApp(auditService: IAuditService): Express {
    const app = express();

    // Simulate authenticated user middleware
    app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
      (req as any).user = {
        userId: 'user-123',
        email: 'test@example.com',
        isAdmin: false,
        jti: 'jti-123',
      };
      next();
    });

    app.use('/api/audit', createAuditRouter(auditService));

    // Error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.statusCode || 500).json({
        error: err.errorCode || 'INTERNAL_ERROR',
        message: err.message,
      });
    });

    return app;
  }

  it('should return user audit logs with default pagination', async () => {
    const mockLogs = {
      logs: [
        {
          id: 'log-1',
          fileId: 'file-1',
          userId: 'user-123',
          eventType: 'UPLOAD',
          ipAddress: '127.0.0.1',
          userAgent: 'test',
          metadata: {},
          createdAt: new Date('2024-01-01'),
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    };

    const mockAuditService: IAuditService = {
      recordEvent: jest.fn(),
      getUserAuditLogs: jest.fn().mockResolvedValue(mockLogs),
      getAdminAuditLogs: jest.fn(),
    };

    const app = createApp(mockAuditService);
    const res = await makeRequest(app, 'GET', '/api/audit');

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(50);
    expect(mockAuditService.getUserAuditLogs).toHaveBeenCalledWith('user-123', 1, 50);
  });

  it('should accept custom page and limit parameters', async () => {
    const mockAuditService: IAuditService = {
      recordEvent: jest.fn(),
      getUserAuditLogs: jest.fn().mockResolvedValue({
        logs: [],
        total: 0,
        page: 2,
        limit: 25,
      }),
      getAdminAuditLogs: jest.fn(),
    };

    const app = createApp(mockAuditService);
    const res = await makeRequest(app, 'GET', '/api/audit?page=2&limit=25');

    expect(res.status).toBe(200);
    expect(mockAuditService.getUserAuditLogs).toHaveBeenCalledWith('user-123', 2, 25);
  });

  it('should clamp limit to maximum 200', async () => {
    const mockAuditService: IAuditService = {
      recordEvent: jest.fn(),
      getUserAuditLogs: jest.fn().mockResolvedValue({
        logs: [],
        total: 0,
        page: 1,
        limit: 200,
      }),
      getAdminAuditLogs: jest.fn(),
    };

    const app = createApp(mockAuditService);
    const res = await makeRequest(app, 'GET', '/api/audit?limit=500');

    expect(res.status).toBe(200);
    expect(mockAuditService.getUserAuditLogs).toHaveBeenCalledWith('user-123', 1, 200);
  });

  it('should default page to 1 for invalid values', async () => {
    const mockAuditService: IAuditService = {
      recordEvent: jest.fn(),
      getUserAuditLogs: jest.fn().mockResolvedValue({
        logs: [],
        total: 0,
        page: 1,
        limit: 50,
      }),
      getAdminAuditLogs: jest.fn(),
    };

    const app = createApp(mockAuditService);
    const res = await makeRequest(app, 'GET', '/api/audit?page=-1');

    expect(res.status).toBe(200);
    expect(mockAuditService.getUserAuditLogs).toHaveBeenCalledWith('user-123', 1, 50);
  });
});
