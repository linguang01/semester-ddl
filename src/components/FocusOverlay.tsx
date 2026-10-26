import { useEffect } from 'react';
import { FOCUS_DURATION_SECONDS, type FocusStatus } from '../hooks/useFocusTimer';
import { PauseIcon, PlayIcon, StopIcon } from './icons';

interface FocusOverlayProps {
  taskTitle: string;
  status: FocusStatus;
  remainingSeconds: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

/** 秒数 → "MM:SS"（如 2160 → "36:00"） */
function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function FocusOverlay({
  taskTitle,
  status,
  remainingSeconds,
  onPause,
  onResume,
  onStop,
}: FocusOverlayProps) {
  // 打开时锁定背景滚动
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const finished = status === 'finished';
  const progress = remainingSeconds / FOCUS_DURATION_SECONDS;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="overlay-fade absolute inset-0 bg-slate-950/70 backdrop-blur-md" />

      <div className="pop-enter relative w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-slate-900">
        {finished ? (
          <>
            <div className="text-5xl leading-none">🎉</div>
            <h2 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
              专注结束！
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              快起来喝口水、看看窗外，休息 6 分钟吧！
            </p>
            <button
              type="button"
              onClick={onStop}
              className="mt-5 h-12 w-full rounded-xl bg-indigo-600 text-sm font-medium text-white transition active:scale-[0.99]"
            >
              知道了
            </button>
          </>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              专注中
            </p>
            <h2 className="mt-1 truncate text-base font-semibold text-slate-900 dark:text-slate-100">
              {taskTitle}
            </h2>

            {/* tabular-nums 避免数字跳动导致布局抖动 */}
            <div className="mt-5 text-6xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-100">
              {formatSeconds(remainingSeconds)}
            </div>

            {/* 进度条：宽度随剩余时间变化，transition 保证平滑 */}
            <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-500 transition-[width] duration-1000 ease-linear"
                style={{ width: `${Math.max(progress * 100, 0)}%` }}
              />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {status === 'running' ? (
                <button
                  type="button"
                  onClick={onPause}
                  className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 transition active:scale-[0.99] dark:border-slate-700 dark:text-slate-200"
                >
                  <PauseIcon className="h-4 w-4" />
                  暂停
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onResume}
                  className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 transition active:scale-[0.99] dark:border-slate-700 dark:text-slate-200"
                >
                  <PlayIcon className="h-4 w-4" />
                  继续
                </button>
              )}

              <button
                type="button"
                onClick={onStop}
                className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-rose-50 text-sm font-medium text-rose-600 transition active:scale-[0.99] dark:bg-rose-500/15 dark:text-rose-400"
              >
                <StopIcon className="h-4 w-4" />
                结束
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
