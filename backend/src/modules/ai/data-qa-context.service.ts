import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/** 引用条目（前端核对用） */
export interface DataQaCitation {
  kind: string;
  label: string;
  detail: string;
}

/** 学情上下文组装结果 */
export interface DataQaContextBundle {
  text: string;
  citations: DataQaCitation[];
  studentId: number | null;
  scopeLabel: string;
  approxTokens: number;
}

/**
 * 学情问答上下文（规则组装，禁止 LLM 写 SQL）。
 * 策略：优先注入紧凑成绩台账（覆盖尽量多年考试），再附带事件/关注摘要；
 * 字符预算约 1.8 万字（≈1.2 万 tokens），适配单班三年数据量。
 */
@Injectable()
export class DataQaContextService {
  /** 学情问答专用预算（宽于评语 2500） */
  private readonly maxChars = 18000;

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * 解析提问范围：显式 studentId > 问句中匹配花名册姓名 > 全班。
   */
  resolveStudentId(
    question: string,
    explicitStudentId?: number | null,
  ): number | null {
    if (explicitStudentId != null && explicitStudentId > 0) {
      const row = this.databaseService
        .getDb()
        .prepare(
          `SELECT id FROM students WHERE id = ? AND deleted_at IS NULL`,
        )
        .get(explicitStudentId) as { id: number } | undefined;
      return row?.id ?? null;
    }
    const students = this.listActiveStudents();
    const sorted = [...students].sort((a, b) => b.name.length - a.name.length);
    for (const s of sorted) {
      if (s.name.length >= 2 && question.includes(s.name)) {
        return s.id;
      }
    }
    return null;
  }

  /** 按范围组装上下文 */
  build(
    question: string,
    explicitStudentId?: number | null,
  ): DataQaContextBundle {
    const studentId = this.resolveStudentId(question, explicitStudentId);
    if (studentId != null) {
      return this.buildStudent(studentId);
    }
    return this.buildClass(question);
  }

  /** 全班：台账为主 + 轻量摘要 */
  private buildClass(question: string): DataQaContextBundle {
    const citations: DataQaCitation[] = [];
    const parts: string[] = [
      '【范围】全班',
      '【说明】下列成绩台账供你自行统计（连续进步、低分、进退等）；勿编造台账外数字。',
    ];

    const settings = this.getSettings();
    const lowRatio = Number(settings.low_score_ratio ?? 0.4);
    const passRatio = Number(settings.pass_ratio ?? 0.6);
    parts.push(
      `【阈值】低分线=${Math.round(lowRatio * 100)}%满分；及格线=${Math.round(passRatio * 100)}%满分`,
    );

    const ledger = this.buildClassScoreLedger();
    parts.push(ledger.text);
    citations.push(...ledger.citations);

    // 问句命中科目时，额外给出该科「最近三场连续进步」预计算结果，降低模型数错概率
    const examsAsc = this.listExamsAsc();
    this.appendSubjectStreakBlocks(question, examsAsc, parts, citations);

    const focus = this.listFocusStudents(2);
    if (focus.length) {
      const focusLine = focus
        .map((f) => `${f.name}(关注${f.focus_level})`)
        .join('、');
      parts.push(`【重点关注】${focusLine}`);
      citations.push({
        kind: 'focus',
        label: '重点关注学生',
        detail: focusLine,
      });
    }

    const incidentStats = this.buildClassIncidentStats();
    parts.push(`【近180天事件类别】${incidentStats.text || '暂无'}`);
    if (incidentStats.text) {
      citations.push({
        kind: 'incident_stat',
        label: '事件类别统计',
        detail: incidentStats.text,
      });
    }

    const contact = this.buildContactSparse();
    if (contact) {
      parts.push(`【家校沟通偏少·近90天】${contact}`);
      citations.push({
        kind: 'contact',
        label: '家校沟通偏少',
        detail: contact,
      });
    }

    return this.finalize(parts.join('\n'), citations, null, '全班');
  }

