import { useEffect, useSyncExternalStore } from 'react';
import {
  fullSync,
  getSyncStatus,
  setCurrentSyncUser,
  subscribeSyncStatus,
  type SyncStatus,
} from '../lib/sync';

/**
 * 同步生命周期管理：登录后启动全量同步 + 自动重同步。
 * Realtime 订阅由同步引擎在首次同步成功后建立，账号冲突时不会偷跑。
 *
 * 自动触发时机：登录成功、网络恢复、回到前台、每 5 分钟兜底。
 * fullSync 内部有并发共享与 30 秒最小间隔守卫，重复触发是安全的。
 */
export function useSyncManager(userId: string | null): SyncStatus {
  const status = useSyncExternalStore(subscribeSyncStatus, getSyncStatus);

  useEffect(() => {
    setCurrentSyncUser(userId);

    if (userId === null) return;

    const run = () => {
      void fullSync(userId).catch(() => {
        // 失败已记录到 syncStatus.lastError，由 UI 展示；这里无需处理
      });
    };

    // 登录后立即全量同步；同步成功后会由同步引擎建立实时订阅。
    run();

    const handleOnline = () => run();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = window.setInterval(run, 5 * 60_000);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(interval);
    };
  }, [userId]);

  return status;
}
