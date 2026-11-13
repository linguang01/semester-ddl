/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// .env.local 中的 Supabase 环境变量（构建时注入，仅暴露 VITE_ 前缀变量到前端）
interface ImportMetaEnv {
  /** Supabase 项目地址，如 https://xxxx.supabase.co */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon public key（受 RLS 保护，可安全暴露在前端） */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

// 由 vite.config.ts 的 define 注入，用于在设置面板展示当前构建版本
declare const __APP_VERSION__: string;
declare const __BUILD_GIT_HASH__: string;
declare const __BUILD_TIME__: string;
