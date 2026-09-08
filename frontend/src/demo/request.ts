import { ApiError } from '@/api/http';
import type { Student } from '@/types';
import { tryHandleDemoAi } from './aiGenerate';
import { buildDemoCommentContext } from './commentContext';
import { allocDemoId, getDemoDb, resetDemoDb } from './db';
import { buildExamMatrix } from './seed';

/** 模拟网络延迟 */
async function delay(): Promise<void> {
  const ms = 60 + Math.floor(Math.random() * 140);
  await new Promise((r) => setTimeout(r, ms));
}

/** 解析 JSON body */
function parseBody(raw: BodyInit | null | undefined): unknown {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** 路径参数匹配 */
function match(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean);
  const sp = pathname.split('/').filter(Boolean);
  if (pp.length !== sp.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i += 1) {
    const a = pp[i]!;
    const b = sp[i]!;
    if (a.startsWith(':')) params[a.slice(1)] = decodeURIComponent(b);
    else if (a !== b) return null;
  }
  return params;
}

/** 列表学生转简表 */
function toStudentBrief(s: Student): Student {
  const {
    id,
    studentNo,
    name,
    gender,
    focusLevel,
    status,
    cadreRole,
    boardType,
    tagIds,
    photoUrl,
    lastIncidentSummary,
    daysSinceLastContact,
    hasSensitive,
  } = s;
  return {
    id,
    studentNo,
    name,
    gender,
    focusLevel,
    status,
    cadreRole,
    boardType,
    tagIds,
    photoUrl,
    lastIncidentSummary,
    daysSinceLastContact,
    hasSensitive,
  };
}

/** 演示 API 总入口：只读写内存库；AI 生成经 DeepSeek 代理 */
export async function demoRequest<T>(
  pathWithQuery: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const url = new URL(pathWithQuery, 'http://cp.demo');
  const pathname = url.pathname;
  const q = url.searchParams;
  const body = parseBody(options.body ?? undefined);

  const aiResult = await tryHandleDemoAi(method, pathname, body);
  if (aiResult !== undefined) {
    return aiResult as T;
  }

  await delay();
  const data = dispatch(method, pathname, q, body);
  return data as T;
}

/** 演示上传：不落盘，返回占位结果 */
export async function demoUpload<T>(path: string): Promise<T> {
  await delay();
  const url = new URL(path, 'http://cp.demo');
  const m = match('/v1/incidents/:id/attachments', url.pathname);
  if (m) {
    return {
      id: Date.now(),
      incidentId: Number(m.id),
      mime: 'image/png',
      size: 0,
      createdAt: new Date().toISOString(),
      hasThumb: false,
    } as T;
  }
  if (url.pathname.includes('/import/parse')) {
    return {
      mapping: {
        headerRowIndex: 0,
        studentNoCol: 0,
        nameCol: 1,
        subjects: [],
        source: 'rules',
        message: '演示模式：未解析真实 Excel',
      },
      subjects: getDemoDb().subjects.map((s) => ({
        id: s.id,
        name: s.name,
        fullScore: s.fullScore,
      })),
      rows: [],
      summary: { totalRows: 0, okRows: 0, writableCells: 0 },
    } as T;
  }
  if (url.pathname.includes('/knowledge/documents/upload')) {
    const id = allocDemoId('kb');
    const doc = {
      id,
      title: '演示上传文档',
      categoryPath: '其他',
      source: 'upload',
      filePath: null,
      segCount: 1,
      tags: [],
      createdAt: new Date().toISOString(),
      preview: '演示模式上传占位内容',
    };
    getDemoDb().kbDocuments.unshift(doc);
    return doc as T;
  }
  throw new ApiError(3001, `演示模式暂不支持上传：${path}`);
}

/** 演示模板占位符（文案不直接提「事件」） */
function demoPlaceholders(
  scene: string,
): Array<{ key: string; label: string; sample: string }> {
  if (scene === 'comment') {
    return [
      { key: 'student_name', label: '学生姓名', sample: '王浩然' },
      { key: 'term', label: '学期名', sample: '2025-2026 第一学期' },
      { key: 'style_tone', label: '语气', sample: '朴实' },
      { key: 'style_length', label: '篇幅', sample: '150-220字' },
      { key: 'style_advice', label: '是否含建议', sample: '是' },
      { key: 'score_trend', label: '成绩摘要', sample: '期中总分班级中游…' },
      { key: 'incident_summary', label: '在校表现摘要', sample: '课堂专注度起伏…' },
      { key: 'praise_summary', label: '表扬摘要', sample: '主动帮助同学…' },
      { key: 'last_comment', label: '上次评语', sample: '无历史评语' },
      { key: 'impression', label: '班主任印象', sample: '乐于助人，作业偶有拖拉' },
    ];
  }
  if (scene === 'data_qa') {
    return [
      { key: 'scope', label: '查询范围', sample: '全班 / 王浩然' },
      { key: 'context', label: '系统数据块', sample: '（成绩与班级概况）' },
    ];
  }
  if (scene === 'talk_script') {
    return [
      { key: 'scene', label: '场景描述', sample: '家长来电想了解近期学习状态…' },
      { key: 'context', label: '学生资料', sample: '（可选注入）' },
      { key: 'student_name', label: '学生姓名', sample: '王浩然' },
    ];
  }
  if (scene === 'work_summary') {
    return [
      { key: 'term', label: '学期名', sample: '2025-2026 第一学期' },
      { key: 'context', label: '班级数据', sample: '（考试趋势与管理概况）' },
    ];
  }
  if (scene === 'report') {
    return [
      { key: 'student_name', label: '学生姓名', sample: '王浩然' },
      { key: 'context', label: '综合资料', sample: '（学习与日常表现）' },
    ];
  }
  return [
    { key: 'student_name', label: '学生姓名', sample: '王浩然' },
    { key: 'context', label: '上下文', sample: '（系统注入）' },
  ];
}

