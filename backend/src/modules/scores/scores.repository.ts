import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { nowIso } from '../../common/api';

/** 学期行 */
export interface TermRow {
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  grade: number | null;
}

/** 科目行 */
export interface SubjectRow {
  id: number;
  code: string;
  name: string;
  full_score: number;
  grade_start: number;
  sort: number;
  enabled: number;
  deleted_at: string | null;
}

/** 考试行 */
export interface ExamRow {
  id: number;
  name: string;
  exam_type: string | null;
  term_id: number | null;
  exam_date: string | null;
  subject_ids: string;
  grade_ref: string | null;
  status: string;
  deleted_at: string | null;
}

/** 成绩行 */
export interface ScoreRow {
  id: number;
  exam_id: number;
  student_id: number;
  subject_id: number;
  score: number | null;
  status: string;
  class_rank: number | null;
}

/** 在读学生简要行 */
export interface ActiveStudentRow {
  id: number;
  student_no: string;
  name: string;
}

/** 成绩仓储：唯一允许接触 DatabaseService 的层 */
@Injectable()
export class ScoresRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 在事务中执行 */
  runInTransaction<T>(fn: () => T): T {
    return this.databaseService.getDb().transaction(fn)();
  }

  /** 列出全部学期 */
  listTerms(): TermRow[] {
    return this.databaseService
      .getDb()
      .prepare('SELECT * FROM terms ORDER BY id ASC')
      .all() as TermRow[];
  }

  /** 列出启用且未删除的科目 */
  listEnabledSubjects(): SubjectRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM subjects
         WHERE enabled = 1 AND deleted_at IS NULL
         ORDER BY sort ASC, id ASC`,
      )
      .all() as SubjectRow[];
  }

  /** 按 ID 列表查询科目 */
  findSubjectsByIds(ids: number[]): SubjectRow[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM subjects
         WHERE id IN (${placeholders}) AND deleted_at IS NULL
         ORDER BY sort ASC, id ASC`,
      )
      .all(...ids) as SubjectRow[];
  }

  /** 列出未软删考试 */
  listExams(): ExamRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM exams
         WHERE deleted_at IS NULL
         ORDER BY exam_date DESC, id DESC`,
      )
      .all() as ExamRow[];
  }

  /** 按 ID 查考试（可含已删，默认排除） */
  findExamById(id: number, includeDeleted = false): ExamRow | undefined {
    if (includeDeleted) {
      return this.databaseService
        .getDb()
        .prepare('SELECT * FROM exams WHERE id = ?')
        .get(id) as ExamRow | undefined;
    }
    return this.databaseService
      .getDb()
      .prepare('SELECT * FROM exams WHERE id = ? AND deleted_at IS NULL')
      .get(id) as ExamRow | undefined;
  }

  /** 创建考试 */
  createExam(input: {
    name: string;
    examType: string;
    termId: number;
    examDate: string;
    subjectIdsJson: string;
  }): number {
    const result = this.databaseService
      .getDb()
      .prepare(
        `INSERT INTO exams (name, exam_type, term_id, exam_date, subject_ids, status)
         VALUES (?, ?, ?, ?, ?, '未录入')`,
      )
      .run(
        input.name,
        input.examType,
        input.termId,
        input.examDate,
        input.subjectIdsJson,
      );
    return Number(result.lastInsertRowid);
  }

  /** 更新考试字段 */
  updateExam(
    id: number,
    fields: {
      name?: string;
      examType?: string;
      termId?: number;
      examDate?: string;
      subjectIdsJson?: string;
    },
  ): void {
    const sets: string[] = [];
    const values: Array<string | number> = [];
    if (fields.name !== undefined) {
      sets.push('name = ?');
      values.push(fields.name);
    }
    if (fields.examType !== undefined) {
      sets.push('exam_type = ?');
      values.push(fields.examType);
    }
    if (fields.termId !== undefined) {
      sets.push('term_id = ?');
      values.push(fields.termId);
    }
    if (fields.examDate !== undefined) {
      sets.push('exam_date = ?');
      values.push(fields.examDate);
    }
    if (fields.subjectIdsJson !== undefined) {
      sets.push('subject_ids = ?');
      values.push(fields.subjectIdsJson);
    }
    if (sets.length === 0) return;
    values.push(id);
    this.databaseService
      .getDb()
      .prepare(`UPDATE exams SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`)
      .run(...values);
  }

  /** 软删除考试 */
  softDeleteExam(id: number): void {
    this.databaseService
      .getDb()
      .prepare(
        `UPDATE exams SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(nowIso(), id);
  }

  /** 更新考试状态 */
  updateExamStatus(id: number, status: string): void {
    this.databaseService
      .getDb()
      .prepare(
        `UPDATE exams SET status = ? WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(status, id);
  }

  /** 列出在读且未删学生（按学号） */
  listActiveStudents(): ActiveStudentRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT id, student_no, name FROM students
         WHERE deleted_at IS NULL AND status = '在读'
         ORDER BY student_no ASC`,
      )
      .all() as ActiveStudentRow[];
  }

  /** 某考试全部成绩 */
  listScoresByExam(examId: number): ScoreRow[] {
    return this.databaseService
      .getDb()
      .prepare('SELECT * FROM scores WHERE exam_id = ?')
      .all(examId) as ScoreRow[];
  }

  /** 某考试某科成绩 */
  listScoresByExamSubject(examId: number, subjectId: number): ScoreRow[] {
    return this.databaseService
      .getDb()
      .prepare('SELECT * FROM scores WHERE exam_id = ? AND subject_id = ?')
      .all(examId, subjectId) as ScoreRow[];
  }

  /** 按学生+科目查当前考试成绩 */
  findScore(
    examId: number,
    studentId: number,
    subjectId: number,
  ): ScoreRow | undefined {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM scores
         WHERE exam_id = ? AND student_id = ? AND subject_id = ?`,
      )
      .get(examId, studentId, subjectId) as ScoreRow | undefined;
  }

  /** 插入或更新单条成绩（清空班排待重算） */
  upsertScore(input: {
    examId: number;
    studentId: number;
    subjectId: number;
    score: number | null;
    status: string;
  }): void {
    this.databaseService
      .getDb()
      .prepare(
        `INSERT INTO scores (exam_id, student_id, subject_id, score, status, class_rank)
         VALUES (?, ?, ?, ?, ?, NULL)
         ON CONFLICT(exam_id, student_id, subject_id) DO UPDATE SET
           score = excluded.score,
           status = excluded.status,
           class_rank = NULL`,
      )
      .run(
        input.examId,
        input.studentId,
        input.subjectId,
        input.score,
        input.status,
      );
  }

  /** 写入单科班排 */
  updateClassRank(
    examId: number,
    studentId: number,
    subjectId: number,
    classRank: number | null,
  ): void {
    this.databaseService
      .getDb()
      .prepare(
        `UPDATE scores SET class_rank = ?
         WHERE exam_id = ? AND student_id = ? AND subject_id = ?`,
      )
      .run(classRank, examId, studentId, subjectId);
  }

  /**
   * 查询该生该科在当前考试之前最近一次正常分
   * （按 exam_date 降序，同日按 id 降序）
   */
  findLastNormalScore(input: {
    studentId: number;
    subjectId: number;
    currentExamId: number;
    currentExamDate: string | null;
  }): number | null {
    const row = this.databaseService
      .getDb()
      .prepare(
        `SELECT s.score AS score
         FROM scores s
         INNER JOIN exams e ON e.id = s.exam_id
         WHERE s.student_id = ?
           AND s.subject_id = ?
           AND e.deleted_at IS NULL
           AND e.id != ?
           AND s.status = '正常'
           AND s.score IS NOT NULL
           AND (
             ? IS NULL
             OR e.exam_date < ?
             OR (e.exam_date = ? AND e.id < ?)
           )
         ORDER BY e.exam_date DESC, e.id DESC
         LIMIT 1`,
      )
      .get(
        input.studentId,
        input.subjectId,
        input.currentExamId,
        input.currentExamDate,
        input.currentExamDate,
        input.currentExamDate,
        input.currentExamId,
      ) as { score: number } | undefined;
    return row ? row.score : null;
  }
}
