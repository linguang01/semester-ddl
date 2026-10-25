import { useEffect } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

export type Notify = (message: string, tone?: ToastTone) => void;

export interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

const TONE_STYLE: Record<ToastTone, string> = {
  info: 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900',
  success: 'bg-emerald-600 text-white',
  error: 'bg-rose-600 text-white',
};

interface ToastProps {
  toast: ToastMessage;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 2800);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-above-tabbar z-50 flex justify-center px-4">
      <div
        key={toast.id}
        role="status"
        aria-live="polite"
        className={`toast-enter w-full max-w-sm rounded-xl px-4 py-3 text-center text-sm font-medium shadow-lg ${TONE_STYLE[toast.tone]}`}
      >
        {toast.message}
      </div>
    </div>
  );
}
