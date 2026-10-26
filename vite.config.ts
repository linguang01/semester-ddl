import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 自动更新：新 SW 安装后立即 skipWaiting 接管，避免手机端卡旧版本
      registerType: 'autoUpdate',
      manifest: {
        name: 'DDL 三件事',
        short_name: 'DDL',
        description: '学期 DDL 与今日三件事，本地优先，数据保存在浏览器。',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0f172a',
        background_color: '#f1f5f9',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 预缓存构建产物；本项目没有外部请求，不做运行时缓存
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg}'],
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        // 新 SW 安装后立即跳过等待并接管所有页面
        // （autoUpdate 下插件会自动设置这两项，这里显式声明更保险）
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
