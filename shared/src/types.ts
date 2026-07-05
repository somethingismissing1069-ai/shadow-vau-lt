// ─── Domain Types ───────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
  rsaPublicKey: string;
  encryptedRsaPrivateKey: string;
  emailVerified: boolean;
  isAdmin: boolean;
  createdAt: Date;
}

export interface FileRecord {
  id: string;
  ownerId: string;
  encryptedFilePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: bigint;
  iv: Buffer; // 12 bytes
  authTag: Buffer; // 16 bytes
  downloadOnce: boolean;
  burnAfterReading: boolean;
  expiresAt: Date;
  isDeleted: boolean;
  createdAt: Date;
}

export interface EncryptedKey {
  id: string;
  fileId: string;
  recipientId: string;
  wrappedAesKey: string; // Base64-encoded RSA-OAEP ciphertext
  publicKeyFingerprint: string;
}

export interface ShareLink {
  id: string;
  fileId: string;
  token: string;
  passwordHash: string | null;
  maxDownloads: number; // -1 = unlimited
  downloadCount: number;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface AuditLog {
  id: string;
  fileId: string | null;
  userId: string | null;
  eventType: AuditEventType;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export type AuditEventType =
  | 'UPLOAD'
  | 'DOWNLOAD'
  | 'EXPIRE'
  | 'DELETE'
  | 'BURN'
  | 'FAIL_ATTEMPT'
  | 'LOGIN'
  | 'LOGOUT'
  | 'PASSWORD_RESET'
  | 'LINK_CREATED'
  | 'LINK_REVOKED';

// ─── Crypto Types ────────────────────────────────────────────────────────────

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer; // 12 bytes, AES-GCM
  authTag: Buffer; // 16 bytes, GCM authentication tag
}

export interface WrappedKeyBundle {
  wrappedAesKey: string; // Base64 RSA-OAEP encrypted AES key
  publicKeyFingerprint: string;
}

export interface EncryptFileResult {
  payload: EncryptedPayload;
  keyBundle: WrappedKeyBundle;
}

// ─── Request / Response DTOs ─────────────────────────────────────────────────

export interface UploadFileRequest {
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
  recipientPublicKey: string;
  expiresInSeconds: number;
  downloadOnce: boolean;
  burnAfterReading: boolean;
  password?: string;
  maxDownloads?: number;
}

export interface UploadFileResponse {
  fileId: string;
  shareUrl: string;
  token: string;
  expiresAt: string;
}

export interface DownloadRequest {
  token: string;
  password?: string;
}

export interface FileDashboardItem {
  fileId: string;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  expiresAt: string;
  downloadCount: number;
  maxDownloads: number;
  lastAccessedAt: string | null;
  status: 'active' | 'expired' | 'burned' | 'deleted';
  shareToken: string;
  encryptionStatus: 'encrypted';
}
