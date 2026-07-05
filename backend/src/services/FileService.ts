import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import {
  IFileService,
  UploadFileParams,
  UploadFileResult,
  DownloadFileParams,
  DownloadFileResult,
} from './interfaces/IFileService';
import { IEncryptionService } from './interfaces/IEncryptionService';
import { IAuditService } from './interfaces/IAuditService';
import { FileDashboardItem } from '@shadowvault/shared';
import {
  FileTooLargeError,
  InvalidMimeTypeError,
  FileNotFoundError,
  ForbiddenError,
  TokenNotFoundError,
  TokenRevokedError,
  LinkExpiredError,
  DownloadLimitReachedError,
  InvalidPasswordError,
  FileBurnedError,
  ValidationError,
} from '../errors';
import {
  MAX_UPLOAD_BYTES,
  MAX_CUSTOM_EXPIRY_SECONDS,
  SHARE_TOKEN_BYTES,
} from '../config/constants';
import { config } from '../config';
import { sanitizeFilename } from '../utils/sanitizeFilename';

/**
 * Allowed MIME types for file upload.
 */
const ALLOWED_MIME_TYPES = new Set([
  // Documents
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-tar',
  'application/x-7z-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/json',
  'application/xml',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  // Video
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/ogg',
  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  // Text
  'text/plain',
  'text/csv',
  'text/html',
  'text/css',
  'text/javascript',
  'text/markdown',
  // Fonts
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/otf',
  // Generic binary
  'application/octet-stream',
]);

/** Minimum expiry duration in seconds */
const MIN_EXPIRY_SECONDS = 60;

/**
 * FileService implements file upload with encryption, download with decryption,
 * share link management, burn-after-reading semantics, and secure file deletion.
 */
export class FileService implements IFileService {
  private readonly prisma: PrismaClient;
  private readonly encryptionService: IEncryptionService;
  private readonly auditService: IAuditService;
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor(
    prisma: PrismaClient,
    encryptionService: IEncryptionService,
    auditService: IAuditService,
    uploadDir?: string,
    baseUrl?: string
  ) {
    this.prisma = prisma;
    this.encryptionService = encryptionService;
    this.auditService = auditService;
    this.uploadDir = uploadDir || config.UPLOAD_DIR;
    this.baseUrl = baseUrl || config.BASE_URL;
  }

  /**
   * Handle a validated multipart upload: encrypt, store, create DB records,
   * generate share link, emit audit event.
   *
   * Steps:
   * 1. Validate file size (≤100MB)
   * 2. Validate MIME type against allowed list
   * 3. Validate expiry duration (60s to 30 days)
   * 4. Sanitize filename
   * 5. Get owner's RSA public key from DB (or use provided recipientPublicKey)
   * 6. Encrypt file via EncryptionService
   * 7. Store ciphertext to disk
   * 8. Generate share token (64 random bytes → 128 hex chars)
   * 9. Create File/EncryptedKey/ShareLink/AuditLog records in single transaction
   * 10. Return shareUrl, token, expiresAt
   */
  async uploadFile(params: UploadFileParams, ownerId: string): Promise<UploadFileResult> {
    const { file, expiresInSeconds, downloadOnce, burnAfterReading, password, maxDownloads } = params;

    // 1. Validate file size
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new FileTooLargeError(
        `File size ${file.size} exceeds maximum allowed ${MAX_UPLOAD_BYTES} bytes`
      );
    }

