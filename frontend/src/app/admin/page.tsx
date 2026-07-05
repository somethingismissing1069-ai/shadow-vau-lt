'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  Upload,
  Download,
  Flame,
  LogIn,
  LogOut,
  Timer,
} from 'lucide-react';
import { Card, LoadingSpinner, Button, Modal } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { api, getApiError } from '@/lib/api';

// Types
interface AdminUser {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  fileCount: number;
}

interface AdminAuditLog {
  id: string;
  fileId: string | null;
  userId: string | null;
  eventType: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  userName?: string;
  fileName?: string;
}

const EVENT_TYPES = [
  'ALL',
  'UPLOAD',
  'DOWNLOAD',
  'EXPIRE',
  'DELETE',
  'BURN',
  'FAIL_ATTEMPT',
  'LOGIN',
  'LOGOUT',
] as const;

type EventType = (typeof EVENT_TYPES)[number];

type AdminTab = 'users' | 'audit';

const eventTypeConfig: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  UPLOAD: { icon: Upload, color: 'text-status-info', label: 'Upload' },
  DOWNLOAD: { icon: Download, color: 'text-status-success', label: 'Download' },
  EXPIRE: { icon: Timer, color: 'text-status-warning', label: 'Expire' },
  DELETE: { icon: Trash2, color: 'text-status-error', label: 'Delete' },
  BURN: { icon: Flame, color: 'text-status-error', label: 'Burn' },
  FAIL_ATTEMPT: {
    icon: AlertTriangle,
    color: 'text-status-warning',
    label: 'Failed Attempt',
  },
  LOGIN: { icon: LogIn, color: 'text-status-info', label: 'Login' },
  LOGOUT: { icon: LogOut, color: 'text-text-secondary', label: 'Logout' },
};

export default function AdminPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [selectedEventType, setSelectedEventType] = useState<EventType>('ALL');
  const [auditPage, setAuditPage] = useState(1);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !user?.isAdmin)) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, user, router]);

  // Fetch users
  const {
    data: users,
    isLoading: usersLoading,
    error: usersError,
  } = useQuery<AdminUser[]>({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const response = await api.get('/admin/users');
      return response.data;
    },
    enabled: isAuthenticated && user?.isAdmin === true,
  });

  // Fetch admin audit logs
  const {
    data: auditLogs,
    isLoading: auditLoading,
    error: auditError,
  } = useQuery<AdminAuditLog[]>({
    queryKey: ['admin', 'audit', selectedEventType, auditPage],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page: auditPage,
        limit: ITEMS_PER_PAGE,
      };
      if (selectedEventType !== 'ALL') {
        params.eventType = selectedEventType;
      }
      const response = await api.get('/admin/audit', { params });
      return response.data;
    },
    enabled: isAuthenticated && user?.isAdmin === true && activeTab === 'audit',
  });

  // Force delete mutation
  const forceDeleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await api.delete(`/admin/files/${fileId}`);
    },
    onSuccess: () => {
      setDeleteFileId(null);
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (error) => {
      const apiError = getApiError(error);
      setDeleteError(apiError.message);
    },
  });

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </main>
    );
  }

  if (!isAuthenticated || !user?.isAdmin) {
    return null;
  }

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
        <div className="flex gap-2 border-b border-border-glass pb-0">
          <button
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
            Global Audit Logs
          </button>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <Card className="p-0 overflow-hidden">
            {usersLoading ? (
              <div className="p-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : usersError ? (
              <div className="p-8 text-center">
                <AlertTriangle className="h-8 w-8 text-status-error mx-auto mb-3" />
                <p className="text-text-secondary">Failed to load users</p>
              </div>
            ) : !users || users.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="h-12 w-12 text-text-secondary/30 mx-auto mb-4" />
                <p className="text-text-secondary">No users found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-glass">
                      <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                        Username
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                        Email
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                        Created
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                        Last Login
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                        Files
                      </th>
                      <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                        Role
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-glass">
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        className="hover:bg-bg-glass/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-text-primary">
                            {u.username}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-text-secondary">
                            {u.email}
                          </span>
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
                        <td className="px-6 py-4">
                          <span className="text-sm text-text-secondary">
                            {u.fileCount}
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Audit Logs Tab */}
        {activeTab === 'audit' && (
          <>
            {/* Filters */}
            <Card className="p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-text-secondary">
                  <Filter className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Filter by event:
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {EVENT_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setSelectedEventType(type);
                        setAuditPage(1);
                      }}
                      className={`
                        px-3 py-1.5 text-xs font-medium rounded-lg border transition-all
                        ${
                          selectedEventType === type
                            ? 'bg-text-accent/20 border-text-accent/50 text-text-accent'
                            : 'bg-bg-glass border-border-glass text-text-secondary hover:text-text-primary hover:border-border-focus'
                        }
                      `}
                    >
                      {type === 'ALL' ? 'All Events' : type.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            {/* Audit Logs Table */}
            <Card className="p-0 overflow-hidden">
              {auditLoading ? (
                <div className="p-12">
                  <LoadingSpinner size="lg" />
                </div>
              ) : auditError ? (
                <div className="p-8 text-center">
                  <AlertTriangle className="h-8 w-8 text-status-error mx-auto mb-3" />
                  <p className="text-text-secondary">
                    Failed to load audit logs
                  </p>
                </div>
              ) : !auditLogs || auditLogs.length === 0 ? (
                <div className="p-12 text-center">
                  <FileText className="h-12 w-12 text-text-secondary/30 mx-auto mb-4" />
                  <p className="text-text-secondary">No audit events found</p>
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
                            User
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            Timestamp
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            File
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            IP Address
                          </th>
                          <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-glass">
                        {auditLogs.map((log) => {
                          const config = eventTypeConfig[log.eventType] || {
                            icon: FileText,
                            color: 'text-text-secondary',
                            label: log.eventType,
                          };
                          const Icon = config.icon;

                          return (
                            <tr
                              key={log.id}
                              className="hover:bg-bg-glass/50 transition-colors"
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <Icon
                                    className={`h-4 w-4 ${config.color}`}
                                  />
                                  <span className="text-sm font-medium text-text-primary">
                                    {config.label}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-text-secondary">
                                  {log.userName || log.userId || '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2 text-sm text-text-secondary">
                                  <Clock className="h-3.5 w-3.5" />
                                  {new Date(log.createdAt).toLocaleString(
                                    'en-US',
                                    {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-text-secondary">
                                  {log.fileName || log.fileId || '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-text-secondary font-mono">
                                  {log.ipAddress || '-'}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                {log.fileId && (
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => setDeleteFileId(log.fileId)}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Delete
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between px-6 py-4 border-t border-border-glass">
                    <span className="text-sm text-text-secondary">
                      Page {auditPage}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={auditPage <= 1}
                        onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={
                          !auditLogs || auditLogs.length < ITEMS_PER_PAGE
                        }
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
      </div>

      {/* Force Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteFileId}
        onClose={() => {
          setDeleteFileId(null);
          setDeleteError(null);
        }}
        title="Force Delete File"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Are you sure you want to force-delete this file? This action will
            permanently remove the encrypted file, all associated keys, and
            revoke all share links. This cannot be undone.
          </p>

          {deleteError && (
            <div className="p-3 rounded-lg bg-status-error/10 border border-status-error/30">
              <p className="text-sm text-status-error">{deleteError}</p>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteFileId(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={forceDeleteMutation.isPending}
              onClick={() => {
                if (deleteFileId) {
                  forceDeleteMutation.mutate(deleteFileId);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Force Delete
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
