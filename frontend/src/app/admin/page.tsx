'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  FileText,
  Shield,
  Trash2,
  Filter,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  FolderOpen,
  CheckCircle,
  X,
} from 'lucide-react';
import { Card, LoadingSpinner, Button, ConfirmDialog } from '@/components/ui';
import { EventBadge } from '@/components/ui/EventBadge';
import { ProtectedRoute } from '@/components/auth';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api, getApiError } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type {
  AdminUser,
  AdminAuditFilters,
  AuditEventType,
  AuditLogEntry,
  PaginatedResponse,
} from '@/types';

const ALL_AUDIT_EVENT_TYPES: AuditEventType[] = [
  'UPLOAD',
  'DOWNLOAD',
  'EXPIRE',
  'DELETE',
  'BURN',
  'FAIL_ATTEMPT',
  'LOGIN',
  'LOGOUT',
  'PASSWORD_RESET',
  'LINK_CREATED',
  'LINK_REVOKED',
];

type AdminTab = 'users' | 'audit' | 'files';

// Types for admin file list
interface AdminFile {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: string;
  expiresAt: string;
  createdAt: string;
  status: 'active' | 'expired' | 'revoked';
  ownerUsername: string;
  downloadCount: number;
  maxDownloads: number;
}

function AdminPanelContent() {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [auditPage, setAuditPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [filesPage, setFilesPage] = useState(1);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);
  const [deleteFileName, setDeleteFileName] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // File management notifications
  const [fileSuccessMessage, setFileSuccessMessage] = useState<string | null>(null);
  const [fileErrorMessage, setFileErrorMessage] = useState<string | null>(null);

  // Audit filter state
  const [auditFilters, setAuditFilters] = useState<AdminAuditFilters>({});
  const [filterEventType, setFilterEventType] = useState<string>('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterFileId, setFilterFileId] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const ITEMS_PER_PAGE = 50;

  // Auto-dismiss success notification after 5 seconds
  useEffect(() => {
    if (fileSuccessMessage) {
      const timer = setTimeout(() => {
        setFileSuccessMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [fileSuccessMessage]);

  // Fetch users with pagination
  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
  } = useQuery<PaginatedResponse<AdminUser>>({
    queryKey: queryKeys.admin.users(usersPage, ITEMS_PER_PAGE),
    queryFn: async () => {
      const response = await api.get('/admin/users', {
        params: { page: usersPage, limit: ITEMS_PER_PAGE },
      });
      // Backend returns { users, total, page, limit } — normalize to PaginatedResponse { data, total, page, limit }
      const raw = response.data;
      return { data: raw.users || raw.data || [], total: raw.total, page: raw.page, limit: raw.limit };
    },
    enabled: isAuthenticated && user?.isAdmin === true,
  });

  // Fetch admin audit logs with filters
  const {
    data: auditData,
    isLoading: auditLoading,
    error: auditError,
    refetch: refetchAudit,
  } = useQuery<PaginatedResponse<AuditLogEntry>>({
    queryKey: queryKeys.admin.audit(auditPage, auditFilters),
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page: auditPage,
        limit: ITEMS_PER_PAGE,
      };
      if (auditFilters.eventType) {
        params.eventType = auditFilters.eventType;
      }
      if (auditFilters.userId) {
        params.userId = auditFilters.userId;
      }
      if (auditFilters.fileId) {
        params.fileId = auditFilters.fileId;
      }
      if (auditFilters.startDate) {
        params.startDate = auditFilters.startDate;
      }
      if (auditFilters.endDate) {
        params.endDate = auditFilters.endDate;
      }
      const response = await api.get('/admin/audit', { params });
      // Backend returns { logs, total, page, limit } — normalize to { data, total, page, limit }
      const raw = response.data;
      return { data: raw.logs || raw.data || [], total: raw.total, page: raw.page, limit: raw.limit };
    },
    enabled: isAuthenticated && user?.isAdmin === true && activeTab === 'audit',
  });

  // Fetch admin files list
  const {
    data: filesData,
    isLoading: filesLoading,
    error: filesError,
  } = useQuery<PaginatedResponse<AdminFile>>({
    queryKey: ['admin', 'files', filesPage, ITEMS_PER_PAGE],
    queryFn: async () => {
      const response = await api.get('/admin/files', {
        params: { page: filesPage, limit: ITEMS_PER_PAGE },
      });
      return response.data;
    },
    enabled: isAuthenticated && user?.isAdmin === true && activeTab === 'files',
  });

  const handleApplyFilters = () => {
    const newFilters: AdminAuditFilters = {};
    if (filterEventType) {
      newFilters.eventType = filterEventType as AuditEventType;
    }
    if (filterUserId.trim()) {
      newFilters.userId = filterUserId.trim();
    }
    if (filterFileId.trim()) {
      newFilters.fileId = filterFileId.trim();
    }
    if (filterStartDate) {
      newFilters.startDate = new Date(filterStartDate).toISOString();
    }
    if (filterEndDate) {
      newFilters.endDate = new Date(filterEndDate).toISOString();
    }
    setAuditFilters(newFilters);
    setAuditPage(1);
  };

  const auditLogs = auditData?.data ?? [];
  const totalAuditEntries = auditData?.total ?? 0;
  const totalAuditPages = auditData
    ? Math.ceil(auditData.total / auditData.limit)
    : 1;

  // Force delete mutation
  const forceDeleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await api.delete(`/admin/files/${fileId}`);
    },
    onSuccess: () => {
      const deletedName = deleteFileName || 'File';
      setDeleteFileId(null);
      setDeleteFileName(null);
      setDeleteError(null);
      setFileErrorMessage(null);
      setFileSuccessMessage(`"${deletedName}" has been deleted successfully.`);
      showToast(`"${deletedName}" has been deleted successfully.`, 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'files'] });
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => {
      const apiError = getApiError(error);
      setDeleteFileId(null);
      setDeleteFileName(null);
      setDeleteError(null);
      setFileErrorMessage(apiError.message || 'Failed to delete file.');
      showToast(apiError.message || 'Failed to delete file', 'error');
    },
  });

  const totalUsersPages = usersData
    ? Math.ceil(usersData.total / usersData.limit)
    : 1;

  const totalFilesPages = filesData
    ? Math.ceil(filesData.total / filesData.limit)
    : 1;

  const formatFileSize = useCallback((bytes: string | number) => {
    const numBytes = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (numBytes < 1024) return `${numBytes} B`;
    if (numBytes < 1024 * 1024) return `${(numBytes / 1024).toFixed(1)} KB`;
    return `${(numBytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  return (
    <main className="min-h-screen pt-20 pb-12 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-6 w-6 text-text-accent" />
              <h1 className="text-3xl font-bold text-text-primary">
                Admin Panel
              </h1>
            </div>
            <p className="text-text-secondary">
              Manage users, audit logs, and system resources
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border-glass pb-0" role="tablist" aria-label="Admin panel tabs">
          <button
            role="tab"
            aria-selected={activeTab === 'users'}
            onClick={() => setActiveTab('users')}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px
              ${
                activeTab === 'users'
                  ? 'border-text-accent text-text-accent'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }
            `}
          >
            <Users className="h-4 w-4" />
            Users
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'audit'}
            onClick={() => setActiveTab('audit')}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px
              ${
                activeTab === 'audit'
                  ? 'border-text-accent text-text-accent'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }
            `}
          >
            <FileText className="h-4 w-4" />
            Audit Logs
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'files'}
            onClick={() => setActiveTab('files')}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px
              ${
                activeTab === 'files'
                  ? 'border-text-accent text-text-accent'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }
            `}
          >
            <FolderOpen className="h-4 w-4" />
            File Management
          </button>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <Card className="p-0 overflow-hidden">
            {usersLoading ? (
              <div className="p-12 flex justify-center">
                <LoadingSpinner size="lg" />
              </div>
            ) : usersError ? (
              <div className="p-8 text-center">
                <AlertTriangle className="h-8 w-8 text-status-error mx-auto mb-3" />
                <p className="text-text-secondary">Failed to load users</p>
              </div>
            ) : !usersData || usersData.data.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="h-12 w-12 text-text-secondary/30 mx-auto mb-4" />
                <p className="text-text-secondary">No users found</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border-glass">
                        <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Email
                        </th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Username
                        </th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Role
                        </th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Created
                        </th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Last Login
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-glass">
                      {usersData.data.map((u) => (
                        <tr
                          key={u.id}
                          className="hover:bg-bg-glass/50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <span className="text-sm text-text-secondary">
                              {u.email}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-medium text-text-primary">
                              {u.username}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {u.isAdmin ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-text-accent/10 text-text-accent border border-text-accent/30">
                                Admin
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-bg-glass text-text-secondary border border-border-glass">
                                User
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-text-secondary">
                              {new Date(u.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-text-secondary">
                              {u.lastLoginAt
                                ? new Date(u.lastLoginAt).toLocaleDateString(
                                    'en-US',
                                    {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    }
                                  )
                                : 'Never'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-border-glass">
                  <span className="text-sm text-text-secondary">
                    Page {usersPage} of {totalUsersPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={usersPage <= 1}
                      onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={usersPage >= totalUsersPages}
                      onClick={() => setUsersPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        )}

        {/* Audit Logs Tab */}
        {activeTab === 'audit' && (
          <>
            {/* Filter Form */}
            <Card className="p-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-text-secondary">
                  <Filter className="h-4 w-4" />
                  <span className="text-sm font-medium">Filters</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                  {/* Event Type Dropdown */}
                  <div>
                    <label
                      htmlFor="audit-filter-event-type"
                      className="block text-xs font-medium text-text-secondary mb-1"
                    >
                      Event Type
                    </label>
                    <select
                      id="audit-filter-event-type"
                      value={filterEventType}
                      onChange={(e) => setFilterEventType(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border-glass bg-bg-glass text-text-primary focus:outline-none focus:border-border-focus"
                    >
                      <option value="">All</option>
                      {ALL_AUDIT_EVENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* User ID Text Input */}
                  <div>
                    <label
                      htmlFor="audit-filter-user-id"
                      className="block text-xs font-medium text-text-secondary mb-1"
                    >
                      User ID
                    </label>
                    <input
                      id="audit-filter-user-id"
                      type="text"
                      value={filterUserId}
                      onChange={(e) => setFilterUserId(e.target.value)}
                      placeholder="Filter by user ID"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border-glass bg-bg-glass text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-border-focus"
                    />
                  </div>

                  {/* File ID Text Input */}
                  <div>
                    <label
                      htmlFor="audit-filter-file-id"
                      className="block text-xs font-medium text-text-secondary mb-1"
                    >
                      File ID
                    </label>
                    <input
                      id="audit-filter-file-id"
                      type="text"
                      value={filterFileId}
                      onChange={(e) => setFilterFileId(e.target.value)}
                      placeholder="Filter by file ID"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border-glass bg-bg-glass text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-border-focus"
                    />
                  </div>

                  {/* Start Date */}
                  <div>
                    <label
                      htmlFor="audit-filter-start-date"
                      className="block text-xs font-medium text-text-secondary mb-1"
                    >
                      Start Date
                    </label>
                    <input
                      id="audit-filter-start-date"
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border-glass bg-bg-glass text-text-primary focus:outline-none focus:border-border-focus"
                    />
                  </div>

                  {/* End Date */}
                  <div>
                    <label
                      htmlFor="audit-filter-end-date"
                      className="block text-xs font-medium text-text-secondary mb-1"
                    >
                      End Date
                    </label>
                    <input
                      id="audit-filter-end-date"
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border-glass bg-bg-glass text-text-primary focus:outline-none focus:border-border-focus"
                    />
                  </div>

                  {/* Apply Button */}
                  <div className="flex items-end">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleApplyFilters}
                      className="w-full"
                    >
                      Apply Filters
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* Audit Logs Table */}
            <Card className="p-0 overflow-hidden">
              {auditLoading ? (
                <div className="divide-y divide-border-glass">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="px-6 py-4 flex gap-4 animate-pulse">
                      <div className="h-5 w-20 rounded bg-bg-glass" />
                      <div className="h-5 w-32 rounded bg-bg-glass" />
                      <div className="h-5 w-24 rounded bg-bg-glass" />
                      <div className="h-5 w-28 rounded bg-bg-glass" />
                      <div className="h-5 w-36 rounded bg-bg-glass" />
                    </div>
                  ))}
                </div>
              ) : auditError ? (
                <div className="p-8 text-center">
                  <AlertTriangle className="h-8 w-8 text-status-error mx-auto mb-3" />
                  <p className="text-text-secondary mb-4">
                    Failed to load audit logs
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => refetchAudit()}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Retry
                  </Button>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="p-12 text-center">
                  <FileText className="h-12 w-12 text-text-secondary/30 mx-auto mb-4" />
                  <p className="text-text-secondary">
                    No results found for the selected filters
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border-glass">
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            Event
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            User ID
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            File ID
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            IP Address
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            Timestamp
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            Metadata
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-glass">
                        {auditLogs.map((log) => (
                          <tr
                            key={log.id}
                            className="hover:bg-bg-glass/50 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <EventBadge eventType={log.eventType} />
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-text-secondary font-mono">
                                {log.userId || '-'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-text-secondary font-mono">
                                {log.fileId || '-'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-text-secondary font-mono">
                                {log.ipAddress || '-'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2 text-sm text-text-secondary">
                                <Clock className="h-3.5 w-3.5" />
                                {new Date(log.createdAt).toLocaleString()}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {log.metadata &&
                              Object.keys(log.metadata).length > 0 ? (
                                <div className="text-xs text-text-secondary space-y-0.5">
                                  {Object.entries(log.metadata).map(
                                    ([key, value]) => (
                                      <div key={key}>
                                        <span className="font-medium text-text-primary">
                                          {key}:
                                        </span>{' '}
                                        {String(value)}
                                      </div>
                                    )
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-text-secondary">
                                  -
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between px-6 py-4 border-t border-border-glass">
                    <span className="text-sm text-text-secondary">
                      Page {auditPage} of {totalAuditPages} ({totalAuditEntries}{' '}
                      total entries)
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={auditPage <= 1}
                        onClick={() =>
                          setAuditPage((p) => Math.max(1, p - 1))
                        }
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={auditPage >= totalAuditPages}
                        onClick={() => setAuditPage((p) => p + 1)}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </Card>
          </>
        )}

        {/* File Management Tab */}
        {activeTab === 'files' && (
          <>
            {/* Notifications */}
            {fileSuccessMessage && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-status-success/10 border border-status-success/30">
                <CheckCircle className="h-5 w-5 text-status-success flex-shrink-0" />
                <p className="text-sm text-status-success flex-1">{fileSuccessMessage}</p>
                <button
                  onClick={() => setFileSuccessMessage(null)}
                  className="text-status-success hover:text-status-success/80"
                  aria-label="Dismiss success notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {fileErrorMessage && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-status-error/10 border border-status-error/30">
                <AlertTriangle className="h-5 w-5 text-status-error flex-shrink-0" />
                <p className="text-sm text-status-error flex-1">{fileErrorMessage}</p>
                <button
                  onClick={() => setFileErrorMessage(null)}
                  className="text-status-error hover:text-status-error/80"
                  aria-label="Dismiss error notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Files Table */}
            <Card className="p-0 overflow-hidden">
              {filesLoading ? (
                <div className="p-12 flex justify-center">
                  <LoadingSpinner size="lg" />
                </div>
              ) : filesError ? (
                <div className="p-8 text-center">
                  <AlertTriangle className="h-8 w-8 text-status-error mx-auto mb-3" />
                  <p className="text-text-secondary">Failed to load files</p>
                </div>
              ) : !filesData || filesData.data.length === 0 ? (
                <div className="p-12 text-center">
                  <FolderOpen className="h-12 w-12 text-text-secondary/30 mx-auto mb-4" />
                  <p className="text-text-secondary">No files found</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border-glass">
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            Filename
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            Size
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            Owner
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            Status
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            Uploaded
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-glass">
                        {filesData.data.map((file) => (
                          <tr
                            key={file.id}
                            className="hover:bg-bg-glass/50 transition-colors"
                          >
                            <td className="px-6 py-4">
                              <span className="text-sm font-medium text-text-primary">
                                {file.originalFilename}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-text-secondary">
                                {formatFileSize(file.sizeBytes)}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-text-secondary">
                                {file.ownerUsername}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full border ${
                                  file.status === 'active'
                                    ? 'bg-status-success/10 text-status-success border-status-success/30'
                                    : file.status === 'expired'
                                      ? 'bg-status-warning/10 text-status-warning border-status-warning/30'
                                      : 'bg-status-error/10 text-status-error border-status-error/30'
                                }`}
                              >
                                {file.status.charAt(0).toUpperCase() + file.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2 text-sm text-text-secondary">
                                <Clock className="h-3.5 w-3.5" />
                                {new Date(file.createdAt).toLocaleDateString(
                                  'en-US',
                                  {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  }
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => {
                                  setDeleteFileId(file.id);
                                  setDeleteFileName(file.originalFilename);
                                }}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between px-6 py-4 border-t border-border-glass">
                    <span className="text-sm text-text-secondary">
                      Page {filesPage} of {totalFilesPages}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={filesPage <= 1}
                        onClick={() => setFilesPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={filesPage >= totalFilesPages}
                        onClick={() => setFilesPage((p) => p + 1)}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </Card>
          </>
        )}
      </div>

      {/* File Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteFileId}
        title="Delete File"
        message={`Are you sure you want to delete "${deleteFileName || ''}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (deleteFileId) {
            forceDeleteMutation.mutate(deleteFileId);
          }
        }}
        onCancel={() => {
          setDeleteFileId(null);
          setDeleteFileName(null);
          setDeleteError(null);
        }}
      />
    </main>
  );
}

export default function AdminPanel() {
  return (
    <ProtectedRoute requireAdmin>
      <AdminPanelContent />
    </ProtectedRoute>
  );
}
