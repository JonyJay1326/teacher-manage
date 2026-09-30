import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 配置：起一套完全独立的「后端 + Vite」，使用专用 mock 库。
 * 绝不复用开发/生产数据——backend/data/e2e.db 由 e2e/setup.ts 重建。
 */

const API_PORT = Number(process.env.E2E_API_PORT ?? 3210);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5313);
const BACKEND_DIR = '../backend';

export default defineConfig({
  testDir: './e2e',
  // 必须在 webServer 之前播种：后端一启动就会创建空库
  globalSetup: './e2e/global-setup.ts',
  // 两条链路共享同一套后端与库，串行执行避免互相污染
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // 后端：独立端口 + 独立库
      command: 'node dist/main.js',
      cwd: BACKEND_DIR,
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        PORT: String(API_PORT),
        DB_PATH: './data/e2e.db',
        BACKUP_DIR: './data/e2e-backups',
        JWT_SECRET: 'e2e-only-secret-not-real',
        COOKIE_SECURE: 'false',
        AES_KEY_HEX:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        // 不设置 DEEPSEEK_API_KEY：评语链路验证的是未配置时的降级占位草稿
        DEEPSEEK_API_KEY: '',
      },
    },
    {
      // 前端：代理到上面的后端
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: '.',
      url: `http://localhost:${WEB_PORT}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_API_TARGET: `http://localhost:${API_PORT}`,
      },
    },
  ],
});
