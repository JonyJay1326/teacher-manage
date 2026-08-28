import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { nowIso } from '../../common/api';

/** 评语行 */
export interface CommentRow {
  id: number;
  student_id: number;
  term_id: number | null;
  comment_type: string | null;
  final_text: string;
  source_ai_record_id: number | null;
  created_at: string | null;
  deleted_at: string | null;
}

/** 工作台学生行 */
export interface WorkbenchStudentRow {
  id: number;
  student_no: string;
  name: string;
  focus_level: number;
}

/** 评语仓储 */
@Injectable()
export class CommentsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 在读学生（工作台） */
  listActiveStudents(): WorkbenchStudentRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT id, student_no, name, focus_level
         FROM students
         WHERE deleted_at IS NULL AND status = '在读'
         ORDER BY CAST(student_no AS INTEGER) ASC, id ASC`,
      )
      .all() as WorkbenchStudentRow[];
  }

  /** 某生某学期某类型最新已采纳评语 */
  findAdopted(
    studentId: number,
    termId: number | null,
    commentType: string,
  ): CommentRow | undefined {
    if (termId === null) {
      return this.databaseService
        .getDb()
        .prepare(
          `SELECT * FROM comments
           WHERE student_id = ? AND comment_type = ? AND deleted_at IS NULL
           ORDER BY id DESC LIMIT 1`,
        )
        .get(studentId, commentType) as CommentRow | undefined;
    }
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM comments
         WHERE student_id = ? AND term_id = ? AND comment_type = ?
           AND deleted_at IS NULL
         ORDER BY id DESC LIMIT 1`,
      )
      .get(studentId, termId, commentType) as CommentRow | undefined;
  }

  /** 某生最新评语 AI 记录 */
  findLatestAiRecord(studentId: number): {
    id: number;
    output_text: string | null;
    context_snapshot: string | null;
    status: string;
    created_at: string | null;
  } | undefined {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT id, output_text, context_snapshot, status, created_at
         FROM ai_records
         WHERE student_id = ? AND scene = 'comment'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(studentId) as
      | {
          id: number;
          output_text: string | null;
          context_snapshot: string | null;
          status: string;
          created_at: string | null;
        }
      | undefined;
  }

  /** 插入评语 */
  insert(input: {
    studentId: number;
    termId: number | null;
    commentType: string;
    finalText: string;
    sourceAiRecordId: number | null;
  }): number {
    const result = this.databaseService
      .getDb()
      .prepare(
        `INSERT INTO comments (
           student_id, term_id, comment_type, final_text,
           source_ai_record_id, created_at, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        input.studentId,
        input.termId,
        input.commentType,
        input.finalText,
        input.sourceAiRecordId,
        nowIso(),
      );
    return Number(result.lastInsertRowid);
  }

  /** 按 ID 查 */
  findById(id: number): CommentRow | undefined {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM comments WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(id) as CommentRow | undefined;
  }

  /** 某生评语列表 */
  listByStudent(studentId: number): CommentRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM comments
         WHERE student_id = ? AND deleted_at IS NULL
         ORDER BY id DESC`,
      )
      .all(studentId) as CommentRow[];
  }

  /** 软删除 */
  softDelete(id: number): void {
    this.databaseService
      .getDb()
      .prepare(`UPDATE comments SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(nowIso(), id);
  }

  /** 学期是否存在 */
  termExists(termId: number): boolean {
    const row = this.databaseService
      .getDb()
      .prepare('SELECT id FROM terms WHERE id = ?')
      .get(termId) as { id: number } | undefined;
    return Boolean(row);
  }

  /** 学生是否存在 */
  studentExists(studentId: number): boolean {
    const row = this.databaseService
      .getDb()
      .prepare(
        `SELECT id FROM students WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(studentId) as { id: number } | undefined;
    return Boolean(row);
  }

  /** 学期名 */
  getTermName(termId: number): string | null {
    const row = this.databaseService
      .getDb()
      .prepare('SELECT name FROM terms WHERE id = ?')
      .get(termId) as { name: string } | undefined;
    return row?.name ?? null;
  }
}
