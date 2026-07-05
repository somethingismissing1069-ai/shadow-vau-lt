import { Router, Request, Response, NextFunction } from 'express';
import { IFileService } from '../services/interfaces/IFileService';
import { shareDownloadRateLimiter } from '../middleware/rateLimiter';
import { sanitizeFilename } from '../utils/sanitizeFilename';

/**
 * Create share download router.
 * GET /api/share/:token – Validate share link, decrypt file, stream to recipient.
 * Password (if link is protected) is sent via the X-Share-Password header.
 * No authentication required; rate limited to prevent abuse.
 *
 * Requirements: 5.1
 */
export function createShareRouter(fileService: IFileService): Router {
  const router = Router();

  // Apply share download rate limiter
  router.use(shareDownloadRateLimiter);

  router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.params;
      const password = req.headers['x-share-password'] as string | undefined;

      // Call fileService.downloadFile which handles:
      // - Token validation (exists, not expired, not revoked, download limit)
      // - Password verification if link is protected
      // - Decryption via EncryptionService
      // - Download count increment + audit event
      // - Burn-after-reading if applicable
      const result = await fileService.downloadFile({
        token,
        password,
      });

      // Sanitize filename for Content-Disposition header
      const safeFilename = sanitizeFilename(result.originalFilename);

      // Stream plaintext as attachment
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeFilename}"`
      );
      res.setHeader('Content-Length', result.plaintext.length.toString());
      res.setHeader('X-ShadowVault-Integrity', 'verified');
      res.setHeader('Cache-Control', 'no-store, max-age=0');

      res.status(200).send(result.plaintext);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
