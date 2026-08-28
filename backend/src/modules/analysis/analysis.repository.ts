import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/** 设置键值 */
export interface SettingRow {
  key: string;
  value: string;
}

/** 考试简要 */
export interface AnalysisExamRow {
  id: number;
  name: string;
  exam_date: string | null;
  grade_ref: string | null;
}

/** 单生成绩合计行 */
export interface StudentTotalRow {
  student_id: number;
  name: string;
  student_no: string;
  total_score: number;
  scored_count: number;
}

/** 单科分数行 */
export interface SubjectScoreStatRow {
  subject_id: number;
  subject_name: string;
  full_score: number;
  sort: number;
  score: number | null;
  status: string;
  student_id: number;
}

/** 分析中心仓储 */
@Injectable()
export class AnalysisRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 读取阈值设置 */
  getSettings(): Record<string, string> {
    const rows = this.databaseService
      .getDb()
      .prepare('SELECT key, value FROM settings')
      .all() as SettingRow[];
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return map;
  }

  /** 有成绩的考试（按日期升序，用于趋势） */
  listExamsWithScores(): AnalysisExamRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT e.id, e.name, e.exam_date, e.grade_ref
         FROM exams e
         WHERE e.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM scores sc WHERE sc.exam_id = e.id)
         ORDER BY COALESCE(e.exam_date, '') ASC, e.id ASC`,
      )
      .all() as AnalysisExamRow[];
  }

  /** 某场考试各生总分（仅计正常有分科目） */
  listStudentTotals(examId: number): StudentTotalRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT s.id AS student_id, s.name, s.student_no,
                COALESCE(SUM(
                  CASE WHEN sc.status = '正常' AND sc.score IS NOT NULL THEN sc.score ELSE 0 END
                ), 0) AS total_score,
                SUM(
                  CASE WHEN sc.status = '正常' AND sc.score IS NOT NULL THEN 1 ELSE 0 END
                ) AS scored_count
         FROM students s
         JOIN scores sc ON sc.student_id = s.id AND sc.exam_id = ?
         WHERE s.deleted_at IS NULL AND s.status = '在读'
         GROUP BY s.id
         HAVING scored_count > 0`,
      )
      .all(examId) as StudentTotalRow[];
  }

  /** 某场考试全部单科成绩（正常状态用于比率） */
  listSubjectScores(examId: number): SubjectScoreStatRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT sc.subject_id, sub.name AS subject_name, sub.full_score, sub.sort,
                sc.score, sc.status, sc.student_id
         FROM scores sc
         JOIN subjects sub ON sub.id = sc.subject_id AND sub.deleted_at IS NULL
         JOIN students st ON st.id = sc.student_id AND st.deleted_at IS NULL AND st.status = '在读'
         WHERE sc.exam_id = ?
         ORDER BY sub.sort ASC, sub.id ASC`,
      )
      .all(examId) as SubjectScoreStatRow[];
  }

  /**
   * 近 N 天每生事件/家校沟通次数（仅已确认）。
   * 沟通 = category「家校沟通」；其余确认事件计入 incident_count。
   */
  listFocusFrequency(days: number): Array<{
    student_id: number;
    student_no: string;
    name: string;
    incident_count: number;
    contact_count: number;
  }> {
    const since = this.daysAgoIso(days);
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT s.id AS student_id, s.student_no, s.name,
                COALESCE(SUM(
                  CASE
                    WHEN i.id IS NOT NULL AND i.category != '家校沟通' THEN 1
                    ELSE 0
                  END
                ), 0) AS incident_count,
                COALESCE(SUM(
                  CASE
                    WHEN i.id IS NOT NULL AND i.category = '家校沟通' THEN 1
                    ELSE 0
                  END
                ), 0) AS contact_count
         FROM students s
         LEFT JOIN incident_students ist ON ist.student_id = s.id
         LEFT JOIN incidents i
           ON i.id = ist.incident_id
          AND i.deleted_at IS NULL
          AND i.status = 'confirmed'
          AND i.occurred_at >= ?
         WHERE s.deleted_at IS NULL AND s.status = '在读'
         GROUP BY s.id
         HAVING COALESCE(SUM(
                  CASE WHEN i.id IS NOT NULL THEN 1 ELSE 0 END
                ), 0) > 0
         ORDER BY (COALESCE(SUM(
                  CASE WHEN i.id IS NOT NULL AND i.category != '家校沟通' THEN 1 ELSE 0 END
                ), 0)
                + COALESCE(SUM(
                  CASE WHEN i.id IS NOT NULL AND i.category = '家校沟通' THEN 1 ELSE 0 END
                ), 0)) DESC,
                  s.student_no ASC`,
      )
      .all(since) as Array<{
      student_id: number;
      student_no: string;
      name: string;
      incident_count: number;
      contact_count: number;
    }>;
  }

  /** 近 N 天家校沟通按日计数 */
  listContactHeatDays(days: number): Array<{ day: string; count: number }> {
    const since = this.daysAgoIso(days);
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT substr(i.occurred_at, 1, 10) AS day, COUNT(*) AS count
         FROM incidents i
         WHERE i.deleted_at IS NULL
           AND i.status = 'confirmed'
           AND i.category = '家校沟通'
           AND i.occurred_at >= ?
         GROUP BY substr(i.occurred_at, 1, 10)
         ORDER BY day ASC`,
      )
      .all(since) as Array<{ day: string; count: number }>;
  }

  /** 计算 N 天前的 UTC ISO 下界 */
  private daysAgoIso(days: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString();
  }

  /** 当前学期（今天落在起止日内）；无则取最新学期 */
  findActiveTerm(): {
    id: number;
    name: string;
    start_date: string | null;
    end_date: string | null;
  } | null {
    const today = new Date().toISOString().slice(0, 10);
    const db = this.databaseService.getDb();
    const active = db
      .prepare(
        `SELECT id, name, start_date, end_date FROM terms
         WHERE start_date IS NOT NULL AND end_date IS NOT NULL
           AND start_date <= ? AND end_date >= ?
         ORDER BY id DESC LIMIT 1`,
      )
      .get(today, today) as
      | {
          id: number;
          name: string;
          start_date: string | null;
          end_date: string | null;
        }
      | undefined;
    if (active) return active;
    const latest = db
      .prepare(
        `SELECT id, name, start_date, end_date FROM terms
         ORDER BY COALESCE(start_date, '') DESC, id DESC LIMIT 1`,
      )
      .get() as
      | {
          id: number;
          name: string;
          start_date: string | null;
          end_date: string | null;
        }
      | undefined;
    return latest ?? null;
  }

  /** 本学期（或指定区间）事件类别计数 */
  listCategoryCounts(
    startIso: string | null,
    endIso: string | null,
  ): Array<{ category: string; count: number }> {
    const clauses = [
      `i.deleted_at IS NULL`,
      `i.status = 'confirmed'`,
    ];
    const params: string[] = [];
    if (startIso) {
      clauses.push(`i.occurred_at >= ?`);
      params.push(startIso);
    }
    if (endIso) {
      clauses.push(`i.occurred_at <= ?`);
      params.push(endIso);
    }
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT i.category AS category, COUNT(*) AS count
         FROM incidents i
         WHERE ${clauses.join(' AND ')}
         GROUP BY i.category
         ORDER BY count DESC`,
      )
      .all(...params) as Array<{ category: string; count: number }>;
  }

  /** 某场考试某科正常分列表（直方图） */
  listSubjectScoreValues(
    examId: number,
    subjectId: number,
  ): Array<{ score: number; full_score: number }> {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT sc.score AS score, sub.full_score AS full_score
         FROM scores sc
         JOIN subjects sub ON sub.id = sc.subject_id
         JOIN students st ON st.id = sc.student_id
           AND st.deleted_at IS NULL AND st.status = '在读'
         WHERE sc.exam_id = ? AND sc.subject_id = ?
           AND sc.status = '正常' AND sc.score IS NOT NULL`,
      )
      .all(examId, subjectId) as Array<{ score: number; full_score: number }>;
  }

  /** 近 N 个月事件按月计数 */
  listIncidentMonthly(months: number): Array<{ month: string; count: number }> {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - months);
    const sinceIso = since.toISOString();
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT substr(i.occurred_at, 1, 7) AS month, COUNT(*) AS count
         FROM incidents i
         WHERE i.deleted_at IS NULL
           AND i.status = 'confirmed'
           AND i.occurred_at >= ?
         GROUP BY substr(i.occurred_at, 1, 7)
         ORDER BY month ASC`,
      )
      .all(sinceIso) as Array<{ month: string; count: number }>;
  }
}
