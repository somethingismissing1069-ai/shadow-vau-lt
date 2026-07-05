import { Router, Request, Response, NextFunction } from 'express';
import { IAuditService } from '../services/interfaces/IAuditService';

/**
 * Create audit logs router for authenticated users.
 * GET /api/audit – Returns the authenticated user's own audit logs with pagination.
 * Authentication middleware must be applied before this router is mounted.
 *
 * Query parameters:
 *   - page (number, default 1)
 *   - limit (number, default 50, max 200)
 *
 * Requirements: 8.4
 */
export function createAuditRouter(auditService: IAuditService): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit as string, 10) || 50));

      const result = await auditService.getUserAuditLogs(userId, page, limit);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