    // 2. Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new InvalidMimeTypeError(`MIME type ${file.mimetype} is not allowed`);
    }

    // 3. Validate expiry duration
    if (expiresInSeconds < MIN_EXPIRY_SECONDS || expiresInSeconds > MAX_CUSTOM_EXPIRY_SECONDS) {
      throw new ValidationError(
        `Expiry must be between ${MIN_EXPIRY_SECONDS} seconds and ${MAX_CUSTOM_EXPIRY_SECONDS} seconds (30 days)`
      );
    }

    // 4. Sanitize filename
    const sanitizedFilename = sanitizeFilename(file.originalname);

    // 5. Determine recipient public key: use provided key or fetch owner's from DB
    let recipientPublicKey = params.recipientPublicKey;
    if (!recipientPublicKey) {
      const owner = await this.prisma.user.findUnique({
        where: { id: ownerId },
        select: { rsaPublicKey: true },
      });

      if (!owner) {
        throw new ValidationError('Owner not found');
      }
      recipientPublicKey = owner.rsaPublicKey;
    }

    // 6. Encrypt file buffer using recipient's public key
    const encryptResult = await this.encryptionService.encryptFile(
      file.buffer,
      recipientPublicKey
    );

    // 7. Generate file ID and store ciphertext to disk
    const fileId = crypto.randomUUID();
    const encryptedFilePath = path.join(this.uploadDir, `${fileId}.enc`);
    await fs.mkdir(this.uploadDir, { recursive: true });
    await fs.writeFile(encryptedFilePath, encryptResult.payload.ciphertext);

    // 8. Generate share link token (64 bytes = 128 hex chars)
    const token = crypto.randomBytes(SHARE_TOKEN_BYTES).toString('hex');

    // 9. Hash password if provided
    let passwordHash: string | null = null;
    if (password) {
      passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    }

    // 10. Calculate expiry time
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    // 11. Determine max downloads
    const resolvedMaxDownloads = maxDownloads ?? (downloadOnce ? 1 : -1);

    // 12. Create all DB records in a single transaction
    await this.prisma.$transaction(async (tx) => {
      // Insert file record
      await tx.file.create({
        data: {
          id: fileId,
          ownerId,
          encryptedFilePath,
          originalFilename: sanitizedFilename,
          mimeType: file.mimetype,
          sizeBytes: BigInt(file.size),
          iv: encryptResult.payload.iv,
          authTag: encryptResult.payload.authTag,
          downloadOnce,
          burnAfterReading,
          expiresAt,
        },
      });

      // Insert encrypted key record
      await tx.encryptedKey.create({
        data: {
          fileId,
          recipientId: ownerId,
          wrappedAesKey: encryptResult.keyBundle.wrappedAesKey,
          publicKeyFingerprint: encryptResult.keyBundle.publicKeyFingerprint,
        },
      });

      // Insert share link record
      await tx.shareLink.create({
        data: {
          fileId,
          createdByUserId: ownerId,
          token,
          passwordHash,
          maxDownloads: resolvedMaxDownloads,
          expiresAt,
        },
      });

      // Insert audit log (UPLOAD event)
      await tx.auditLog.create({
        data: {
          eventType: 'UPLOAD',
          fileId,
          userId: ownerId,
          metadata: {
            originalFilename: sanitizedFilename,
            sizeBytes: file.size,
            mimeType: file.mimetype,
          },
        },
      });
    });

    // 13. Return response
    const shareUrl = `${this.baseUrl}/share/${token}`;
    return {
      fileId,
      shareUrl,
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Validate share token, enforce expiry and download limits, decrypt file,
   * return plaintext buffer, then conditionally burn the record.
   */
  async downloadFile(request: DownloadFileParams): Promise<DownloadFileResult> {
    // 1. Find share link by token
    const link = await this.prisma.shareLink.findUnique({
      where: { token: request.token },
      include: {
        file: {
          include: {
            encryptedKeys: true,
            owner: true,
          },
        },
      },
    });

    if (!link) {
      await this.auditService.recordEvent({
        eventType: 'FAIL_ATTEMPT',
        metadata: { reason: 'TOKEN_NOT_FOUND', token: request.token.substring(0, 8) + '...' },
      });
      throw new TokenNotFoundError();
    }

    // 2. Check if file is already burned/deleted
    if (link.file.isDeleted) {
      await this.auditService.recordEvent({
        eventType: 'FAIL_ATTEMPT',
        fileId: link.fileId,
        metadata: { reason: 'FILE_BURNED' },
      });
      throw new FileBurnedError();
    }

    // 3. Check if link is revoked
    if (link.revokedAt !== null) {
      await this.auditService.recordEvent({
        eventType: 'FAIL_ATTEMPT',
        fileId: link.fileId,
        metadata: { reason: 'TOKEN_REVOKED' },
      });
      throw new TokenRevokedError();
    }

    // 4. Check if link is expired
    if (link.expiresAt < new Date()) {
      await this.auditService.recordEvent({
        eventType: 'FAIL_ATTEMPT',
        fileId: link.fileId,
        metadata: { reason: 'LINK_EXPIRED' },
      });
      throw new LinkExpiredError();
    }

    // 5. Check download limit
    if (link.maxDownloads !== -1 && link.downloadCount >= link.maxDownloads) {
      await this.auditService.recordEvent({
        eventType: 'FAIL_ATTEMPT',
        fileId: link.fileId,
        metadata: { reason: 'DOWNLOAD_LIMIT_REACHED' },
      });
      throw new DownloadLimitReachedError();
    }

    // 6. Check password if required
    if (link.passwordHash !== null) {
      if (!request.password) {
        await this.auditService.recordEvent({
          eventType: 'FAIL_ATTEMPT',
          fileId: link.fileId,
          metadata: { reason: 'INVALID_SHARE_PASSWORD', detail: 'No password provided' },
        });
        throw new InvalidPasswordError();
      }

      let isPasswordValid = false;
      try {
        isPasswordValid = await argon2.verify(link.passwordHash, request.password);
      } catch {
        // Invalid hash format or verification failure
        isPasswordValid = false;
      }
      if (!isPasswordValid) {
        await this.auditService.recordEvent({
          eventType: 'FAIL_ATTEMPT',
          fileId: link.fileId,
          metadata: { reason: 'INVALID_SHARE_PASSWORD' },
        });
        throw new InvalidPasswordError();
      }
    }

    // 7. Read ciphertext from disk
    const ciphertext = await fs.readFile(link.file.encryptedFilePath);

    // 8. Get the wrapped AES key
    const encKey = link.file.encryptedKeys[0];
    if (!encKey) {
      throw new FileNotFoundError('Encrypted key not found for file');
    }

    // 9. Get the recipient's private key for decryption
    const privateKeyPath = config.RSA_PRIVATE_KEY_PATH;
    let recipientPrivateKey: string;
    try {
      recipientPrivateKey = await fs.readFile(privateKeyPath, 'utf-8');
    } catch {
      throw new FileNotFoundError('Server private key not available');
    }

    // 10. Decrypt file
    const plaintext = await this.encryptionService.decryptFile(
      {
        ciphertext,
        iv: Buffer.from(link.file.iv),
        authTag: Buffer.from(link.file.authTag),
      },
      encKey.wrappedAesKey,
      recipientPrivateKey
    );

    // 11. Update download count and last accessed
    await this.prisma.shareLink.update({
      where: { id: link.id },
      data: {
        downloadCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    // 12. Record DOWNLOAD audit event
    await this.auditService.recordEvent({
      eventType: 'DOWNLOAD',
      fileId: link.fileId,
    });

    // 13. Burn if burnAfterReading or downloadOnce
    if (link.file.burnAfterReading || link.file.downloadOnce) {
      await this.burnFile(link.fileId);
    }

    return {
      plaintext,
      originalFilename: link.file.originalFilename,
      mimeType: link.file.mimeType,
    };
  }

  /**
   * Return dashboard items for all non-deleted files owned by userId.
   */
  async listFilesForUser(userId: string): Promise<FileDashboardItem[]> {
    const files = await this.prisma.file.findMany({
      where: {
        ownerId: userId,
        isDeleted: false,
      },
      include: {
        shareLinks: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return files.map((file) => {
      const shareLink = file.shareLinks[0];
      let status: 'active' | 'expired' | 'burned' | 'deleted' = 'active';

      if (file.isDeleted) {
        status = 'deleted';
      } else if (file.expiresAt < new Date()) {
        status = 'expired';
      }

      return {
        fileId: file.id,
        originalFilename: file.originalFilename,
        sizeBytes: Number(file.sizeBytes),
        mimeType: file.mimeType,
        expiresAt: file.expiresAt.toISOString(),
        downloadCount: shareLink?.downloadCount ?? 0,
        maxDownloads: shareLink?.maxDownloads ?? -1,
        lastAccessedAt: shareLink?.lastAccessedAt?.toISOString() ?? null,
        status,
        shareToken: shareLink?.token ?? '',
        encryptionStatus: 'encrypted' as const,
      };
    });
  }

  /**
   * Permanently delete a file (owner or admin only).
   * Verifies ownership, performs secure deletion, removes DB records, records audit event.
   */
  async deleteFile(fileId: string, requestingUserId: string): Promise<void> {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { owner: true },
    });

    if (!file) {
      throw new FileNotFoundError();
    }

    const requestingUser = await this.prisma.user.findUnique({
      where: { id: requestingUserId },
    });

    if (!requestingUser) {
      throw new ForbiddenError('User not found');
    }

    if (file.ownerId !== requestingUserId && !requestingUser.isAdmin) {
      throw new ForbiddenError('Only the file owner or an admin can delete this file');
    }

    if (file.isDeleted) {
      return;
    }

    try {
      await this.secureDelete(file.encryptedFilePath);
    } catch {
      // File might not exist on disk anymore - continue with DB cleanup
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.encryptedKey.deleteMany({
        where: { fileId },
      });

      await tx.shareLink.updateMany({
        where: { fileId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.file.update({
        where: { id: fileId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: 'DELETE',
          fileId,
          userId: requestingUserId,
        },
      });
    });
  }

  /**
   * Revoke a share link without deleting the underlying file.
   */
  async revokeShareLink(token: string, requestingUserId: string): Promise<void> {
    const link = await this.prisma.shareLink.findUnique({
      where: { token },
      include: { file: true },
    });

    if (!link) {
      throw new TokenNotFoundError();
    }

    const requestingUser = await this.prisma.user.findUnique({
      where: { id: requestingUserId },
    });

    if (!requestingUser) {
      throw new ForbiddenError('User not found');
    }

    if (link.file.ownerId !== requestingUserId && !requestingUser.isAdmin) {
      throw new ForbiddenError('Only the file owner or an admin can revoke this link');
    }

    await this.prisma.shareLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });

    await this.auditService.recordEvent({
      eventType: 'LINK_REVOKED',
      fileId: link.fileId,
      userId: requestingUserId,
    });
  }

  /**
   * Burn a file: delete encrypted keys, revoke share links, secure-delete file,
   * mark as deleted, record BURN audit event.
   * Idempotent: no-op if already burned/deleted.
   */
  async burnFile(fileId: string): Promise<void> {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return; // File doesn't exist - no-op
    }

    if (file.isDeleted) {
      return; // Already deleted - idempotent
    }

    try {
      await this.secureDelete(file.encryptedFilePath);
    } catch {
      // File might not exist on disk - continue with DB cleanup
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.encryptedKey.deleteMany({
        where: { fileId },
      });

      await tx.shareLink.updateMany({
        where: { fileId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.file.update({
        where: { id: fileId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: 'BURN',
          fileId,
        },
      });
    });
  }

  /**
   * Secure delete a file from disk:
   * 1. Overwrite with random bytes
   * 2. Overwrite with zeros
   * 3. Unlink the file
   */
  async secureDelete(filePath: string): Promise<void> {
    const stat = await fs.stat(filePath);
    const fileHandle = await fs.open(filePath, 'w');

    try {
      // Pass 1: Overwrite with random bytes
      const randomBuffer = crypto.randomBytes(stat.size);
      await fileHandle.write(randomBuffer, 0, randomBuffer.length, 0);
      await fileHandle.datasync();

      // Pass 2: Overwrite with zeros
      const zeroBuffer = Buffer.alloc(stat.size, 0);
      await fileHandle.write(zeroBuffer, 0, zeroBuffer.length, 0);
      await fileHandle.datasync();
    } finally {
      await fileHandle.close();
    }

    await fs.unlink(filePath);
  }
}
