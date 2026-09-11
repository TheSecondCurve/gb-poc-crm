import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.mjs'],
          // better-sqlite3 / argon2 为原生模块，用 forks 池避免 worker_threads 兼容问题
          pool: 'forks',
        },
      },
      {
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      // 覆盖率门禁只管后端核心目录（前端组件测试非标准层，见 engineering-standards §3）
      include: ['server/routes/**', 'server/engine/**', 'server/db/**', 'server/static.js'],
      exclude: [
        // 纯声明文件：drizzle 表结构定义，仅被 drizzle-kit 消费，无运行逻辑
        'server/db/schema.js',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
