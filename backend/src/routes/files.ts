import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { IFileService } from '../services/interfaces/IFileService';
import { IAuthService } from '../services/interfaces/IAuthService';
import { authenticate } from '../middleware/authenticate';
import { uploadRateLimiter } from '../middleware/rateLimiter';
import { uploadSchema } from '../validation';
import { MAX_UPLOAD_BYTES } from '../config/constants';
import { ValidationError, FileNotFoundError, ForbiddenError } from '../errors';

/**
 * Creates the file routes router.
 * All routes require authentication. The upload endpoint additionally
 * applies rate limiting and multer for multipart file handling.
 *
 * Routes:
 *   POST   /upload       – multipart upload with multer, encrypt, store
 *   GET    /             – list own files
 *   GET    /:fileId      – file details
 *   DELETE /:fileId      – secure delete
 *   POST   /:fileId/revoke – revoke share link
 *
 * Requirements: 3.5, 9.1, 9.2, 9.3
 */
export function createFileRoutes(
  fileService: IFileService,
  authService: IAuthService
): Router {
  const router = Router();

  // Configure multer with memory storage and file size limit
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
    },
  });

  // All routes require authentication
  const auth = authenticate(authService);

  /**
   * POST /upload
   * Upload a file with multipart form data.
   * Encrypts the file and creates share link.
   *
   * Body fields (multipart/form-data):
   *   - file: The file to upload (binary)
   *   - expiresInSeconds: Expiry duration in seconds
   *   - downloadOnce: Whether file should be deleted after first download
   *   - burnAfterReading: Whether file should be burned after reading
   *   - password: Optional password for share link
   *   - maxDownloads: Optional max download count (-1 for unlimited)
   */
  router.post(
    '/upload',
    auth,
    uploadRateLimiter,
    upload.single('file'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Validate that a file was provided
        if (!req.file) {
          throw new ValidationError('No file provided in the upload request');
        }

        // Validate body fields using Zod schema
        const parseResult = uploadSchema.safeParse(req.body);
        if (!parseResult.success) {
          const errorMessage = parseResult.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ');
          throw new ValidationError(errorMessage);
        }

        const { expiresInSeconds, downloadOnce, burnAfterReading, password, maxDownloads } =
          parseResult.data;

        // Call FileService to handle upload
        const result = await fileService.uploadFile(
          {
            file: {
              buffer: req.file.buffer,
              originalname: req.file.originalname,
              mimetype: req.file.mimetype,
              size: req.file.size,
            },
            expiresInSeconds,
            downloadOnce,
            burnAfterReading,
            password,
            maxDownloads,
          },
          req.user!.userId
        );

        res.status(201).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /
   * List all files owned by the authenticated user.
   * Returns non-deleted files with status information.
   */
  router.get(
    '/',
    auth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const files = await fileService.listFilesForUser(req.user!.userId);
        res.status(200).json({ files });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /:fileId
   * Get details for a specific file.
   * Verifies that the requesting user owns the file.
   */
  router.get(
    '/:fileId',
    auth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { fileId } = req.params;
        const userId = req.user!.userId;

        // Get all files for the user and find the specific one
        const files = await fileService.listFilesForUser(userId);
        const file = files.find((f) => f.fileId === fileId);

        if (!file) {
          throw new FileNotFoundError('File not found or access denied');
        }

        res.status(200).json(file);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * DELETE /:fileId
   * Securely delete a file.
   * Only the file owner or an admin can delete files.
   */
  router.delete(
    '/:fileId',
    auth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { fileId } = req.params;
        await fileService.deleteFile(fileId, req.user!.userId);
        res.status(200).json({ message: 'File deleted successfully' });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /:fileId/revoke
   * Revoke the share link associated with a file.
   * Only the file owner or an admin can revoke share links.
   */
  router.post(
    '/:fileId/revoke',
    auth,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { fileId } = req.params;
        const userId = req.user!.userId;

        // Find the share link token for this file to pass to revokeShareLink
        const files = await fileService.listFilesForUser(userId);
        const file = files.find((f) => f.fileId === fileId);

        if (!file) {
          throw new FileNotFoundError('File not found or access denied');
        }

        if (!file.shareToken) {
          throw new ValidationError('No active share link found for this file');
        }

        await fileService.revokeShareLink(file.shareToken, userId);
        res.status(200).json({ message: 'Share link revoked successfully' });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
