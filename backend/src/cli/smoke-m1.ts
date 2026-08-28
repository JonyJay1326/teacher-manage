/**
 * M1 冒烟自测：登录后逐项打关键 API
 */
const BASE = 'http://127.0.0.1:3000/api';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface CaseResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: CaseResult[] = [];
let cookie = '';

/** 记录用例 */
function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name} — ${detail}`);
}

/** 发起 JSON 请求 */
async function api<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const part = c.split(';')[0];
    if (part) cookie = part;
  }
  // Node 旧版兜底
  const raw = res.headers.get('set-cookie');
  if (raw && !cookie) cookie = raw.split(';')[0];
  return (await res.json()) as ApiResponse<T>;
}

/** 上传 multipart */
async function upload<T>(
  path: string,
  filename: string,
  buffer: Buffer,
): Promise<ApiResponse<T>> {
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(buffer)]),
    filename,
  );
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: cookie ? { Cookie: cookie } : undefined,
    body: form,
  });
  return (await res.json()) as ApiResponse<T>;
}

async function main(): Promise<void> {
  // 1 登录
  const login = await api<{ username: string }>('POST', '/v1/auth/login', {
    username: 'admin',
    password: 'admin123',
  });
  record('登录', login.code === 0 && Boolean(cookie), `${login.message} cookie=${Boolean(cookie)}`);

  // 2 首页看板
  const home = await api<{
    focusStudents: unknown[];
    dueFollowUps: unknown[];
  }>('GET', '/v1/dashboard/home');
  record(
    '首页看板',
    home.code === 0,
    `focus=${home.data?.focusStudents?.length ?? '?'} followUps=${home.data?.dueFollowUps?.length ?? '?'}`,
  );

  // 3 学生列表 + 取一人
  const students = await api<{ items: Array<{ id: number; name: string }> }>(
    'GET',
    '/v1/students?page=1&pageSize=5',
  );
  const studentId = students.data?.items?.[0]?.id;
  record(
    '学生花名册',
    students.code === 0 && Boolean(studentId),
    `first=${students.data?.items?.[0]?.name ?? '无'} id=${studentId ?? '-'}`,
  );

  // 4 时间线
  if (studentId) {
    const tl = await api<unknown[]>('GET', `/v1/students/${studentId}/timeline`);
    record('成长时间线', tl.code === 0 && Array.isArray(tl.data), `items=${Array.isArray(tl.data) ? tl.data.length : 0}`);
  } else {
    record('成长时间线', false, '无学生可测');
  }

  // 5 PIN 状态 + L2 摘要
  const pin = await api<{ hasPin: boolean; unlocked: boolean }>('GET', '/v1/auth/pin/status');
  record('PIN 状态', pin.code === 0, `hasPin=${pin.data?.hasPin} unlocked=${pin.data?.unlocked}`);

  if (studentId) {
    const sens = await api<unknown[]>('GET', `/v1/students/${studentId}/sensitive`);
    // 未解锁可能业务错误，接口可达即可；code 0 或明确业务码
    record(
      'L2 高敏摘要接口',
      sens.code === 0 || sens.code === 2001 || sens.code === 2004 || sens.code === 3002,
      `code=${sens.code} msg=${sens.message}`,
    );
  }

  // 6 成绩：考试/录入/分析
  const exams = await api<Array<{ id: number; name: string }>>('GET', '/v1/exams');
  const examId = exams.data?.[0]?.id;
  record('考试列表', exams.code === 0 && Boolean(examId), `exam=${exams.data?.[0]?.name ?? '-'} id=${examId ?? '-'}`);

  if (examId) {
    const matrix = await api<{ rows: unknown[]; subjects: unknown[] }>(
      'GET',
      `/v1/exams/${examId}/matrix`,
    );
    record(
      '考试成绩矩阵',
      matrix.code === 0,
      `rows=${matrix.data?.rows?.length ?? 0} subjects=${matrix.data?.subjects?.length ?? 0}`,
    );

    const tpl = await api<{ base64: string; filename: string }>(
      'GET',
      `/v1/exams/${examId}/import/template`,
    );
    record(
      'Excel 模板下载',
      tpl.code === 0 && Boolean(tpl.data?.base64),
      tpl.data?.filename ?? tpl.message,
    );

    // 用模板再解析一遍（空分也应能出预览结构）
    if (tpl.data?.base64) {
      const buf = Buffer.from(tpl.data.base64, 'base64');
      const parsed = await upload<{
        summary: { totalRows: number; writableCells: number };
        mapping: { source: string };
      }>(`/v1/exams/${examId}/import/parse`, tpl.data.filename, buf);
      record(
        'Excel AI/规则解析预览',
        parsed.code === 0,
        `source=${parsed.data?.mapping?.source} rows=${parsed.data?.summary?.totalRows} writable=${parsed.data?.summary?.writableCells} msg=${parsed.message}`,
      );
    }

    // 示例文件若存在则再测一次
    const fs = await import('fs');
    const path = await import('path');
    const sample = path.join(__dirname, '../../../成绩导入示例_开学摸底考.xlsx');
    if (fs.existsSync(sample)) {
      const buf = fs.readFileSync(sample);
      const parsed2 = await upload<{
        summary: { okRows: number; writableCells: number };
        mapping: { source: string; message?: string };
      }>(`/v1/exams/${examId}/import/parse`, 'sample.xlsx', buf);
      record(
        '示例成绩表解析',
        parsed2.code === 0 && (parsed2.data?.summary?.writableCells ?? 0) > 0,
        `source=${parsed2.data?.mapping?.source} okRows=${parsed2.data?.summary?.okRows} writable=${parsed2.data?.summary?.writableCells} ${parsed2.data?.mapping?.message ?? ''}`,
      );
    } else {
      record('示例成绩表解析', false, '示例 xlsx 不存在，跳过');
    }
  }

  const analysis = await api<{
    totalTrend: unknown[];
    subjectRates: unknown;
    rankMovers: unknown;
  }>('GET', '/v1/analysis/overview');
  record(
    '成绩分析 overview',
    analysis.code === 0,
    `trend=${analysis.data?.totalTrend?.length ?? 0}`,
  );

  // 7 评语工作台
  const terms = await api<Array<{ id: number; name: string }>>('GET', '/v1/terms');
  const termId = terms.data?.[0]?.id;
  if (termId) {
    const wb = await api<{
      summary: { total: number; none: number; generated: number; adopted: number };
      items: unknown[];
    }>('GET', `/v1/comments/workbench?termId=${termId}&commentType=${encodeURIComponent('期末评语')}`);
    record(
      '评语工作台',
      wb.code === 0,
      `total=${wb.data?.summary?.total} none=${wb.data?.summary?.none} generated=${wb.data?.summary?.generated} adopted=${wb.data?.summary?.adopted}`,
    );

    if (studentId) {
      const gen = await api<{
        draftText: string;
        available: boolean;
        aiRecordId: number | null;
      }>('POST', '/v1/comments/generate', {
        studentId,
        termId,
        commentType: '期末评语',
        tone: '朴实',
        length: '短',
        includeAdvice: true,
      });
      record(
        '评语生成(可降级)',
        gen.code === 0 && Boolean(gen.data?.draftText),
        `available=${gen.data?.available} len=${gen.data?.draftText?.length ?? 0}`,
      );

      if (gen.code === 0 && gen.data?.draftText) {
        const adopt = await api<{ id: number }>('POST', '/v1/comments/adopt', {
          studentId,
          termId,
          commentType: '日常评语',
          finalText: gen.data.draftText,
          aiRecordId: gen.data.aiRecordId ?? undefined,
        });
        record('评语采纳', adopt.code === 0, `id=${adopt.data?.id ?? '-'} msg=${adopt.message}`);
      }
    }
  } else {
    record('评语工作台', false, '无学期');
  }

  // 8 AI health
  const health = await api<{ configured: boolean; month: { callCount: number } }>(
    'GET',
    '/v1/ai/health',
  );
  record(
    'AI 健康/用量',
    health.code === 0,
    `configured=${health.data?.configured} calls=${health.data?.month?.callCount}`,
  );

  // 9 事件列表（无 AI 整理）
  const incidents = await api<{ items: unknown[]; draftCount: number }>(
    'GET',
    '/v1/incidents?page=1&pageSize=5',
  );
  record(
    '事件列表(手工)',
    incidents.code === 0,
    `items=${incidents.data?.items?.length ?? 0} drafts=${incidents.data?.draftCount ?? 0}`,
  );

  // 汇总
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log('\n======== M1 SMOKE SUMMARY ========');
  console.log(`PASS ${passed} / FAIL ${failed} / TOTAL ${results.length}`);
  if (failed > 0) {
    for (const r of results.filter((x) => !x.ok)) {
      console.log(` - FAIL: ${r.name}: ${r.detail}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
