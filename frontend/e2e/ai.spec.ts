import { expect, test } from '@playwright/test';
import { login } from './helpers';

/** AI 与评语模块交互（DeepSeek 未配置，验证降级可用） */

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe('AI / 评语模块', () => {
  test('评语工作台：未配置 AI 时仍出占位草稿并可采纳', async ({ page }) => {
    await page.goto('/ai/comments', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    await page.locator('.comments-wb__list-body .comments-wb__item').first().click();
    await page.waitForTimeout(1500);

    await page.locator('.comments-wb__actions button').filter({ hasText: /生成/ }).first().click();
    await page.waitForTimeout(3500);

    const editor = page.locator('.comments-wb__editor textarea').first();
    await expect(editor).toBeVisible();
    const text = await editor.inputValue();
    expect(text.trim().length).toBeGreaterThan(10);

    await page.locator('.comments-wb__actions button').filter({ hasText: '采纳' }).first().click();
    await page.waitForTimeout(2500);
    await expect(page.getByText('已采纳').first()).toBeVisible();
  });

  test('学生详情手工新建评语可落库', async ({ page }) => {
    const stu = await page.request.get('/api/v1/students?page=1&pageSize=1');
    const sid = ((await stu.json()) as { data: { items: Array<{ id: number }> } }).data.items[0]!.id;
    const text = `手工评语-${Date.now() % 100000}`;

    const res = await page.request.post('/api/v1/comments', {
      data: { studentId: sid, commentType: '日常评语', finalText: text },
    });
    expect(res.status()).toBe(201);

    await page.goto(`/students/${sid}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.locator('#tab-comments').click();
    await page.waitForTimeout(1200);
    // 限定在评语面板内，避免命中时间线 tab 的同名摘要
    await expect(page.locator('#pane-comments').getByText(text).first()).toBeVisible();
  });

  test('沟通话术页可打开且无异常', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message.slice(0, 80)));
    await page.goto('/ai/talk', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).toContainText('沟通话术');
    expect(errs).toEqual([]);
  });

  test('工作总结页可打开且无异常', async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message.slice(0, 80)));
    await page.goto('/ai/summary', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).toContainText('工作总结');
    expect(errs).toEqual([]);
  });

  test('模板管理可打开', async ({ page }) => {
    await page.goto('/ai/prompts', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // 该页是「列表 + 表单」两栏布局，不是表格
    await expect(page.getByRole('button', { name: '新建' })).toBeVisible();
    // 注意：不能用 getByText，它会命中窄屏下隐藏的侧栏菜单项
    await expect(page.locator('h2.cp-page-header__title')).toHaveText('模板管理');
  });

  test('生成历史页可打开', async ({ page }) => {
    await page.goto('/ai/records', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await expect(page.locator('.el-table, .el-empty').first()).toBeVisible();
  });
});