/** 路由分发 */
function dispatch(
  method: string,
  pathname: string,
  q: URLSearchParams,
  body: unknown,
): unknown {
  const db = getDemoDb();
  const b = (body ?? {}) as Record<string, unknown>;

  // —— Auth ——
  if (method === 'POST' && pathname === '/v1/auth/login') {
    return { ...db.user };
  }
  if (method === 'POST' && pathname === '/v1/auth/logout') {
    return { ok: true };
  }
  if (method === 'GET' && pathname === '/v1/auth/me') {
    return { ...db.user };
  }
  if (method === 'POST' && pathname === '/v1/auth/change-password') {
    return { ok: true };
  }
  if (method === 'GET' && pathname === '/v1/auth/pin/status') {
    return {
      hasPin: false,
      unlocked: true,
      unlockedUntil: null,
      pinLocked: false,
      pinLockedUntil: null,
    };
  }
  if (method === 'POST' && pathname === '/v1/auth/pin/set') {
    return { ok: true };
  }
  if (method === 'POST' && pathname === '/v1/auth/pin/verify') {
    return { unlockedUntil: new Date(Date.now() + 3600_000).toISOString() };
  }

  // —— Dashboard ——
  if (method === 'GET' && pathname === '/v1/dashboard/home') {
    return buildDashboardHome();
  }

  // —— Students / tags ——
  if (method === 'GET' && pathname === '/v1/tags') {
    return [...db.tags];
  }
  if (method === 'POST' && pathname === '/v1/tags') {
    const id = allocDemoId('tag');
    const tag = {
      id,
      name: String(b.name ?? '新标签'),
      domain: (b.domain as never) ?? '其他',
      color: (b.color as string) ?? undefined,
      sensitiveLevel: 0 as const,
    };
    db.tags.push(tag);
    return tag;
  }
  if (method === 'GET' && pathname === '/v1/students') {
    return listStudents(q);
  }
  {
    const m = match('/v1/students/:id', pathname);
    if (m && method === 'GET') {
      const stu = db.students.find((s) => s.id === Number(m.id));
      if (!stu) throw new ApiError(3001, '学生不存在');
      return {
        ...stu,
        guardians: db.guardians.filter((g) => g.studentId === stu.id),
      };
    }
    if (m && method === 'PATCH') {
      const stu = db.students.find((s) => s.id === Number(m.id));
      if (!stu) throw new ApiError(3001, '学生不存在');
      Object.assign(stu, b);
      return toStudentBrief(stu);
    }
    if (m && method === 'DELETE') {
      const idx = db.students.findIndex((s) => s.id === Number(m.id));
      if (idx < 0) throw new ApiError(3001, '学生不存在');
      db.students.splice(idx, 1);
      return { ok: true };
    }
  }
  if (method === 'POST' && pathname === '/v1/students') {
    const id = allocDemoId('student');
    const stu = {
      id,
      studentNo: String(b.studentNo ?? `202499${id}`),
      name: String(b.name ?? '新同学'),
      gender: (Number(b.gender) === 1 ? 1 : 0) as 0 | 1,
      focusLevel: 0 as const,
      status: '在读' as const,
      tagIds: [],
      guardians: [],
      ethnicity: null,
      address: null,
      residence: null,
      enrolledAt: new Date().toISOString(),
      remark: null,
    };
    db.students.push(stu);
    return toStudentBrief(stu);
  }
  {
    const m = match('/v1/students/:id/tags', pathname);
    if (m && method === 'POST') {
      const stu = db.students.find((s) => s.id === Number(m.id));
      if (!stu) throw new ApiError(3001, '学生不存在');
      stu.tagIds = Array.isArray(b.tagIds) ? (b.tagIds as number[]) : [];
      return toStudentBrief(stu);
    }
  }
  {
    const m = match('/v1/students/:studentId/guardians', pathname);
    if (m && method === 'GET') {
      return db.guardians.filter((g) => g.studentId === Number(m.studentId));
    }
    if (m && method === 'POST') {
      const id = allocDemoId('guardian');
      const g = {
        id,
        studentId: Number(m.studentId),
        relation: (b.relation as string) ?? null,
        name: (b.name as string) ?? null,
        phone: (b.phone as string) ?? null,
        wechat: (b.wechat as string) ?? null,
        job: (b.job as string) ?? null,
        contactPref: (b.contactPref as string) ?? null,
        bestTime: (b.bestTime as string) ?? null,
        isPrimary: Boolean(b.isPrimary),
        remark: (b.remark as string) ?? null,
      };
      db.guardians.push(g);
      return g;
    }
  }
  {
    const m = match('/v1/students/guardians/:guardianId', pathname);
    if (m && method === 'PATCH') {
      const g = db.guardians.find((x) => x.id === Number(m.guardianId));
      if (!g) throw new ApiError(3001, '监护人不存在');
      Object.assign(g, b);
      return g;
    }
    if (m && method === 'DELETE') {
      const idx = db.guardians.findIndex((x) => x.id === Number(m.guardianId));
      if (idx >= 0) db.guardians.splice(idx, 1);
      return { ok: true };
    }
  }
  if (method === 'POST' && pathname === '/v1/students/import/preview') {
    return { rows: [] };
  }
  if (method === 'POST' && pathname === '/v1/students/import/confirm') {
    return { created: 0, skipped: 0, updated: 0 };
  }
  {
    const m = match('/v1/students/:studentId/sensitive', pathname);
    if (m && method === 'GET') {
      const prefix = `${m.studentId}:`;
      return Object.keys(db.sensitive)
        .filter((k) => k.startsWith(prefix))
        .map((k) => ({
          category: k.slice(prefix.length),
          hasContent: true,
          updatedAt: new Date().toISOString(),
        }));
    }
  }
  {
    const m = match('/v1/students/:studentId/sensitive/:category', pathname);
    if (m && method === 'GET') {
      const key = `${m.studentId}:${m.category}`;
      const content = db.sensitive[key];
      if (!content) throw new ApiError(3001, '无该敏感档案');
      return {
        category: m.category,
        content,
        updatedAt: new Date().toISOString(),
      };
    }
    if (m && method === 'PUT') {
      const key = `${m.studentId}:${m.category}`;
      db.sensitive[key] = String(b.content ?? '');
      return {
        category: m.category,
        content: db.sensitive[key],
        updatedAt: new Date().toISOString(),
      };
    }
    if (m && method === 'DELETE') {
      delete db.sensitive[`${m.studentId}:${m.category}`];
      return { ok: true };
    }
  }
  {
    const m = match('/v1/students/:studentId/timeline', pathname);
    if (m && method === 'GET') {
      return db.timelines[Number(m.studentId)] ?? [];
    }
  }
  {
    const m = match('/v1/students/:studentId/impression', pathname);
    if (m && method === 'GET') {
      const sid = Number(m.studentId);
      return {
        studentId: sid,
        content: db.impressions[sid] ?? '',
        updatedAt: new Date().toISOString(),
      };
    }
    if (m && method === 'PUT') {
      const sid = Number(m.studentId);
      db.impressions[sid] = String(b.content ?? '');
      return {
        studentId: sid,
        content: db.impressions[sid],
        updatedAt: new Date().toISOString(),
      };
    }
  }

  // —— Scores ——
  if (method === 'GET' && pathname === '/v1/terms') return [...db.terms];
  if (method === 'GET' && pathname === '/v1/subjects') return [...db.subjects];
  if (method === 'GET' && pathname === '/v1/exams') return [...db.exams];
  if (method === 'POST' && pathname === '/v1/exams') {
    const id = allocDemoId('exam');
    const exam = {
      id,
      name: String(b.name ?? '新考试'),
      examType: String(b.examType ?? '测验'),
      examDate: String(b.examDate ?? new Date().toISOString()),
      subjectIds: Array.isArray(b.subjectIds) ? (b.subjectIds as number[]) : [],
      status: 'open',
    };
    db.exams.unshift(exam);
    return exam;
  }
  {
    const m = match('/v1/exams/:id', pathname);
    if (m && method === 'GET') {
      const exam = db.exams.find((e) => e.id === Number(m.id));
      if (!exam) throw new ApiError(3001, '考试不存在');
      return exam;
    }
    if (m && method === 'PATCH') {
      const exam = db.exams.find((e) => e.id === Number(m.id));
      if (!exam) throw new ApiError(3001, '考试不存在');
      Object.assign(exam, b);
      return exam;
    }
    if (m && method === 'DELETE') {
      const idx = db.exams.findIndex((e) => e.id === Number(m.id));
      if (idx >= 0) db.exams.splice(idx, 1);
      return { ok: true };
    }
  }
  {
    const m = match('/v1/exams/:id/matrix', pathname);
    if (m && method === 'GET') return buildExamMatrix(db, Number(m.id));
  }
  {
    const m = match('/v1/exams/:examId/entry', pathname);
    if (m && method === 'GET') {
      const examId = Number(m.examId);
      const subjectId = Number(q.get('subjectId'));
      const prevExam = db.exams
        .filter((e) => e.id < examId)
        .sort((a, b) => b.id - a.id)[0];
      return db.students
        .filter((s) => s.status === '在读')
        .map((s) => {
          const cur = db.scores.find(
            (c) =>
              c.examId === examId &&
              c.subjectId === subjectId &&
              c.studentId === s.id,
          );
          const last = prevExam
            ? db.scores.find(
                (c) =>
                  c.examId === prevExam.id &&
                  c.subjectId === subjectId &&
                  c.studentId === s.id,
              )
            : undefined;
          return {
            studentId: s.id,
            studentNo: s.studentNo,
            name: s.name,
            lastScore: last?.score ?? null,
            currentScore: cur?.score ?? null,
            status: cur?.status ?? 'empty',
          };
        });
    }
  }
  if (method === 'PATCH' && pathname === '/v1/scores/batch') {
    const examId = Number(b.examId);
    const subjectId = Number(b.subjectId);
    const items = Array.isArray(b.items) ? b.items : [];
    for (const raw of items) {
      const item = raw as {
        studentId: number;
        score: number | null;
        status: string;
      };
      let cell = db.scores.find(
        (c) =>
          c.examId === examId &&
          c.subjectId === subjectId &&
          c.studentId === item.studentId,
      );
      if (!cell) {
        cell = {
          examId,
          subjectId,
          studentId: item.studentId,
          score: item.score,
          status: (item.status as never) || 'normal',
          classRank: null,
        };
        db.scores.push(cell);
      } else {
        cell.score = item.score;
        cell.status = (item.status as never) || 'normal';
      }
    }
    return { ok: true };
  }
  {
    const m = match('/v1/exams/:examId/recalc', pathname);
    if (m && method === 'POST') return { ok: true };
  }
  {
    const m = match('/v1/exams/:examId/import/template', pathname);
    if (m && method === 'GET') {
      return {
        filename: 'demo-score-template.csv',
        mimeType: 'text/csv',
        base64: btoa('学号,姓名\n'),
      };
    }
  }
  {
    const m = match('/v1/exams/:examId/import/commit', pathname);
    if (m && method === 'POST') return { ok: true, written: 0 };
  }

  // —— Incidents ——
  if (method === 'GET' && pathname === '/v1/incidents') {
    return listIncidents(q);
  }
  if (method === 'GET' && pathname === '/v1/incidents/draft-count') {
    return {
      count: db.incidents.filter((i) => i.status === 'draft').length,
    };
  }
  if (method === 'GET' && pathname === '/v1/incidents/follow-ups/due') {
    return db.incidents.filter(
      (i) =>
        i.followUpNeeded &&
        !i.followUpDone &&
        i.status === 'confirmed',
    );
  }
  if (method === 'POST' && pathname === '/v1/incidents/draft') {
    return createIncident({
      title: String(b.content ?? '').slice(0, 20) || '速记草稿',
      content: String(b.content ?? ''),
      draftContent: String(b.content ?? ''),
      category: (b.category as never) ?? '其他',
      severity: 1,
      studentIds: Array.isArray(b.studentIds) ? (b.studentIds as number[]) : [],
      occurredAt: (b.occurredAt as string) ?? new Date().toISOString(),
      followUpNeeded: false,
      followUpDone: false,
      status: 'draft',
    });
  }
  if (method === 'POST' && pathname === '/v1/incidents') {
    return createIncident({
      title: String(b.title ?? ''),
      content: String(b.content ?? ''),
      category: (b.category as never) ?? '其他',
      severity: (Number(b.severity) as 1 | 2 | 3) || 1,
      studentIds: Array.isArray(b.studentIds) ? (b.studentIds as number[]) : [],
      occurredAt: (b.occurredAt as string) ?? new Date().toISOString(),
      followUpNeeded: Boolean(b.followUpNeeded),
      followUpDone: false,
      followUpDeadline: (b.followUpDeadline as string) ?? undefined,
      status: 'confirmed',
    });
  }
  {
    const m = match('/v1/incidents/:id/confirm', pathname);
    if (m && method === 'PATCH') {
      const item = db.incidents.find((i) => i.id === Number(m.id));
      if (!item) throw new ApiError(3001, '事件不存在');
      Object.assign(item, b, { status: 'confirmed' });
      item.studentNames = item.studentIds.map(
        (sid) => db.students.find((s) => s.id === sid)?.name ?? '未知',
      );
      return item;
    }
  }
  {
    const m = match('/v1/incidents/:id/attachments', pathname);
    if (m && method === 'GET') return [];
  }
  {
    const m = match('/v1/incidents/:id', pathname);
    if (m && method === 'GET') {
      const item = db.incidents.find((i) => i.id === Number(m.id));
      if (!item) throw new ApiError(3001, '事件不存在');
      return item;
    }
    if (m && method === 'PATCH') {
      const item = db.incidents.find((i) => i.id === Number(m.id));
      if (!item) throw new ApiError(3001, '事件不存在');
      if (b.followUpDone === true) {
        item.followUpDone = true;
        item.followUpDoneAt = new Date().toISOString();
      } else if (b.followUpDone === false) {
        item.followUpDone = false;
        item.followUpDoneAt = null;
        item.followUpResult = null;
      }
      if (b.followUpResult !== undefined) {
        item.followUpResult = b.followUpResult as string | null;
      }
      if (b.title !== undefined) item.title = String(b.title);
      if (b.content !== undefined) item.content = String(b.content);
      if (b.category !== undefined) item.category = b.category as never;
      if (b.severity !== undefined) item.severity = Number(b.severity) as 1 | 2 | 3;
      if (b.followUpNeeded !== undefined) {
        item.followUpNeeded = Boolean(b.followUpNeeded);
      }
      if (b.followUpDeadline !== undefined) {
        item.followUpDeadline = b.followUpDeadline as string | undefined;
      }
      if (Array.isArray(b.studentIds)) {
        item.studentIds = b.studentIds as number[];
        item.studentNames = item.studentIds.map(
          (sid) => db.students.find((s) => s.id === sid)?.name ?? '未知',
        );
      }
      return item;
    }
    if (m && method === 'DELETE') {
      const idx = db.incidents.findIndex((i) => i.id === Number(m.id));
      if (idx >= 0) db.incidents.splice(idx, 1);
      return { ok: true };
    }
  }
  {
    const m = match('/v1/attachments/:id', pathname);
    if (m && method === 'DELETE') return { ok: true };
  }

  // —— Comments / AI health ——
  if (method === 'GET' && pathname === '/v1/comments/workbench') {
    const termId = Number(q.get('termId') || db.terms[db.terms.length - 1]?.id || 1);
    const term = db.terms.find((t) => t.id === termId);
    const commentType = q.get('commentType') || '期中评语';
    const items = db.students
      .filter((s) => s.status === '在读')
      .map((s) => {
        const adopted = db.comments.find(
          (c) => c.studentId === s.id && c.commentType === commentType,
        );
        return {
          studentId: s.id,
          studentNo: s.studentNo,
          name: s.name,
          focusLevel: s.focusLevel,
          status: adopted ? ('adopted' as const) : ('none' as const),
          aiRecordId: null,
          draftText: null,
          commentId: adopted?.id ?? null,
          finalText: adopted?.finalText ?? null,
        };
      });
    return {
      termId,
      termName: term?.name ?? null,
      commentType,
      items,
      summary: {
        total: items.length,
        none: items.filter((i) => i.status === 'none').length,
        generated: 0,
        failed: 0,
        adopted: items.filter((i) => i.status === 'adopted').length,
      },
    };
  }
  {
    const m = match('/v1/comments/context/:studentId', pathname);
    if (m && method === 'GET') {
      const termRaw = q.get('termId');
      const termId =
        termRaw != null && termRaw !== '' ? Number(termRaw) : null;
      // 与生成接口共用同一套上下文组装，保证预览与入参一致
      return buildDemoCommentContext(Number(m.studentId), termId);
    }
  }
  // POST /v1/comments/generate 由 tryHandleDemoAi 处理
  if (method === 'POST' && pathname === '/v1/comments/adopt') {
    const id = allocDemoId('comment');
    const row = {
      id,
      studentId: Number(b.studentId),
      termId: (b.termId as number) ?? null,
      commentType: (b.commentType as string) ?? null,
      finalText: String(b.finalText ?? ''),
      sourceAiRecordId: (b.aiRecordId as number) ?? null,
      createdAt: new Date().toISOString(),
    };
    db.comments.unshift(row);
    return row;
  }
  if (method === 'POST' && pathname === '/v1/comments') {
    const id = allocDemoId('comment');
    const row = {
      id,
      studentId: Number(b.studentId),
      termId: (b.termId as number) ?? null,
      commentType: (b.commentType as string) ?? null,
      finalText: String(b.finalText ?? ''),
      sourceAiRecordId: null,
      createdAt: new Date().toISOString(),
    };
    db.comments.unshift(row);
    return row;
  }
  {
    const m = match('/v1/comments/student/:studentId', pathname);
    if (m && method === 'GET') {
      return db.comments.filter((c) => c.studentId === Number(m.studentId));
    }
  }
  {
    const m = match('/v1/comments/:id', pathname);
    if (m && method === 'DELETE') {
      const idx = db.comments.findIndex((c) => c.id === Number(m.id));
      if (idx >= 0) db.comments.splice(idx, 1);
      return { ok: true };
    }
  }
  if (method === 'GET' && pathname === '/v1/ai/health') {
    return {
      configured: true,
      available: true,
      month: {
        tokensIn: 12600,
        tokensOut: 4800,
        callCount: 28,
        failCount: 0,
      },
    };
  }

  // —— AI ——
  if (method === 'GET' && pathname === '/v1/ai/prompts') {
    const scene = q.get('scene');
    const items = scene
      ? db.prompts.filter((p) => p.scene === scene)
      : [...db.prompts];
    return {
      items,
      placeholders: demoPlaceholders(scene ?? 'comment'),
    };
  }
  if (method === 'POST' && pathname === '/v1/ai/prompts') {
    const id = allocDemoId('prompt');
    const row = {
      id,
      scene: String(b.scene ?? 'comment'),
      name: String(b.name ?? '自定义模板'),
      template: String(b.template ?? ''),
      styleParams: (b.styleParams as never) ?? {},
      isBuiltin: false,
      isDefault: Boolean(b.isDefault),
    };
    db.prompts.push(row);
    return row;
  }
  {
    const m = match('/v1/ai/prompts/:id/clone', pathname);
    if (m && method === 'POST') {
      const src = db.prompts.find((p) => p.id === Number(m.id));
      if (!src) throw new ApiError(3001, '模板不存在');
      const id = allocDemoId('prompt');
      const row = {
        ...src,
        id,
        name: `${src.name}（副本）`,
        isBuiltin: false,
        isDefault: false,
      };
      db.prompts.push(row);
      return row;
    }
  }
  {
    const m = match('/v1/ai/prompts/:id/default', pathname);
    if (m && method === 'POST') {
      const target = db.prompts.find((p) => p.id === Number(m.id));
      if (!target) throw new ApiError(3001, '模板不存在');
      for (const p of db.prompts) {
        if (p.scene === target.scene) p.isDefault = p.id === target.id;
      }
      return target;
    }
  }
  {
    const m = match('/v1/ai/prompts/:id', pathname);
    if (m && method === 'PATCH') {
      const p = db.prompts.find((x) => x.id === Number(m.id));
      if (!p) throw new ApiError(3001, '模板不存在');
      Object.assign(p, b);
      return p;
    }
    if (m && method === 'DELETE') {
      const idx = db.prompts.findIndex((x) => x.id === Number(m.id));
      if (idx >= 0) db.prompts.splice(idx, 1);
      return { ok: true };
    }
  }
  // POST data-ask / talk-script / work-summary / knowledge/ask 由 tryHandleDemoAi 处理
  if (method === 'GET' && pathname === '/v1/ai/records') {
    const page = Number(q.get('page') || 1);
    const pageSize = Number(q.get('pageSize') || 20);
    return {
      items: db.aiRecords.slice(0, pageSize),
      total: db.aiRecords.length,
      page,
      pageSize,
    };
  }

  // —— Knowledge ——
  if (method === 'GET' && pathname === '/v1/knowledge/categories') {
    return {
      presets: ['班级管理', '家校沟通', '教学资料', '其他'],
      used: ['班级管理/公约', '家校沟通'],
    };
  }
  if (method === 'GET' && pathname === '/v1/knowledge/documents') {
    const page = Number(q.get('page') || 1);
    const pageSize = Number(q.get('pageSize') || 20);
    let items = [...db.kbDocuments];
    const kw = q.get('keyword');
    if (kw) items = items.filter((d) => d.title.includes(kw));
    return { items, total: items.length, page, pageSize };
  }
  {
    const m = match('/v1/knowledge/documents/:id', pathname);
    if (m && method === 'GET') {
      const document = db.kbDocuments.find((d) => d.id === Number(m.id));
      if (!document) throw new ApiError(3001, '文档不存在');
      return {
        document,
        segments: [
          {
            id: 1,
            seq: 1,
            text: document.preview || '演示文档段落内容。',
          },
        ],
      };
    }
    if (m && method === 'PATCH') {
      const document = db.kbDocuments.find((d) => d.id === Number(m.id));
      if (!document) throw new ApiError(3001, '文档不存在');
      Object.assign(document, b);
      return document;
    }
    if (m && method === 'DELETE') {
      const idx = db.kbDocuments.findIndex((d) => d.id === Number(m.id));
      if (idx >= 0) db.kbDocuments.splice(idx, 1);
      return { ok: true };
    }
  }
  if (method === 'POST' && pathname === '/v1/knowledge/documents/paste') {
    const id = allocDemoId('kb');
    const doc = {
      id,
      title: String(b.title ?? '未命名'),
      categoryPath: (b.categoryPath as string) ?? null,
      source: 'paste',
      filePath: null,
      segCount: 1,
      tags: Array.isArray(b.tags) ? (b.tags as string[]) : [],
      createdAt: new Date().toISOString(),
      preview: String(b.content ?? '').slice(0, 80),
    };
    db.kbDocuments.unshift(doc);
    return doc;
  }

  // —— Analysis ——
  if (method === 'GET' && pathname === '/v1/analysis/overview') {
    return buildAnalysis(q);
  }

  // —— Recycle ——
  if (method === 'GET' && pathname === '/v1/recycle') {
    return { items: [] };
  }
  {
    const m = match('/v1/recycle/:type/:id/restore', pathname);
    if (m && method === 'POST') return { ok: true };
  }

  // —— Settings / backup ——
  if (method === 'GET' && pathname === '/v1/settings/thresholds') {
    return { ...db.thresholds };
  }
  if (method === 'PUT' && pathname === '/v1/settings/thresholds') {
    Object.assign(db.thresholds, b);
    return { ...db.thresholds };
  }
  if (method === 'GET' && pathname === '/v1/backup/list') {
    return [
      {
        filename: 'demo-backup-placeholder.db',
        size: 1024,
        createdAt: new Date().toISOString(),
        quickCheckOk: true,
        trigger: 'manual',
      },
    ];
  }
  if (method === 'POST' && pathname === '/v1/backup/run') {
    return {
      ok: true,
      backupPath: 'demo://memory',
      filename: 'demo-backup-placeholder.db',
    };
  }
  if (method === 'POST' && pathname === '/v1/backup/restore') {
    resetDemoDb();
    return {
      ok: true,
      safetyBackup: 'demo://memory',
      restoredFrom: 'demo-seed',
    };
  }
  if (method === 'GET' && pathname === '/v1/settings/audit-logs') {
    return {
      items: [
        {
          id: 1,
          action: 'demo.view',
          targetStudentId: null,
          detail: '进入演示模式（内存数据，未写生产库）',
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
    };
  }

  throw new ApiError(3001, `演示模式未实现接口：${method} ${pathname}`);
}

/** 学生列表 */
function listStudents(q: URLSearchParams): { items: Student[]; total: number } {
  const db = getDemoDb();
  let items = db.students.map(toStudentBrief);
  const status = q.get('status');
  const focus = q.get('focusLevel');
  const keyword = q.get('q');
  if (status) items = items.filter((s) => s.status === status);
  if (focus != null && focus !== '') {
    items = items.filter((s) => s.focusLevel === Number(focus));
  }
  if (keyword) {
    items = items.filter(
      (s) => s.name.includes(keyword) || s.studentNo.includes(keyword),
    );
  }
  const sortBy = q.get('sortBy');
  const sortOrder = q.get('sortOrder') === 'desc' ? -1 : 1;
  if (sortBy === 'focusLevel') {
    items.sort((a, b) => (a.focusLevel - b.focusLevel) * sortOrder);
  } else if (sortBy === 'studentNo') {
    items.sort((a, b) => a.studentNo.localeCompare(b.studentNo, 'zh') * sortOrder);
  }
  const page = Number(q.get('page') || 1);
  const pageSize = Number(q.get('pageSize') || 100);
  const total = items.length;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total };
}

/** 事件列表 */
function listIncidents(q: URLSearchParams): {
  items: ReturnType<typeof getDemoDb>['incidents'];
  total: number;
  draftCount: number;
} {
  const db = getDemoDb();
  let items = [...db.incidents];
  const status = q.get('status');
  const category = q.get('category');
  const keyword = q.get('q');
  if (status) items = items.filter((i) => i.status === status);
  if (category) items = items.filter((i) => i.category === category);
  if (keyword) {
    items = items.filter(
      (i) =>
        i.title.includes(keyword) ||
        (i.content ?? '').includes(keyword),
    );
  }
  items.sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
  const page = Number(q.get('page') || 1);
  const pageSize = Number(q.get('pageSize') || 50);
  const total = items.length;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    draftCount: db.incidents.filter((i) => i.status === 'draft').length,
  };
}

