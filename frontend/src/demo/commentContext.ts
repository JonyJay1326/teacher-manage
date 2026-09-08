import type { DemoDb } from './seed';
import { getDemoDb } from './db';
import { buildExamMatrix } from './seed';

/** 评语上下文（对齐 CommentContextService） */
export interface DemoCommentContextBundle {
  text: string;
  sections: {
    profile: string;
    scores: string;
    incidents: string;
    lastComment: string;
    impression: string;
  };
  approxTokens: number;
}

const MAX_TOKENS = 2500;

/** 组装演示评语上下文 */
export function buildDemoCommentContext(
  studentId: number,
  termId: number | null,
): DemoCommentContextBundle {
  const db = getDemoDb();
  const profile = buildProfile(db, studentId, termId);
  let scores = buildScores(db, studentId);
  let incidents = buildIncidents(db, studentId);
  const lastComment = buildLastComment(db, studentId);
  let impression = buildImpression(db, studentId);

  let text = joinSections({ profile, scores, incidents, lastComment, impression });
  let approxTokens = estimateTokens(text);

  if (approxTokens > MAX_TOKENS) {
    impression = truncateBlock(impression, 400);
    incidents = truncateBlock(incidents, 400);
    text = joinSections({ profile, scores, incidents, lastComment, impression });
    approxTokens = estimateTokens(text);
  }
  if (approxTokens > MAX_TOKENS) {
    scores = truncateBlock(scores, 600);
    text = joinSections({ profile, scores, incidents, lastComment, impression });
    approxTokens = estimateTokens(text);
  }

  return {
    text,
    sections: { profile, scores, incidents, lastComment, impression },
    approxTokens,
  };
}

/** 拼接各段 */
function joinSections(sections: DemoCommentContextBundle['sections']): string {
  return [
    '【学生档案】',
    sections.profile,
    '',
    '【成绩摘要】',
    sections.scores,
    '',
    '【事件摘要】',
    sections.incidents,
    '',
    '【上次评语】',
    sections.lastComment,
    '',
    '【班主任印象】',
    sections.impression,
  ].join('\n');
}

/** 估算 token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 1.5);
}

/** 截断段落 */
function truncateBlock(block: string, maxChars: number): string {
  if (block.length <= maxChars) return block;
  return `${block.slice(0, maxChars)}…（已截断）`;
}

/** 档案 */
function buildProfile(
  db: DemoDb,
  studentId: number,
  termId: number | null,
): string {
  const student = db.students.find((s) => s.id === studentId);
  if (!student) return '（学生不存在）';
  const term =
    (termId != null ? db.terms.find((t) => t.id === termId) : null) ??
    db.terms[db.terms.length - 1];
  const genderLabel =
    student.gender === 1 ? '女' : student.gender === 0 ? '男' : '未知';
  const tags = db.tags
    .filter((t) => student.tagIds.includes(t.id) && t.sensitiveLevel <= 1)
    .map((t) => t.name);
  return [
    `姓名：${student.name}`,
    `性别：${genderLabel}`,
    `学期：${term?.name ?? '当前学期'}`,
    `状态：${student.status}`,
    `关注等级：${student.focusLevel}`,
    `班干部：${student.cadreRole ?? '无'}`,
    `标签：${tags.length ? tags.join('、') : '无'}`,
  ].join('\n');
}

