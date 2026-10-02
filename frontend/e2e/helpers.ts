import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_USER } from './setup';

export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[placeholder="用户名"]', E2E_USER.username);
  await page.fill('input[placeholder="密码"]', E2E_USER.password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
}

export async function logout(page: Page): Promise<void> {
  await page.locator('.topbar__user').first().click({ force: true });
  // 菜单项是 el-dropdown-item，不是 button
  await page.locator('.el-dropdown-menu__item').filter({ hasText: /退出登录|退出演示/ }).first().click();
  await page.waitForURL((u) => u.pathname.includes('/login'), { timeout: 15_000 });
}

export async function someStudentId(request: APIRequestContext): Promise<number> {
  // 注意：request fixture 不共享 page 的登录 Cookie，调用方应传 page.request

  const res = await request.get('/api/v1/students?page=1&pageSize=1');
  const body = (await res.json()) as { data: { items: Array<{ id: number }> } | null };
  const id = (body.data?.items ?? [])[0]?.id;
  if (!id) throw new Error('取学生ID失败 HTTP=' + res.status() + ' body=' + JSON.stringify(body).slice(0,200));
  return id;
}

export async function latestExamId(request: APIRequestContext): Promise<number> {
  const res = await request.get('/api/v1/exams');
  const body = (await res.json()) as { data: Array<{ id: number }> | null };
  const id = (body.data ?? [])[0]?.id;
  if (!id) throw new Error('取考试ID失败 HTTP=' + res.status() + ' body=' + JSON.stringify(body).slice(0,200));
  return id;
}

export async function ensurePin(request: APIRequestContext): Promise<void> {
  const status = await request.get('/api/v1/auth/pin/status');
  const s = (await status.json()) as { data: { hasPin: boolean } };
  if (s.data.hasPin) return;
  await request.post('/api/v1/auth/pin/set', {
    data: { password: E2E_USER.password, pin: '123456' },
  });
}

/** 测试用 PIN（须与 ensurePin 设置的值一致） */
export const TEST_PIN = '123456';

/** 无条件重设 PIN：不同用例的浏览器实例互不共享登录态，需各自确保 */
export async function resetPin(request: APIRequestContext): Promise<void> {
  await request.post('/api/v1/auth/pin/set', {
    data: { password: E2E_USER.password, pin: TEST_PIN },
  });
}

export async function assertPageHealthy(page: Page, label: string): Promise<void> {
  const m = await page.evaluate(() => ({
    sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    cw: document.documentElement.clientWidth,
    len: document.body.innerText.replace(/\s+/g, '').length,
  }));
  expect.soft(m.len, label + ' 内容过少（可能白屏）').toBeGreaterThan(40);
  expect.soft(m.sw, label + ' 横向溢出 ' + m.sw + '/' + m.cw).toBeLessThanOrEqual(m.cw + 1);
}

/** 失败时留档整页截图（路径由 playwright.config 的 outputDir 决定） */
export async function captureOnFailure(page: Page, label: string): Promise<void> {
  await page
    .screenshot({ path: `test-results/${label}.png`, fullPage: true })
    .catch(() => undefined);
}
