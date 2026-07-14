'use client';

import { useState, useRef, useCallback, useEffect, DragEvent, ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosProgressEvent } from 'axios';
import { Button, Card, Input } from '@/components/ui';
import { ProtectedRoute } from '@/components/auth';
import { uploadSchema } from '@/lib/schemas';
import { api, getApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { z } from 'zod';

type UploadFormData = z.infer<typeof uploadSchema>;

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const EXPIRY_OPTIONS = [
  { label: '5 minutes', value: 300 },
  { label: '30 minutes', value: 1800 },
  { label: '1 hour', value: 3600 },
  { label: '24 hours', value: 86400 },
  { label: '7 days', value: 604800 },
  { label: 'Custom', value: -1 },
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

function UploadPageContent() {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedExpiryOption, setSelectedExpiryOption] = useState<number>(3600);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { showToast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
    reset,
  } = useForm<UploadFormData>({
    resolver: zodResolver(uploadSchema),
    mode: 'onBlur',
    defaultValues: {
      expiresInSeconds: 3600,
      downloadOnce: false,
      burnAfterReading: false,
      password: '',
      maxDownloads: 1,
    },
  });

  const file = watch('file');
  const downloadOnce = watch('downloadOnce');
  const burnAfterReading = watch('burnAfterReading');
  const expiresInSeconds = watch('expiresInSeconds');

  // When downloadOnce is toggled on, set maxDownloads to 1 and disable the field
  useEffect(() => {
    if (downloadOnce) {
      setValue('maxDownloads', 1);
    }
  }, [downloadOnce, setValue]);

  const isCustomExpiry = selectedExpiryOption === -1;

  const handleFileSelect = useCallback((selectedFile: File) => {
    setError(null);
    setUploadResult(null);
    setValue('file', selectedFile);
    trigger('file');
  }, [setValue, trigger]);

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

  const handleExpiryOptionChange = useCallback((value: number) => {
    setSelectedExpiryOption(value);
    if (value !== -1) {
      setValue('expiresInSeconds', value);
      trigger('expiresInSeconds');
    }
  }, [setValue, trigger]);

  const handleCustomExpiryChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      setValue('expiresInSeconds', val);
    } else {
      setValue('expiresInSeconds', 0);
    }
    trigger('expiresInSeconds');
  }, [setValue, trigger]);

  const onSubmit = async (data: UploadFormData) => {
    if (!data.file) return;

    setError(null);
    setUploading(true);
    setUploadProgress(0);

    // Create an AbortController for the 30-second timeout (Requirement 13.5)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('expiresInSeconds', String(data.expiresInSeconds));
      formData.append('maxDownloads', String(data.maxDownloads ?? 1));
      formData.append('burnAfterReading', String(data.burnAfterReading));
      formData.append('downloadOnce', String(data.downloadOnce));
      if (data.password) {
        formData.append('password', data.password);
      }

      const response = await api.post<UploadResponse>('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        signal: controller.signal,
        timeout: 30000,
        onUploadProgress: (progressEvent: AxiosProgressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        },
      });

      setUploadResult(response.data);
      setUploadProgress(100);
      // Reset form to default state on success (Requirement 7.9)
      reset();
      setSelectedExpiryOption(3600);
    } catch (err) {
      // Form data is preserved on error (Requirement 13.5) - no reset here
      if (controller.signal.aborted) {
        const timeoutMsg = 'Upload timed out. The server did not respond within 30 seconds. Please try again.';
        setError(timeoutMsg);
        showToast(timeoutMsg, 'error');
      } else {
        const apiError = getApiError(err);
        setError(apiError.message);
        showToast(apiError.message || 'Upload failed', 'error');
      }
    } finally {
      clearTimeout(timeoutId);
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
    reset();
    setUploadResult(null);
    setError(null);
    setUploadProgress(0);
    setCopied(false);
    setSelectedExpiryOption(3600);
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
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            {/* Drag-and-Drop Zone */}
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={handleBrowseClick}
              className={`
                relative mb-2 p-8 border-2 border-dashed rounded-xl cursor-pointer
                transition-all duration-200 text-center
                ${isDragging
                  ? 'border-text-accent bg-text-accent/5 scale-[1.02]'
                  : 'border-border-glass hover:border-border-focus hover:bg-bg-glass/50'
                }
                ${file ? 'border-status-success/50 bg-status-success/5' : ''}
                ${errors.file ? 'border-status-error/50' : ''}
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
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setValue('file', undefined as unknown as File);
                      trigger('file');
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

            {errors.file && (
              <p className="mb-4 text-sm text-status-error" role="alert">
                {errors.file.message}
              </p>
            )}

            {/* Upload Options */}
            <div className="space-y-5 mt-4">
              {/* Expiry Time */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Expiry Time
                </label>
                <select
                  value={selectedExpiryOption}
                  onChange={(e) => handleExpiryOptionChange(Number(e.target.value))}
                  className="glass-input appearance-none"
                  aria-label="Expiry time preset"
                >
                  {EXPIRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} className="bg-bg-secondary text-text-primary">
                      {option.label}
                    </option>
                  ))}
                </select>

                {isCustomExpiry && (
                  <div className="mt-2">
                    <input
                      type="number"
                      min={60}
                      max={2592000}
                      value={expiresInSeconds || ''}
                      onChange={handleCustomExpiryChange}
                      onBlur={() => trigger('expiresInSeconds')}
                      placeholder="Duration in seconds (60 – 2592000)"
                      className="glass-input"
                      aria-label="Custom expiry duration in seconds"
                    />
                  </div>
                )}

                {errors.expiresInSeconds && (
                  <p className="mt-1 text-sm text-status-error" role="alert">
                    {errors.expiresInSeconds.message}
                  </p>
                )}
              </div>

              {/* Download Once Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">Download Once</p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Limits to a single download and disables max downloads
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={downloadOnce}
                  aria-label="Download once toggle"
                  onClick={() => {
                    setValue('downloadOnce', !downloadOnce);
                  }}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full
                    transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 focus:ring-offset-bg-primary
                    ${downloadOnce ? 'bg-text-accent' : 'bg-border-glass'}
                  `}
                >
                  <span
                    className={`
                      inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200
                      ${downloadOnce ? 'translate-x-6' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>

              {/* Max Downloads */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Maximum Downloads
                </label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  disabled={downloadOnce}
                  value={watch('maxDownloads') ?? ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setValue('maxDownloads', isNaN(val) ? undefined : val);
                  }}
                  onBlur={() => trigger('maxDownloads')}
                  placeholder="1"
                  className={`glass-input ${downloadOnce ? 'opacity-50 cursor-not-allowed' : ''}`}
                  aria-label="Maximum downloads"
                />
                {errors.maxDownloads && (
                  <p className="mt-1 text-sm text-status-error" role="alert">
                    {errors.maxDownloads.message}
                  </p>
                )}
              </div>

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
                  aria-label="Burn after reading toggle"
                  onClick={() => {
                    setValue('burnAfterReading', !burnAfterReading);
                  }}
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
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Password (optional)
                </label>
                <input
                  type="password"
                  {...register('password')}
                  placeholder="Set a password to protect this share"
                  className="glass-input"
                  aria-label="Share password"
                />
                {errors.password && (
                  <p className="mt-1 text-sm text-status-error" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>
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
              type="submit"
              disabled={!file || uploading}
              isLoading={uploading}
              size="lg"
              className="w-full mt-6"
            >
              {uploading ? 'Encrypting & Uploading...' : 'Encrypt & Upload'}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}

export default function UploadPage() {
  return (
    <ProtectedRoute>
      <UploadPageContent />
    </ProtectedRoute>
  );
}
