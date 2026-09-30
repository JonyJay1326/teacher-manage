import { expect, test } from '@playwright/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { API_BASE } from './setup';
import { captureOnFailure, login } from './helpers';

/**
 * 链路一：成绩 xlsx 导入 → 考试详情列表可见 → 分析中心出图。
 * 使用根目录的示例 xlsx（成绩导入示例_开学摸底考.xlsx）结构造 mock。
 */

const SAMPLE_XLSX = path.resolve(
  __dirname,
  '../../成绩导入示例_开学摸底考.xlsx',
);


test.describe('成绩 xlsx 导入全链路', () => {
  test('导入 → 列表可见 → 分析页出图', async ({ page }) => {
    // 0) 先登录，后续 page.request 才带得上 Cookie（所有 /api/v1 都要过认证守卫）
    await login(page);

    // 1) 造一场全新的考试，避免与 seed 里的 5 场冲突
    const created = await page.request.post(`${API_BASE}/v1/exams`, {
      data: {
        name: 'E2E 导入测试考',
        examType: '月考',
        termId: 1,
        examDate: '2026-03-15',
        subjectIds: [1, 2, 3, 4, 5, 6, 7, 8],
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const examId = (await created.json()).data.id as number;
    expect(examId).toBeGreaterThan(0);

    // 2) 进入该考试的录入页，打开 Excel 导入
    await page.goto(`/scores/exams/${examId}/enter`);
    await expect(page.getByText('E2E 导入测试考').first()).toBeVisible();
    await page.getByRole('button', { name: 'Excel 导入' }).click();

    const dialog = page.getByRole('dialog', { name: 'Excel 导入' });
    await expect(dialog).toBeVisible();

    // 3) 上传示例 xlsx
    await dialog.locator('input[type="file"]').setInputFiles(SAMPLE_XLSX);

    // 4) 等待识别预览：40 行有效 + 可写格 > 0
    await expect(dialog.getByText(/有效行 40\/40/)).toBeVisible({
      timeout: 30_000,
    });
    const meta = await dialog.locator('.score-excel__meta').innerText();
    expect(meta).toMatch(/可写格 [1-9]\d*/);

    await captureOnFailure(page, 'score-import-preview');

    // 5) 确认写入
    const commitBtn = dialog.getByRole('button', { name: '确认写入数据库' });
    await expect(commitBtn).toBeEnabled();
    await commitBtn.click();

    // 可能弹「是否立即重算排名」
    const recalc = page.getByRole('button', { name: /立即重算|确定/ }).first();
    if (await recalc.isVisible({ timeout: 4000 }).catch(() => false)) {
      await recalc.click();
    }

    // 6) 关闭弹窗，回到考试详情验证成绩可见
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.goto(`/scores/exams/${examId}`);

    // 详情页应能看到刚导入的学生与分数（示例表首行 202601 李敏 语文 66）
    const detail = page.locator('.exam-detail, .exam-matrix, table').first();
    await expect(detail).toBeVisible();
    await expect(page.getByText('李敏').first()).toBeVisible({ timeout: 20_000 });
    // 语文 66 必须出现在矩阵里
    await expect(page.getByText('66', { exact: true }).first()).toBeVisible();

    await captureOnFailure(page, 'score-import-list');

    // 7) 后端直接核对：该生语文分已落库
    const matrix = await page.request.get(`${API_BASE}/v1/exams/${examId}/matrix`);
    expect(matrix.ok()).toBeTruthy();
    const rows = (await matrix.json()).data.rows as Array<{
      studentNo: string;
      name: string;
      subjectScores: Record<string, { score: number | null; status: string }>;
      totalScore: number | null;
      totalRank: number | null;
    }>;
    expect(rows.length).toBe(40);
    const liMin = rows.find((r) => r.studentNo === '202601');
    expect(liMin, '应存在 202601 李敏').toBeTruthy();
    expect(liMin!.name).toBe('李敏');
    // 语文(1)=66、数学(2)=69.6；第3人语文为「缺」→ 缺考且不计总分
    expect(liMin!.subjectScores['1']?.score).toBeCloseTo(66, 5);
    // matrix 接口的状态是英文枚举（normal/absent/exempt/empty），非库内中文
    expect(liMin!.subjectScores['1']?.status).toBe('normal');
    expect(liMin!.subjectScores['2']?.score).toBeCloseTo(69.6, 5);

    const liuYan = rows.find((r) => r.studentNo === '202603');
    expect(liuYan!.subjectScores['1']?.status).toBe('absent');

    // 至少大部分学生拿到了总排
    const ranked = rows.filter((r) => r.totalRank !== null);
    expect(ranked.length).toBeGreaterThan(30);

    // 8) 分析中心出图
    await page.goto('/analysis');
    await expect(
      page.getByRole('heading', { name: '分析中心' }),
    ).toBeVisible({ timeout: 20_000 });

    // 等 ECharts 画布出现且有实际像素内容（非空白）
    const canvases = page.locator('canvas');
    await expect(canvases.first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2500); // 等动画结束

    const canvasCount = await canvases.count();
    expect(canvasCount).toBeGreaterThan(0);

    // 至少一个 canvas 真正画了东西：采样非透明像素
    const painted = await canvases.evaluateAll((nodes) =>
      nodes.some((c) => {
        const ctx = (c as HTMLCanvasElement).getContext('2d');
        if (!ctx || (c as HTMLCanvasElement).width === 0) return false;
        const d = ctx.getImageData(0, 0, (c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height).data;
        for (let i = 3; i < d.length; i += 4) {
          if (d[i]! > 0) return true;
        }
        return false;
      }),
    );
    expect(painted, '分析页应有已绘制的图表 canvas').toBe(true);

    await captureOnFailure(page, 'score-import-analysis');
  });
});
