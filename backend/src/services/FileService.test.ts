import fs from 'fs/promises';
import { FileService } from './FileService';
import { IEncryptionService, EncryptFileResult } from './interfaces/IEncryptionService';
import { IAuditService } from './interfaces/IAuditService';
import { UploadFileParams } from './interfaces/IFileService';
import { FileTooLargeError, InvalidMimeTypeError, ValidationError } from '../errors';
import { MAX_UPLOAD_BYTES, MAX_CUSTOM_EXPIRY_SECONDS } from '../config/constants';

jest.mock('../config', () => ({
  config: { UPLOAD_DIR: '/tmp/uploads', BASE_URL: 'http://test:3001', RSA_PRIVATE_KEY_PATH: '/tmp/key.pem' },
}));
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('x')),
  stat: jest.fn().mockResolvedValue({ size: 50 }),
  open: jest.fn().mockResolvedValue({ write: jest.fn().mockResolvedValue(undefined), datasync: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined) }),
  unlink: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('argon2', () => ({ hash: jest.fn().mockResolvedValue('$hashed'), verify: jest.fn().mockResolvedValue(true), argon2id: 2 }));

const enc: EncryptFileResult = {
  payload: { ciphertext: Buffer.from('enc'), iv: Buffer.alloc(12, 1), authTag: Buffer.alloc(16, 2) },
  keyBundle: { wrappedAesKey: 'wrapped', publicKeyFingerprint: 'fp' },
};