/** 创建事件 */
function createIncident(
  partial: Omit<
    ReturnType<typeof getDemoDb>['incidents'][number],
    'id' | 'studentNames'
  >,
): ReturnType<typeof getDemoDb>['incidents'][number] {
  const db = getDemoDb();
  const id = allocDemoId('incident');
  const item = {
    ...partial,
    id,
    studentNames: partial.studentIds.map(
      (sid) => db.students.find((s) => s.id === sid)?.name ?? '未知',
    ),
  };
  db.incidents.unshift(item);
  return item;
}

/** 首页看板 */
function buildDashboardHome(): unknown {
  const db = getDemoDb();
  const focusStudents = db.students
    .filter((s) => s.status === '在读' && s.focusLevel >= 2)
    .map(toStudentBrief);
  const dueFollowUps = db.incidents.filter(
    (i) => i.followUpNeeded && !i.followUpDone && i.status === 'confirmed',
  );
  const recentDrafts = db.incidents
    .filter((i) => i.status === 'draft')
    .slice(0, 5);
  const draftCount = db.incidents.filter((i) => i.status === 'draft').length;

  const latest = [...db.exams].sort((a, b) => b.id - a.id)[0];
  let scoreBrief = null;
  if (latest) {
    const matrix = buildExamMatrix(db, latest.id);
    const totals = matrix.rows
      .map((r) => r.totalScore)
      .filter((x): x is number => x != null);
    const latestClassAvg =
      totals.length > 0
        ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) /
          10
        : null;
    const totalTrend = db.exams.map((exam) => {
      const m = buildExamMatrix(db, exam.id);
      const ts = m.rows
        .map((r) => r.totalScore)
        .filter((x): x is number => x != null);
      const classAvg =
        ts.length > 0
          ? Math.round((ts.reduce((a, b) => a + b, 0) / ts.length) * 10) / 10
          : null;
      return {
        examId: exam.id,
        examName: exam.name,
        examDate: exam.examDate,
        classAvg,
        gradeAvg: classAvg != null ? Math.round((classAvg - 3) * 10) / 10 : null,
        studentCount: ts.length,
      };
    });
    const subjects = db.subjects.map((sub) => {
      const cells = db.scores.filter(
        (c) =>
          c.examId === latest.id &&
          c.subjectId === sub.id &&
          c.score != null &&
          c.status === 'normal',
      );
      const avg =
        cells.length > 0
          ? Math.round(
              (cells.reduce((a, c) => a + (c.score ?? 0), 0) / cells.length) *
                10,
            ) / 10
          : 0;
      const low = cells.filter(
        (c) => (c.score ?? 0) < sub.fullScore * db.thresholds.lowScoreRatio,
      ).length;
      return {
        subjectId: sub.id,
        subjectName: sub.name,
        avgScore: avg,
        lowRate:
          Math.round((cells.length ? low / cells.length : 0) * 10000) / 100,
        sampleCount: cells.length,
      };
    });
    scoreBrief = {
      latestExamId: latest.id,
      latestExamName: latest.name,
      latestExamDate: latest.examDate,
      latestClassAvg,
      totalTrend,
      subjects,
    };
  }

  return {
    focusStudents,
    dueFollowUps,
    draftCount,
    recentDrafts,
    scoreBrief,
  };
}