  /**
   * 紧凑成绩台账：考试从旧到新；每生一行「总分;科1/科2/...」按考试用 | 分隔。
   * 超预算时从最旧考试裁掉，保留较新考试。
   */
  private buildClassScoreLedger(): {
    text: string;
    citations: DataQaCitation[];
  } {
    const subjects = this.listSubjects();
    const students = this.listActiveStudents();
    let exams = this.listExamsAsc();
    const citations: DataQaCitation[] = [];

    if (exams.length === 0 || subjects.length === 0 || students.length === 0) {
      return {
        text: '【成绩台账】暂无成绩数据',
        citations: [
          {
            kind: 'score_ledger',
            label: '成绩台账',
            detail: '无数据',
          },
        ],
      };
    }

    const subjectNames = subjects.map((s) => s.name);
    const headerBudget = 400;
    const perStudentBudgetHint = Math.max(
      80,
      Math.floor(
        (this.maxChars - 4000 - headerBudget) / Math.max(students.length, 1),
      ),
    );

    // 估算：每考试每生约 (科目数*3 + 8) 字符
    const charsPerExamPerStudent = subjects.length * 3 + 10;
    let maxExams = Math.max(
      3,
      Math.floor(perStudentBudgetHint / charsPerExamPerStudent),
    );
    maxExams = Math.min(maxExams, exams.length, 24);
    if (exams.length > maxExams) {
      exams = exams.slice(exams.length - maxExams);
    }

    // 预取所有相关分数
    const examIds = exams.map((e) => e.id);
    const scoreRows = this.loadScoreRows(examIds);
    // key: `${studentId}|${examId}|${subjectId}` -> score
    const scoreMap = new Map<string, number>();
    for (const r of scoreRows) {
      scoreMap.set(`${r.student_id}|${r.exam_id}|${r.subject_id}`, r.score);
    }

    const lines: string[] = [];
    lines.push(
      `【成绩台账】科目顺序=${subjectNames.join(',')}`,
    );
    lines.push(
      `考试顺序(旧→新)=${exams.map((e) => e.name).join(',')}`,
    );
    lines.push(
      '每生格式：姓名: 考试1总分;科分斜杠分隔 | 考试2总分;科分... （缺考/无分用-）',
    );

    for (const stu of students) {
      const segments: string[] = [];
      for (const exam of exams) {
        const subjectScores: string[] = [];
        let total = 0;
        let n = 0;
        for (const sub of subjects) {
          const v = scoreMap.get(`${stu.id}|${exam.id}|${sub.id}`);
          if (v == null) {
            subjectScores.push('-');
          } else {
            subjectScores.push(this.fmtScore(v));
            total += v;
            n += 1;
          }
        }
        const totalLabel = n > 0 ? this.fmtScore(total) : '-';
        segments.push(`${totalLabel};${subjectScores.join('/')}`);
      }
      lines.push(`${stu.name}: ${segments.join(' | ')}`);
    }

    let text = lines.join('\n');
    // 若仍超预算，继续丢掉最旧考试重装（最多再裁两次）
    let guard = 0;
    while (text.length > this.maxChars - 2500 && exams.length > 3 && guard < 5) {
      exams = exams.slice(1);
      guard += 1;
      const rebuild = this.buildClassScoreLedgerWithExams(
        exams,
        subjects,
        students,
        scoreMap,
      );
      text = rebuild;
    }

    citations.push({
      kind: 'score_ledger',
      label: '成绩台账',
      detail: `${exams.length} 场考试 × ${students.length} 人 × ${subjects.length} 科（紧凑格式）`,
    });
    for (const e of exams) {
      citations.push({
        kind: 'exam',
        label: e.name,
        detail: e.exam_date ?? '无日期',
      });
    }

    return { text, citations };
  }

