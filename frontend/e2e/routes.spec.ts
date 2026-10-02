import { expect, test } from '@playwright/test';
import { assertPageHealthy, latestExamId, login, someStudentId } from './helpers';

/**
 * 全路由巡检：每条业务路由都要能正常渲染、无 JS 异常、无横向溢出。
 * 在 chromium 与 chromium-mobile 两个 project 下各跑一遍。
 */

const ROUTES: Array<[string, string]> = [
  ['/', '首页看板'],
  ['/students', '花名册'],
  ['/scores', '考试管理'],
  ['/incidents', '事件记录'],
  ['/knowledge', '文档管理'],
  ['/knowledge/ask', '智能问答'],
  ['/ai/comments', '评语工作台'],
  ['/ai/ask', '学情问答'],
  ['/ai/talk', '沟通话术'],
  ['/ai/summary', '工作总结'],
  ['/ai/prompts', '模板管理'],
  ['/ai/records', '生成历史'],
  ['/analysis', '分析中心'],
  ['/recycle', '回收站'],
  ['/settings', '系统设置'],
];

test.describe('全路由巡检', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const [path, name] of ROUTES) {
    test(`路由 ${path} (${name})`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 100)));
      await page.goto(path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await assertPageHealthy(page, name);
      expect(errors, `${name} 不应有 JS 异常`).toEqual([]);
    });
  }

  test('详情页：学生详情 6 个 tab 均可切换', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 100)));
    const sid = await someStudentId(page.request);
    await page.goto(`/students/${sid}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    for (const t of ['archive', 'sensitive', 'scores', 'timeline', 'comments', 'impression']) {
      await page.locator(`#tab-${t}`).click();
      await page.waitForTimeout(600);
      await expect(page.locator(`#pane-${t}`)).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('详情页：考试详情与成绩录入可打开', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 100)));
    const eid = await latestExamId(page.request);
    for (const p of [`/scores/exams/${eid}`, `/scores/exams/${eid}/enter`]) {
      await page.goto(p, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await assertPageHealthy(page, p);
    }
    expect(errors).toEqual([]);
  });

  test('详情页：事件详情可打开', async ({ page }) => {
    // 先建一条事件，才有可打开的详情
    const sid = await someStudentId(page.request);
    const created = await page.request.post('/api/v1/incidents', {
      data: {
        title: '巡检事件',
        content: '用于详情页巡检',
        category: '其他',
        severity: 1,
        studentIds: [sid],
      },
    });
    expect(created.status()).toBe(201);
    const id = ((await created.json()) as { data: { id: number } }).data.id;

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 100)));
    await page.goto(`/incidents/${id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await assertPageHealthy(page, '事件详情');
    // 标题在输入框 value 里，不是文本节点
    await expect(page.locator('input').filter({ hasNot: page.locator('[type=search]') }).first()).toHaveValue('巡检事件');
    expect(errors).toEqual([]);
  });
});
