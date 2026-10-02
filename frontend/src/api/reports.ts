/** 成绩单 PDF 导出 */

/**
 * 下载成绩单 PDF 响应。
 * 后端返回二进制（zip 或 pdf），因此不走统一 {code,message,data} JSON 包装。
 */
async function download(path: string, fallbackName: string): Promise<{ filename: string; size: number }> {
  const response = await fetch(`/api${path}`, { credentials: 'include' });
  if (!response.ok) {
    // 失败时后端仍返回 JSON，读出 message 给用户看
    let message = `导出失败（HTTP ${response.status}）`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // 非 JSON 响应，用默认文案
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  // 优先取后端给的文件名
  const disp = response.headers.get('Content-Disposition') ?? '';
  const m = /filename="([^"]+)"/.exec(disp);
  const filename = m?.[1] ? decodeURIComponent(m[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { filename, size: blob.size };
}

/** 一键打包下载全部学生成绩单（zip） */
export function exportScoreCardsZip(): Promise<{ filename: string; size: number }> {
  return download('/v1/reports/score-cards.zip', '成绩单.zip');
}

/** 下载单个学生成绩单（pdf） */
export function exportScoreCardPdf(
  studentId: number,
): Promise<{ filename: string; size: number }> {
  return download(`/v1/reports/score-cards/${studentId}.pdf`, `${studentId}_成绩单.pdf`);
}
