'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { useToast, ToastType, Toast as ToastItem } from '@/contexts/ToastContext';

const typeStyles: Record<ToastType, { container: string; icon: string }> = {
  success: {
    container:
      'border-green-500/30 bg-green-500/10 text-green-300',
    icon: 'text-green-400',
  },
  error: {
    container:
      'border-red-500/30 bg-red-500/10 text-red-300',
    icon: 'text-red-400',
  },
  info: {
    container:
      'border-blue-500/30 bg-blue-500/10 text-blue-300',
    icon: 'text-blue-400',
  },
};

const typeIcons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

function ToastCard({ toast }: { toast: ToastItem }) {
  const { dismissToast } = useToast();
  const styles = typeStyles[toast.type];
  const Icon = typeIcons[toast.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      role="alert"
      className={`
        flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-md
        shadow-lg max-w-sm w-full pointer-events-auto
        ${styles.container}
      `}
    >
      <Icon size={18} className={`mt-0.5 flex-shrink-0 ${styles.icon}`} />
      <p className="flex-1 text-sm font-medium leading-snug">{toast.message}</p>
      <button
        onClick={() => dismissToast(toast.id)}
        className="flex-shrink-0 p-0.5 rounded-lg hover:bg-white/10 transition-colors"
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
}

export function ToastContainer() {
  const { toasts } = useToast();

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
