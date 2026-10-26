import { useRegisterSW } from 'virtual:pwa-register/react';
import { XIcon } from './icons';

/**
 * PWA 新版本更新提示（非阻塞 Toast）。
 *
 * 触发链路：
 * 1. Service Worker 检测到新版本进入 waiting 状态 → 插件内部把 needRefresh 置为 true。
 * 2. 本组件渲染右下角 Toast，文案「发现新版本，点击刷新」。
 * 3. 用户点击 → updateServiceWorker(true) 向旧 SW 发 skipWaiting，
 *    新 SW 接管后插件自动 window.location.reload() 完成刷新。
 *
 * 注意：registerType 已改为 'prompt'，必须由本组件手动注册/消费，
 *       否则不会自动弹出（也不会自动更新）。
 */
export function UpdatePrompt() {
  // useRegisterSW 内部已自动 setNeedRefresh(true)，无需额外传 onNeedRefresh
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  // 无新版本时不渲染任何东西
  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="toast-enter fixed right-4 z-50 flex max-w-[calc(100vw-2rem)] items-stretch overflow-hidden rounded-xl bg-slate-900 text-sm font-medium text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
      style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="px-4 py-3 text-left"
      >
        发现新版本，点击刷新
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        aria-label="暂不更新"
        className="flex shrink-0 items-center border-l border-white/20 px-3 text-slate-300 transition hover:text-white dark:border-slate-900/10 dark:text-slate-500 dark:hover:text-slate-900"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
