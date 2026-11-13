import { useDialog } from '../hooks/useDialog';

interface ConfirmDialogProps {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** primary：常规确认；danger：破坏性操作（覆盖/删除）用红色强调 */
  tone?: 'primary' | 'danger';
  /** 是否允许 Esc / 点遮罩取消；必须显式二选一的场景设为 false */
  dismissible?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title = '请确认',
  message,
  confirmText = '确定',
  cancelText = '取消',
  tone = 'primary',
  dismissible = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useDialog(onCancel, { closeOnEscape: dismissible });

  const confirmClass =
    tone === 'danger'
      ? 'bg-rose-600 text-white dark:bg-rose-600'
      : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div
        className="overlay-fade absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/60"
        onClick={dismissible ? onCancel : undefined}
        role="presentation"
      />

      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="pop-enter relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl outline-none dark:bg-slate-900"
      >
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{message}</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 transition active:scale-[0.99] dark:border-slate-700 dark:text-slate-300"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-11 rounded-xl text-sm font-medium transition active:scale-[0.99] ${confirmClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
