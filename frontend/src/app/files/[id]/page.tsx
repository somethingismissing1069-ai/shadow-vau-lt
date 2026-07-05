'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Copy,
  Check,
  Trash2,
  LinkIcon,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { useFileDetails, useDeleteFile, useRevokeShareLink } from '@/hooks/useFiles';
import { Card, Button, StatusBadge, LoadingSpinner, Modal } from '@/components/ui';
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

export default function FileDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.id as string;

  const { data: file, isLoading, error } = useFileDetails(fileId);
  const deleteFile = useDeleteFile();
  const revokeLink = useRevokeShareLink();

  const [copied, setCopied] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);

  const shareUrl = file?.shareToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${file.shareToken}`
    : '';

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteFile.mutateAsync(fileId);
      router.push('/dashboard');
    } catch {
      // Error is handled by React Query
    }
    setShowDeleteModal(false);
  };

  const handleRevoke = async () => {
    try {
      await revokeLink.mutateAsync(fileId);
    } catch {
      // Error is handled by React Query
    }
    setShowRevokeModal(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <Navbar isAuthenticated={true} />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <Navbar isAuthenticated={true} />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
          <Card className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-status-error mx-auto mb-4" />
            <p className="text-status-error text-lg">File not found</p>
            <p className="text-text-secondary text-sm mt-1">
              This file may have been deleted or you don&apos;t have access.
            </p>
            <Link href="/dashboard" className="inline-block mt-4">
              <Button variant="secondary" size="sm">
                Back to Dashboard
              </Button>
            </Link>
          </Card>
        </main>
      </div>
    );
  }

  const isActive = file.status === 'active';

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar isAuthenticated={true} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        {/* Back Navigation */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back to Dashboard</span>
        </Link>

        {/* File Header */}
        <Card className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="p-3 rounded-xl bg-bg-secondary shrink-0">
              <FileText className="h-8 w-8 text-text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl font-bold text-text-primary truncate">
                    {file.originalFilename}
                  </h1>
                  <p className="text-text-secondary text-sm mt-1">
                    {file.mimeType}
                  </p>
                </div>
                <StatusBadge status={file.status} />
              </div>
            </div>
          </div>
        </Card>

        {/* Share Link Section */}
        {isActive && file.shareToken && (
          <Card className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <LinkIcon className="h-5 w-5 text-text-accent" />
              <h2 className="text-lg font-semibold text-text-primary">
                Share Link
              </h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 flex items-center gap-2 glass-input pr-2">
                <span className="truncate text-sm text-text-secondary">
                  {shareUrl}
                </span>
              </div>
              <Button
                variant="secondary"
                size="md"
                onClick={handleCopyLink}
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2 text-status-success" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Link
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {/* File Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card>
            <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-4">
              File Information
            </h3>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-text-secondary text-sm">Size</dt>
                <dd className="text-text-primary text-sm font-medium">
                  {formatFileSize(file.sizeBytes)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary text-sm">MIME Type</dt>
                <dd className="text-text-primary text-sm font-medium">
                  {file.mimeType}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary text-sm">Uploaded</dt>
                <dd className="text-text-primary text-sm font-medium">
                  {formatDate(file.createdAt)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary text-sm">Encryption</dt>
                <dd className="text-text-primary text-sm font-medium flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-status-success" />
                  AES-256-GCM
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-4">
              Access & Expiry
            </h3>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-text-secondary text-sm">Downloads</dt>
                <dd className="text-text-primary text-sm font-medium">
                  {file.downloadCount}
                  {file.maxDownloads > 0 && ` / ${file.maxDownloads}`}
                  {file.maxDownloads === -1 && ' (unlimited)'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary text-sm">Expires</dt>
                <dd className="text-text-primary text-sm font-medium">
                  {formatDate(file.expiresAt)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary text-sm">Download Once</dt>
                <dd className="text-text-primary text-sm font-medium">
                  {file.downloadOnce ? 'Yes' : 'No'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary text-sm">Burn After Reading</dt>
                <dd className="text-text-primary text-sm font-medium">
                  {file.burnAfterReading ? 'Yes' : 'No'}
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        {/* Actions */}
        {isActive && (
          <Card>
            <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-4">
              Actions
            </h3>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowRevokeModal(true)}
                isLoading={revokeLink.isPending}
              >
                <LinkIcon className="h-4 w-4 mr-2" />
                Revoke Share Link
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowDeleteModal(true)}
                isLoading={deleteFile.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete File
              </Button>
            </div>
          </Card>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete File"
      >
        <p className="text-text-secondary mb-6">
          Are you sure you want to permanently delete{' '}
          <span className="font-medium text-text-primary">
            {file.originalFilename}
          </span>
          ? This action will securely delete the encrypted file and revoke all
          share links. This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowDeleteModal(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleDelete}
            isLoading={deleteFile.isPending}
          >
            Delete Permanently
          </Button>
        </div>
      </Modal>

      {/* Revoke Confirmation Modal */}
      <Modal
        isOpen={showRevokeModal}
        onClose={() => setShowRevokeModal(false)}
        title="Revoke Share Link"
      >
        <p className="text-text-secondary mb-6">
          Are you sure you want to revoke the share link for{' '}
          <span className="font-medium text-text-primary">
            {file.originalFilename}
          </span>
          ? Anyone with the link will no longer be able to download the file.
          The file itself will not be deleted.
        </p>
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowRevokeModal(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleRevoke}
            isLoading={revokeLink.isPending}
          >
            Revoke Link
          </Button>
        </div>
      </Modal>
    </div>
  );
}
