import { FileDashboardItem } from '@shadowvault/shared';

/**
 * Parameters for uploading a file.
 */
export interface UploadFileParams {
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
  recipientPublicKey?: string;
  expiresInSeconds: number;
  downloadOnce: boolean;
  burnAfterReading: boolean;
  password?: string;
  maxDownloads?: number;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Result returned after a successful file upload.
 */
export interface UploadFileResult {
  fileId: string;
  shareUrl: string;
  token: string;
  expiresAt: string;
}

/**
 * Parameters for downloading a file via share link.
 */
export interface DownloadFileParams {
  token: string;
  password?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Result returned after a successful file download.
 */
export interface DownloadFileResult {
  plaintext: Buffer;
  originalFilename: string;
  mimeType: string;
}

/**
 * Interface for the File Service.
 * Handles file upload with encryption, download with share link validation,
 * burn-after-reading, file listing, deletion, and link revocation.
 */
export interface IFileService {
  /**
   * Handle a validated multipart upload: encrypt, store, create DB records,
   * generate share link, emit audit event.
   *
   * Preconditions:
   *   - params.file.size <= MAX_UPLOAD_BYTES
   *   - params.expiresInSeconds in valid range (300..MAX_CUSTOM_EXPIRY_SECONDS)
   * Postconditions:
   *   - Encrypted ciphertext stored at encryptedFilePath (never plaintext)
   *   - File, EncryptedKey, ShareLink, AuditLog inserted in DB within a single transaction
   *   - Returns shareUrl, token, expiresAt
   */
  uploadFile(params: UploadFileParams, ownerId: string): Promise<UploadFileResult>;

  /**
   * Validate share token, enforce expiry and download limits, decrypt file,
   * return plaintext buffer with file metadata.
   *
   * Postconditions:
   *   - Audit DOWNLOAD event recorded
   *   - If burnAfterReading || downloadOnce: file, key, and metadata deleted
   */
  downloadFile(request: DownloadFileParams): Promise<DownloadFileResult>;

  /**
   * Return dashboard items for all non-deleted files owned by userId.
   */
  listFilesForUser(userId: string): Promise<FileDashboardItem[]>;

  /**
   * Permanently delete a file (owner or admin only).
   * Removes encrypted file from FS, deletes DB rows, records audit event.
   */
  deleteFile(fileId: string, requestingUserId: string): Promise<void>;

  /**
   * Revoke a share link without deleting the underlying file.
   */
  revokeShareLink(token: string, requestingUserId: string): Promise<void>;

  /**
   * Burn a file: delete keys, revoke links, secure-delete file, record audit.
   * Idempotent - no-op if already burned/deleted.
   */
  burnFile(fileId: string): Promise<void>;

  /**
   * Securely delete a file from disk: overwrite with random bytes, then zeros, then unlink.
   */
  secureDelete(filePath: string): Promise<void>;
}
