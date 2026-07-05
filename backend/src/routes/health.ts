import { Router, Request, Response } from 'express';

/**
 * Health check router.
 * GET /api/health – liveness probe (no auth required).
 * Returns status: 'ok' with current timestamp.
 *
 * Requirement: 18.4
 */
const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export { healthRouter };
