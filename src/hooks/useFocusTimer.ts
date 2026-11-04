import { useCallback, useEffect, useRef, useState } from 'react';

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

/** 计时刷新间隔（毫秒）：500ms 保证秒数视觉上不跳格 */
const TICK_MS = 500;

/**
 * 专注倒计时逻辑。
 *
 * 关键实现：以「结束时刻（epoch ms）」为唯一真源，每秒重算 `结束时刻 - 现在`，
 * 而不是用 setInterval 每秒 -1。
 * 原因：手机切后台后浏览器会节流甚至暂停定时器，-1 的写法会让 36 分钟变成一小时，
 * 回到前台再按时间戳重算就不会漂移。
 * 刷新页面仍会重置（不做跨会话持久化）。
 */
export function useFocusTimer(): UseFocusTimerResult {
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<FocusStatus>('idle');
  const [remainingSeconds, setRemainingSeconds] = useState(FOCUS_DURATION_SECONDS);

  // 结束时刻；仅 running 时有值，paused / idle / finished 一律为 null
  const endAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== 'running') return;

    const sync = () => {
      const endAt = endAtRef.current;
      if (endAt === null) return;

      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemainingSeconds(left);

      if (left === 0) {
        endAtRef.current = null;
        setStatus('finished');
      }
    };

    // 立即同步一次：从暂停恢复、从后台切回时不用等下一个 tick
    sync();

    const timer = window.setInterval(sync, TICK_MS);
    document.addEventListener('visibilitychange', sync);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [status]);

  const start = useCallback((taskId: string) => {
    endAtRef.current = Date.now() + FOCUS_DURATION_SECONDS * 1000;
    setFocusTaskId(taskId);
    setRemainingSeconds(FOCUS_DURATION_SECONDS);
    setStatus('running');
  }, []);

  const pause = useCallback(() => {
    const endAt = endAtRef.current;
    if (endAt === null) return; // 只有 running 才有结束时刻

    endAtRef.current = null;
    const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    setRemainingSeconds(left);
    setStatus(left === 0 ? 'finished' : 'paused');
  }, []);

  const resume = useCallback(() => {
    if (status !== 'paused') return;

    endAtRef.current = Date.now() + remainingSeconds * 1000;
    setStatus('running');
  }, [status, remainingSeconds]);

  const stop = useCallback(() => {
    endAtRef.current = null;
    setFocusTaskId(null);
    setRemainingSeconds(FOCUS_DURATION_SECONDS);
    setStatus('idle');
  }, []);

  return { focusTaskId, status, remainingSeconds, start, pause, resume, stop };
}
