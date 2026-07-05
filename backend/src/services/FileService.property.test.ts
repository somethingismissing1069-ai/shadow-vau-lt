/**
 * Property-Based Tests for FileService and Share Link Operations.
 *
 * These tests validate universal properties that must hold across all inputs,
 * using fast-check for property-based testing.
 *
 * **Validates: Requirements 4.3, 5.2, 5.4, 5.5, 6.1-6.6, 4.1, 4.2, 3.6**
 */
import * as fc from 'fast-check';
import crypto from 'crypto';
import { FileService } from './FileService';
import { IEncryptionService, EncryptFileResult } from './interfaces/IEncryptionService';
import { IAuditService } from './interfaces/IAuditService';
import { UploadFileParams } from './interfaces/IFileService';
import {
  FileTooLargeError,
  ValidationError,
  DownloadLimitReachedError,
  LinkExpiredError,
  InvalidPasswordError,
  TokenNotFoundError,
  FileBurnedError,
} from '../errors';
import { MAX_UPLOAD_BYTES, MAX_CUSTOM_EXPIRY_SECONDS, SHARE_TOKEN_BYTES } from '../config/constants';

// ─── Mock Configuration ──────────────────────────────────────────────────────

jest.mock('../config', () => ({
  config: {
    UPLOAD_DIR: '/tmp/test-uploads',
    BASE_URL: 'http://test:3001',
    RSA_PRIVATE_KEY_PATH: '/tmp/key.pem',
  },
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('ciphertext')),
  stat: jest.fn().mockResolvedValue({ size: 50 }),
  open: jest.fn().mockResolvedValue({
    write: jest.fn().mockResolvedValue(undefined),
    datasync: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  }),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('$argon2id$hashed'),
  verify: jest.fn().mockImplementation(async (hash, password) => {
    // Simulate real behavior: only the "correct" password matches
    return password === 'correct-password';
  }),
  argon2id: 2,
}));

// ─── Helper Factories ────────────────────────────────────────────────────────

function createMockEncResult(): EncryptFileResult {
  return {
    payload: {
      ciphertext: Buffer.from('encrypted-data'),
      iv: Buffer.alloc(12, 1),
      authTag: Buffer.alloc(16, 2),
    },
    keyBundle: {
      wrappedAesKey: Buffer.from('wrapped-key').toString('base64'),
      publicKeyFingerprint: 'fp-test',
    },
  };
}

function createMockEncryptionService(): jest.Mocked<IEncryptionService> {
  return {
    encryptFile: jest.fn().mockResolvedValue(createMockEncResult()),
    decryptFile: jest.fn().mockResolvedValue(Buffer.from('decrypted-plaintext')),
    generateRsaKeyPair: jest.fn(),
    encryptPrivateKeyWithPassword: jest.fn(),
    decryptPrivateKeyWithPassword: jest.fn(),
    getPublicKeyFingerprint: jest.fn(),
  };
}

function createMockAuditService(): jest.Mocked<IAuditService> {
  return {
    recordEvent: jest.fn().mockResolvedValue(undefined),
    getUserAuditLogs: jest.fn().mockResolvedValue({ logs: [], total: 0, page: 1, limit: 50 }),
    getAdminAuditLogs: jest.fn().mockResolvedValue({ logs: [], total: 0, page: 1, limit: 50 }),
  };
}

function createMockPrisma() {
  const mock: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'user1', rsaPublicKey: 'pk', isAdmin: false }) },
    file: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    encryptedKey: {
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn(),
    },
    shareLink: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(mock)),
  };
  return mock;
}

