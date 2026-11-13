import { defineConfig } from 'vitest/config';

// 单元测试只运行纯 TypeScript 逻辑，无需加载 React、Tailwind 与 PWA 构建插件。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 当前 Windows 环境下默认 forks 池会在收集阶段报 config undefined；
    // VM 线程池已通过全部现有用例，也避免为每个文件重复创建 Node 进程。
    pool: 'vmThreads',
  },
});
