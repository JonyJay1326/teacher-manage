import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { nowIso } from '../../common/api';

/** 高敏明细行 */
export interface SensitiveRow {
  id: number;
  student_id: number;
  category: string;
  content_encrypted: Buffer;
  iv: Buffer;
  updated_at: string | null;
  deleted_at: string | null;
}

/** 高敏摘要行（不含密文） */
export interface SensitiveSummaryRow {
  category: string;
  updated_at: string | null;
}

/** 学生高敏仓储 */
@Injectable()
export class SensitiveRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 列出学生未删除高敏类别摘要 */
  listSummaries(studentId: number): SensitiveSummaryRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT category, updated_at FROM student_sensitive
         WHERE student_id = ? AND deleted_at IS NULL
         ORDER BY category ASC`,
      )
      .all(studentId) as SensitiveSummaryRow[];
  }

  /** 按学生+类别查询未删除记录 */
  findByStudentCategory(
    studentId: number,
    category: string,
  ): SensitiveRow | undefined {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM student_sensitive
         WHERE student_id = ? AND category = ? AND deleted_at IS NULL`,
      )
      .get(studentId, category) as SensitiveRow | undefined;
  }

  /** 插入或更新密文 */
  upsert(input: {
    studentId: number;
    category: string;
    ciphertext: Buffer;
    iv: Buffer;
  }): void {
    const existing = this.findByStudentCategory(input.studentId, input.category);
    const now = nowIso();
    if (existing) {
      this.databaseService
        .getDb()
        .prepare(
          `UPDATE student_sensitive
           SET content_encrypted = ?, iv = ?, updated_at = ?, deleted_at = NULL
           WHERE id = ?`,
        )
        .run(input.ciphertext, input.iv, now, existing.id);
      return;
    }
    this.databaseService
      .getDb()
      .prepare(
        `INSERT INTO student_sensitive
           (student_id, category, content_encrypted, iv, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        input.studentId,
        input.category,
        input.ciphertext,
        input.iv,
        now,
      );
  }

  /** 软删除 */
  softDelete(studentId: number, category: string): boolean {
    const result = this.databaseService
      .getDb()
      .prepare(
        `UPDATE student_sensitive
         SET deleted_at = ?, updated_at = ?
         WHERE student_id = ? AND category = ? AND deleted_at IS NULL`,
      )
      .run(nowIso(), nowIso(), studentId, category);
    return result.changes > 0;
  }

  /** 批量查询存在未删除高敏记录的学生 ID */
  findStudentIdsHavingSensitive(studentIds: number[]): number[] {
    if (studentIds.length === 0) return [];
    const placeholders = studentIds.map(() => '?').join(',');
    const rows = this.databaseService
      .getDb()
      .prepare(
        `SELECT DISTINCT student_id AS id FROM student_sensitive
         WHERE deleted_at IS NULL AND student_id IN (${placeholders})`,
      )
      .all(...studentIds) as Array<{ id: number }>;
    return rows.map((r) => r.id);
  }
}
