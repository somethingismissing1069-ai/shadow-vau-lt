'use client';

type StatusType = 'active' | 'expired' | 'burned' | 'deleted';

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; styles: string }> = {
  active: {
    label: 'Active',
    styles: 'bg-status-success/10 text-status-success border-status-success/30',
  },
  expired: {
    label: 'Expired',
    styles: 'bg-status-warning/10 text-status-warning border-status-warning/30',
  },
  burned: {
    label: 'Burned',
    styles: 'bg-status-error/10 text-status-error border-status-error/30',
  },
  deleted: {
    label: 'Deleted',
    styles: 'bg-text-secondary/10 text-text-secondary border-text-secondary/30',
  },
};

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 text-xs font-medium
        rounded-full border
        ${config.styles}
        ${className}
      `}
    >
      {config.label}
    </span>
  );
}
