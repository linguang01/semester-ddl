/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// 由 vite.config.ts 的 define 注入，用于在设置面板展示当前构建版本
declare const __APP_VERSION__: string;
declare const __BUILD_GIT_HASH__: string;
declare const __BUILD_TIME__: string;