function validUploadParams(overrides?: Partial<UploadFileParams>): UploadFileParams {
  return {
    file: {
      buffer: Buffer.from('test-content'),
      originalname: 'document.pdf',
      mimetype: 'application/pdf',
      size: 1024,
    },
    recipientPublicKey: 'test-public-key',
    expiresInSeconds: 3600,
    downloadOnce: false,
    burnAfterReading: false,
    ...overrides,
  };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('FileService Property Tests (Task 5.5)', () => {
  let svc: FileService;
  let mockEnc: jest.Mocked<IEncryptionService>;
  let mockAudit: jest.Mocked<IAuditService>;
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnc = createMockEncryptionService();
    mockAudit = createMockAuditService();
    mockPrisma = createMockPrisma();
    svc = new FileService(mockPrisma, mockEnc, mockAudit, '/tmp/test-uploads', 'http://test:3001');
  });

  /**
   * Property 19: Share Token Structure
   * For any share link creation, the generated token SHALL be exactly 128 hexadecimal
   * characters (representing 64 random bytes).
   *
   * **Validates: Requirements 4.1**
   */
  describe('Property 19: Share Token Structure', () => {
    it('generated token is always exactly 128 hex characters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 60, max: MAX_CUSTOM_EXPIRY_SECONDS }),
          async (expirySeconds) => {
            jest.clearAllMocks();
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', rsaPublicKey: 'pk' });
            mockEnc.encryptFile.mockResolvedValue(createMockEncResult());

            const result = await svc.uploadFile(
              validUploadParams({ expiresInSeconds: expirySeconds }),
              'user1'
            );

            // Token must be exactly 128 hex chars (64 bytes)
            expect(result.token).toMatch(/^[0-9a-f]{128}$/);
            expect(result.token.length).toBe(SHARE_TOKEN_BYTES * 2);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 20: Expiry Range Validation
   * For any custom expiry duration exceeding 30 days (2,592,000 seconds), share link
   * creation SHALL be rejected. Valid preset durations and custom durations ≤ 30 days
   * SHALL be accepted.
   *
   * **Validates: Requirements 4.2**
   */
  describe('Property 20: Expiry Range Validation', () => {
    it('rejects expiry durations exceeding 30 days', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: MAX_CUSTOM_EXPIRY_SECONDS + 1, max: MAX_CUSTOM_EXPIRY_SECONDS * 10 }),
          async (invalidExpiry) => {
            await expect(
              svc.uploadFile(validUploadParams({ expiresInSeconds: invalidExpiry }), 'user1')
            ).rejects.toThrow(ValidationError);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('accepts valid expiry durations in range [60, MAX_CUSTOM_EXPIRY_SECONDS]', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 60, max: MAX_CUSTOM_EXPIRY_SECONDS }),
          async (validExpiry) => {
            jest.clearAllMocks();
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', rsaPublicKey: 'pk' });
            mockEnc.encryptFile.mockResolvedValue(createMockEncResult());

            const result = await svc.uploadFile(
              validUploadParams({ expiresInSeconds: validExpiry }),
              'user1'
            );
            expect(result.fileId).toBeDefined();
            expect(result.token).toBeDefined();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('rejects expiry durations below minimum (< 60s)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: -100000, max: 59 }),
          async (invalidExpiry) => {
            await expect(
              svc.uploadFile(validUploadParams({ expiresInSeconds: invalidExpiry }), 'user1')
            ).rejects.toThrow(ValidationError);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 21: File Size Validation
   * For any file upload with size exceeding 100MB, the upload SHALL be rejected with
   * a FILE_TOO_LARGE error.
   *
   * **Validates: Requirements 3.6**
   */
  describe('Property 21: File Size Validation', () => {
    it('rejects files exceeding MAX_UPLOAD_BYTES', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: MAX_UPLOAD_BYTES + 1, max: MAX_UPLOAD_BYTES * 5 }),
          async (oversizedBytes) => {
            await expect(
              svc.uploadFile(
                validUploadParams({
                  file: {
                    buffer: Buffer.alloc(1), // Don't actually allocate huge buffers
                    originalname: 'big.pdf',
                    mimetype: 'application/pdf',
                    size: oversizedBytes,
                  },
                }),
                'user1'
              )
            ).rejects.toThrow(FileTooLargeError);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('accepts files at or below MAX_UPLOAD_BYTES', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: MAX_UPLOAD_BYTES }),
          async (validSize) => {
            jest.clearAllMocks();
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', rsaPublicKey: 'pk' });
            mockEnc.encryptFile.mockResolvedValue(createMockEncResult());

            const result = await svc.uploadFile(
              validUploadParams({
                file: {
                  buffer: Buffer.from('x'),
                  originalname: 'file.pdf',
                  mimetype: 'application/pdf',
                  size: validSize,
                },
              }),
              'user1'
            );
            expect(result.fileId).toBeDefined();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 10: Download Limit Enforcement
   * For any share link with maxDownloads set to k (where k ≥ 1), after exactly k
   * successful downloads, the (k+1)th download attempt SHALL be rejected with a
   * DOWNLOAD_LIMIT_REACHED error.
   *
   * **Validates: Requirements 4.3, 5.4**
   */
  describe('Property 10: Download Limit Enforcement', () => {
    it('rejects download when downloadCount >= maxDownloads', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          async (maxDownloads, extra) => {
            const downloadCount = maxDownloads + extra; // Always >= maxDownloads

            mockPrisma.shareLink.findUnique.mockResolvedValue({
              id: 'link1',
              fileId: 'file1',
              token: 'a'.repeat(128),
              passwordHash: null,
              maxDownloads,
              downloadCount,
              expiresAt: new Date(Date.now() + 3600000), // Future
              revokedAt: null,
              lastAccessedAt: null,
              file: {
                id: 'file1',
                isDeleted: false,
                encryptedFilePath: '/tmp/test.enc',
                originalFilename: 'test.pdf',
                mimeType: 'application/pdf',
                iv: Buffer.alloc(12),
                authTag: Buffer.alloc(16),
                burnAfterReading: false,
                downloadOnce: false,
                encryptedKeys: [{ wrappedAesKey: 'key' }],
                owner: { id: 'user1' },
              },
            });

            await expect(
              svc.downloadFile({ token: 'a'.repeat(128) })
            ).rejects.toThrow(DownloadLimitReachedError);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 11: Expiry Enforcement
   * For any share link whose expiresAt timestamp is in the past, any download attempt
   * SHALL be rejected with a LINK_EXPIRED error.
   *
   * **Validates: Requirements 5.2**
   */
  describe('Property 11: Expiry Enforcement', () => {
    it('rejects downloads for expired links', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 365 * 24 * 60 * 60 * 1000 }), // Past time in ms
          async (pastMs) => {
            const expiredDate = new Date(Date.now() - pastMs);

            mockPrisma.shareLink.findUnique.mockResolvedValue({
              id: 'link1',
              fileId: 'file1',
              token: 'b'.repeat(128),
              passwordHash: null,
              maxDownloads: -1,
              downloadCount: 0,
              expiresAt: expiredDate,
              revokedAt: null,
              lastAccessedAt: null,
              file: {
                id: 'file1',
                isDeleted: false,
                encryptedFilePath: '/tmp/test.enc',
                originalFilename: 'test.pdf',
                mimeType: 'application/pdf',
                iv: Buffer.alloc(12),
                authTag: Buffer.alloc(16),
                burnAfterReading: false,
                downloadOnce: false,
                encryptedKeys: [{ wrappedAesKey: 'key' }],
                owner: { id: 'user1' },
              },
            });

            await expect(
              svc.downloadFile({ token: 'b'.repeat(128) })
            ).rejects.toThrow(LinkExpiredError);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 14: Password-Protected Link Access Control
   * For any password-protected share link and any password string that does not match
   * the stored hash, download SHALL be rejected with INVALID_SHARE_PASSWORD.
   *
   * **Validates: Requirements 5.5**
   */
  describe('Property 14: Password-Protected Link Access Control', () => {
    it('rejects incorrect passwords on password-protected links', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s !== 'correct-password'),
          async (wrongPassword) => {
            mockPrisma.shareLink.findUnique.mockResolvedValue({
              id: 'link1',
              fileId: 'file1',
              token: 'c'.repeat(128),
              passwordHash: '$argon2id$stored-hash',
              maxDownloads: -1,
              downloadCount: 0,
              expiresAt: new Date(Date.now() + 3600000),
              revokedAt: null,
              lastAccessedAt: null,
              file: {
                id: 'file1',
                isDeleted: false,
                encryptedFilePath: '/tmp/test.enc',
                originalFilename: 'test.pdf',
                mimeType: 'application/pdf',
                iv: Buffer.alloc(12),
                authTag: Buffer.alloc(16),
                burnAfterReading: false,
                downloadOnce: false,
                encryptedKeys: [{ wrappedAesKey: 'key' }],
                owner: { id: 'user1' },
              },
            });

            await expect(
              svc.downloadFile({ token: 'c'.repeat(128), password: wrongPassword })
            ).rejects.toThrow(InvalidPasswordError);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 12: Burn Completeness
   * For any file marked as burn-after-reading or download-once, after the first
   * successful download: encrypted key records SHALL be deleted, the encrypted file
   * SHALL not exist on disk, all associated share links SHALL have revokedAt set,
   * a BURN audit event SHALL exist.
   *
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**
   */
  describe('Property 12: Burn Completeness', () => {
    it('burn operation deletes keys, revokes links, and marks file as deleted', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(), // burnAfterReading
          fc.boolean(), // downloadOnce
          async (burnAfterReading, downloadOnce) => {
            // At least one must be true for burn to trigger
            if (!burnAfterReading && !downloadOnce) return;

            jest.clearAllMocks();
            mockPrisma = createMockPrisma();
            svc = new FileService(mockPrisma, mockEnc, mockAudit, '/tmp/test-uploads', 'http://test:3001');

            // Setup: file exists and is not deleted
            mockPrisma.file.findUnique.mockResolvedValue({
              id: 'file1',
              isDeleted: false,
              encryptedFilePath: '/tmp/test-uploads/file1.enc',
            });

            await svc.burnFile('file1');

            // Encrypted keys deleted
            expect(mockPrisma.encryptedKey.deleteMany).toHaveBeenCalledWith({
              where: { fileId: 'file1' },
            });

            // Share links revoked
            expect(mockPrisma.shareLink.updateMany).toHaveBeenCalledWith({
              where: { fileId: 'file1', revokedAt: null },
              data: { revokedAt: expect.any(Date) },
            });

            // File marked as deleted
            expect(mockPrisma.file.update).toHaveBeenCalledWith({
              where: { id: 'file1' },
              data: {
                isDeleted: true,
                deletedAt: expect.any(Date),
              },
            });

            // BURN audit event created
            expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
              data: {
                eventType: 'BURN',
                fileId: 'file1',
              },
            });
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 13: Idempotent Burn
   * For any file, calling the burn procedure N times (N ≥ 1) SHALL produce the same
   * final state as calling it exactly once.
   *
   * **Validates: Requirements 6.1, 6.2, 6.3**
   */
  describe('Property 13: Idempotent Burn', () => {
    it('calling burn multiple times is a no-op after first burn', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }), // Number of burn calls
          async (burnCount) => {
            jest.clearAllMocks();
            mockPrisma = createMockPrisma();
            svc = new FileService(mockPrisma, mockEnc, mockAudit, '/tmp/test-uploads', 'http://test:3001');

            // First call: file exists and is not deleted
            let isDeletedState = false;
            mockPrisma.file.findUnique.mockImplementation(async () => {
              if (isDeletedState) {
                return { id: 'file1', isDeleted: true, encryptedFilePath: '/tmp/f.enc' };
              }
              return { id: 'file1', isDeleted: false, encryptedFilePath: '/tmp/f.enc' };
            });

            // First burn - should do work
            await svc.burnFile('file1');
            isDeletedState = true;

            // Subsequent burns - should be no-ops (file is now isDeleted=true)
            const transactionCallsAfterFirst = mockPrisma.$transaction.mock.calls.length;

            for (let i = 1; i < burnCount; i++) {
              await svc.burnFile('file1');
            }

            // No additional transactions should have been called
            expect(mockPrisma.$transaction.mock.calls.length).toBe(transactionCallsAfterFirst);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('burn on non-existent file is a no-op', async () => {
      mockPrisma.file.findUnique.mockResolvedValue(null);

      await expect(svc.burnFile('non-existent')).resolves.toBeUndefined();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
