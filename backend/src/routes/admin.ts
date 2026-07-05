import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { IAuditService, AuditEventType } from '../services/interfaces/IAuditService';
import { IFileService } from '../services/interfaces/IFileService';

/**
 * Create admin router.
 * All routes require authentication + admin middleware (applied before mount).
 *
 * Routes:
 *   GET  /api/admin/users          – List all users with pagination
 *   GET  /api/admin/audit          – All audit logs with filtering/pagination
 *   DELETE /api/admin/files/:fileId – Admin force delete
 *
 * Requirements: 8.5, 10.1, 10.2, 10.3
 */
export function createAdminRouter(
  prisma: PrismaClient,
  auditService: IAuditService,
  fileService: IFileService
): Router {
  const router = Router();

  /**
   * GET /api/admin/users
   * List all registered users with pagination.
   * Query params: page (default 1), limit (default 50, max 200)
   *
   * Requirement: 10.1
   */
  router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit as string, 10) || 50));
      const skip = (page - 1) * limit;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          select: {
            id: true,
            email: true,
            username: true,
            emailVerified: true,
            isAdmin: true,
            createdAt: true,
            updatedAt: true,
            lastLoginAt: true,
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.user.count(),
      ]);

      res.status(200).json({
        users,
        total,
        page,
        limit,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/admin/audit
   * All audit logs with optional filtering and pagination.
   * Query params:
   *   - eventType: filter by event type (UPLOAD, DOWNLOAD, etc.)
   *   - fileId: filter by file ID
   *   - userId: filter by user ID
   *   - startDate: filter by start date (ISO 8601)
   *   - endDate: filter by end date (ISO 8601)
   *   - page (default 1)
   *   - limit (default 50, max 200)
   *
   * Requirement: 8.5
   */
  router.get('/audit', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit as string, 10) || 50));

      // Build filters from query params
      const filters: {
        eventType?: AuditEventType;
        fileId?: string;
        userId?: string;
        startDate?: Date;
        endDate?: Date;
      } = {};

      if (req.query.eventType && typeof req.query.eventType === 'string') {
        filters.eventType = req.query.eventType as AuditEventType;
      }
      if (req.query.fileId && typeof req.query.fileId === 'string') {
        filters.fileId = req.query.fileId;
      }
      if (req.query.userId && typeof req.query.userId === 'string') {
        filters.userId = req.query.userId;
      }
      if (req.query.startDate && typeof req.query.startDate === 'string') {
        const startDate = new Date(req.query.startDate);
        if (!isNaN(startDate.getTime())) {
          filters.startDate = startDate;
        }
      }
      if (req.query.endDate && typeof req.query.endDate === 'string') {
        const endDate = new Date(req.query.endDate);
        if (!isNaN(endDate.getTime())) {
          filters.endDate = endDate;
        }
      }

      const result = await auditService.getAdminAuditLogs(filters, page, limit);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/admin/files/:fileId
   * Admin force delete a file.
   * Performs same secure deletion procedure as owner-initiated deletion.
   *
   * Requirement: 10.2
   */
  router.delete('/files/:fileId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fileId } = req.params;
      const adminUserId = req.user!.userId;

      await fileService.deleteFile(fileId, adminUserId);

      res.status(200).json({
        message: 'File deleted successfully',
        fileId,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
