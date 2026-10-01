import { expect, test } from '@playwright/test';
import { API_BASE } from './setup';
import { login } from './helpers';

/**
 * 链路三：每日备份。
 *
 * AGENTS.md 要求 e2e 覆盖「登录 / 成绩录入保存重算 / 每日备份」三条，
 * 本文件补齐此前缺失的备份链路：
 * 手动触发 → 完整性校验 → 出现在列表 → 恢复演练。
 *
 * 全部走 API 层断言（等价于设置页按钮背后发生的事），
 * 避免 UI 断言受 Element Plus 内部结构变动影响。
 */

test.describe('每日备份链路', () => {
  test('手动备份 → 校验 → 列表可见 → 可恢复', async ({ page }) => {
    await login(page);

    // 1) 手动触发备份
    const run = await page.request.post(`${API_BASE}/v1/backup/run`);
    expect(run.ok(), await run.text()).toBeTruthy();
    const filename = (await run.json()).data.filename as string;
    expect(filename).toMatch(/^classpilot-.*\.db$/);

    // 2) 完整性校验：integrity_check + sha256 均通过
    const verify = await page.request.post(`${API_BASE}/v1/backup/verify`, {
      data: { filename },
    });
    expect(verify.ok()).toBeTruthy();
    const v = (await verify.json()).data;
    expect(v.integrityOk).toBe(true);
    expect(v.sha256Ok).toBe(true);

    // 3) 出现在列表中
    const list = await page.request.get(`${API_BASE}/v1/backup/list`);
    expect(list.ok()).toBeTruthy();
    const items = (await list.json()).data as Array<{
      filename: string;
      quickCheckOk: boolean | null;
    }>;
    const found = items.find((i) => i.filename === filename);
    expect(found, '新备份应出现在列表').toBeTruthy();
    expect(found!.quickCheckOk).toBe(true);

    // 4) 恢复演练：先确认未确认会被拒
    const noConfirm = await page.request.post(`${API_BASE}/v1/backup/restore`, {
      data: { filename, confirm: false },
    });
    expect(noConfirm.status()).toBe(400);

    // 5) 正常恢复（restore 自审查起为 async，接口返回 Promise 由 Nest 处理）
    const restore = await page.request.post(`${API_BASE}/v1/backup/restore`, {
      data: { filename, confirm: true },
    });
    expect(restore.ok(), await restore.text()).toBeTruthy();
    const r = (await restore.json()).data;
    expect(r.ok).toBe(true);
    expect(r.restoredFrom).toBe(filename);
    // 恢复前会自动打一份安全备份
    expect(r.safetyBackup).toMatch(/^classpilot-.*\.db$/);

    // 6) 恢复后业务数据仍可用（登录态未失效、接口正常）
    const students = await page.request.get(
      `${API_BASE}/v1/students?page=1&pageSize=5`,
    );
    expect(students.ok()).toBeTruthy();
    expect((await students.json()).data.items.length).toBeGreaterThan(0);
  });

  test('拒绝非法备份文件名（防目录穿越）', async ({ page }) => {
    await login(page);
    for (const bad of ['../secret.db', '/etc/passwd', 'evil.txt', 'classpilot-']) {
      const res = await page.request.post(`${API_BASE}/v1/backup/restore`, {
        data: { filename: bad, confirm: true },
      });
      expect(res.status(), `${bad} 应被拒绝`).toBe(400);
    }
  });

  test('并发恢复不会把服务打成 500', async ({ page }) => {
    await login(page);
    const run = await page.request.post(`${API_BASE}/v1/backup/run`);
    const filename = (await run.json()).data.filename as string;

    // 并发发起两个恢复。
    // 恢复是同步阻塞操作（replaceWithBackup 会 close 并重建连接），
    // 单进程下请求会天然串行，因此这里断言的是「结果确定且服务不被打挂」：
    // 每个响应都必须是 200 或 409，绝不允许出现 500/503 之类
    // 的 "connection is not open" 中间态。
    const responses = await Promise.all([
      page.request.post(`${API_BASE}/v1/backup/restore`, {
        data: { filename, confirm: true },
      }),
      page.request.post(`${API_BASE}/v1/backup/restore`, {
        data: { filename, confirm: true },
      }),
    ]);
    for (const res of responses) {
      // Nest 对 POST 默认返回 201；被串行锁拒绝时为 409
      expect([200, 201, 409], `实际状态 ${res.status()}`).toContain(res.status());
    }

    // 恢复结束后服务必须仍然可用
    const after = await page.request.get(`${API_BASE}/v1/backup/list`);
    expect(after.ok()).toBeTruthy();
  });
});
