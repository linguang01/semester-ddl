import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string };

function gitShortHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // 无 git 环境时的占位值
    return 'nogit';
  }
}

// https://vite.dev/config/
export default defineConfig({
  // 相对 base：部署到 GitHub Pages（/semester-ddl/）等子路径时静态资源可直接访问
  base: './',
  define: {
    // 构建信息注入源码：设置面板展示，用于核对手机上运行的到底是哪个版本
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_GIT_HASH__: JSON.stringify(gitShortHash()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 自动更新：新 SW 安装后立即 skipWaiting 接管，避免手机端卡旧版本
      registerType: 'autoUpdate',
      // 使用自定义 Service Worker（src/sw.ts），以加入 DDL 系统通知的 message/notificationclick 处理
      strategies: 'injectManifest',
      // SW 源码目录与文件名（插件用 esbuild 独立编译，不走 tsc）
      srcDir: 'src',
      filename: 'sw.ts',
      // 注册与主动更新检查逻辑在 src/pwa.ts 通过 virtual:pwa-register 接管，
      // 插件检测到导入后不会再注入 registerSW.js
      injectRegister: 'auto',
      manifest: {
        name: 'DDL 三件事',
        short_name: 'DDL',
        description: '学期 DDL 与今日三件事，本地优先，数据保存在浏览器。',
        lang: 'zh-CN',
        // 相对路径按 manifest 所在目录解析，子路径部署（GitHub Pages）不会 404
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#0f172a',
        background_color: '#f1f5f9',
        icons: [
          {
            src: './pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: './pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: './pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // injectManifest 策略下，预缓存与导航回退等逻辑写在 src/sw.ts 里，这里只控制构建范围
      injectManifest: {
        // 预缓存构建产物；本项目没有外部请求，不做运行时缓存
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg}'],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