/** 分析中心 */
function buildAnalysis(q: URLSearchParams): unknown {
  const db = getDemoDb();
  const examId = q.get('examId') ? Number(q.get('examId')) : null;
  const subjectId = q.get('subjectId') ? Number(q.get('subjectId')) : null;
  const exams = [...db.exams].sort((a, b) => a.id - b.id);
  const curr =
    exams.find((e) => e.id === examId) ?? exams[exams.length - 1] ?? null;
  const prevIdx = curr ? exams.findIndex((e) => e.id === curr.id) - 1 : -1;
  const prev = prevIdx >= 0 ? exams[prevIdx]! : null;

  const totalTrend = exams.map((exam) => {
    const m = buildExamMatrix(db, exam.id);
    const ts = m.rows
      .map((r) => r.totalScore)
      .filter((x): x is number => x != null);
    const classAvg =
      ts.length > 0
        ? Math.round((ts.reduce((a, b) => a + b, 0) / ts.length) * 10) / 10
        : null;
    return {
      examId: exam.id,
      examName: exam.name,
      examDate: exam.examDate,
      classAvg,
      gradeAvg: classAvg != null ? Math.round((classAvg - 2.5) * 10) / 10 : null,
      studentCount: ts.length,
    };
  });

  const subjectRatesItems = db.subjects.map((sub) => {
    if (!curr) {
      return {
        subjectId: sub.id,
        subjectName: sub.name,
        lowRate: 0,
        passRate: 0,
        excellentRate: 0,
        sampleCount: 0,
      };
    }
    const cells = db.scores.filter(
      (c) =>
        c.examId === curr.id &&
        c.subjectId === sub.id &&
        c.score != null &&
        c.status === 'normal',
    );
    const n = cells.length || 1;
    const low = cells.filter(
      (c) => (c.score ?? 0) < sub.fullScore * db.thresholds.lowScoreRatio,
    ).length;
    const pass = cells.filter(
      (c) => (c.score ?? 0) >= sub.fullScore * db.thresholds.passRatio,
    ).length;
    const exc = cells.filter(
      (c) => (c.score ?? 0) >= sub.fullScore * db.thresholds.excellentRatio,
    ).length;
    return {
      subjectId: sub.id,
      subjectName: sub.name,
      lowRate: Math.round((low / n) * 10000) / 100,
      passRate: Math.round((pass / n) * 10000) / 100,
      excellentRate: Math.round((exc / n) * 10000) / 100,
      sampleCount: cells.length,
    };
  });

  const improve: unknown[] = [];
  const decline: unknown[] = [];
  if (curr && prev) {
    const currM = buildExamMatrix(db, curr.id);
    const prevM = buildExamMatrix(db, prev.id);
    for (const row of currM.rows) {
      const p = prevM.rows.find((r) => r.studentId === row.studentId);
      if (!p?.totalRank || !row.totalRank) continue;
      const delta = p.totalRank - row.totalRank;
      const item = {
        studentId: row.studentId,
        studentNo: row.studentNo,
        name: row.name,
        prevRank: p.totalRank,
        currRank: row.totalRank,
        delta,
        currTotal: row.totalScore ?? 0,
      };
      if (delta >= db.thresholds.rankJumpThreshold) improve.push(item);
      if (delta <= -db.thresholds.rankJumpThreshold) decline.push(item);
    }
    improve.sort((a, b) => (b as { delta: number }).delta - (a as { delta: number }).delta);
    decline.sort((a, b) => (a as { delta: number }).delta - (b as { delta: number }).delta);
  }

  const focusFrequency = db.students
    .filter((s) => s.status === '在读')
    .map((s) => {
      const incidentCount = db.incidents.filter((i) =>
        i.studentIds.includes(s.id),
      ).length;
      return {
        studentId: s.id,
        studentNo: s.studentNo,
        name: s.name,
        incidentCount,
        contactCount: Math.max(1, 5 - s.focusLevel),
        total: incidentCount + Math.max(1, 5 - s.focusLevel),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const catMap = new Map<string, number>();
  for (const i of db.incidents) {
    catMap.set(i.category, (catMap.get(i.category) ?? 0) + 1);
  }

  const histSubject =
    db.subjects.find((s) => s.id === subjectId) ?? db.subjects[1]!;
  const histCells =
    curr && histSubject
      ? db.scores.filter(
          (c) =>
            c.examId === curr.id &&
            c.subjectId === histSubject.id &&
            c.score != null,
        )
      : [];
  const bins = [
    { label: '0-60%', count: 0 },
    { label: '60-70%', count: 0 },
    { label: '70-80%', count: 0 },
    { label: '80-90%', count: 0 },
    { label: '90-100%', count: 0 },
  ];
  for (const c of histCells) {
    const r = (c.score ?? 0) / histSubject.fullScore;
    if (r < 0.6) bins[0]!.count += 1;
    else if (r < 0.7) bins[1]!.count += 1;
    else if (r < 0.8) bins[2]!.count += 1;
    else if (r < 0.9) bins[3]!.count += 1;
    else bins[4]!.count += 1;
  }

  return {
    thresholds: { ...db.thresholds },
    totalTrend,
    subjectRates: {
      examId: curr?.id ?? null,
      examName: curr?.name ?? null,
      items: subjectRatesItems,
    },
    rankMovers: {
      prevExamId: prev?.id ?? null,
      prevExamName: prev?.name ?? null,
      currExamId: curr?.id ?? null,
      currExamName: curr?.name ?? null,
      improve: improve.slice(0, 8),
      decline: decline.slice(0, 8),
    },
    focusFrequency: { days: 90, items: focusFrequency },
    contactHeatmap: {
      days: 28,
      rangeStart: '2026-02-01',
      rangeEnd: '2026-02-28',
      cells: Array.from({ length: 28 }, (_, i) => [
        `2026-02-${String(i + 1).padStart(2, '0')}`,
        Math.floor(Math.random() * 4),
      ]),
      maxCount: 4,
    },
    categoryDistribution: {
      termId: db.terms[db.terms.length - 1]?.id ?? null,
      termName: db.terms[db.terms.length - 1]?.name ?? null,
      items: [...catMap.entries()].map(([category, count]) => ({
        category,
        count,
      })),
    },
    subjectHistogram: {
      examId: curr?.id ?? null,
      examName: curr?.name ?? null,
      subjectId: histSubject.id,
      subjectName: histSubject.name,
      fullScore: histSubject.fullScore,
      bins,
      sampleCount: histCells.length,
    },
    incidentMonthly: {
      months: 6,
      points: [
        { month: '2025-09', count: 3 },
        { month: '2025-10', count: 5 },
        { month: '2025-11', count: 4 },
        { month: '2025-12', count: 2 },
        { month: '2026-01', count: 3 },
        { month: '2026-02', count: 6 },
      ],
    },
  };
}
