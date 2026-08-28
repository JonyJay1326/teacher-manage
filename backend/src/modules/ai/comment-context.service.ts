import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/** 上下文组装结果 */
export interface CommentContextBundle {
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

/** 评语上下文组装（规则拼接 + token 预算截断） */
@Injectable()
export class CommentContextService {
  /** 约 1 token ≈ 1.5 汉字，预算 2500 */
  private readonly maxTokens = 2500;

  constructor(private readonly databaseService: DatabaseService) {}

  /** 组装某生评语上下文 */
  build(studentId: number, termId: number | null): CommentContextBundle {
    const profile = this.buildProfile(studentId, termId);
    const scores = this.buildScores(studentId);
    let incidents = this.buildIncidents(studentId);
    const lastComment = this.buildLastComment(studentId);
    let impression = this.buildImpression(studentId);

    let text = this.joinSections({
      profile,
      scores,
      incidents,
      lastComment,
      impression,
    });
    let approxTokens = this.estimateTokens(text);

    if (approxTokens > this.maxTokens) {
      impression = this.truncateBlock(impression, 400);
      incidents = this.truncateBlock(incidents, 400);
      text = this.joinSections({
        profile,
        scores,
        incidents,
        lastComment,
        impression,
      });
      approxTokens = this.estimateTokens(text);
    }
    if (approxTokens > this.maxTokens) {
      const trimmedScores = this.truncateBlock(scores, 600);
      text = this.joinSections({
        profile,
        scores: trimmedScores,
        incidents,
        lastComment,
        impression,
      });
      approxTokens = this.estimateTokens(text);
    }

    return {
      text,
      sections: { profile, scores, incidents, lastComment, impression },
      approxTokens,
    };
  }

  /** 拼接各段 */
  private joinSections(sections: {
    profile: string;
    scores: string;
    incidents: string;
    lastComment: string;
    impression: string;
  }): string {
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
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 1.5);
  }

  /** 截断段落 */
  private truncateBlock(block: string, maxChars: number): string {
    if (block.length <= maxChars) return block;
    return `${block.slice(0, maxChars)}…（已截断）`;
  }

