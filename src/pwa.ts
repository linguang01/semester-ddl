import { registerSW } from 'virtual:pwa-register';

/**
 * PWA 更新策略（解决「改完代码，手机上还是旧版」的问题）
 *
 * 浏览器默认只在「打开页面 / 页面导航」时检查 sw.js 是否有更新，而且 CDN 边缘节点
 * 可能把 sw.js 缓存在边缘（需配合部署端 Cache-Control: no-cache，见 vercel.json /
 * edgeone.json），导致新版本一直装不上。这里在默认机制之上加主动检查：
 *
 * - 从后台切回前台、网络恢复时各检查一次；
 * - 页面一直开着时每小时检查一次（覆盖 PWA 挂在后台不触发导航的场景）；
 * - 设置面板里可以手动「检查更新」。
 *
 * 新 SW（构建时带 skipWaiting/clientsClaim）安装完成后立即激活，随后自动刷新页面
 * 加载新版本；用户正在操作时会延迟到切后台时再刷新，最多等 2 分钟。
 */

const PERIODIC_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MIN_CHECK_GAP_MS = 60 * 1000;
const DEFERRED_RELOAD_TIMEOUT_MS = 2 * 60 * 1000;
const LAUNCH_GRACE_MS = 30 * 1000;

export type UpdateCheckResult = 'updated' | 'latest' | 'offline' | 'unsupported' | 'error';

let registration: ServiceWorkerRegistration | undefined;
let lastCheckAt = 0;
let newVersionFound = false;
let reloadTriggered = false;
let immediateReloadUntil = 0;
const pageLoadedAt = Date.now();

function reloadPage() {
  if (reloadTriggered) return;
  reloadTriggered = true;
  window.location.reload();
}

function onHiddenReload() {
  if (document.visibilityState === 'hidden') reloadPage();
}

function handleNeedReload() {
  const now = Date.now();
  // 刚打开应用（启动阶段）或刚手动检查出更新：立即刷新，不等待
  if (document.visibilityState === 'hidden' || now - pageLoadedAt < LAUNCH_GRACE_MS || now < immediateReloadUntil) {
    reloadPage();
    return;
  }

  // 使用中途发现的更新：等切到后台再刷新，避免打断正在输入的内容；最多等 2 分钟
  document.addEventListener('visibilitychange', onHiddenReload);
  window.setTimeout(reloadPage, DEFERRED_RELOAD_TIMEOUT_MS);
}

async function runUpdateCheck(): Promise<void> {
  if (!registration) return;
  if (Date.now() - lastCheckAt < MIN_CHECK_GAP_MS) return;
  lastCheckAt = Date.now();

  try {
    // update() 会重新拉取 sw.js（绕过浏览器 HTTP 缓存），
    // 发现新版本时走「安装 → skipWaiting 激活 → 自动刷新」流程
    await registration.update();
  } catch {
    // 离线、弱网或部署地址变化时静默失败，等下次触发再试
  }
}

export function initPwa() {
  // 开发模式不生成 Service Worker（devOptions.enabled 为 false），跳过注册
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;

  registerSW({
    onNeedReload: handleNeedReload,
    onRegisteredSW(_swScriptUrl, reg) {
      if (!reg) return;
      registration = reg;

      reg.addEventListener('updatefound', () => {
        newVersionFound = true;
      });

      // 页面一直开着（PWA 从主屏幕打开后挂在后台/常驻）也要能发现新版本
      window.setInterval(() => void runUpdateCheck(), PERIODIC_CHECK_INTERVAL_MS);

      // 从后台切回前台时检查：覆盖「只有打开应用才会更新」的主场景
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void runUpdateCheck();
      });

      // 网络恢复时检查：离线打开应用、联网后立即追上最新版
      window.addEventListener('online', () => void runUpdateCheck());

      // iOS 从缓存恢复页面（bfcache）时不触发 visibilitychange，用 pageshow 补一次检查
      window.addEventListener('pageshow', (event) => {
        if (event.persisted) void runUpdateCheck();
      });
    },
    onRegisterError(error) {
      console.warn('Service Worker 注册失败（不影响应用使用）', error);
    },
  });
}

/**
 * 手动检查更新（设置面板按钮）。
 * 发现新版本时会自动走「安装 → 激活 → 刷新」流程，无需额外处理。
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  if (!navigator.onLine) return 'offline';

  try {
    // 不传参按当前页面 URL 匹配 scope，兼容根路径与子路径（GitHub Pages）部署
    const reg = registration ?? (await navigator.serviceWorker.getRegistration());
    if (!reg) return 'unsupported';

    // 手动检查发现新版本时立即刷新，不走延迟逻辑（须在 update() 之前设置）
    immediateReloadUntil = Date.now() + LAUNCH_GRACE_MS;
    lastCheckAt = Date.now();

    const result = await reg.update();
    if (newVersionFound || result.installing || result.waiting) return 'updated';
    return 'latest';
  } catch {
    return 'error';
  }
}
