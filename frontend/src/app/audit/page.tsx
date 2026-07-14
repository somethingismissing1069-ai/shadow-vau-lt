'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ProtectedRoute } from '@/components/auth';
import { Card, Button } from '@/components/ui';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { AuditLogEntry, PaginatedResponse, AuditEventType } from '@/types';

const EVENT_TYPE_COLORS: Record<AuditEventType, string> = {
  UPLOAD: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  DOWNLOAD: 'bg-green-500/20 text-green-400 border-green-500/30',
  DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
  BURN: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  EXPIRE: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  FAIL_ATTEMPT: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  LOGIN: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  LOGOUT: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  PASSWORD_RESET: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  LINK_CREATED: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  LINK_REVOKED: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

function EventTypeBadge({ eventType }: { eventType: AuditEventType }) {
  const colorClasses = EVENT_TYPE_COLORS[eventType] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${colorClasses}`}
      data-testid={`event-badge-${eventType}`}
    >
      {eventType.replace(/_/g, ' ')}
    </span>
  );
}

function AuditPageContent() {
  const [page, setPage] = useState(1);
  const limit = 50;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<PaginatedResponse<AuditLogEntry>>({
    queryKey: queryKeys.audit.user(page, limit),
    queryFn: async () => {
      const response = await api.get('/audit', {
        params: { page, limit },
      });
      // Backend returns { logs, total, page, limit } — normalize to { data, total, page, limit }
      const raw = response.data;
      return { data: raw.logs || raw.data || [], total: raw.total, page: raw.page, limit: raw.limit };
    },
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;
  const entries = data?.data ?? [];

  // Loading state with skeleton rows
  if (isLoading) {
    return (
      <main className="min-h-screen pt-20 pb-12 px-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Audit Logs</h1>
            <p className="text-text-secondary">Review your security events and file activity</p>
          </div>
          <Card className="p-0 overflow-hidden">
            <div className="divide-y divide-border-glass">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4 animate-pulse">
                  <div className="h-6 w-24 bg-gray-700/50 rounded-md" />
                  <div className="h-5 w-32 bg-gray-700/50 rounded" />
                  <div className="h-5 w-40 bg-gray-700/50 rounded" />
                  <div className="h-5 w-28 bg-gray-700/50 rounded" />
                  <div className="h-5 w-48 bg-gray-700/50 rounded flex-1" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    );
  }

  // Error state with retry
  if (isError) {
    return (
      <main className="min-h-screen pt-20 pb-12 px-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Audit Logs</h1>
            <p className="text-text-secondary">Review your security events and file activity</p>
          </div>
          <Card className="p-8">
            <div className="text-center">
              <p className="text-status-error mb-4">
                {error instanceof Error ? error.message : 'Failed to load audit logs'}
              </p>
              <Button onClick={() => refetch()} variant="primary">
                Retry
              </Button>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  // Empty state
  if (entries.length === 0) {
    return (
      <main className="min-h-screen pt-20 pb-12 px-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Audit Logs</h1>
            <p className="text-text-secondary">Review your security events and file activity</p>
          </div>
          <Card className="p-12">
            <div className="text-center">
              <p className="text-text-secondary text-lg">
                No security events have been recorded
              </p>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-20 pb-12 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">Audit Logs</h1>
          <p className="text-text-secondary">Review your security events and file activity</p>
        </div>

        {/* Audit Logs Table */}
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-glass">
                  <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Event
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    File
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    IP Address
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-medium text-text-secondary uppercase tracking-wider">
                    User Agent
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-glass">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-bg-glass/50 transition-colors">
                    <td className="px-6 py-4">
                      <EventTypeBadge eventType={entry.eventType} />
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-text-primary">
                        {entry.fileName || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-text-secondary">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-text-secondary font-mono">
                        {entry.ipAddress || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-text-secondary truncate max-w-[200px] block">
                        {entry.userAgent || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between">
          <Button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            variant="secondary"
          >
            Previous
          </Button>
          <span className="text-sm text-text-secondary">
            Page {page} of {totalPages}
          </span>
          <Button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * limit >= (data?.total ?? 0)}
            variant="secondary"
          >
            Next
          </Button>
        </div>
      </div>
    </main>
  );
}

export default function AuditLogsPage() {
  return (
    <ProtectedRoute>
      <AuditPageContent />
    </ProtectedRoute>
  );
}
