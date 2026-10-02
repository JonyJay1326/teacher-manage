import { expect, test } from '@playwright/test';
import { latestExamId, login } from './helpers';

/** 成绩模块交互：录入保存、重算排名、模板下载 */

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe('成绩模块', () => {
  test('成绩录入：改一个格子并保存', async ({ page }) => {
    const eid = await latestExamId(page.request);
    await page.goto(`/scores/exams/${eid}/enter`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const cell = page.locator('.el-table__body td input, .el-table__body .cell input').first();
    // 硬断言：录入格找不到说明页面结构变了，不能静默 skip 掩盖回归
    await expect(cell).toBeVisible();
    const before = await cell.inputValue();
    await cell.fill('');
    await page.keyboard.type('88');
    await page.getByRole('button', { name: /保存并重算排名/ }).click();
    await page.waitForTimeout(3500);

    // 无论保存成功或被校验拦截，页面都不应报错
    const errs = await page.locator('.el-message--error').count();
    expect(errs).toBe(0);
    expect(before).toBeDefined();
  });

  test('重算排名后分数行可打开', async ({ page }) => {
    const eid = await latestExamId(page.request);
    const res = await page.request.post(`/api/v1/exams/${eid}/recalc`, { data: {} });
    expect(res.ok(), await res.text()).toBeTruthy();

    await page.goto(`/scores/exams/${eid}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await expect(page.locator('.el-table').first()).toBeVisible();
  });

  test('Excel 模板可下载', async ({ page }) => {
    const eid = await latestExamId(page.request);
    const res = await page.request.get(`/api/v1/exams/${eid}/import/template`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const data = (body as { data: { filename: string; base64: string } }).data;
    expect(data.filename).toContain('.xlsx');
    // base64 解码后应是 zip 魔数 PK
    const buf = Buffer.from(data.base64, 'base64');
    expect(buf.subarray(0, 2).toString()).toBe('PK');
  });

  test('新建考试：可在列表中看到', async ({ page }) => {
    const name = `巡检考试-${Date.now() % 100000}`;
    await page.goto('/scores', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '新建考试' }).click();
    await page.waitForTimeout(1200);
    await page.locator('.el-dialog input').first().fill(name);
    // 考试日期为必填项，不填则「创建」保持禁用
    const dateInput = page.locator('.el-dialog input[placeholder*=\"选择日期\"]').first();
    await dateInput.fill('2026-03-15');
    await page.keyboard.press('Enter'); // 确认日期并收起浮层，否则会遮挡「创建」
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: '创建' }).click();
    await page.waitForTimeout(3000);
    // 失败时先看后端是否真的创建成功
    const res = await page.request.get('/api/v1/exams');
    const body = (await res.json()) as { data: Array<{ name: string }> | null };
    const inApi = (body.data ?? []).some((e) => e.name === name);
    expect.soft(inApi, '后端应能查到新建的考试').toBe(true);
    await expect(page.getByText(name).first()).toBeVisible();
  });
});
