import { Injectable } from '@nestjs/common';
import { nowIso } from '../../common/api';
import { DatabaseService } from '../../database/database.service';

/** 回收站条目 */
export interface RecycleItemRow {
  id: number;
  entity_type: string;
  title: string;
  deleted_at: string;
  extra: string | null;
}

/** 可恢复实体 */
export type RecycleEntityType =
  | 'students'
  | 'incidents'
  | 'comments'
  | 'exams'
  | 'kb_documents';

/** 回收站仓储 */
@Injectable()
export class RecycleRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 列出某类软删除记录 */
  listByType(type: RecycleEntityType): RecycleItemRow[] {
    const db = this.databaseService.getDb();
    if (type === 'students') {
      return db
        .prepare(
          `SELECT id, 'students' AS entity_type,
                  (student_no || ' ' || name) AS title,
                  deleted_at, status AS extra
           FROM students WHERE deleted_at IS NOT NULL
           ORDER BY deleted_at DESC`,
        )
        .all() as RecycleItemRow[];
    }
    if (type === 'incidents') {
      return db
        .prepare(
          `SELECT id, 'incidents' AS entity_type,
                  COALESCE(title, substr(COALESCE(draft_content, content, ''), 1, 40), '(无标题)') AS title,
                  deleted_at, category AS extra
           FROM incidents WHERE deleted_at IS NOT NULL
           ORDER BY deleted_at DESC`,
        )
        .all() as RecycleItemRow[];
    }
    if (type === 'comments') {
      return db
        .prepare(
          `SELECT c.id, 'comments' AS entity_type,
                  (COALESCE(s.name, '?') || ' · ' || COALESCE(c.comment_type, '评语')) AS title,
                  c.deleted_at, substr(c.final_text, 1, 40) AS extra
           FROM comments c
           LEFT JOIN students s ON s.id = c.student_id
           WHERE c.deleted_at IS NOT NULL
           ORDER BY c.deleted_at DESC`,
        )
        .all() as RecycleItemRow[];
    }
    if (type === 'exams') {
      return db
        .prepare(
          `SELECT id, 'exams' AS entity_type, name AS title,
                  deleted_at, exam_date AS extra
           FROM exams WHERE deleted_at IS NOT NULL
           ORDER BY deleted_at DESC`,
        )
        .all() as RecycleItemRow[];
    }
    return db
      .prepare(
        `SELECT id, 'kb_documents' AS entity_type, title,
                deleted_at, category_path AS extra
         FROM kb_documents WHERE deleted_at IS NOT NULL
         ORDER BY deleted_at DESC`,
      )
      .all() as RecycleItemRow[];
  }

  /** 恢复软删除 */
  restore(type: RecycleEntityType, id: number): boolean {
    const table =
      type === 'kb_documents'
        ? 'kb_documents'
        : type === 'students'
          ? 'students'
          : type === 'incidents'
            ? 'incidents'
            : type === 'comments'
              ? 'comments'
              : 'exams';
    const result = this.databaseService
      .getDb()
      .prepare(
        `UPDATE ${table} SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`,
      )
      .run(id);
    if (type === 'students' && result.changes > 0) {
      this.databaseService
        .getDb()
        .prepare(
          `UPDATE student_impressions SET deleted_at = NULL
           WHERE student_id = ? AND deleted_at IS NOT NULL`,
        )
        .run(id);
    }
    return result.changes > 0;
  }

  /** 写入简单审计 */
  insertAudit(action: string, detail: string): void {
    this.databaseService
      .getDb()
      .prepare(
        `INSERT INTO audit_logs (action, target_student_id, detail, created_at)
         VALUES (?, NULL, ?, ?)`,
      )
      .run(action, detail, nowIso());
  }
}
