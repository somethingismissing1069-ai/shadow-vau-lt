import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pino from 'pino';
import { globalRateLimiter, authenticate, adminMiddleware } from './middleware';
import { authRouter, createShareRouter, createAuditRouter, createAdminRouter, healthRouter } from './routes';
import { AppError } from './errors';
import { EncryptionService } from './services/EncryptionService';
import { AuthService } from './services/AuthService';
import { AuditService } from './services/AuditService';
import { FileService } from './services/FileService';
import prisma from './lib/prisma';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));

// Global rate limiter
app.use(globalRateLimiter);

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Cache-Control: no-store on all API responses
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  next();
});

// Initialize services for route wiring
const encryptionService = new EncryptionService();
const authService = new AuthService(prisma, encryptionService);
const auditService = new AuditService(prisma);
const fileService = new FileService(prisma, encryptionService, auditService);

// Health check endpoint (no auth) – Requirement 18.4
app.use('/api/health', healthRouter);

// API Routes
app.use('/api/auth', authRouter);

// Share download (no auth, has its own rate limiter) – Requirement 5.1
app.use('/api/share', createShareRouter(fileService));

// User audit logs (authenticated) – Requirement 8.4
app.use('/api/audit', authenticate(authService), createAuditRouter(auditService));

// Admin routes (authenticated + admin) – Requirements 10.1, 10.2, 10.3, 8.5
app.use(
  '/api/admin',
  authenticate(authService),
  adminMiddleware,
  createAdminRouter(prisma, auditService, fileService)
);

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.errorCode,
      message: err.message,
      requestId: (req as any).id || 'unknown',
    });
  } else {
    logger.error({ err, requestId: (req as any).id }, 'Unhandled error');
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: (req as any).id || 'unknown',
    });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`ShadowVault API server running on port ${PORT}`);
});

export default app;
