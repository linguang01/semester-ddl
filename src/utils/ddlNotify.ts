import type { Task } from '../types';

// 距 DDL 多久内提醒：24 小时（毫秒）
const DDL_WINDOW_MS = 24 * 60 * 60 * 1000;
// 页面开着时多久检查一次：15 分钟
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
// 去重用的 localStorage key 前缀（记录「已提醒过的任务 id → 当时的 deadline」）
const NOTIFIED_KEY_PREFIX = 'ddl-notify-';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

/** 当前通知权限状态（浏览器不支持时返回 unsupported） */
export function getNotificationState(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** 请求通知权限（必须在用户点击等手势中调用），返回请求后的状态 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result as NotificationPermissionState;
  } catch {
    return 'unsupported';
  }
}

/** 找出临近 DDL 的待办：未完成，且 0 < 剩余时间 <= 24 小时 */
export function findDueTasks(tasks: Task[], now = Date.now()): Task[] {
  return tasks.filter((task) => {
    if (task.status !== 'todo') return false;
    const remaining = new Date(task.deadline).getTime() - now;
    return remaining > 0 && remaining <= DDL_WINDOW_MS;
  });
}

/** 通过 Service Worker 弹系统通知；无 SW 时回退到页面内 new Notification */
async function showSystemNotification(title: string, body: string, tag: string): Promise<void> {
  // 优先走 SW：应用切后台/最小化时也能弹
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && reg.active) {
      reg.active.postMessage({ type: 'SHOW_DDL_NOTIFICATION', title, body, tag });
      return;
    }
  } catch {
    // 无 SW 环境，走下方回退
  }

  // 回退：仅在页面打开时生效
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, tag });
  }
}

/** 检查临近 DDL 的任务并弹通知；同一任务同一 deadline 只提醒一次（改 deadline 后重新提醒） */
export async function checkDdlNotifications(tasks: Task[]): Promise<void> {
  if (getNotificationState() !== 'granted') return;

  for (const task of findDueTasks(tasks)) {
    const key = `${NOTIFIED_KEY_PREFIX}${task.id}`;
    let notifiedDeadline = '';
    try {
      notifiedDeadline = localStorage.getItem(key) ?? '';
    } catch {
      notifiedDeadline = '';
    }
    // 已按当前 deadline 提醒过 → 跳过，避免每次打开都弹
    if (notifiedDeadline === task.deadline) continue;

    try {
      await showSystemNotification(
        'DDL 临近',
        `「${task.title}」距离截止不足 24 小时`,
        `ddl-${task.id}`,
      );
      try {
        localStorage.setItem(key, task.deadline);
      } catch {
        // localStorage 不可用时忽略；下次会再提醒一次，可接受
      }
    } catch {
      // 通知失败不阻塞主流程
    }
  }
}

/**
 * 启动 DDL 通知检查：立即查一次 + 页面可见时每 15 分钟查一次。
 * 通过 getTasks 拿到最新任务，避免闭包拿到过期数据。返回清理函数。
 */
export function initDdlNotifications(getTasks: () => Task[]): () => void {
  void checkDdlNotifications(getTasks());

  const timer = window.setInterval(() => {
    // 后台挂起时不查，切回前台会由页面可见性触发下一轮
    if (document.visibilityState === 'visible') {
      void checkDdlNotifications(getTasks());
    }
  }, CHECK_INTERVAL_MS);

  return () => window.clearInterval(timer);
}

/** 开启通知后立即发一条测试通知，让用户确认系统能弹 */
export async function sendTestNotification(): Promise<void> {
  await showSystemNotification('通知已开启', '之后有任务距离 DDL 不足 24 小时，会在这里提醒你', 'ddl-test');
}
