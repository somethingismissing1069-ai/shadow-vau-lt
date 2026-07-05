'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Download, Clock, Eye, Search } from 'lucide-react';
import { useFiles, FileDashboardItem } from '@/hooks/useFiles';
import { Card, Button, StatusBadge, LoadingSpinner } from '@/components/ui';
import { Navbar } from '@/components/layout/Navbar';

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
  const { data: files, isLoading, error } = useFiles();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredFiles = files?.filter((file) => {
    const matchesSearch = file.originalFilename
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || file.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar isAuthenticated={true} />

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

        {/* Stats Cards */}
        {files && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-text-accent/10">
                  <FileText className="h-5 w-5 text-text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-text-primary">
                    {files.length}
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
                    {files.filter((f) => f.status === 'active').length}
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
                    {files.filter((f) => f.status === 'expired').length}
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
                    {files.reduce((sum, f) => sum + f.downloadCount, 0)}
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
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="glass-input w-full sm:w-48"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="burned">Burned</option>
              <option value="deleted">Deleted</option>
            </select>
          </div>
        </Card>

        {/* File List */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        )}

        {error && (
          <Card className="text-center py-12">
            <p className="text-status-error">
              Failed to load files. Please try again.
            </p>
          </Card>
        )}

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

        {filteredFiles && filteredFiles.length > 0 && (
          <div className="space-y-3">
            {filteredFiles.map((file) => (
              <FileRow key={file.fileId} file={file} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function FileRow({ file }: { file: FileDashboardItem }) {
  return (
    <Link href={`/files/${file.fileId}`}>
      <Card hover className="cursor-pointer">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* File Icon & Name */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
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
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-6 text-sm">
            <div className="hidden md:flex items-center gap-1.5 text-text-secondary">
              <Download className="h-3.5 w-3.5" />
              <span>
                {file.downloadCount}
                {file.maxDownloads > 0 && `/${file.maxDownloads}`}
              </span>
            </div>
            <div className="hidden lg:flex items-center gap-1.5 text-text-secondary">
              <Clock className="h-3.5 w-3.5" />
              <span>{formatRelativeTime(file.expiresAt)}</span>
            </div>
            <StatusBadge status={file.status} />
          </div>
        </div>
      </Card>
    </Link>
  );
}
