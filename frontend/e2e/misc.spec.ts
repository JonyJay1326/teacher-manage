import { expect, test } from '@playwright/test';
import { login, logout, someStudentId } from './helpers';

/** 全局交互：登录登出、移动端抽屉、回收站恢复 */

test.describe('全局', () => {
  test('登录 → 登出 → 再登录 可往返', async ({ page }) => {
    await login(page);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
    await login(page);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('未登录访问业务页会被重定向到登录页', async ({ browser, baseURL }) => {
    // 独立 context：clearCookies 会污染同 worker 的后续用例
    const ctx = await browser.newContext();
    const anon = await ctx.newPage();
    await anon.goto((baseURL ?? '') + '/students');
    await anon.waitForTimeout(2500);
    await expect(anon).toHaveURL(/\/login/);
    await ctx.close();
  });

  test('回收站：软删的学生可恢复', async ({ page }) => {
    await login(page);
    const sid = await someStudentId(page.request);

    await page.request.delete(`/api/v1/students/${sid}`);
    const del = await page.request.get(`/api/v1/students/${sid}`);
    expect(del.status()).toBe(404);

    await page.goto('/recycle', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    // 真正执行恢复：回收站 API 恢复后，学生应重新可查
    const restored = await page.request.post(`/api/v1/recycle/students/${sid}/restore`);
    expect(restored.ok(), await restored.text()).toBeTruthy();

    const after = await page.request.get(`/api/v1/students/${sid}`);
    expect(after.status()).toBe(200);
  });
});

test.describe('移动端适配', () => {
  test('窄屏下侧栏收起、可通过汉堡按钮打开抽屉', async ({ page, isMobile }) => {
    test.skip(!isMobile, '仅移动端 project 适用');
    await login(page);
    await page.waitForTimeout(2000);

    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeHidden();

    await page.locator('.topbar__left button').first().click();
    await page.waitForTimeout(900);
    await expect(sidebar).toBeVisible();
    await expect(page.locator('.sidebar__mask')).toBeVisible();

    // 点遮罩关闭
    await page.locator('.sidebar__mask').click({ position: { x: 350, y: 400 } });
    await page.waitForTimeout(900);
    await expect(sidebar).toBeHidden();
  });

  test('窄屏下关键页面无横向溢出', async ({ page, isMobile }) => {
    test.skip(!isMobile, '仅移动端 project 适用');
    await login(page);
    for (const p of ['/', '/students', '/scores', '/incidents', '/analysis', '/ai/comments', '/settings']) {
      await page.goto(p, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      const m = await page.evaluate(() => ({
        sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        cw: document.documentElement.clientWidth,
      }));
      expect(m.sw, `${p} 出现横向溢出 ${m.sw}/${m.cw}`).toBeLessThanOrEqual(m.cw + 1);
    }
  });

  test('窄屏顶栏：汉堡与用户菜单均可见且可点', async ({ page, isMobile }) => {
    test.skip(!isMobile, '仅移动端 project 适用');
    await login(page);
    await page.waitForTimeout(2000);

    // 顶栏右侧不得被整体隐藏（历史上曾因 CSS 顺序依赖误设 display:none）
    const right = page.locator('.topbar__right');
    await expect(right).toBeVisible();
    await expect(page.locator('.topbar__user')).toBeVisible();

    // 左侧汉堡按钮必须可点（曾被右侧挤出行外）
    const burger = page.locator('.topbar__left button').first();
    await expect(burger).toBeVisible();
    await burger.click();
    await page.waitForTimeout(900);
    await expect(page.locator('.sidebar')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
