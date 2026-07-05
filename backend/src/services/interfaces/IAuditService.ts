/**
 * Supported audit event types for security-relevant actions.
 */
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

/**
 * Parameters for recording an audit event.
 */
export interface RecordEventParams {
  eventType: AuditEventType;
  fileId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Represents an audit log entry returned from queries.
 */
export interface AuditLogEntry {
  id: string;
  fileId: string | null;
  userId: string | null;
  eventType: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: Date;
}

/**
 * Paginated result for audit log queries.
 */
export interface PaginatedAuditLogs {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Filters for admin audit log queries.
 */
export interface AdminAuditLogFilters {
  eventType?: AuditEventType;
  fileId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Interface for the Audit Service.
 * Records all security-relevant events in the audit log.
 */
export interface IAuditService {
  /**
   * Record a security-relevant audit event.
   * This is a fire-and-forget operation - errors are logged but don't
   * interrupt the main operation.
   *
   * Postconditions:
   *   - Audit log entry created with eventType, timestamp, and applicable context
   *   - On failure, error is logged but does not propagate
   */
  recordEvent(params: RecordEventParams): Promise<void>;

  /**
   * Retrieve audit logs for a specific user.
   * Returns only events where userId matches or where fileId belongs to files owned by the user.
   *
   * Postconditions:
   *   - Only events associated with the user's own files or actions are returned
   *   - Results are paginated and ordered by createdAt DESC
   *   - Limit is capped at 200
   */
  getUserAuditLogs(userId: string, page?: number, limit?: number): Promise<PaginatedAuditLogs>;

  /**
   * Retrieve all audit logs with optional filtering (admin only).
   * Supports filtering by eventType, fileId, userId, and date range.
   *
   * Postconditions:
   *   - All matching events are returned with pagination
   *   - Results are ordered by createdAt DESC
   *   - Limit is capped at 200
   */
  getAdminAuditLogs(filters?: AdminAuditLogFilters, page?: number, limit?: number): Promise<PaginatedAuditLogs>;
}
