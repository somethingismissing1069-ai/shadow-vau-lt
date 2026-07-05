'use client';

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import { AxiosProgressEvent } from 'axios';
import { Button, Card, Input } from '@/components/ui';
import { api, getApiError } from '@/lib/api';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const EXPIRY_OPTIONS = [
  { label: '5 minutes', value: 300 },
  { label: '30 minutes', value: 1800 },
  { label: '1 hour', value: 3600 },
  { label: '24 hours', value: 86400 },
  { label: '7 days', value: 604800 },
] as const;

interface UploadResponse {
  fileId: string;
  shareUrl: string;
  token: string;
  expiresAt: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [expirySeconds, setExpirySeconds] = useState<number>(3600);
  const [maxDownloads, setMaxDownloads] = useState<string>('1');
  const [burnAfterReading, setBurnAfterReading] = useState(false);
  const [password, setPassword] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((selectedFile: File): boolean => {
    if (selectedFile.size > MAX_FILE_SIZE) {
      setFileSizeError(`File exceeds the maximum size of 100MB. Selected file is ${formatFileSize(selectedFile.size)}.`);
      return false;
    }
    setFileSizeError(null);
    return true;
  }, []);

  const handleFileSelect = useCallback((selectedFile: File) => {
    setError(null);
    setUploadResult(null);
    if (validateFile(selectedFile)) {
      setFile(selectedFile);
    } else {
      setFile(null);
    }
  }, [validateFile]);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFileSelect(droppedFiles[0]);
    }
  }, [handleFileSelect]);

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleUpload = async () => {
    if (!file) return;

    setError(null);
    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('expiresInSeconds', String(expirySeconds));
      formData.append('maxDownloads', maxDownloads || '1');
      formData.append('burnAfterReading', String(burnAfterReading));
      formData.append('downloadOnce', String(burnAfterReading));
      if (password) {
        formData.append('password', password);
      }

      const response = await api.post<UploadResponse>('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent: AxiosProgressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        },
      });

      setUploadResult(response.data);
      setUploadProgress(100);
    } catch (err) {
      const apiError = getApiError(err);
      setError(apiError.message);
    } finally {
      setUploading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!uploadResult) return;
    try {
      await navigator.clipboard.writeText(uploadResult.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = uploadResult.shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReset = () => {
    setFile(null);
    setUploadResult(null);
    setError(null);
    setUploadProgress(0);
    setFileSizeError(null);
    setCopied(false);
  };

  // Success state
  if (uploadResult) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6">
        <Card className="w-full max-w-lg p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-status-success/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-text-primary mb-2">Upload Successful</h2>
            <p className="text-text-secondary">Your file has been encrypted and is ready to share.</p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-text-secondary mb-2">Share Link</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={uploadResult.shareUrl}
                className="glass-input flex-1 text-sm truncate"
              />
              <Button
                onClick={handleCopyLink}
                variant={copied ? 'secondary' : 'primary'}
                size="md"
              >
                {copied ? (
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </span>
                )}
              </Button>
            </div>
          </div>

          <div className="text-sm text-text-secondary mb-6">
            <p>Expires: {new Date(uploadResult.expiresAt).toLocaleString()}</p>
          </div>

          <Button onClick={handleReset} variant="secondary" className="w-full">
            Upload Another File
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Upload File</h1>
          <p className="text-text-secondary">Encrypt and share files securely with configurable expiry</p>
        </div>

        <Card className="p-8">
          {/* Drag-and-Drop Zone */}
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={handleBrowseClick}
            className={`
              relative mb-6 p-8 border-2 border-dashed rounded-xl cursor-pointer
              transition-all duration-200 text-center
              ${isDragging
                ? 'border-text-accent bg-text-accent/5 scale-[1.02]'
                : 'border-border-glass hover:border-border-focus hover:bg-bg-glass/50'
              }
              ${file ? 'border-status-success/50 bg-status-success/5' : ''}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleInputChange}
              className="hidden"
            />

            {file ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-status-success/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-text-primary font-medium">{file.name}</p>
                  <p className="text-text-secondary text-sm">{formatFileSize(file.size)}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setFileSizeError(null);
                  }}
                  className="text-sm text-text-secondary hover:text-status-error transition-colors"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-text-accent/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-text-primary font-medium">
                    {isDragging ? 'Drop your file here' : 'Drag & drop your file here'}
                  </p>
                  <p className="text-text-secondary text-sm mt-1">
                    or click to browse (max 100MB)
                  </p>
                </div>
              </div>
            )}
          </div>

          {fileSizeError && (
            <div className="mb-4 p-3 rounded-lg bg-status-error/10 border border-status-error/30 text-status-error text-sm">
              {fileSizeError}
            </div>
          )}

          {/* Upload Options */}
          <div className="space-y-5">
            {/* Expiry Time */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Expiry Time
              </label>
              <select
                value={expirySeconds}
                onChange={(e) => setExpirySeconds(Number(e.target.value))}
                className="glass-input appearance-none"
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} className="bg-bg-secondary text-text-primary">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Max Downloads */}
            <Input
              label="Maximum Downloads"
              type="number"
              min="1"
              max="1000"
              value={maxDownloads}
              onChange={(e) => setMaxDownloads(e.target.value)}
              placeholder="1"
            />

            {/* Burn After Reading Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">Burn After Reading</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  File is permanently destroyed after first download
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={burnAfterReading}
                onClick={() => setBurnAfterReading(!burnAfterReading)}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full
                  transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 focus:ring-offset-bg-primary
                  ${burnAfterReading ? 'bg-text-accent' : 'bg-border-glass'}
                `}
              >
                <span
                  className={`
                    inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200
                    ${burnAfterReading ? 'translate-x-6' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>

            {/* Password (Optional) */}
            <Input
              label="Password (optional)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Set a password to protect this share"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-3 rounded-lg bg-status-error/10 border border-status-error/30 text-status-error text-sm">
              {error}
            </div>
          )}

          {/* Upload Progress */}
          {uploading && (
            <div className="mt-6">
              <div className="flex justify-between text-sm text-text-secondary mb-2">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 bg-bg-glass rounded-full overflow-hidden">
                <div
                  className="h-full bg-text-accent rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload Button */}
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            isLoading={uploading}
            size="lg"
            className="w-full mt-6"
          >
            {uploading ? 'Encrypting & Uploading...' : 'Encrypt & Upload'}
          </Button>
        </Card>
      </div>
    </main>
  );
}
