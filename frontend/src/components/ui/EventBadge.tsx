'use client';

import type { AuditEventType } from '@/types';

interface EventBadgeProps {
  eventType: AuditEventType;
  className?: string;
}

const eventConfig: Record<AuditEventType, { label: string; styles: string }> = {
  UPLOAD: {
    label: 'Upload',
    styles: 'bg-blue-500/10 text-blue-400',
  },
  DOWNLOAD: {
    label: 'Download',
    styles: 'bg-green-500/10 text-green-400',
  },
  DELETE: {
    label: 'Delete',
    styles: 'bg-red-500/10 text-red-400',
  },
  BURN: {
    label: 'Burn',
    styles: 'bg-orange-500/10 text-orange-400',
  },
  EXPIRE: {
    label: 'Expire',
    styles: 'bg-yellow-500/10 text-yellow-400',
  },
  FAIL_ATTEMPT: {
    label: 'Fail Attempt',
    styles: 'bg-amber-500/10 text-amber-400',
  },
  LOGIN: {
    label: 'Login',
    styles: 'bg-cyan-500/10 text-cyan-400',
  },
  LOGOUT: {
    label: 'Logout',
    styles: 'bg-gray-500/10 text-gray-400',
  },
  PASSWORD_RESET: {
    label: 'Password Reset',
    styles: 'bg-purple-500/10 text-purple-400',
  },
  LINK_CREATED: {
    label: 'Link Created',
    styles: 'bg-teal-500/10 text-teal-400',
  },
  LINK_REVOKED: {
    label: 'Link Revoked',
    styles: 'bg-rose-500/10 text-rose-400',
  },
};

export function EventBadge({ eventType, className = '' }: EventBadgeProps) {
  const config = eventConfig[eventType];

  return (
    <span
      className={`
        inline-flex items-center px-2 py-0.5 text-xs font-medium
        rounded-full
        ${config.styles}
        ${className}
      `}
    >
      {config.label}
    </span>
  );
}
