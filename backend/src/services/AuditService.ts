import { PrismaClient, Prisma } from '@prisma/client';
import {
  IAuditService,
  RecordEventParams,
  PaginatedAuditLogs,
  AdminAuditLogFilters,
  AuditLogEntry,
} from './interfaces/IAuditService';

/** Maximum number of audit logs per page */
const MAX_PAGE_LIMIT = 200;
/** Default number of audit logs per page */
const DEFAULT_PAGE_LIMIT = 50;

/**
 * AuditService records all security-relevant events in the audit log.
 * This is a fire-and-forget operation - errors are logged but never interrupt
 * the main operation flow.
 */
export class AuditService implements IAuditService {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Record a security-relevant audit event.
   * Errors are caught and logged to console.error but never thrown.
   */
  async recordEvent(params: RecordEventParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          eventType: params.eventType,
          fileId: params.fileId || null,
          userId: params.userId || null,
          ipAddress: params.ipAddress || null,
          userAgent: params.userAgent || null,
          metadata: params.metadata
            ? (params.metadata as any)
            : Prisma.JsonNull,
        },
      });
    } catch (error) {
      // Log error but don't throw - audit logging should never break main flow
      console.error('[AuditService] Failed to record event:', params.eventType, error);
    }
  }

  /**
   * Retrieve audit logs for a specific user.
   * Returns only events where userId matches OR where fileId belongs to files owned by the user.
   * Results are paginated and ordered by createdAt DESC.
   */
  async getUserAuditLogs(
    userId: string,
    page: number = 1,
    limit: number = DEFAULT_PAGE_LIMIT
  ): Promise<PaginatedAuditLogs> {
    const sanitizedPage = Math.max(1, Math.floor(page));
    const sanitizedLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_PAGE_LIMIT);
    const skip = (sanitizedPage - 1) * sanitizedLimit;

    // Find all file IDs owned by this user
    const userFiles = await this.prisma.file.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    const userFileIds = userFiles.map((f) => f.id);

    // Build the where clause: userId matches OR fileId is in user's files
    const where: Prisma.AuditLogWhereInput = {
      OR: [
        { userId },
        ...(userFileIds.length > 0 ? [{ fileId: { in: userFileIds } }] : []),
      ],
    };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: sanitizedLimit,
        include: {
          file: {
            select: { originalFilename: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs: logs.map((log) => ({
        ...this.mapToAuditLogEntry(log),
        fileName: log.file?.originalFilename || null,
      })),
      total,
      page: sanitizedPage,
      limit: sanitizedLimit,
    };
  }

  /**
   * Retrieve all audit logs with optional filtering (admin only).
   * Supports filtering by eventType, fileId, userId, and date range.
   * Results are paginated and ordered by createdAt DESC.
   */
  async getAdminAuditLogs(
    filters: AdminAuditLogFilters = {},
    page: number = 1,
    limit: number = DEFAULT_PAGE_LIMIT
  ): Promise<PaginatedAuditLogs> {
    const sanitizedPage = Math.max(1, Math.floor(page));
    const sanitizedLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_PAGE_LIMIT);
    const skip = (sanitizedPage - 1) * sanitizedLimit;

    // Build the where clause from filters
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.eventType) {
      where.eventType = filters.eventType;
    }
    if (filters.fileId) {
      where.fileId = filters.fileId;
    }
    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: sanitizedLimit,
        include: {
          file: {
            select: { originalFilename: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs: logs.map((log) => ({
        ...this.mapToAuditLogEntry(log),
        fileName: log.file?.originalFilename || null,
      })),
      total,
      page: sanitizedPage,
      limit: sanitizedLimit,
    };
  }

  /**
   * Map a Prisma AuditLog record to the AuditLogEntry interface.
   */
  private mapToAuditLogEntry(log: any): AuditLogEntry {
    return {
      id: log.id,
      fileId: log.fileId,
      userId: log.userId,
      eventType: log.eventType,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      metadata: log.metadata,
      createdAt: log.createdAt,
    };
  }
}
