import { useCallback, useEffect, useState } from 'react';

/** 单次专注时长（秒）：36 分钟 */
export const FOCUS_DURATION_SECONDS = 36 * 60;

/** 专注状态机：空闲 / 进行中 / 暂停 / 已结束 */
export type FocusStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface UseFocusTimerResult {
  /** 当前专注的任务 id；null 表示未在专注 */
  focusTaskId: string | null;
  status: FocusStatus;
  /** 剩余秒数（初始 2160） */
  remainingSeconds: number;
  start: (taskId: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

/**
 * 专注倒计时逻辑。
 * 用 setInterval 每秒 -1；暂停/卸载/结束都会清理 interval（防内存泄漏）。
 * 刷新页面即重置（第一版不做后台持续计时）。
 */
export function useFocusTimer(): UseFocusTimerResult {
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<FocusStatus>('idle');
  const [remainingSeconds, setRemainingSeconds] = useState(FOCUS_DURATION_SECONDS);

  // 计时核心：仅 running 时挂 interval，其余状态（含暂停）都不计时。
  // 依赖 [status]：status 变化会先清理上一个 interval，再按需挂新的，天然防重复计时。
  useEffect(() => {
    if (status !== 'running') return;

    const timer = window.setInterval(() => {
      // 用函数式更新，避免闭包读到过期值；到 0 后不再递减
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status]);

  // 归零判定：剩余秒数到 0 时切换到 finished。
  // 放在独立 effect，避免在 setState 的 updater 里触发另一个 setState（React 禁止副作用）。
  useEffect(() => {
    if (status === 'running' && remainingSeconds === 0) {
      setStatus('finished');
    }
  }, [status, remainingSeconds]);

  const start = useCallback((taskId: string) => {
    setFocusTaskId(taskId);
    setRemainingSeconds(FOCUS_DURATION_SECONDS);
    setStatus('running');
  }, []);

  const pause = useCallback(() => {
    setStatus((prev) => (prev === 'running' ? 'paused' : prev));
  }, []);

  const resume = useCallback(() => {
    setStatus((prev) => (prev === 'paused' ? 'running' : prev));
  }, []);

  const stop = useCallback(() => {
    setFocusTaskId(null);
    setRemainingSeconds(FOCUS_DURATION_SECONDS);
    setStatus('idle');
  }, []);

  return { focusTaskId, status, remainingSeconds, start, pause, resume, stop };
}
