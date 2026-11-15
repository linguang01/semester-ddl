import { defineConfig } from 'vitest/config';

// 进度与统计的口径都是「本地自然日」（startOf('day')、跨天落位、共 N 天），
// 因此测试必须跑在确定的时区里：CI 是 UTC、开发机是 GMT+8，
// 不钉死会让同一份断言在两地得出不同天数。
// 应用面向国内用户，固定为 Asia/Shanghai，测试结果与线上行为一致。
process.env.TZ = 'Asia/Shanghai';

// 单元测试只运行纯 TypeScript 逻辑，无需加载 React、Tailwind 与 PWA 构建插件。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 当前 Windows 环境下默认 forks 池会在收集阶段报 config undefined；
    // VM 线程池已通过全部现有用例，也避免为每个文件重复创建 Node 进程。
    pool: 'vmThreads',
    // worker 内再设一次，确保子环境不会继承到宿主机的时区
    env: { TZ: 'Asia/Shanghai' },
  },
});