  /** 档案段 */
  private buildProfile(studentId: number, termId: number | null): string {
    const db = this.databaseService.getDb();
    const student = db
      .prepare(
        `SELECT name, gender, focus_level, cadre_role, status
         FROM students WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(studentId) as
      | {
          name: string;
          gender: number | null;
          focus_level: number;
          cadre_role: string | null;
          status: string;
        }
      | undefined;
    if (!student) return '（学生不存在）';

    const tags = db
      .prepare(
        `SELECT t.name, t.sensitive_level
         FROM student_tags st
         JOIN tags t ON t.id = st.tag_id AND t.deleted_at IS NULL
         WHERE st.student_id = ? AND t.sensitive_level <= 1
         ORDER BY t.sensitive_level ASC, t.id ASC`,
      )
      .all(studentId) as Array<{ name: string; sensitive_level: number }>;

    let termName = '当前学期';
    if (termId) {
      const term = db
        .prepare('SELECT name FROM terms WHERE id = ?')
        .get(termId) as { name: string } | undefined;
      if (term) termName = term.name;
    }

    const genderLabel =
      student.gender === 1 ? '女' : student.gender === 0 ? '男' : '未知';
    const tagText =
      tags.length > 0
        ? tags.map((t) => t.name).join('、')
        : '无';

    return [
      `姓名：${student.name}`,
      `性别：${genderLabel}`,
      `学期：${termName}`,
      `状态：${student.status}`,
      `关注等级：${student.focus_level}`,
      `班干部：${student.cadre_role ?? '无'}`,
      `标签：${tagText}`,
    ].join('\n');
  }

  /** 最近两场考试成绩 */
  private buildScores(studentId: number): string {
    const db = this.databaseService.getDb();
    const exams = db
      .prepare(
        `SELECT e.id, e.name, e.exam_date
         FROM exams e
         JOIN scores sc ON sc.exam_id = e.id AND sc.student_id = ?
         WHERE e.deleted_at IS NULL
         GROUP BY e.id
         ORDER BY COALESCE(e.exam_date, '') DESC, e.id DESC
         LIMIT 2`,
      )
      .all(studentId) as Array<{
      id: number;
      name: string;
      exam_date: string | null;
    }>;

    if (exams.length === 0) return '暂无成绩记录';

    const lines: string[] = [];
    for (const exam of exams) {
      const rows = db
        .prepare(
          `SELECT sub.name, sc.score, sc.status, sc.class_rank, sub.full_score
           FROM scores sc
           JOIN subjects sub ON sub.id = sc.subject_id
           WHERE sc.exam_id = ? AND sc.student_id = ?
           ORDER BY sub.sort ASC`,
        )
        .all(exam.id, studentId) as Array<{
        name: string;
        score: number | null;
        status: string;
        class_rank: number | null;
        full_score: number;
      }>;

      const parts = rows.map((r) => {
        if (r.status === '缺考') return `${r.name}缺`;
        if (r.status === '免考') return `${r.name}免`;
        if (r.score === null) return `${r.name}—`;
        const rank = r.class_rank !== null ? `/第${r.class_rank}名` : '';
        return `${r.name}${r.score}${rank}`;
      });
      const total = rows
        .filter((r) => r.status === '正常' && r.score !== null)
        .reduce((s, r) => s + (r.score as number), 0);
      lines.push(
        `${exam.name}（${exam.exam_date ?? '无日期'}）总分约 ${Math.round(total * 10) / 10}：${parts.join('，')}`,
      );
    }

    if (exams.length >= 2) {
      const newer = this.sumNormalScores(exams[0].id, studentId);
      const older = this.sumNormalScores(exams[1].id, studentId);
      if (newer !== null && older !== null) {
        const delta = Math.round((newer - older) * 10) / 10;
        const label =
          delta > 0 ? `较上场总分上升 ${delta}` : delta < 0 ? `较上场总分下降 ${Math.abs(delta)}` : '较上场总分持平';
        lines.push(label);
      }
      const strongWeak = this.findStrongWeak(exams[0].id, studentId);
      if (strongWeak) lines.push(strongWeak);
    }
    return lines.join('\n');
  }

  /** 正常分总分 */
  private sumNormalScores(examId: number, studentId: number): number | null {
    const rows = this.databaseService
      .getDb()
      .prepare(
        `SELECT score, status FROM scores WHERE exam_id = ? AND student_id = ?`,
      )
      .all(examId, studentId) as Array<{ score: number | null; status: string }>;
    const normals = rows.filter((r) => r.status === '正常' && r.score !== null);
    if (normals.length === 0) return null;
    return normals.reduce((s, r) => s + (r.score as number), 0);
  }

  /** 本场最强/最弱科（按班排） */
  private findStrongWeak(examId: number, studentId: number): string | null {
    const rows = this.databaseService
      .getDb()
      .prepare(
        `SELECT sub.name, sc.class_rank
         FROM scores sc
         JOIN subjects sub ON sub.id = sc.subject_id
         WHERE sc.exam_id = ? AND sc.student_id = ?
           AND sc.status = '正常' AND sc.class_rank IS NOT NULL`,
      )
      .all(examId, studentId) as Array<{ name: string; class_rank: number }>;
    if (rows.length === 0) return null;
    const sorted = [...rows].sort((a, b) => a.class_rank - b.class_rank);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    return `最近一场相对最强：${best.name}(第${best.class_rank}名)；相对最弱：${worst.name}(第${worst.class_rank}名)`;
  }

  /** 事件摘要（表扬全量，其余压缩） */
  private buildIncidents(studentId: number): string {
    const db = this.databaseService.getDb();
    const rows = db
      .prepare(
        `SELECT i.category, i.severity, i.title, i.content, i.occurred_at
         FROM incidents i
         JOIN incident_students ist ON ist.incident_id = i.id AND ist.student_id = ?
         WHERE i.deleted_at IS NULL AND i.status = 'confirmed'
         ORDER BY i.severity DESC, i.occurred_at DESC
         LIMIT 30`,
      )
      .all(studentId) as Array<{
      category: string;
      severity: number;
      title: string | null;
      content: string | null;
      occurred_at: string;
    }>;

    if (rows.length === 0) return '本学期暂无已确认事件';

    const praise = rows.filter((r) => r.category === '表扬奖励');
    const others = rows.filter((r) => r.category !== '表扬奖励');

    const lines: string[] = [];
    if (praise.length > 0) {
      lines.push('表扬类：');
      for (const p of praise.slice(0, 8)) {
        lines.push(
          `- ${p.occurred_at.slice(0, 10)} ${p.title ?? ''} ${p.content ?? ''}`.trim(),
        );
      }
    }
    if (others.length > 0) {
      lines.push('其他事件（一句话）：');
      for (const o of others.slice(0, 12)) {
        const oneLine = (o.title || o.content || '未命名').replace(/\s+/g, ' ').slice(0, 40);
        lines.push(`- [${o.category}·${o.severity}星] ${oneLine}`);
      }
    }
    return lines.join('\n');
  }

  /** 上次评语 */
  private buildLastComment(studentId: number): string {
    const row = this.databaseService
      .getDb()
      .prepare(
        `SELECT final_text, comment_type, created_at
         FROM comments
         WHERE student_id = ? AND deleted_at IS NULL
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(studentId) as
      | { final_text: string; comment_type: string | null; created_at: string | null }
      | undefined;
    if (!row) return '无历史评语';
    return `${row.comment_type ?? '评语'}（${row.created_at?.slice(0, 10) ?? ''}）：\n${row.final_text}`;
  }

  /** 班主任印象 */
  private buildImpression(studentId: number): string {
    const row = this.databaseService
      .getDb()
      .prepare(
        `SELECT content FROM student_impressions
         WHERE student_id = ? AND deleted_at IS NULL`,
      )
      .get(studentId) as { content: string } | undefined;
    const text = row?.content?.trim() ?? '';
    if (!text) return '暂无印象记录';
    const maxLen = 1200;
    return text.length > maxLen ? `${text.slice(0, maxLen)}…（已截断）` : text;
  }
}