/** 最近两场成绩（含班排、进退、强弱科） */
function buildScores(db: DemoDb, studentId: number): string {
  const exams = [...db.exams]
    .filter((e) =>
      db.scores.some(
        (c) =>
          c.examId === e.id &&
          c.studentId === studentId &&
          c.status === 'normal' &&
          c.score != null,
      ),
    )
    .sort((a, b) => b.id - a.id)
    .slice(0, 2);
  if (exams.length === 0) return '暂无成绩记录';

  const lines: string[] = [];
  for (const exam of exams) {
    const matrix = buildExamMatrix(db, exam.id);
    const row = matrix.rows.find((r) => r.studentId === studentId);
    const parts = db.subjects.map((sub) => {
      const cell = db.scores.find(
        (c) =>
          c.examId === exam.id &&
          c.studentId === studentId &&
          c.subjectId === sub.id,
      );
      if (!cell || cell.status === 'absent') return `${sub.name}缺`;
      if (cell.status === 'exempt') return `${sub.name}免`;
      if (cell.score == null) return `${sub.name}—`;
      const rankCell = row?.subjectScores[sub.id];
      const rank =
        rankCell?.classRank != null ? `/第${rankCell.classRank}名` : '';
      return `${sub.name}${cell.score}${rank}`;
    });
    const total =
      row?.totalScore != null
        ? Math.round(row.totalScore * 10) / 10
        : null;
    lines.push(
      `${exam.name}（${exam.examDate.slice(0, 10)}）总分约 ${total ?? '—'}：${parts.join('，')}`,
    );
  }

  if (exams.length >= 2) {
    const newer = sumNormalScores(db, exams[0]!.id, studentId);
    const older = sumNormalScores(db, exams[1]!.id, studentId);
    if (newer !== null && older !== null) {
      const delta = Math.round((newer - older) * 10) / 10;
      const label =
        delta > 0
          ? `较上场总分上升 ${delta}`
          : delta < 0
            ? `较上场总分下降 ${Math.abs(delta)}`
            : '较上场总分持平';
      lines.push(label);
    }
    const strongWeak = findStrongWeak(db, exams[0]!.id, studentId);
    if (strongWeak) lines.push(strongWeak);
  }
  return lines.join('\n');
}

/** 正常分总分 */
function sumNormalScores(
  db: DemoDb,
  examId: number,
  studentId: number,
): number | null {
  const rows = db.scores.filter(
    (c) =>
      c.examId === examId &&
      c.studentId === studentId &&
      c.status === 'normal' &&
      c.score != null,
  );
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + (r.score as number), 0);
}

/** 本场最强/最弱科（按班排） */
function findStrongWeak(
  db: DemoDb,
  examId: number,
  studentId: number,
): string | null {
  const matrix = buildExamMatrix(db, examId);
  const row = matrix.rows.find((r) => r.studentId === studentId);
  if (!row) return null;
  const ranked = Object.entries(row.subjectScores)
    .filter(([, cell]) => cell.classRank != null)
    .map(([subjectId, cell]) => {
      const name =
        db.subjects.find((sub) => sub.id === Number(subjectId))?.name ??
        '科目';
      return { name, classRank: cell.classRank as number };
    })
    .sort((a, b) => a.classRank - b.classRank);
  if (ranked.length === 0) return null;
  const best = ranked[0]!;
  const worst = ranked[ranked.length - 1]!;
  return `最近一场相对最强：${best.name}(第${best.classRank}名)；相对最弱：${worst.name}(第${worst.classRank}名)`;
}

/** 事件摘要（表扬全量，其余压缩） */
function buildIncidents(db: DemoDb, studentId: number): string {
  const items = db.incidents
    .filter(
      (i) =>
        i.studentIds.includes(studentId) && i.status === 'confirmed',
    )
    .sort((a, b) => {
      if (b.severity !== a.severity) return b.severity - a.severity;
      return (
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      );
    })
    .slice(0, 30);
  if (items.length === 0) return '本学期暂无已确认事件';

  const praise = items.filter((i) => i.category === '表扬奖励');
  const others = items.filter((i) => i.category !== '表扬奖励');
  const lines: string[] = [];
  if (praise.length) {
    lines.push('表扬类：');
    for (const i of praise.slice(0, 8)) {
      lines.push(
        `- ${i.occurredAt.slice(0, 10)} ${i.title} ${(i.content ?? '').slice(0, 80)}`.trim(),
      );
    }
  }
  if (others.length) {
    lines.push('其他事件（一句话）：');
    for (const i of others.slice(0, 12)) {
      const oneLine = (i.title || i.content || '未命名')
        .replace(/\s+/g, ' ')
        .slice(0, 40);
      lines.push(`- [${i.category}·${i.severity}星] ${oneLine}`);
    }
  }
  return lines.join('\n');
}

/** 上次评语 */
function buildLastComment(db: DemoDb, studentId: number): string {
  const row = db.comments
    .filter((c) => c.studentId === studentId)
    .sort((a, b) =>
      (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
    )[0];
  if (!row) return '无历史评语';
  return `${row.commentType ?? '评语'}（${row.createdAt?.slice(0, 10) ?? ''}）：\n${row.finalText}`;
}

/** 班主任印象 */
function buildImpression(db: DemoDb, studentId: number): string {
  const text = (db.impressions[studentId] ?? '').trim();
  if (!text) return '暂无印象记录';
  const maxLen = 1200;
  return text.length > maxLen ? `${text.slice(0, maxLen)}…（已截断）` : text;
}
