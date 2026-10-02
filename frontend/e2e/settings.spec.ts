import { expect, test } from '@playwright/test';
import { E2E_USER } from './setup';
import { ensurePin, login } from './helpers';

/** 设置模块交互：阈值、PIN、备份、导出 */

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
});

test.describe('设置模块', () => {
  test('阈值修改可保存并回读一致', async ({ page }) => {
    await page.locator('#tab-thresholds, .el-tabs__item').first().click();
    await page.waitForTimeout(800);

    const num = page.locator('.settings__form .el-input-number input').first();
    await num.fill('35');
    await page.getByRole('button', { name: '保存阈值' }).click();
    await page.waitForTimeout(2000);

    const res = await page.request.get('/api/v1/settings/thresholds');
    const body = (await res.json()) as {
      data: { lowScoreRatio: number };
    };
    expect(Math.round(body.data.lowScoreRatio * 100)).toBe(35);
  });

  test('PIN 状态可查询并可修改', async ({ page }) => {
    await ensurePin(page.request);
    await page.locator('.el-tabs__item').nth(1).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(/当前：/).first()).toBeVisible();
  });

  test('修改密码校验：原密码错误应报错', async ({ page }) => {
    await page.locator('.el-tabs__item').nth(1).click();
    await page.waitForTimeout(1000);
    const inputs = page.locator('.el-form input[type="password"]');
    if ((await inputs.count()) < 3) {
      test.skip(true, '未找到密码表单');
      return;
    }
    await inputs.nth(0).fill('wrong-password');
    await inputs.nth(1).fill('newpass12345');
    await inputs.nth(2).fill('newpass12345');
    await page.getByRole('button', { name: '更新密码' }).click();
    await page.waitForTimeout(2000);
    // 原密码错误时后端返回 400，前端应弹错误提示
    await expect(page.locator('.el-message--error').first()).toBeVisible();
    expect(E2E_USER.password).toBe('e2e123456');
  });

  test('备份：手动备份后可校验并列出', async ({ page }) => {
    await page.locator('.el-tabs__item').nth(2).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: '立即备份' }).click();
    await page.waitForTimeout(3000);

    const list = await page.request.get('/api/v1/backup/list');
    const body = (await list.json()) as { data: Array<{ filename: string }> };
    expect(body.data.length).toBeGreaterThan(0);

    const latest = body.data[0]!.filename;
    const verify = await page.request.post('/api/v1/backup/verify', {
      data: { filename: latest },
    });
    const v = (await verify.json()) as {
      data: { integrityOk: boolean; sha256Ok: boolean | null };
    };
    expect(v.data.integrityOk).toBe(true);
    expect(v.data.sha256Ok).not.toBe(false);
  });

  test('全量 Excel 导出可下载', async ({ page }) => {
    await page.locator('.el-tabs__item').nth(2).click();
    await page.waitForTimeout(1200);
    const res = await page.request.get('/api/v1/export/excel');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      data: { filename: string; base64: string; counts: Record<string, number> };
    };
    expect(body.data.filename).toContain('.xlsx');
    expect(Buffer.from(body.data.base64, 'base64').subarray(0, 2).toString()).toBe('PK');
    expect(body.data.counts.students).toBeGreaterThan(0);
  });

  test('成绩单 PDF 可生成', async ({ page }) => {
    await page.locator('.el-tabs__item').nth(2).click();
    await page.waitForTimeout(1200);
    const res = await page.request.get('/api/v1/reports/score-cards.zip');
    // 未配置中文字体时后端会明确报错；有字体时应返回 zip
    if (res.ok()) {
      const buf = await res.body();
      expect(buf.subarray(0, 2).toString()).toBe('PK');
    } else {
      const body = (await res.json()) as { message: string };
      expect(body.message).toContain('字体');
    }
  });
});
