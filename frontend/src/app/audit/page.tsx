'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Filter,
  Clock,
  Download,
  Upload,
  Trash2,
  Flame,
  AlertTriangle,
  LogIn,
  LogOut,
  Timer,
} from 'lucide-react';
import { Card, LoadingSpinner, Button } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

interface AuditLogEntry {
  id: string;
  fileId: string | null;
  userId: string | null;
  eventType: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
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

export default function AuditLogsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedEventType, setSelectedEventType] = useState<EventType>('ALL');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  const {
    data: auditLogs,
    isLoading,
    error,
  } = useQuery<AuditLogEntry[]>({
    queryKey: ['auditLogs', selectedEventType],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (selectedEventType !== 'ALL') {
        params.eventType = selectedEventType;
      }
      const response = await api.get('/audit', { params });
      return response.data;
    },
    enabled: isAuthenticated,
  });

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="min-h-screen pt-20 pb-12 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">
              Audit Logs
            </h1>
            <p className="text-text-secondary">
              Review your security events and file activity
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-text-secondary">
              <Filter className="h-4 w-4" />
              <span className="text-sm font-medium">Filter by event:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedEventType(type)}
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
          {isLoading ? (
            <div className="p-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertTriangle className="h-8 w-8 text-status-error mx-auto mb-3" />
              <p className="text-text-secondary">Failed to load audit logs</p>
            </div>
          ) : !auditLogs || auditLogs.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-12 w-12 text-text-secondary/30 mx-auto mb-4" />
              <p className="text-text-secondary">No audit events found</p>
              <p className="text-sm text-text-secondary/70 mt-1">
                {selectedEventType !== 'ALL'
                  ? 'Try selecting a different event type filter'
                  : 'Your activity will appear here'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-glass">
                    <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Event
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                      File
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                      Details
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
                            <Icon className={`h-4 w-4 ${config.color}`} />
                            <span className="text-sm font-medium text-text-primary">
                              {config.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-sm text-text-secondary">
                            <Clock className="h-3.5 w-3.5" />
                            {new Date(log.createdAt).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-text-secondary">
                            {log.fileName || log.fileId || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-text-secondary">
                            {log.metadata
                              ? Object.entries(log.metadata)
                                  .map(([k, v]) => `${k}: ${v}`)
                                  .join(', ')
                              : log.ipAddress || '-'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
