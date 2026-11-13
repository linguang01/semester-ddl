import { useEffect, useState } from 'react';

/**
 * 返回一个定时刷新的「当前时间」，用于驱动倒计时文案、DDL 进度条随时间走动。
 *
 * 两个细节：
 * 1. 页面在后台时不刷新（手机省电，且后台刷新也没人看）；
 * 2. 切回前台立刻同步一次，避免看到「切走那一刻」的旧时间。
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const tickWhenVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };

    const timer = window.setInterval(tickWhenVisible, intervalMs);
    document.addEventListener('visibilitychange', tickWhenVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tickWhenVisible);
    };
  }, [intervalMs]);

  return now;
}
