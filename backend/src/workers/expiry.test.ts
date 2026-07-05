// Mock config module before any imports to avoid env validation
jest.mock('../config', () => ({
  config: {
    UPLOAD_DIR: '/tmp/uploads',
    BASE_URL: 'http://test:3001',
    RSA_PRIVATE_KEY_PATH: '/tmp/key.pem',
    EXPIRY_CRON_SCHEDULE: '*/5 * * * *',
  },
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    file: {
      findMany: jest.fn(),
    },
    $disconnect: jest.fn(),
  },
}));

jest.mock('../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ stop: jest.fn() })),
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('x')),
  stat: jest.fn().mockResolvedValue({ size: 50 }),
  open: jest.fn().mockResolvedValue({
    write: jest.fn().mockResolvedValue(undefined),
    datasync: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  }),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('$hashed'),
  verify: jest.fn().mockResolvedValue(true),
  argon2id: 2,
}));

import { processExpiredFiles } from './expiry';
import { prisma } from '../lib/prisma';
import { FileService } from '../services/FileService';
import { AuditService } from '../services/AuditService';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Expiry Worker - processExpiredFiles', () => {
  let mockBurnFile: jest.Mock;
  let mockRecordEvent: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockBurnFile = jest.fn().mockResolvedValue(undefined);
    mockRecordEvent = jest.fn().mockResolvedValue(undefined);

    // Override the prototype methods which are used by the module-level instances
    FileService.prototype.burnFile = mockBurnFile;
    AuditService.prototype.recordEvent = mockRecordEvent;
  });

  it('should query for expired, non-deleted files', async () => {
    (mockPrisma.file.findMany as jest.Mock).mockResolvedValue([]);

    await processExpiredFiles();

    expect(mockPrisma.file.findMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { lt: expect.any(Date) },
        isDeleted: false,
      },
      take: 100,
    });
  });

  it('should do nothing when no expired files are found', async () => {
    (mockPrisma.file.findMany as jest.Mock).mockResolvedValue([]);

    await processExpiredFiles();

    expect(mockBurnFile).not.toHaveBeenCalled();
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it('should burn each expired file and record EXPIRE audit event', async () => {
    const expiredFiles = [
      { id: 'file-1', expiresAt: new Date('2020-01-01'), isDeleted: false },
      { id: 'file-2', expiresAt: new Date('2020-01-02'), isDeleted: false },
    ];
    (mockPrisma.file.findMany as jest.Mock).mockResolvedValue(expiredFiles);

    await processExpiredFiles();

    expect(mockBurnFile).toHaveBeenCalledTimes(2);
    expect(mockBurnFile).toHaveBeenCalledWith('file-1');
    expect(mockBurnFile).toHaveBeenCalledWith('file-2');

    expect(mockRecordEvent).toHaveBeenCalledTimes(2);
    expect(mockRecordEvent).toHaveBeenCalledWith({
      eventType: 'EXPIRE',
      fileId: 'file-1',
    });
    expect(mockRecordEvent).toHaveBeenCalledWith({
      eventType: 'EXPIRE',
      fileId: 'file-2',
    });
  });

  it('should continue processing remaining files when one file fails', async () => {
    const expiredFiles = [
      { id: 'file-1', expiresAt: new Date('2020-01-01'), isDeleted: false },
      { id: 'file-2', expiresAt: new Date('2020-01-02'), isDeleted: false },
      { id: 'file-3', expiresAt: new Date('2020-01-03'), isDeleted: false },
    ];
    (mockPrisma.file.findMany as jest.Mock).mockResolvedValue(expiredFiles);

    // Simulate failure on the second file
    mockBurnFile
      .mockResolvedValueOnce(undefined) // file-1 succeeds
      .mockRejectedValueOnce(new Error('Disk I/O failure')) // file-2 fails
      .mockResolvedValueOnce(undefined); // file-3 succeeds

    await processExpiredFiles();

    // All three should be attempted
    expect(mockBurnFile).toHaveBeenCalledTimes(3);
    expect(mockBurnFile).toHaveBeenCalledWith('file-1');
    expect(mockBurnFile).toHaveBeenCalledWith('file-2');
    expect(mockBurnFile).toHaveBeenCalledWith('file-3');

    // EXPIRE events recorded for successful files only (file-1 and file-3)
    expect(mockRecordEvent).toHaveBeenCalledTimes(2);
    expect(mockRecordEvent).toHaveBeenCalledWith({
      eventType: 'EXPIRE',
      fileId: 'file-1',
    });
    expect(mockRecordEvent).toHaveBeenCalledWith({
      eventType: 'EXPIRE',
      fileId: 'file-3',
    });
  });

  it('should limit query to 100 files per run', async () => {
    (mockPrisma.file.findMany as jest.Mock).mockResolvedValue([]);

    await processExpiredFiles();

    const callArgs = (mockPrisma.file.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(100);
  });
});