const mockEnc: jest.Mocked<IEncryptionService> = {
  encryptFile: jest.fn().mockResolvedValue(enc),
  decryptFile: jest.fn().mockResolvedValue(Buffer.from('plain')),
  generateRsaKeyPair: jest.fn(),
  encryptPrivateKeyWithPassword: jest.fn(),
  decryptPrivateKeyWithPassword: jest.fn(),
  getPublicKeyFingerprint: jest.fn(),
};
const mockAudit: jest.Mocked<IAuditService> = { recordEvent: jest.fn().mockResolvedValue(undefined), getUserAuditLogs: jest.fn().mockResolvedValue({ logs: [], total: 0, page: 1, limit: 50 }), getAdminAuditLogs: jest.fn().mockResolvedValue({ logs: [], total: 0, page: 1, limit: 50 }) };
const mockPrisma: any = {
  user: { findUnique: jest.fn().mockResolvedValue({ rsaPublicKey: 'pk' }) },
  file: { create: jest.fn().mockResolvedValue({}), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
  encryptedKey: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn() },
  shareLink: { create: jest.fn().mockResolvedValue({}), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  $transaction: jest.fn().mockImplementation(async (fn: any) => fn(mockPrisma)),
};

describe('FileService - uploadFile (Task 5.1)', () => {
  let svc: FileService;
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ rsaPublicKey: 'pk' });
    mockEnc.encryptFile.mockResolvedValue(enc);
    svc = new FileService(mockPrisma, mockEnc, mockAudit, '/tmp/uploads', 'http://test:3001');
  });

  const vp = (o?: Partial<UploadFileParams>): UploadFileParams => ({
    file: { buffer: Buffer.from('data'), originalname: 'doc.pdf', mimetype: 'application/pdf', size: 1024 },
    recipientPublicKey: 'pub-key',
    expiresInSeconds: 3600,
    downloadOnce: false,
    burnAfterReading: false,
    ...o,
  });

  test('rejects file > MAX_UPLOAD_BYTES', async () => {
    await expect(svc.uploadFile(vp({ file: { buffer: Buffer.alloc(1), originalname: 'x', mimetype: 'application/pdf', size: MAX_UPLOAD_BYTES + 1 } }), 'u')).rejects.toThrow(FileTooLargeError);
  });

  test('rejects disallowed MIME type', async () => {
    await expect(svc.uploadFile(vp({ file: { buffer: Buffer.alloc(1), originalname: 'x', mimetype: 'application/x-msdownload', size: 10 } }), 'u')).rejects.toThrow(InvalidMimeTypeError);
  });

  test('rejects expiry < 60s', async () => {
    await expect(svc.uploadFile(vp({ expiresInSeconds: 30 }), 'u')).rejects.toThrow(ValidationError);
  });

  test('rejects expiry > 30 days', async () => {
    await expect(svc.uploadFile(vp({ expiresInSeconds: MAX_CUSTOM_EXPIRY_SECONDS + 1 }), 'u')).rejects.toThrow(ValidationError);
  });

  test('rejects when owner not found and no recipientPublicKey', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(svc.uploadFile(vp({ recipientPublicKey: '' }), 'u')).rejects.toThrow(ValidationError);
  });

  test('encrypts with provided recipientPublicKey', async () => {
    await svc.uploadFile(vp(), 'u');
    expect(mockEnc.encryptFile).toHaveBeenCalledWith(expect.any(Buffer), 'pub-key');
  });

  test('falls back to DB key when recipientPublicKey empty', async () => {
    await svc.uploadFile(vp({ recipientPublicKey: '' }), 'u');
    expect(mockEnc.encryptFile).toHaveBeenCalledWith(expect.any(Buffer), 'pk');
  });

  test('writes ciphertext to disk', async () => {
    await svc.uploadFile(vp(), 'u');
    expect(fs.mkdir).toHaveBeenCalledWith('/tmp/uploads', { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('.enc'), enc.payload.ciphertext);
  });

  test('creates all DB records in single transaction', async () => {
    await svc.uploadFile(vp(), 'u');
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.file.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.encryptedKey.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.shareLink.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  test('returns 128-char hex token and valid share URL', async () => {
    const r = await svc.uploadFile(vp(), 'u');
    expect(r.token).toMatch(/^[0-9a-f]{128}$/);
    expect(r.shareUrl).toBe(`http://test:3001/share/${r.token}`);
    expect(r.fileId).toBeDefined();
    expect(new Date(r.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  test('maxDownloads=1 when downloadOnce', async () => {
    await svc.uploadFile(vp({ downloadOnce: true }), 'u');
    expect(mockPrisma.shareLink.create.mock.calls[0][0].data.maxDownloads).toBe(1);
  });

  test('maxDownloads=-1 when not downloadOnce', async () => {
    await svc.uploadFile(vp({ downloadOnce: false }), 'u');
    expect(mockPrisma.shareLink.create.mock.calls[0][0].data.maxDownloads).toBe(-1);
  });

  test('uses explicit maxDownloads', async () => {
    await svc.uploadFile(vp({ maxDownloads: 7 }), 'u');
    expect(mockPrisma.shareLink.create.mock.calls[0][0].data.maxDownloads).toBe(7);
  });

  test('hashes password when provided', async () => {
    await svc.uploadFile(vp({ password: 'secret' }), 'u');
    expect(mockPrisma.shareLink.create.mock.calls[0][0].data.passwordHash).toBe('$hashed');
  });

  test('passwordHash null when no password', async () => {
    await svc.uploadFile(vp(), 'u');
    expect(mockPrisma.shareLink.create.mock.calls[0][0].data.passwordHash).toBeNull();
  });

  test('records UPLOAD audit with metadata', async () => {
    await svc.uploadFile(vp(), 'u');
    const d = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(d.eventType).toBe('UPLOAD');
    expect(d.userId).toBe('u');
    expect(d.metadata).toEqual({ originalFilename: 'doc.pdf', sizeBytes: 1024, mimeType: 'application/pdf' });
  });

  test('sanitizes dangerous filenames', async () => {
    await svc.uploadFile(vp({ file: { buffer: Buffer.from('x'), originalname: '../../../etc/passwd', mimetype: 'text/plain', size: 1 } }), 'u');
    const name = mockPrisma.file.create.mock.calls[0][0].data.originalFilename;
    expect(name).not.toContain('/');
    expect(name).not.toContain('\\');
  });

  test('stores iv and authTag from encryption', async () => {
    await svc.uploadFile(vp(), 'u');
    const d = mockPrisma.file.create.mock.calls[0][0].data;
    expect(d.iv).toEqual(enc.payload.iv);
    expect(d.authTag).toEqual(enc.payload.authTag);
  });

  test('accepts file at exact size limit', async () => {
    await expect(svc.uploadFile(vp({ file: { buffer: Buffer.alloc(1), originalname: 'x', mimetype: 'application/octet-stream', size: MAX_UPLOAD_BYTES } }), 'u')).resolves.toBeDefined();
  });

  test('accepts boundary expiry values (60s and MAX)', async () => {
    await expect(svc.uploadFile(vp({ expiresInSeconds: 60 }), 'u')).resolves.toBeDefined();
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ rsaPublicKey: 'pk' });
    mockEnc.encryptFile.mockResolvedValue(enc);
    await expect(svc.uploadFile(vp({ expiresInSeconds: MAX_CUSTOM_EXPIRY_SECONDS }), 'u')).resolves.toBeDefined();
  });
});