  /** 指定考试列表重装台账正文 */
  private buildClassScoreLedgerWithExams(
    exams: Array<{ id: number; name: string; exam_date: string | null }>,
    subjects: Array<{ id: number; name: string }>,
    students: Array<{ id: number; name: string }>,
    scoreMap: Map<string, number>,
  ): string {
    const subjectNames = subjects.map((s) => s.name);
    const lines: string[] = [];
    lines.push(`【成绩台账】科目顺序=${subjectNames.join(',')}`);
    lines.push(
      `考试顺序(旧→新)=${exams.map((e) => e.name).join(',')}`,
    );
    lines.push(
      '每生格式：姓名: 考试1总分;科分斜杠分隔 | 考试2总分;科分... （缺考/无分用-）',
    );
    for (const stu of students) {
      const segments: string[] = [];
      for (const exam of exams) {
        const subjectScores: string[] = [];
        let total = 0;
        let n = 0;
        for (const sub of subjects) {
          const v = scoreMap.get(`${stu.id}|${exam.id}|${sub.id}`);
          if (v == null) {
            subjectScores.push('-');
          } else {
            subjectScores.push(this.fmtScore(v));
            total += v;
            n += 1;
          }
        }
        const totalLabel = n > 0 ? this.fmtScore(total) : '-';
        segments.push(`${totalLabel};${subjectScores.join('/')}`);
      }
      lines.push(`${stu.name}: ${segments.join(' | ')}`);
    }
    return lines.join('\n');
  }

