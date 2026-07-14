import type { AdminAuditFilters } from '@/types';

export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  files: {
    all: ['files'] as const,
    list: () => ['files', 'list'] as const,
    detail: (id: string) => ['files', 'detail', id] as const,
  },
  audit: {
    user: (page: number, limit: number) => ['audit', 'user', page, limit] as const,
  },
  admin: {
    users: (page: number, limit: number) => ['admin', 'users', page, limit] as const,
    audit: (page: number, filters: AdminAuditFilters) =>
      ['admin', 'audit', page, filters] as const,
  },
};
