import type { DemoDb } from './seed';
import { getDemoDb } from './db';

/** 引用条目 */
export interface DemoCitation {
  kind: string;
  label: string;
  detail: string;
}

/** 学情问答 Mock 上下文 */
export interface DemoDataQaContext {
  text: string;
  citations: DemoCitation[];
  studentId: number | null;
  scopeLabel: string;
}

/**
 * 组装演示学情问答上下文（成绩台账 + 问句命中时的连续进步预计算）。
 * 对齐正式 DataQaContextService 的策略，数据来自内存 Mock。
 */
export function buildDemoDataQaContext(
  question: string,
  explicitStudentId?: number | null,
): DemoDataQaContext {
  const db = getDemoDb();
  const studentId = resolveStudentId(db, question, explicitStudentId);
  if (studentId != null) {
    return buildStudentContext(db, studentId);
  }
  return buildClassContext(db, question);
}

/** 解析范围：显式 ID > 问句姓名 > 全班 */
function resolveStudentId(
  db: DemoDb,
  question: string,
  explicitStudentId?: number | null,
): number | null {
  if (explicitStudentId != null && explicitStudentId > 0) {
    return db.students.some((s) => s.id === explicitStudentId)
      ? explicitStudentId
      : null;
  }
  const active = db.students.filter((s) => s.status === '在读');
  const sorted = [...active].sort((a, b) => b.name.length - a.name.length);
  for (const s of sorted) {
    if (s.name.length >= 2 && question.includes(s.name)) {
      return s.id;
    }
  }
  return null;
}

/** 全班上下文 */
function buildClassContext(db: DemoDb, question: string): DemoDataQaContext {
  const citations: DemoCitation[] = [];
  const parts: string[] = [
    '【范围】全班',
    '【说明】下列成绩台账供你自行统计（连续进步、低分、进退等）；勿编造台账外数字。',
    `【阈值】低分线=${Math.round(db.thresholds.lowScoreRatio * 100)}%满分；及格线=${Math.round(db.thresholds.passRatio * 100)}%满分`,
  ];

  const ledger = buildClassScoreLedger(db);
  parts.push(ledger.text);
  citations.push(...ledger.citations);

  appendSubjectStreakBlocks(db, question, parts, citations);

  const focus = db.students.filter(
    (s) => s.status === '在读' && s.focusLevel >= 2,
  );
  if (focus.length) {
    const focusLine = focus
      .map((f) => `${f.name}(关注${f.focusLevel})`)
      .join('、');
    parts.push(`【重点关注】${focusLine}`);
    citations.push({
      kind: 'focus',
      label: '重点关注学生',
      detail: focusLine,
    });
  }

  const catMap = new Map<string, number>();
  for (const i of db.incidents.filter((x) => x.status === 'confirmed')) {
    catMap.set(i.category, (catMap.get(i.category) ?? 0) + 1);
  }
  const catText = [...catMap.entries()]
    .map(([k, v]) => `${k}${v}`)
    .join('、');
  parts.push(`【近180天事件类别】${catText || '暂无'}`);
  if (catText) {
    citations.push({
      kind: 'incident_stat',
      label: '事件类别统计',
      detail: catText,
    });
  }

  return {
    text: parts.join('\n'),
    citations,
    studentId: null,
    scopeLabel: '全班',
  };
}

/** 单生上下文（对齐 DataQaContextService.buildStudent） */
function buildStudentContext(db: DemoDb, studentId: number): DemoDataQaContext {
  const stu = db.students.find((s) => s.id === studentId);
  if (!stu) {
    return {
      text: '【范围】指定学生不存在',
      citations: [],
      studentId: null,
      scopeLabel: '未知学生',
    };
  }
  const citations: DemoCitation[] = [];
  const genderLabel =
    stu.gender === 1 ? '女' : stu.gender === 0 ? '男' : '未知';
  const tags = db.tags
    .filter((t) => stu.tagIds.includes(t.id) && t.sensitiveLevel <= 1)
    .map((t) => t.name);
  const parts: string[] = [
    `【范围】学生 ${stu.name}`,
    '【档案】',
    [
      `姓名：${stu.name}`,
      `学号：${stu.studentNo}`,
      `性别：${genderLabel}`,
      `状态：${stu.status}`,
      `关注等级：${stu.focusLevel}`,
      `班干部：${stu.cadreRole ?? '无'}`,
      `标签：${tags.join('、') || '无'}`,
      '（不含 L2 高敏明细）',
    ].join('\n'),
  ];
  citations.push({
    kind: 'student',
    label: stu.name,
    detail: `学号 ${stu.studentNo}`,
  });

  const exams = [...db.exams].sort((a, b) => a.id - b.id);
  parts.push(
    `【成绩台账】科目顺序=${db.subjects.map((s) => s.name).join(',')}`,
  );
  parts.push('格式：考试名(日期): 总分; 科分...');
  for (const exam of exams) {
    const subjectScores: string[] = [];
    let total = 0;
    let n = 0;
    for (const sub of db.subjects) {
      const cell = db.scores.find(
        (c) =>
          c.examId === exam.id &&
          c.studentId === stu.id &&
          c.subjectId === sub.id &&
          c.status === 'normal' &&
          c.score != null,
      );
      if (cell?.score == null) {
        subjectScores.push(`${sub.name}-`);
      } else {
        subjectScores.push(`${sub.name}${cell.score}`);
        total += cell.score;
        n += 1;
      }
    }
    if (n === 0) continue;
    const line = `${exam.name}（${exam.examDate.slice(0, 10)}）: ${total}; ${subjectScores.join('，')}`;
    parts.push(line);
    citations.push({ kind: 'exam', label: exam.name, detail: line });
  }

  const incItems = db.incidents
    .filter(
      (i) => i.studentIds.includes(stu.id) && i.status === 'confirmed',
    )
    .slice(0, 20);
  const incText = incItems
    .map((i) => `${i.occurredAt.slice(0, 10)}[${i.category}]${i.title}`)
    .join('；');
  parts.push(`【近180天事件】${incText || '暂无'}`);
  if (incText) {
    citations.push({
      kind: 'incident_stat',
      label: `${stu.name}事件`,
      detail: incText,
    });
  }

  const impression = db.impressions[stu.id] ?? '';
  parts.push(`【班主任印象】${impression || '暂无'}`);

  return {
    text: parts.join('\n'),
    citations,
    studentId: stu.id,
    scopeLabel: `学生 · ${stu.name}`,
  };
}

