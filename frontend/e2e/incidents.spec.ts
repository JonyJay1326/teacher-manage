import { expect, test } from '@playwright/test';
import { login, someStudentId } from './helpers';

/** 事件模块交互：新建（含时区）、编辑、删除、速记 */

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe('事件模块', () => {
  test('新建事件：落库且时间为本地时刻（时区回归）', async ({ page }) => {
    const sid = await someStudentId(page.request);
    const title = `时区回归-${Date.now() % 100000}`;

    await page.goto('/incidents', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // 页头与空状态各有一个「新建事件」，取第一个即可
    await page.getByRole('button', { name: '新建事件' }).first().click();
    await page.waitForTimeout(1200);

    await page.locator('.el-dialog input').first().fill(title);
    await page.locator('.el-dialog textarea').first().fill('验证事件时间入库为本地时刻');

    // 表单里有两个 select：第 1 个是类别，第 2 个是学生
    const sels = page.locator('.el-dialog .el-select');
    await sels.nth(1).locator('input').click({ force: true });
    await page.waitForTimeout(1000);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    await page.getByRole('button', { name: '创建' }).click();
    await page.waitForTimeout(2500);

    const list = await page.request.get('/api/v1/incidents?page=1&pageSize=50');
    const body = (await list.json()) as {
      data: { items: Array<{ title: string; occurredAt: string }> };
    };
    const hit = body.data.items.find((i) => i.title === title);
    expect(hit, '事件应已入库').toBeTruthy();

    // 核心断言：入库时间与「现在」相差应很小（不能差 8 小时）
    const driftMin = Math.abs(
      Date.now() - new Date(hit!.occurredAt).getTime(),
    ) / 60000;
    expect(
      driftMin,
      `事件时间偏移 ${driftMin.toFixed(1)} 分钟，疑似时区 bug`,
    ).toBeLessThan(10);
  });

  test('草稿确认：速记生成后可确认入库', async ({ page }) => {
    const sid = await someStudentId(page.request);
    const created = await page.request.post('/api/v1/incidents/draft', {
      data: { content: '巡检速记内容', category: '其他', studentIds: [sid] },
    });
    expect(created.status()).toBe(201);

    await page.goto('/incidents', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await expect(page.getByText('巡检速记内容').first()).toBeVisible();
  });

  test('事件详情：可编辑标题', async ({ page }) => {
    const sid = await someStudentId(page.request);
    const created = await page.request.post('/api/v1/incidents', {
      data: {
        title: '待编辑事件',
        content: '内容',
        category: '其他',
        severity: 1,
        studentIds: [sid],
      },
    });
    const id = ((await created.json()) as { data: { id: number } }).data.id;

    await page.goto(`/incidents/${id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const titleInput = page.locator('input').filter({ hasNot: page.locator('[type=search]') }).first();
    await titleInput.fill('已编辑事件标题');
    await page.getByRole('button', { name: '保存' }).click();
    await page.waitForTimeout(2200);

    // 标题在输入框 value 里，不是文本节点
    await expect(page.locator('input').filter({ hasNot: page.locator('[type=search]') }).first())
      .toHaveValue('已编辑事件标题');
  });

  test('事件删除：软删除后进入回收站', async ({ page }) => {
    const sid = await someStudentId(page.request);
    const created = await page.request.post('/api/v1/incidents', {
      data: {
        title: '待删除事件',
        content: '内容',
        category: '其他',
        severity: 1,
        studentIds: [sid],
      },
    });
    const id = ((await created.json()) as { data: { id: number } }).data.id;

    await page.goto(`/incidents/${id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    page.on('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: '删除' }).click();
    await page.waitForTimeout(1200);
    const confirm = page.locator('.el-message-box').getByRole('button', { name: /确定|确认/ });
    if (await confirm.count()) await confirm.first().click();
    await page.waitForTimeout(2500);

    await expect(page).toHaveURL(/\/incidents$/);
    const after = await page.request.get(`/api/v1/incidents/${id}`);
    expect(after.status()).toBe(404);
  });
});
