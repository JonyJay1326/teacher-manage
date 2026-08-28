import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { nowIso } from '../common/api';

/** 审计日志行 */
export interface AuditLogRow {
  id: number;
  action: string;
  target_student_id: number | null;
  detail: string | null;
  created_at: string;
}

/** 审计日志仓储（只增不删） */
@Injectable()
export class AuditLogsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 写入一条审计 */
  insert(input: {
    action: string;
    targetStudentId?: number | null;
    detail?: string | null;
  }): number {
    const result = this.databaseService
      .getDb()
      .prepare(
        `INSERT INTO audit_logs (action, target_student_id, detail, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        input.action,
        input.targetStudentId ?? null,
        input.detail ?? null,
        nowIso(),
      );
    return Number(result.lastInsertRowid);
  }

  /** 分页查询（安全日志页） */
  findPage(
    page: number,
    pageSize: number,
  ): { rows: AuditLogRow[]; total: number } {
    return this.findPageFiltered(page, pageSize);
  }

  /** 分页 + 可选筛选 */
  findPageFiltered(
    page: number,
    pageSize: number,
    q?: string,
    action?: string,
  ): { rows: AuditLogRow[]; total: number } {
    const db = this.databaseService.getDb();
    const where: string[] = [];
    const params: unknown[] = [];
    if (action && action.trim()) {
      where.push('action = ?');
      params.push(action.trim());
    }
    if (q && q.trim()) {
      where.push('(action LIKE ? OR IFNULL(detail, \'\') LIKE ?)');
      const like = `%${q.trim()}%`;
      params.push(like, like);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS c FROM audit_logs ${whereSql}`)
      .get(...params) as { c: number };
    const offset = (page - 1) * pageSize;
    const rows = db
      .prepare(
        `SELECT * FROM audit_logs
         ${whereSql}
         ORDER BY id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as AuditLogRow[];
    return { rows, total: totalRow.c };
  }
}
