import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/** 成绩单渲染所需的学生信息 */
export interface ReportStudentRow {
  id: number;
  student_no: string;
  name: string;
}

/** 某场考试的科目 */
export interface ReportSubjectRow {
  id: number;
  name: string;
  full_score: number;
  sort: number;
}

/** 某场考试信息 */
export interface ReportExamRow {
  id: number;
  name: string;
  exam_date: string | null;
  term_name: string | null;
}

/** 单个学生在某场考试下的成绩行 */
export interface ReportScoreRow {
  subject_id: number;
  subject_name: string;
  full_score: number;
  score: number | null;
  status: string;
  class_rank: number | null;
}

/** 该生最近一条已采纳评语 */
export interface ReportCommentRow {
  final_text: string;
  comment_type: string | null;
  created_at: string | null;
}

/**
 * 成绩单数据仓储：本模块唯一允许 SQL 的层。
 * 查询严格按 student_id 收敛，单份 PDF 的数据边界由 SQL 保证。
 */
@Injectable()
export class ReportsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 在读学生（按学号） */
  listActiveStudents(): ReportStudentRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT id, student_no, name FROM students
         WHERE deleted_at IS NULL AND status = '在读'
         ORDER BY CAST(student_no AS INTEGER) ASC, student_no ASC`,
      )
      .all() as ReportStudentRow[];
  }

  /** 最近一场有已录成绩的考试（id 倒序取最近） */
  findLatestScoredExam(): ReportExamRow | undefined {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT e.id, e.name, e.exam_date, t.name AS term_name
         FROM exams e
         JOIN scores sc ON sc.exam_id = e.id
         LEFT JOIN terms t ON t.id = e.term_id
         WHERE e.deleted_at IS NULL
         GROUP BY e.id
         ORDER BY COALESCE(e.exam_date, '') DESC, e.id DESC
         LIMIT 1`,
      )
      .get() as ReportExamRow | undefined;
  }

  /** 按 ID 取考试 */
  findExam(examId: number): ReportExamRow | undefined {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT e.id, e.name, e.exam_date, t.name AS term_name
         FROM exams e
         LEFT JOIN terms t ON t.id = e.term_id
         WHERE e.id = ? AND e.deleted_at IS NULL`,
      )
      .get(examId) as ReportExamRow | undefined;
  }

  /** 该场考试的科目（按业务排序） */
  listExamSubjects(examId: number): ReportSubjectRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT sub.id, sub.name, sub.full_score, sub.sort
         FROM subjects sub
         JOIN json_each(
           (SELECT subject_ids FROM exams WHERE id = ?)
         ) j ON j.value = sub.id
         WHERE sub.deleted_at IS NULL
         ORDER BY sub.sort ASC, sub.id ASC`,
      )
      .all(examId) as ReportSubjectRow[];
  }

  /**
   * 某生在该场考试的成绩。
   * WHERE student_id = ? 是硬边界：任何情况下都不会混入他人行。
   */
  listStudentScores(examId: number, studentId: number): ReportScoreRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT sc.subject_id, sub.name AS subject_name, sub.full_score,
                sc.score, sc.status, sc.class_rank
         FROM scores sc
         JOIN subjects sub ON sub.id = sc.subject_id AND sub.deleted_at IS NULL
         WHERE sc.exam_id = ? AND sc.student_id = ?
         ORDER BY sub.sort ASC, sub.id ASC`,
      )
      .all(examId, studentId) as ReportScoreRow[];
  }

  /** 该场考试全体总分（用于算该生班排） */
  listTotals(examId: number): Array<{ student_id: number; total: number }> {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT student_id, ROUND(SUM(score), 2) AS total
         FROM scores
         WHERE exam_id = ? AND status = '正常' AND score IS NOT NULL
         GROUP BY student_id
         HAVING total > 0`,
      )
      .all(examId) as Array<{ student_id: number; total: number }>;
  }

  /** 该生该场考试的最近一条已采纳评语 */
  findLatestComment(
    studentId: number,
    termId: number | null,
  ): ReportCommentRow | undefined {
    if (termId === null) {
      return this.databaseService
        .getDb()
        .prepare(
          `SELECT final_text, comment_type, created_at
           FROM comments
           WHERE student_id = ? AND deleted_at IS NULL
           ORDER BY id DESC LIMIT 1`,
        )
        .get(studentId) as ReportCommentRow | undefined;
    }
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT final_text, comment_type, created_at
         FROM comments
         WHERE student_id = ? AND term_id = ? AND deleted_at IS NULL
         ORDER BY id DESC LIMIT 1`,
      )
      .get(studentId, termId) as ReportCommentRow | undefined;
  }

  /** 该场考试的学期 ID（评语匹配用） */
  findExamTermId(examId: number): number | null {
    const row = this.databaseService
      .getDb()
      .prepare('SELECT term_id FROM exams WHERE id = ?')
      .get(examId) as { term_id: number | null } | undefined;
    return row?.term_id ?? null;
  }
}
