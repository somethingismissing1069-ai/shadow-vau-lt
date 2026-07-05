import express, { Express } from 'express';
import http from 'http';
import { healthRouter } from './health';

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

describe('Health Router - GET /api/health', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use('/api/health', healthRouter);
  });

  it('should return status ok with timestamp', async () => {
    const res = await makeRequest(app, 'GET', '/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
    // Verify timestamp is a valid ISO 8601 string
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  it('should not require authentication', async () => {
    // No auth headers or cookies provided
    const res = await makeRequest(app, 'GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
