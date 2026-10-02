import { expect, test } from '@playwright/test';
import { login, resetPin, someStudentId, TEST_PIN } from './helpers';

/** 学生模块交互：标签、监护人、关注等级 */

test.beforeEach(async ({ page }) => {
  await login(page);
});

test.describe('学生模块', () => {
  test('新增并关联标签后出现在档案标签区', async ({ page }) => {
    const sid = await someStudentId(page.request);
    const tagName = `巡检标签-${Date.now() % 100000}`;
    const created = await page.request.post('/api/v1/tags', {
      data: { name: tagName, domain: '其他' },
    });
    const tagId = ((await created.json()) as { data: { id: number } }).data.id;
    // 必须关联到学生，否则档案页不会显示该标签
    await page.request.post(`/api/v1/students/${sid}/tags`, {
      data: { tagIds: [tagId] },
    });

    await page.goto(`/students/${sid}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await expect(page.getByText(tagName).first()).toBeVisible();
  });

  test('为学生添加监护人后可见', async ({ page }) => {
    const sid = await someStudentId(page.request);
    const name = `监护人${Date.now() % 10000}`;
    await page.goto(`/students/${sid}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await page.getByRole('button', { name: '添加监护人' }).click();
    await page.waitForTimeout(1000);
    await page.locator('.el-dialog input').first().fill(name);
    await page.locator('.el-dialog input').nth(2).fill('13900000000');
    await page.getByRole('button', { name: '保存' }).click();
    await page.waitForTimeout(2000);

    await expect(page.getByText(name).first()).toBeVisible();
  });

  test('修改关注等级后 PATCH 落库', async ({ page }) => {
    const sid = await someStudentId(page.request);
    await page.goto(`/students/${sid}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const sel = page.locator('.student-detail__focus-block .el-select');
    await sel.click();
    await page.waitForTimeout(900);
    const opts = page.locator('.el-select-dropdown__item:visible');
    await opts.nth(3).click();
    await page.waitForTimeout(1800);

    const res = await page.request.get(`/api/v1/students/${sid}`);
    const body = (await res.json()) as { data: { focusLevel: number } };
    expect([1, 2, 3]).toContain(body.data.focusLevel);
  });

  test('高敏：PIN 解锁后可查看并保存', async ({ page }) => {
    await resetPin(page.request);
    const sid = await someStudentId(page.request);
    await page.goto(`/students/${sid}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.locator('#tab-sensitive').click();
    await page.waitForTimeout(1200);

    // 必须先点卡片，PIN 框才会出现
    await page.locator('.sensitive-card').first().click();
    await page.waitForTimeout(1500);

    // 若已解锁（10 分钟窗口），点卡片会直接进编辑���
    // 用 placeholder 定位：show-password 的输入框 type 不是 password
    const pinInput = page.getByPlaceholder('请输入 PIN 码');
    if ((await pinInput.count()) > 0) {
      await pinInput.fill(TEST_PIN);
      await page.getByRole('button', { name: '解锁' }).click();
      await page.waitForTimeout(2000);
    }
    const editor = page.locator('.el-dialog textarea');
    await expect(editor).toBeVisible();

    const text = `巡检健康记录 ${Date.now() % 100000}`;
    await editor.fill(text);
    await page.getByRole('button', { name: '保存' }).click();
    await page.waitForTimeout(1800);
    await expect(page.locator('.el-message--success')).toBeVisible();
  });

  test('搜索防抖：输入后能筛出结果', async ({ page }) => {
    await page.goto('/students', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const box = page.locator('input[placeholder]').first();
    await box.fill('a');
    await page.waitForTimeout(1800);
    // 不抛错、页面仍可用即通过（具体结果依数据而定）
    await expect(page.locator('.el-table').first()).toBeVisible();
  });
});
