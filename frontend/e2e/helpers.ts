import type { Page } from '@playwright/test';
import { E2E_USER } from './setup';

/** 走真实登录流程（Cookie 会话），返回已登录的页面 */
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[placeholder="用户名"]', E2E_USER.username);
  await page.fill('input[placeholder="密码"]', E2E_USER.password);
  await page.getByRole('button', { name: '登录' }).click();
  // 登录成功后跳首页
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
}

/** 失败时留档：整页截图 + 当前步骤描述（路径见 playwright.config 的 outputDir） */
export async function captureOnFailure(page: Page, label: string): Promise<void> {
  const dir = page.context()._options?.outputDir ?? 'test-results';
  await page
    .screenshot({ path: `${dir}/${label}.png`, fullPage: true })
    .catch(() => undefined);
}
