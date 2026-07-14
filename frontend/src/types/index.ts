// ─── Auth Types ──────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (params: LoginParams) => Promise<AuthResult>;
  register: (params: RegisterParams) => Promise<AuthResult>;
  logout: () => Promise<void>;
}

export interface LoginParams {
  email: string;
  password: string;
}

export interface RegisterParams {
  email: string;
  username: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  error?: { error: string; message: string };
}

// ─── File Types ──────────────────────────────────────────────────────────────

export interface FileDashboardItem {
  fileId: string;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  expiresAt: string;
  downloadCount: number;
  maxDownloads: number; // -1 = unlimited
  lastAccessedAt: string | null;
  status: 'active' | 'expired' | 'burned' | 'deleted';
  shareToken: string;
  encryptionStatus: 'encrypted';
}

export interface UploadFormData {
  file: File;
  expiresInSeconds: number;
  downloadOnce: boolean;
  burnAfterReading: boolean;
  password?: string;
  maxDownloads?: number; // -1 = unlimited
}

export interface UploadResponse {
  fileId: string;
  shareUrl: string;
  shareToken: string;
  expiresAt: string;
}

// ─── Share Types ─────────────────────────────────────────────────────────────

export type SharePageState =
  | { phase: 'ready' }
  | { phase: 'password-required'; attempt?: number }
  | { phase: 'downloading' }
  | { phase: 'success'; filename: string }
  | { phase: 'error'; errorCode: string; message: string; retryable: boolean };

// ─── Audit Types ─────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'UPLOAD'
  | 'DOWNLOAD'
  | 'DELETE'
  | 'BURN'
  | 'EXPIRE'
  | 'FAIL_ATTEMPT'
  | 'LOGIN'
  | 'LOGOUT'
  | 'PASSWORD_RESET'
  | 'LINK_CREATED'
  | 'LINK_REVOKED';

export interface AuditLogEntry {
  id: string;
  eventType: AuditEventType;
  fileId: string | null;
  fileName: string | null;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ─── Admin Types ─────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AdminAuditFilters {
  eventType?: AuditEventType;
  userId?: string;
  fileId?: string;
  startDate?: string; // ISO 8601
  endDate?: string; // ISO 8601
}
