'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';

export interface FileDashboardItem {
  fileId: string;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  expiresAt: string;
  downloadCount: number;
  maxDownloads: number;
  lastAccessedAt: string | null;
  status: 'active' | 'expired' | 'burned' | 'deleted';
  shareToken: string;
  encryptionStatus: 'encrypted';
}

export interface FileDetails extends FileDashboardItem {
  createdAt: string;
  downloadOnce: boolean;
  burnAfterReading: boolean;
}

const FILE_KEYS = {
  all: ['files'] as const,
  list: () => [...FILE_KEYS.all, 'list'] as const,
  detail: (id: string) => [...FILE_KEYS.all, 'detail', id] as const,
};

export function useFiles() {
  return useQuery<FileDashboardItem[]>({
    queryKey: FILE_KEYS.list(),
    queryFn: async () => {
      const response = await api.get('/files');
      return response.data;
    },
  });
}

export function useFileDetails(fileId: string) {
  return useQuery<FileDetails>({
    queryKey: FILE_KEYS.detail(fileId),
    queryFn: async () => {
      const response = await api.get(`/files/${fileId}`);
      return response.data;
    },
    enabled: !!fileId,
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fileId: string) => {
      await api.delete(`/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FILE_KEYS.all });
    },
    onError: (error) => {
      return getApiError(error);
    },
  });
}

export function useRevokeShareLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fileId: string) => {
      await api.post(`/files/${fileId}/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FILE_KEYS.all });
    },
    onError: (error) => {
      return getApiError(error);
    },
  });
}
