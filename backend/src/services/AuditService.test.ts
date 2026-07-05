import { AuditService } from './AuditService';

// Mock Prisma Client
const mockPrisma = {
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  file: {
    findMany: jest.fn(),
  },
} as any;

describe('AuditService', () => {
  let auditService: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    auditService = new AuditService(mockPrisma);
  });

  describe('recordEvent', () => {
    it('should create an audit log entry with all fields', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      await auditService.recordEvent({
        eventType: 'UPLOAD',
        fileId: 'file-123',
        userId: 'user-456',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        metadata: { originalSize: 1024 },
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          eventType: 'UPLOAD',
          fileId: 'file-123',
          userId: 'user-456',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: { originalSize: 1024 },
        },
      });
    });

    it('should handle optional fields as null', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-2' });

      await auditService.recordEvent({
        eventType: 'LOGIN',
      });

      const callArgs = mockPrisma.auditLog.create.mock.calls[0][0];
      expect(callArgs.data.eventType).toBe('LOGIN');
      expect(callArgs.data.fileId).toBeNull();
      expect(callArgs.data.userId).toBeNull();
      expect(callArgs.data.ipAddress).toBeNull();
      expect(callArgs.data.userAgent).toBeNull();
      // metadata uses Prisma.JsonNull when not provided
      expect(callArgs.data.metadata).toBeDefined();
    });

    it('should not throw when database operation fails', async () => {
      mockPrisma.auditLog.create.mockRejectedValue(new Error('DB connection lost'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(auditService.recordEvent({
        eventType: 'DOWNLOAD',
        fileId: 'file-123',
      })).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[AuditService] Failed to record event:',
        'DOWNLOAD',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should support all audit event types', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-x' });

      const eventTypes = [
        'UPLOAD', 'DOWNLOAD', 'EXPIRE', 'DELETE',
        'BURN', 'FAIL_ATTEMPT', 'LOGIN', 'LOGOUT',
        'PASSWORD_RESET', 'LINK_CREATED', 'LINK_REVOKED',
      ] as const;

      for (const eventType of eventTypes) {
        await auditService.recordEvent({ eventType });
      }

      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(eventTypes.length);
    });
  });

  describe('getUserAuditLogs', () => {
    const userId = 'user-123';

    it('should return paginated audit logs for a user', async () => {
      const mockFiles = [{ id: 'file-1' }, { id: 'file-2' }];
      const mockLogs = [
        {
          id: 'log-1',
          fileId: 'file-1',
          userId: 'user-123',
          eventType: 'UPLOAD',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: null,
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'log-2',
          fileId: null,
          userId: 'user-123',
          eventType: 'LOGIN',
          ipAddress: '10.0.0.1',
          userAgent: 'Chrome',
          metadata: null,
          createdAt: new Date('2024-01-02'),
        },
      ];

      mockPrisma.file.findMany.mockResolvedValue(mockFiles);
      mockPrisma.auditLog.findMany.mockResolvedValue(mockLogs);
      mockPrisma.auditLog.count.mockResolvedValue(2);

      const result = await auditService.getUserAuditLogs(userId, 1, 50);

      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.logs[0].eventType).toBe('UPLOAD');
      expect(result.logs[1].eventType).toBe('LOGIN');
    });

    it('should query with OR condition: userId matches or fileId in user files', async () => {
      const mockFiles = [{ id: 'file-1' }, { id: 'file-2' }];
      mockPrisma.file.findMany.mockResolvedValue(mockFiles);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await auditService.getUserAuditLogs(userId);

      expect(mockPrisma.file.findMany).toHaveBeenCalledWith({
        where: { ownerId: userId },
        select: { id: true },
      });

      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.where.OR).toEqual([
        { userId },
        { fileId: { in: ['file-1', 'file-2'] } },
      ]);
      expect(findManyCall.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should handle user with no files (only userId-based query)', async () => {
      mockPrisma.file.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await auditService.getUserAuditLogs(userId);

      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.where.OR).toEqual([{ userId }]);
    });

    it('should use default page and limit values', async () => {
      mockPrisma.file.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const result = await auditService.getUserAuditLogs(userId);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);

      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.skip).toBe(0);
      expect(findManyCall.take).toBe(50);
    });

    it('should cap limit at 200', async () => {
      mockPrisma.file.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const result = await auditService.getUserAuditLogs(userId, 1, 500);

      expect(result.limit).toBe(200);
      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(200);
    });

    it('should calculate correct skip value for pagination', async () => {
      mockPrisma.file.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await auditService.getUserAuditLogs(userId, 3, 20);

      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.skip).toBe(40); // (3 - 1) * 20
      expect(findManyCall.take).toBe(20);
    });

    it('should sanitize page to minimum of 1', async () => {
      mockPrisma.file.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const result = await auditService.getUserAuditLogs(userId, -5, 50);

      expect(result.page).toBe(1);
      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.skip).toBe(0);
    });
  });

  describe('getAdminAuditLogs', () => {
    it('should return all audit logs without filters', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          fileId: 'file-1',
          userId: 'user-1',
          eventType: 'UPLOAD',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          metadata: null,
          createdAt: new Date('2024-01-01'),
        },
      ];

      mockPrisma.auditLog.findMany.mockResolvedValue(mockLogs);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await auditService.getAdminAuditLogs();

      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);

      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.where).toEqual({});
      expect(findManyCall.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should filter by eventType', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await auditService.getAdminAuditLogs({ eventType: 'UPLOAD' });

      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.where.eventType).toBe('UPLOAD');
    });

    it('should filter by fileId', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await auditService.getAdminAuditLogs({ fileId: 'file-xyz' });

      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.where.fileId).toBe('file-xyz');
    });

    it('should filter by userId', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await auditService.getAdminAuditLogs({ userId: 'user-abc' });

      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.where.userId).toBe('user-abc');
    });

    it('should filter by date range (startDate and endDate)', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await auditService.getAdminAuditLogs({ startDate, endDate });

      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.where.createdAt).toEqual({
        gte: startDate,
        lte: endDate,
      });
    });

    it('should filter by startDate only', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const startDate = new Date('2024-01-01');

      await auditService.getAdminAuditLogs({ startDate });

      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.where.createdAt).toEqual({ gte: startDate });
    });

    it('should filter by endDate only', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const endDate = new Date('2024-01-31');

      await auditService.getAdminAuditLogs({ endDate });

      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.where.createdAt).toEqual({ lte: endDate });
    });

    it('should apply multiple filters simultaneously', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await auditService.getAdminAuditLogs({
        eventType: 'DOWNLOAD',
        fileId: 'file-1',
        userId: 'user-1',
        startDate,
        endDate,
      });

      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.where.eventType).toBe('DOWNLOAD');
      expect(findManyCall.where.fileId).toBe('file-1');
      expect(findManyCall.where.userId).toBe('user-1');
      expect(findManyCall.where.createdAt).toEqual({ gte: startDate, lte: endDate });
    });

    it('should cap limit at 200', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const result = await auditService.getAdminAuditLogs({}, 1, 999);

      expect(result.limit).toBe(200);
      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(200);
    });

    it('should paginate correctly', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const result = await auditService.getAdminAuditLogs({}, 5, 25);

      expect(result.page).toBe(5);
      expect(result.limit).toBe(25);
      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.skip).toBe(100); // (5 - 1) * 25
      expect(findManyCall.take).toBe(25);
    });

    it('should sanitize page to minimum of 1', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const result = await auditService.getAdminAuditLogs({}, 0, 50);

      expect(result.page).toBe(1);
      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.skip).toBe(0);
    });

    it('should sanitize limit to minimum of 1', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const result = await auditService.getAdminAuditLogs({}, 1, 0);

      expect(result.limit).toBe(1);
      const findManyCall = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(findManyCall.take).toBe(1);
    });
  });
});