  /** 单生：全历史紧凑成绩 + 事件 */
  private buildStudent(studentId: number): DataQaContextBundle {
    const citations: DataQaCitation[] = [];
    const db = this.databaseService.getDb();
    const student = db
      .prepare(
        `SELECT id, student_no, name, gender, focus_level, cadre_role, status
         FROM students WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(studentId) as
      | {
          id: number;
          student_no: string;
          name: string;
          gender: number | null;
          focus_level: number;
          cadre_role: string | null;
          status: string;
        }
      | undefined;

    if (!student) {
      return this.finalize('【范围】指定学生不存在', [], null, '未知学生');
    }

    const tags = db
      .prepare(
        `SELECT t.name FROM student_tags st
         JOIN tags t ON t.id = st.tag_id AND t.deleted_at IS NULL
         WHERE st.student_id = ? AND t.sensitive_level <= 1
         ORDER BY t.id`,
      )
      .all(studentId) as Array<{ name: string }>;

    const genderLabel =
      student.gender === 1 ? '女' : student.gender === 0 ? '男' : '未知';
    const parts = [
      `【范围】学生 ${student.name}`,
      '【档案】',
      [
        `姓名：${student.name}`,
        `学号：${student.student_no}`,
        `性别：${genderLabel}`,
        `状态：${student.status}`,
        `关注等级：${student.focus_level}`,
        `班干部：${student.cadre_role ?? '无'}`,
        `标签：${tags.map((t) => t.name).join('、') || '无'}`,
        '（不含 L2 高敏明细）',
      ].join('\n'),
    ];
    citations.push({
      kind: 'student',
      label: student.name,
      detail: `学号 ${student.student_no}`,
    });

    const subjects = this.listSubjects();
    const exams = this.listExamsAsc();
    const examIds = exams.map((e) => e.id);
    const scoreRows = this.loadScoreRows(examIds, studentId);
    const scoreMap = new Map<string, number>();
    for (const r of scoreRows) {
      scoreMap.set(`${r.exam_id}|${r.subject_id}`, r.score);
    }

    parts.push(
      `【成绩台账】科目顺序=${subjects.map((s) => s.name).join(',')}`,
    );
    parts.push('格式：考试名(日期): 总分; 科分...');
    for (const exam of exams) {
      const subjectScores: string[] = [];
      let total = 0;
      let n = 0;
      for (const sub of subjects) {
        const v = scoreMap.get(`${exam.id}|${sub.id}`);
        if (v == null) {
          subjectScores.push(`${sub.name}-`);
        } else {
          subjectScores.push(`${sub.name}${this.fmtScore(v)}`);
          total += v;
          n += 1;
        }
      }
      if (n === 0) continue;
      const line = `${exam.name}（${exam.exam_date ?? '无日期'}）: ${this.fmtScore(total)}; ${subjectScores.join('，')}`;
      parts.push(line);
      citations.push({ kind: 'exam', label: exam.name, detail: line });
    }

    const inc = this.buildStudentIncidentStats(studentId);
    parts.push(`【近180天事件】${inc.text || '暂无'}`);
    if (inc.text) {
      citations.push({
        kind: 'incident_stat',
        label: `${student.name}事件`,
        detail: inc.text,
      });
    }

    const impression = this.loadImpression(studentId);
    parts.push(`【班主任印象】${impression || '暂无'}`);
    if (impression) {
      citations.push({
        kind: 'impression',
        label: `${student.name}印象`,
        detail: impression.slice(0, 200),
      });
    }

    return this.finalize(
      parts.join('\n'),
      citations,
      studentId,
      student.name,
    );
  }

  /** 读取班主任印象文本（截断） */
  private loadImpression(studentId: number): string {
    const row = this.databaseService
      .getDb()
      .prepare(
        `SELECT content FROM student_impressions
         WHERE student_id = ? AND deleted_at IS NULL`,
      )
      .get(studentId) as { content: string } | undefined;
    const text = row?.content?.trim() ?? '';
    if (!text) return '';
    const maxLen = 2000;
    return text.length > maxLen ? `${text.slice(0, maxLen)}…（已截断）` : text;
  }

  /** 截断并估算 token */
  private finalize(
    text: string,
    citations: DataQaCitation[],
    studentId: number | null,
    scopeLabel: string,
  ): DataQaContextBundle {
    let finalText = text;
    if (finalText.length > this.maxChars) {
      finalText = `${finalText.slice(0, this.maxChars)}…（已截断）`;
    }
    return {
      text: finalText,
      citations,
      studentId,
      scopeLabel,
      approxTokens: Math.ceil(finalText.length / 1.5),
    };
  }

  private fmtScore(n: number): string {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  }

  private getSettings(): Record<string, string> {
    const rows = this.databaseService
      .getDb()
      .prepare('SELECT key, value FROM settings')
      .all() as Array<{ key: string; value: string }>;
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return map;
  }

  private listActiveStudents(): Array<{ id: number; name: string }> {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT id, name FROM students
         WHERE deleted_at IS NULL AND status = '在读'
         ORDER BY name`,
      )
      .all() as Array<{ id: number; name: string }>;
  }

