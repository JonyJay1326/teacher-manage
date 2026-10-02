import { expect, test } from '@playwright/test';
import { captureOnFailure, login } from './helpers';

/**
 * 链路二：评语生成（demo 模式，mock DeepSeek）。
 *
 * demo 态下评语生成走 /v1/ai/demo-complete 代理；后端未配置 DEEPSEEK_API_KEY 时
 * 该代理返回 available=false，前端降级为「占位草稿」。
 * 本用例锁定两件事：
 *   1) demo 路由树可进入、工作台可加载；
 *   2) 未配 AI 时仍能生成草稿并采纳（核心 CRUD 不得因 AI 不可用而瘫掉）。
 */


test.describe('评语生成（demo 模式 · mock DeepSeek）', () => {
  test('demo 工作台生成草稿并采纳入库', async ({ page }) => {
    // 先用正式账号登录一次，供 demo 态的 DeepSeek 代理复用 Cookie
    await login(page);
    const cookies = await page.context().cookies();
    expect(cookies.length).toBeGreaterThan(0);

    // 进入 demo 模式（业务走内存 Mock，不打真实 API）
    await page.goto('/demo');
    await page.waitForURL(/\/demo/, { timeout: 20_000 });

    // 打开评语工作台
    await page.goto('/demo/ai/comments');
    // 用 hero 区标题定位：页面内「评语工作台」文本不止一处
    await expect(page.locator('h1').first()).toHaveText('评语工作台', { timeout: 30_000 });

    // 等学生列表渲染，选中第一个学生
    const firstStudent = page.locator('.comments-wb__list-body .comments-wb__item').first();
    await expect(firstStudent).toBeVisible({ timeout: 20_000 });
    await firstStudent.click();
    await page.waitForTimeout(1200);

    await captureOnFailure(page, 'comment-workbench');

    // 点「生成草稿」
    const generateBtn = page.locator('.comments-wb__actions button', { hasText: /生成/ }).first();
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // AI 未配置 → 前端降级为占位草稿，编辑器里应有内容
    const editor = page.locator('.comments-wb__editor textarea').first();
    await expect(editor).toBeVisible({ timeout: 30_000 });

    // 等「生成中…」按钮态回落 = 流已收完（onDone 已把完整文本写入编辑器）。
    // 不能只等长度 > 0：打字机第一个 delta 就有内容，会读到中间态导致误判。
    await expect(generateBtn).not.toContainText('生成中', { timeout: 60_000 });

    const draft = (await editor.inputValue()).trim();
    expect(draft.length).toBeGreaterThan(10);

    await captureOnFailure(page, 'comment-generated');

    // 采纳入库
    const adoptBtn = page.locator('.comments-wb__actions button', { hasText: '采纳' }).first();
    await expect(adoptBtn).toBeEnabled();
    await adoptBtn.click();

    // 采纳无二次确认弹窗，直接等列表状态变化
    // 采纳后状态应变为「已采纳」
    // 限定在工作台列表项内，避免命中隐藏 tab 的同名文本
    await expect(
      page.locator('.comments-wb__list-body').getByText('已采纳').first(),
    ).toBeVisible({ timeout: 20_000 });

    // 切换到另一个学生再切回，确认采纳状态被持久化到 demo 内存库
    const items = page.locator('.comments-wb__list-body .comments-wb__item');
    await items.nth(1).click();
    await page.waitForTimeout(1200);
    await items.first().click();
    await page.waitForTimeout(1200);
    await expect(
      page.locator('.comments-wb__list-body').getByText('已采纳').first(),
    ).toBeVisible({ timeout: 20_000 });

    await captureOnFailure(page, 'comment-adopted');
  });

  test('AI 不可用时核心 CRUD 仍可用（降级不瘫）', async ({ page }) => {
    await page.goto('/demo');
    await page.waitForURL(/\/demo/, { timeout: 20_000 });

    // 花名册在 demo 态可用
    await page.goto('/demo/students');
    // 用页面标题，不能用 getByText（会命中窄屏下隐藏的侧栏菜单项）
    await expect(page.locator('h2.cp-page-header__title')).toHaveText('花名册', { timeout: 30_000 });
    // 行数用 poll 判定；count 每轮重新求值，避免导航切换瞬间上下文被销毁
    await expect
      .poll(async () => page.locator('.el-table__body tr').count(), { timeout: 30_000 })
      .toBeGreaterThan(5);
    const rows = page.locator('.el-table__body tr');

    // 学生详情可打开
    await rows.first().click();
    await page.waitForTimeout(1500);
    await expect(page.getByRole('tab', { name: '档案' })).toBeVisible();

    await captureOnFailure(page, 'demo-crud-degraded');
  });
});
