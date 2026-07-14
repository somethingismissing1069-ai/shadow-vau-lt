'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { api, getApiError } from '@/lib/api';
import { isTerminalShareError } from '@/types/api';
import type { SharePageState } from '@/types/index';

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  LINK_EXPIRED: {
    title: 'Link Expired',
    description: 'This share link has expired and is no longer available.',
  },
  TOKEN_REVOKED: {
    title: 'Link Revoked',
    description: 'This share link has been revoked by the file owner.',
  },
  FILE_BURNED: {
    title: 'File Destroyed',
    description: 'This file has been permanently destroyed after being downloaded.',
  },
  DOWNLOAD_LIMIT_REACHED: {
    title: 'Download Limit Reached',
    description: 'This file has reached its maximum number of downloads.',
  },
  INVALID_SHARE_PASSWORD: {
    title: 'Incorrect Password',
    description: 'The password you entered is incorrect. Please try again.',
  },
  TOKEN_NOT_FOUND: {
    title: 'Link Not Found',
    description: 'This share link does not exist or has been removed.',
  },
};

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;

  const [state, setState] = useState<SharePageState>({ phase: 'ready' });
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleDownload = useCallback(async (sharePassword?: string) => {
    setState({ phase: 'downloading' });
    setPasswordError('');

    try {
      const headers: Record<string, string> = {};
      if (sharePassword) {
        headers['X-Share-Password'] = sharePassword;
      }

      const response = await api.get(`/share/${token}`, {
        headers,
        responseType: 'blob',
      });

      // Extract filename from Content-Disposition header
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'download';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      // Trigger browser download
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setState({ phase: 'success', filename });
    } catch (err: unknown) {
      const apiError = getApiError(err);

      if (apiError.error === 'INVALID_SHARE_PASSWORD') {
        // Determine attempt number: if already in password-required state, increment; otherwise start at 1
        setState((prev) => {
          const attempt = prev.phase === 'password-required' ? (prev.attempt ?? 0) + 1 : 1;
          return { phase: 'password-required', attempt };
        });
        if (sharePassword) {
          setPasswordError('Incorrect password. Please try again.');
        }
        return;
      }

      const errorCode = apiError.error || 'UNKNOWN_ERROR';
      const retryable = !isTerminalShareError(errorCode);

      setState({
        phase: 'error',
        errorCode,
        message: apiError.message || 'An unexpected error occurred.',
        retryable,
      });
    }
  }, [token]);

  const handleInitialDownload = useCallback(() => {
    handleDownload();
  }, [handleDownload]);

  const handlePasswordSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setPasswordError('Password is required');
      return;
    }
    handleDownload(password);
  }, [password, handleDownload]);

  const handleRetry = useCallback(() => {
    setState({ phase: 'ready' });
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            ShadowVault
          </h1>
          <p className="text-text-secondary text-sm">
            Secure Encrypted File Sharing
          </p>
        </div>

        <Card className="p-8">
          {/* Ready state - Initial download button */}
          {state.phase === 'ready' && (
            <div className="text-center space-y-6">
              <div className="mx-auto w-16 h-16 rounded-full bg-text-accent/10 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-text-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-text-primary mb-2">
                  File Ready to Download
                </h2>
                <p className="text-text-secondary text-sm">
                  Someone has shared an encrypted file with you.
                </p>
              </div>
              <Button
                onClick={handleInitialDownload}
                size="lg"
                className="w-full"
              >
                Download File
              </Button>
            </div>
          )}

          {/* Password required state */}
          {state.phase === 'password-required' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-status-warning/10 flex items-center justify-center mb-4">
                  <svg
                    className="w-8 h-8 text-status-warning"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-text-primary mb-2">
                  Password Required
                </h2>
                <p className="text-text-secondary text-sm">
                  {state.attempt && state.attempt > 1
                    ? 'Incorrect password. Please try again.'
                    : 'This file is password-protected. Enter the password to download.'}
                </p>
              </div>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <Input
                  type="password"
                  label="Password"
                  placeholder="Enter share password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError('');
                  }}
                  error={passwordError}
                  autoFocus
                />
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                >
                  Unlock &amp; Download
                </Button>
              </form>
            </div>
          )}

          {/* Downloading state */}
          {state.phase === 'downloading' && (
            <div className="text-center space-y-6 py-4">
              <LoadingSpinner size="lg" />
              <div>
                <h2 className="text-xl font-semibold text-text-primary mb-2">
                  Downloading...
                </h2>
                <p className="text-text-secondary text-sm">
                  Decrypting and preparing your file for download.
                </p>
              </div>
            </div>
          )}

          {/* Success state */}
          {state.phase === 'success' && (
            <div className="text-center space-y-6">
              <div className="mx-auto w-16 h-16 rounded-full bg-status-success/10 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-status-success"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-text-primary mb-2">
                  Download Complete
                </h2>
                <p className="text-text-secondary text-sm">
                  <span className="font-medium text-text-primary">{state.filename}</span> has been successfully downloaded and decrypted.
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {state.phase === 'error' && (
            <div className="text-center space-y-6">
              <div className="mx-auto w-16 h-16 rounded-full bg-status-error/10 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-status-error"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-text-primary mb-2">
                  {ERROR_MESSAGES[state.errorCode]?.title || 'Download Failed'}
                </h2>
                <p className="text-text-secondary text-sm">
                  {ERROR_MESSAGES[state.errorCode]?.description || state.message}
                </p>
              </div>
              {state.retryable && (
                <Button
                  onClick={handleRetry}
                  variant="secondary"
                  size="lg"
                  className="w-full"
                >
                  Try Again
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* Footer */}
        <p className="text-center text-text-secondary/50 text-xs mt-6">
          Files are encrypted end-to-end with AES-256-GCM
        </p>
      </div>
    </main>
  );
}
