import { useEffect } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

/** 提示条上的操作（目前用于「撤销」）：手滑删掉/移出时给一条退路 */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export type Notify = (message: string, tone?: ToastTone, action?: ToastAction) => void;

export interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

/** 带操作的提示要留足反应时间，否则刚看到就消失了 */
const AUTO_DISMISS_MS = 2800;
const ACTION_DISMISS_MS = 6000;

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
    const timer = window.setTimeout(onDismiss, toast.action ? ACTION_DISMISS_MS : AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.action, onDismiss]);

  return (
    <div className="bottom-above-tabbar pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4">
      <div
        key={toast.id}
        role="status"
        aria-live="polite"
        className={`toast-enter flex w-full max-w-sm items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${TONE_STYLE[toast.tone]}`}
      >
        <span className="min-w-0 flex-1 text-left">{toast.message}</span>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss();
            }}
            className="pointer-events-auto shrink-0 rounded-lg border border-white/40 px-2.5 py-1 text-xs font-semibold transition active:scale-95"
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
