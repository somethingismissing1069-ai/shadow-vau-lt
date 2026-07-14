'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { FileText, Download, Clock, Eye, Search, Trash2, LinkIcon, Copy, Check } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { ProtectedRoute } from '@/components/auth';
import { Card, Button, StatusBadge } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import type { FileDashboardItem } from '@/types';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = date.getTime() - now.getTime();

  if (diff < 0) return 'Expired';

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days > 0) return `${days}d remaining`;
  if (hours > 0) return `${hours}h remaining`;
  if (minutes > 0) return `${minutes}m remaining`;
  return 'Expiring soon';
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Fetch files using React Query with queryKeys
  const { data: files, isLoading, error } = useQuery<FileDashboardItem[]>({
    queryKey: queryKeys.files.list(),
    queryFn: async () => {
      const response = await api.get('/files');
      // Backend returns { files: [...] } — extract the array
      return response.data.files || response.data;
    },
  });

  // Delete file mutation with optimistic update
  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await api.delete(`/files/${fileId}`);
    },
    onMutate: async (fileId: string) => {
      setDeleteError(null);
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.files.list() });
      // Snapshot previous value
      const previousFiles = queryClient.getQueryData<FileDashboardItem[]>(queryKeys.files.list());
      // Optimistically remove the file
      queryClient.setQueryData<FileDashboardItem[]>(
        queryKeys.files.list(),
        (old) => old?.filter((f) => f.fileId !== fileId) ?? []
      );
      return { previousFiles };
    },
    onError: (error, _fileId, context) => {
      // Rollback on error
      if (context?.previousFiles) {
        queryClient.setQueryData(queryKeys.files.list(), context.previousFiles);
      }
      const apiError = getApiError(error);
      setDeleteError(apiError.message);
      showToast(apiError.message || 'Failed to delete file', 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.all });
    },
  });

  // Revoke share link mutation with optimistic update
  const revokeMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await api.post(`/files/${fileId}/revoke`);
    },
    onMutate: async (fileId: string) => {
      setRevokeError(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.files.list() });
      const previousFiles = queryClient.getQueryData<FileDashboardItem[]>(queryKeys.files.list());
      // Optimistically clear the shareToken
      queryClient.setQueryData<FileDashboardItem[]>(
        queryKeys.files.list(),
        (old) =>
          old?.map((f) =>
            f.fileId === fileId ? { ...f, shareToken: '' } : f
          ) ?? []
      );
      return { previousFiles };
    },
    onError: (error, _fileId, context) => {
      // Rollback on error
      if (context?.previousFiles) {
        queryClient.setQueryData(queryKeys.files.list(), context.previousFiles);
      }
      const apiError = getApiError(error);
      setRevokeError(apiError.message);
      showToast(apiError.message || 'Failed to revoke share link', 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.all });
    },
  });

  const handleDelete = (fileId: string, filename: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${filename}"? This action cannot be undone.`
    );
    if (confirmed) {
      deleteMutation.mutate(fileId);
    }
  };

  const handleRevoke = (fileId: string, filename: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to revoke the share link for "${filename}"? The link will no longer work.`
    );
    if (confirmed) {
      revokeMutation.mutate(fileId);
    }
  };

  // Sort files by most recent (expiresAt descending)
  const sortedFiles = files
    ? [...files].sort(
        (a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime()
      )
    : undefined;

  const filteredFiles = sortedFiles?.filter((file) => {
    const matchesSearch = file.originalFilename
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || file.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-text-secondary mt-1">
            Manage your encrypted files and share links
          </p>
        </div>
        <Link href="/upload">
          <Button variant="primary" size="md">
            Upload File
          </Button>
        </Link>
      </div>

      {/* Inline error messages */}
      {deleteError && (
        <div className="mb-4 p-3 rounded-lg bg-status-error/10 border border-status-error/30 text-status-error text-sm" role="alert">
          <span className="font-medium">Delete failed:</span> {deleteError}
          <button
            onClick={() => setDeleteError(null)}
            className="ml-2 text-status-error/70 hover:text-status-error"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      {revokeError && (
        <div className="mb-4 p-3 rounded-lg bg-status-error/10 border border-status-error/30 text-status-error text-sm" role="alert">
          <span className="font-medium">Revoke failed:</span> {revokeError}
          <button
            onClick={() => setRevokeError(null)}
            className="ml-2 text-status-error/70 hover:text-status-error"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Stats Cards */}
      {sortedFiles && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-text-accent/10">
                <FileText className="h-5 w-5 text-text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">
                  {sortedFiles.length}
                </p>
                <p className="text-xs text-text-secondary">Total Files</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-status-success/10">
                <Eye className="h-5 w-5 text-status-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">
                  {sortedFiles.filter((f) => f.status === 'active').length}
                </p>
                <p className="text-xs text-text-secondary">Active</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-status-warning/10">
                <Clock className="h-5 w-5 text-status-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">
                  {sortedFiles.filter((f) => f.status === 'expired').length}
                </p>
                <p className="text-xs text-text-secondary">Expired</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-status-info/10">
                <Download className="h-5 w-5 text-status-info" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">
                  {sortedFiles.reduce((sum, f) => sum + f.downloadCount, 0)}
                </p>
                <p className="text-xs text-text-secondary">Total Downloads</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input pl-10"
              aria-label="Search files"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="glass-input w-full sm:w-48"
            aria-label="Filter by status"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="burned">Burned</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>
      </Card>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3" aria-label="Loading files">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 animate-pulse">
                <div className="flex items-center gap-3 flex-1">
                  <div className="p-2 rounded-lg bg-bg-secondary shrink-0">
                    <div className="h-5 w-5 bg-gray-700 rounded" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-700 rounded w-3/4" />
                    <div className="h-3 bg-gray-700 rounded w-1/2" />
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="h-4 bg-gray-700 rounded w-12" />
                  <div className="h-4 bg-gray-700 rounded w-16" />
                  <div className="h-6 bg-gray-700 rounded w-16" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="text-center py-12">
          <p className="text-status-error">
            Failed to load files. Please try again.
          </p>
        </Card>
      )}

      {/* Empty State */}
      {filteredFiles && filteredFiles.length === 0 && (
        <Card className="text-center py-12">
          <FileText className="h-12 w-12 text-text-secondary mx-auto mb-4" />
          <p className="text-text-secondary text-lg">No files found</p>
          <p className="text-text-secondary/70 text-sm mt-1">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Upload your first encrypted file to get started'}
          </p>
          {!searchQuery && statusFilter === 'all' && (
            <Link href="/upload" className="inline-block mt-4">
              <Button variant="primary" size="sm">
                Upload File
              </Button>
            </Link>
          )}
        </Card>
      )}

      {/* File List */}
      {filteredFiles && filteredFiles.length > 0 && (
        <div className="space-y-3">
          {filteredFiles.map((file) => (
            <FileRow
              key={file.fileId}
              file={file}
              onDelete={handleDelete}
              onRevoke={handleRevoke}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === file.fileId}
              isRevoking={revokeMutation.isPending && revokeMutation.variables === file.fileId}
            />
          ))}
        </div>
      )}
    </main>
  );
}

interface FileRowProps {
  file: FileDashboardItem;
  onDelete: (fileId: string, filename: string) => void;
  onRevoke: (fileId: string, filename: string) => void;
  isDeleting: boolean;
  isRevoking: boolean;
}

function FileRow({ file, onDelete, onRevoke, isDeleting, isRevoking }: FileRowProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl =
    file.status === 'active' && file.shareToken && file.shareToken.length > 0
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${file.shareToken}`
      : null;

  const handleCopyShareUrl = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: silently fail if clipboard not available
    }
  }, [shareUrl]);

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* File Icon & Name */}
          <Link href={`/files/${file.fileId}`} className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 rounded-lg bg-bg-secondary shrink-0">
              <FileText className="h-5 w-5 text-text-accent" />
            </div>
            <div className="min-w-0">
              <p className="text-text-primary font-medium truncate">
                {file.originalFilename}
              </p>
              <p className="text-text-secondary text-xs mt-0.5">
                {file.mimeType} &middot; {formatFileSize(file.sizeBytes)}
              </p>
            </div>
          </Link>

          {/* Metadata */}
          <div className="flex items-center gap-4 text-sm flex-shrink-0">
            <div className="hidden md:flex items-center gap-1.5 text-text-secondary">
              <Download className="h-3.5 w-3.5" />
              <span>
                {file.maxDownloads === -1 ? (
                  <>
                    {file.downloadCount}{' '}
                    <span className="text-xs text-text-secondary/70">Unlimited</span>
                  </>
                ) : (
                  `${file.downloadCount}/${file.maxDownloads}`
                )}
              </span>
            </div>
            <div className="hidden lg:flex items-center gap-1.5 text-text-secondary">
              <Clock className="h-3.5 w-3.5" />
              <span>{formatRelativeTime(file.expiresAt)}</span>
            </div>
            <StatusBadge status={file.status} />

            {/* Actions */}
            <div className="flex items-center gap-2">
              {file.status === 'active' && file.shareToken && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onRevoke(file.fileId, file.originalFilename);
                  }}
                  disabled={isRevoking}
                  className="p-1.5 rounded-md text-text-secondary hover:text-status-warning hover:bg-status-warning/10 transition-colors disabled:opacity-50"
                  title="Revoke share link"
                  aria-label={`Revoke share link for ${file.originalFilename}`}
                >
                  <LinkIcon className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onDelete(file.fileId, file.originalFilename);
                }}
                disabled={isDeleting}
                className="p-1.5 rounded-md text-text-secondary hover:text-status-error hover:bg-status-error/10 transition-colors disabled:opacity-50"
                title="Delete file"
                aria-label={`Delete ${file.originalFilename}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Share URL Section - only shown for active files with a shareToken */}
        {shareUrl && (
          <div className="flex items-center gap-2 pl-11">
            <div className="flex-1 min-w-0 flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-secondary/50 border border-border-primary/30">
              <LinkIcon className="h-3.5 w-3.5 text-text-secondary shrink-0" />
              <span className="text-xs text-text-secondary truncate" title={shareUrl}>
                {shareUrl}
              </span>
            </div>
            <button
              onClick={handleCopyShareUrl}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-text-accent/10 text-text-accent hover:bg-text-accent/20 transition-colors shrink-0"
              aria-label={`Copy share URL for ${file.originalFilename}`}
              title="Copy share URL"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
