// 自定义 Service Worker：预缓存 + 导航回退 + DDL 系统通知。
// 由 vite-plugin-pwa 的 injectManifest 策略编译，__WB_MANIFEST 在构建时被替换为预缓存清单。
// 引入 webworker lib，补全 ServiceWorkerGlobalScope / ExtendableMessageEvent / NotificationEvent 等类型
/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// ServiceWorkerGlobalScope 来自 DOM lib；这里额外补充插件注入的 __WB_MANIFEST 字段
declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: PrecacheEntry[];
};

// 新 SW 安装后立即接管并跳过等待，配合 registerType: 'autoUpdate' 实现「改代码即更新」
self.skipWaiting();
clientsClaim();

// 清理旧版本预缓存，避免缓存无限增长
cleanupOutdatedCaches();

// 预缓存构建产物（图标、html、js、css 等），实现离线打开
precacheAndRoute(self.__WB_MANIFEST);

// SPA 导航回退：离线时任意导航请求都回退到 index.html（相对路径，兼容子路径部署）
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// ===== 桌面系统通知 =====

// 页面发来的消息结构：要求 SW 弹一条系统通知
interface DdlNotifyMessage {
  type: 'SHOW_DDL_NOTIFICATION';
  title: string;
  body: string;
  tag: string;
}

// 页面通过 postMessage 让 SW 弹通知；应用切到后台/最小化时 SW 仍能弹，比页面内 new Notification 更稳
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as DdlNotifyMessage | undefined;
  if (!data || data.type !== 'SHOW_DDL_NOTIFICATION') return;

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag, // 同一 tag 只保留一条通知
      icon: './pwa-192x192.png',
      badge: './pwa-192x192.png',
    }),
  );
});

// 点击通知：优先聚焦已打开的应用窗口，否则打开首页
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        // 只有 WindowClient 才有 focus 方法
        if ('focus' in client) {
          void (client as WindowClient).focus();
          return client;
        }
      }
      return self.clients.openWindow('./');
    }),
  );
});