/** 紧凑全班成绩台账 */
function buildClassScoreLedger(db: DemoDb): {
  text: string;
  citations: DemoCitation[];
} {
  const subjects = db.subjects;
  const students = db.students.filter((s) => s.status === '在读');
  const exams = [...db.exams].sort((a, b) => a.id - b.id);
  const subjectNames = subjects.map((s) => s.name);

  const lines: string[] = [
    `【成绩台账】科目顺序=${subjectNames.join(',')}`,
    `考试顺序(旧→新)=${exams.map((e) => e.name).join(',')}`,
    '每生格式：姓名: 考试1总分;科分斜杠分隔 | 考试2总分;科分... （缺考/无分用-）',
  ];

  for (const stu of students) {
    const segments: string[] = [];
    for (const exam of exams) {
      const subjectScores: string[] = [];
      let total = 0;
      let n = 0;
      for (const sub of subjects) {
        const cell = db.scores.find(
          (c) =>
            c.examId === exam.id &&
            c.subjectId === sub.id &&
            c.studentId === stu.id &&
            c.status === 'normal' &&
            c.score != null,
        );
        if (cell?.score == null) {
          subjectScores.push('-');
        } else {
          subjectScores.push(String(cell.score));
          total += cell.score;
          n += 1;
        }
      }
      segments.push(`${n > 0 ? total : '-'};${subjectScores.join('/')}`);
    }
    lines.push(`${stu.name}: ${segments.join(' | ')}`);
  }

  return {
    text: lines.join('\n'),
    citations: [
      {
        kind: 'score_ledger',
        label: '成绩台账',
        detail: `${students.length}人 × ${exams.length}场`,
      },
    ],
  };
}

/** 问句含科目 + 连续进步时，预计算最近三场严格递增名单 */
function appendSubjectStreakBlocks(
  db: DemoDb,
  question: string,
  parts: string[],
  citations: DemoCitation[],
): void {
  const wantsStreak = /连续|连升|越考越好|一场比一场|三场|三次/.test(question);
  const wantsProgress = /进步|提升|上升|涨分/.test(question);
  if (!wantsStreak || !wantsProgress) return;

  const subjects = db.subjects.filter((s) => question.includes(s.name));
  if (subjects.length === 0) return;

  const examsAsc = [...db.exams].sort((a, b) => a.id - b.id);
  if (examsAsc.length < 3) {
    parts.push(`【单科连续进步】有成绩考试仅 ${examsAsc.length} 场，不足 3 场`);
    return;
  }
  const last3 = examsAsc.slice(-3);
  const examNames = last3.map((e) => e.name).join(' → ');

  for (const subject of subjects) {
    const improvers = findContinuousImprovers(
      db,
      last3.map((e) => e.id),
      subject.id,
    );
    parts.push(
      `【预计算·${subject.name}连续进步】最近三场 ${examNames}（分数严格递增）`,
    );
    parts.push(
      improvers.length === 0
        ? '符合条件：无'
        : `符合条件（${improvers.length}人）：${improvers
            .map((p) => `${p.name}（${p.scores.join('→')}）`)
            .join('；')}`,
    );
    citations.push({
      kind: 'subject_streak',
      label: `${subject.name}连续进步`,
      detail:
        improvers.length === 0
          ? '无'
          : improvers.map((p) => `${p.name}:${p.scores.join('→')}`).join('；'),
    });
  }
}

/** 最近三场某科分数严格递增的在读学生 */
function findContinuousImprovers(
  db: DemoDb,
  examIdsOldestFirst: number[],
  subjectId: number,
): Array<{ name: string; scores: number[] }> {
  const scoreMaps = examIdsOldestFirst.map((examId) => {
    const map = new Map<number, number>();
    for (const c of db.scores) {
      if (
        c.examId === examId &&
        c.subjectId === subjectId &&
        c.status === 'normal' &&
        c.score != null
      ) {
        const stu = db.students.find((s) => s.id === c.studentId);
        if (stu?.status === '在读') {
          map.set(c.studentId, c.score);
        }
      }
    }
    return map;
  });

  const first = scoreMaps[0];
  if (!first) return [];
  const ids = [...first.keys()].filter((id) =>
    scoreMaps.every((m) => m.has(id)),
  );
  const result: Array<{ name: string; scores: number[]; gain: number }> = [];
  for (const id of ids) {
    const scores = scoreMaps.map((m) => m.get(id) as number);
    let rising = true;
    for (let i = 1; i < scores.length; i += 1) {
      if (!(scores[i]! > scores[i - 1]!)) {
        rising = false;
        break;
      }
    }
    if (!rising) continue;
    const name = db.students.find((s) => s.id === id)?.name ?? String(id);
    result.push({
      name,
      scores,
      gain: scores[scores.length - 1]! - scores[0]!,
    });
  }
  result.sort((a, b) => b.gain - a.gain);
  return result.map(({ name, scores }) => ({ name, scores }));
}