  private listSubjects(): Array<{ id: number; name: string }> {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT id, name FROM subjects WHERE deleted_at IS NULL ORDER BY sort ASC, id ASC`,
      )
      .all() as Array<{ id: number; name: string }>;
  }

  /** 有成绩的考试，旧→新 */
  private listExamsAsc(): Array<{
    id: number;
    name: string;
    exam_date: string | null;
  }> {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT e.id, e.name, e.exam_date
         FROM exams e
         WHERE e.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM scores sc WHERE sc.exam_id = e.id)
         ORDER BY COALESCE(e.exam_date, '') ASC, e.id ASC`,
      )
      .all() as Array<{
      id: number;
      name: string;
      exam_date: string | null;
    }>;
  }

  private loadScoreRows(
    examIds: number[],
    studentId?: number,
  ): Array<{
    student_id: number;
    exam_id: number;
    subject_id: number;
    score: number;
  }> {
    if (examIds.length === 0) return [];
    const placeholders = examIds.map(() => '?').join(',');
    const params: unknown[] = [...examIds];
    let studentFilter = '';
    if (studentId != null) {
      studentFilter = ' AND sc.student_id = ?';
      params.push(studentId);
    }
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT sc.student_id, sc.exam_id, sc.subject_id, sc.score
         FROM scores sc
         JOIN students s ON s.id = sc.student_id AND s.deleted_at IS NULL AND s.status = '在读'
         WHERE sc.exam_id IN (${placeholders})
           AND sc.status = '正常' AND sc.score IS NOT NULL
           ${studentFilter}`,
      )
      .all(...params) as Array<{
      student_id: number;
      exam_id: number;
      subject_id: number;
      score: number;
    }>;
  }

  private listFocusStudents(
    minLevel: number,
  ): Array<{ name: string; focus_level: number }> {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT name, focus_level FROM students
         WHERE deleted_at IS NULL AND status = '在读' AND focus_level >= ?
         ORDER BY focus_level DESC, name ASC
         LIMIT 20`,
      )
      .all(minLevel) as Array<{ name: string; focus_level: number }>;
  }

  private buildClassIncidentStats(): { text: string } {
    const rows = this.databaseService
      .getDb()
      .prepare(
        `SELECT category, COUNT(*) AS c
         FROM incidents
         WHERE deleted_at IS NULL AND status = 'confirmed'
           AND datetime(COALESCE(occurred_at, created_at)) >= datetime('now', '-180 days')
         GROUP BY category
         ORDER BY c DESC`,
      )
      .all() as Array<{ category: string | null; c: number }>;
    if (!rows.length) return { text: '' };
    return {
      text: rows
        .map((r) => `${r.category || '未分类'} ${r.c} 次`)
        .join('；'),
    };
  }

  private buildStudentIncidentStats(studentId: number): { text: string } {
    const rows = this.databaseService
      .getDb()
      .prepare(
        `SELECT i.category, COUNT(*) AS c
         FROM incidents i
         JOIN incident_students ist ON ist.incident_id = i.id
         WHERE i.deleted_at IS NULL AND i.status = 'confirmed'
           AND ist.student_id = ?
           AND datetime(COALESCE(i.occurred_at, i.created_at)) >= datetime('now', '-180 days')
         GROUP BY i.category
         ORDER BY c DESC`,
      )
      .all(studentId) as Array<{ category: string | null; c: number }>;
    const recent = this.databaseService
      .getDb()
      .prepare(
        `SELECT i.title, i.category, i.occurred_at
         FROM incidents i
         JOIN incident_students ist ON ist.incident_id = i.id
         WHERE i.deleted_at IS NULL AND i.status = 'confirmed'
           AND ist.student_id = ?
         ORDER BY COALESCE(i.occurred_at, i.created_at) DESC
         LIMIT 8`,
      )
      .all(studentId) as Array<{
      title: string | null;
      category: string | null;
      occurred_at: string | null;
    }>;
    const parts: string[] = [];
    if (rows.length) {
      parts.push(rows.map((r) => `${r.category || '未分类'} ${r.c} 次`).join('；'));
    }
    if (recent.length) {
      parts.push(
        '最近：' +
          recent
            .map(
              (r) =>
                `${r.occurred_at?.slice(0, 10) ?? '?'}[${r.category ?? ''}]${r.title ?? ''}`,
            )
            .join('；'),
      );
    }
    return { text: parts.join('\n') };
  }

  private buildContactSparse(): string {
    const students = this.listActiveStudents();
    if (!students.length) return '';
    const counts = this.databaseService
      .getDb()
      .prepare(
        `SELECT ist.student_id AS student_id, COUNT(*) AS c,
                MAX(COALESCE(i.occurred_at, i.created_at)) AS last_at
         FROM incidents i
         JOIN incident_students ist ON ist.incident_id = i.id
         WHERE i.deleted_at IS NULL AND i.status = 'confirmed'
           AND i.category = '家校沟通'
           AND datetime(COALESCE(i.occurred_at, i.created_at)) >= datetime('now', '-90 days')
         GROUP BY ist.student_id`,
      )
      .all() as Array<{
      student_id: number;
      c: number;
      last_at: string | null;
    }>;
    const map = new Map(counts.map((r) => [r.student_id, r]));
    const ranked = students
      .map((s) => {
        const hit = map.get(s.id);
        return {
          name: s.name,
          c: hit?.c ?? 0,
          lastAt: hit?.last_at ?? null,
        };
      })
      .sort((a, b) => a.c - b.c || a.name.localeCompare(b.name, 'zh'))
      .slice(0, 8);
    return ranked
      .map((r) => {
        const days = r.lastAt
          ? Math.floor(
              (Date.now() - new Date(r.lastAt).getTime()) / 86400000,
            )
          : null;
        const dayLabel =
          days == null || Number.isNaN(days) ? '近90天无记录' : `距今${days}天`;
        return `${r.name}（${r.c}次，${dayLabel}）`;
      })
      .join('；');
  }

  /**
   * 问句含科目 + 连续/进步时，预计算连续进步名单（辅助台账，降低数错）。
   * examsAsc：旧→新。
   */
  private appendSubjectStreakBlocks(
    question: string,
    examsAsc: Array<{ id: number; name: string; exam_date: string | null }>,
    parts: string[],
    citations: DataQaCitation[],
  ): void {
    const wantsStreak = /连续|连升|越考越好|一场比一场|三场|三次/.test(
      question,
    );
    const wantsProgress = /进步|提升|上升|涨分/.test(question);
    if (!wantsStreak || !wantsProgress) {
      return;
    }
    const subjects = this.listSubjects().filter((s) =>
      question.includes(s.name),
    );
    if (subjects.length === 0) {
      return;
    }
    if (examsAsc.length < 3) {
      parts.push(
        `【单科连续进步】有成绩考试仅 ${examsAsc.length} 场，不足 3 场`,
      );
      return;
    }
    const last3 = examsAsc.slice(-3);
    const examNames = last3.map((e) => e.name).join(' → ');
    for (const subject of subjects) {
      const improvers = this.findContinuousSubjectImprovers(
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

  private findContinuousSubjectImprovers(
    examIdsOldestFirst: number[],
    subjectId: number,
  ): Array<{ name: string; scores: number[] }> {
    const scoreMaps = examIdsOldestFirst.map((examId) => {
      const rows = this.databaseService
        .getDb()
        .prepare(
          `SELECT sc.student_id AS student_id, sc.score AS score
           FROM scores sc
           JOIN students s ON s.id = sc.student_id AND s.deleted_at IS NULL AND s.status = '在读'
           WHERE sc.exam_id = ? AND sc.subject_id = ?
             AND sc.status = '正常' AND sc.score IS NOT NULL`,
        )
        .all(examId, subjectId) as Array<{ student_id: number; score: number }>;
      return new Map(rows.map((r) => [r.student_id, r.score]));
    });
    const ids = [...scoreMaps[0].keys()].filter((id) =>
      scoreMaps.every((m) => m.has(id)),
    );
    const nameById = new Map(
      this.listActiveStudents().map((s) => [s.id, s.name] as const),
    );
    const result: Array<{ name: string; scores: number[]; gain: number }> = [];
    for (const id of ids) {
      const scores = scoreMaps.map((m) => m.get(id) as number);
      let rising = true;
      for (let i = 1; i < scores.length; i += 1) {
        if (!(scores[i] > scores[i - 1])) {
          rising = false;
          break;
        }
      }
      if (!rising) continue;
      const name = nameById.get(id);
      if (!name) continue;
      result.push({
        name,
        scores,
        gain: scores[scores.length - 1] - scores[0],
      });
    }
    return result
      .sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name, 'zh'))
      .map(({ name, scores }) => ({ name, scores }));
  }
}
