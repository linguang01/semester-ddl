import { useEffect, useRef, type RefObject } from 'react';

const dialogStack: string[] = [];
let nextDialogId = 0;
let previousBodyOverflow = '';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  );
}

export interface DialogOptions {
  /** 嵌套确认框等场景可关闭 Esc（默认开启） */
  closeOnEscape?: boolean;
}

/**
 * 统一弹窗生命周期：
 * - 只让最上层响应 Escape；
 * - body 滚动锁支持嵌套；
 * - 打开后聚焦弹窗，关闭后恢复原焦点；
 * - Tab/Shift+Tab 在弹窗内循环。
 */
export function useDialog(
  onClose?: () => void,
  options: DialogOptions = {},
): RefObject<HTMLDivElement | null> {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const optionsRef = useRef(options);
  const stackIdRef = useRef<string>('');

  useEffect(() => {
    closeRef.current = onClose;
    optionsRef.current = options;
  }, [onClose, options]);

  useEffect(() => {
    const id = `dialog-${nextDialogId++}`;
    stackIdRef.current = id;
    dialogStack.push(id);

    if (dialogStack.length === 1) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog || dialog.contains(document.activeElement)) return;
      (getFocusable(dialog)[0] ?? dialog).focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== id) return;
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (event.key === 'Escape' && optionsRef.current.closeOnEscape !== false) {
        if (!closeRef.current) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusable(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown);

      const index = dialogStack.lastIndexOf(id);
      if (index >= 0) dialogStack.splice(index, 1);

      if (dialogStack.length === 0) {
        document.body.style.overflow = previousBodyOverflow;
      }
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return dialogRef;
}
