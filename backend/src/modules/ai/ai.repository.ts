import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { nowIso } from '../../common/api';

/** 写入 ai_records 入参 */
export interface InsertAiRecordInput {
  scene: string;
  promptId?: number | null;
  studentId?: number | null;
  contextSnapshot: string;
  outputText: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  status: string;
}

/** AI 调用记录仓储 */
@Injectable()
export class AiRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 写入一条 AI 调用记录 */
  insertRecord(input: InsertAiRecordInput): number {
    const result = this.databaseService
      .getDb()
      .prepare(
        `INSERT INTO ai_records (
           scene, prompt_id, student_id, context_snapshot, output_text,
           model, tokens_in, tokens_out, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.scene,
        input.promptId ?? null,
        input.studentId ?? null,
        input.contextSnapshot,
        input.outputText,
        input.model,
        input.tokensIn,
        input.tokensOut,
        input.status,
        nowIso(),
      );
    return Number(result.lastInsertRowid);
  }

  /** 更新记录状态 */
  updateStatus(id: number, status: string): void {
    this.databaseService
      .getDb()
      .prepare(`UPDATE ai_records SET status = ? WHERE id = ?`)
      .run(status, id);
  }

  /** 按 ID 查询 */
  findById(id: number): {
    id: number;
    scene: string;
    student_id: number | null;
    context_snapshot: string | null;
    output_text: string | null;
    status: string;
    created_at: string | null;
  } | undefined {
    return this.databaseService
      .getDb()
      .prepare('SELECT * FROM ai_records WHERE id = ?')
      .get(id) as
      | {
          id: number;
          scene: string;
          student_id: number | null;
          context_snapshot: string | null;
          output_text: string | null;
          status: string;
          created_at: string | null;
        }
      | undefined;
  }

  /** 某生最近一条评语生成记录 */
  findLatestCommentRecord(studentId: number): {
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

  /** 当月用量 */
  getMonthStats(): {
    tokensIn: number;
    tokensOut: number;
    callCount: number;
    failCount: number;
  } {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();
    const row = this.databaseService
      .getDb()
      .prepare(
        `SELECT
           COALESCE(SUM(tokens_in), 0) AS tokens_in,
           COALESCE(SUM(tokens_out), 0) AS tokens_out,
           COUNT(*) AS call_count,
           COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS fail_count
         FROM ai_records
         WHERE created_at >= ?`,
      )
      .get(monthStart) as {
      tokens_in: number;
      tokens_out: number;
      call_count: number;
      fail_count: number;
    };
    return {
      tokensIn: row.tokens_in,
      tokensOut: row.tokens_out,
      callCount: row.call_count,
      failCount: row.fail_count,
    };
  }

  /** 分页列表 */
  findPage(filter: {
    scene?: string;
    studentId?: number;
    status?: string;
    page: number;
    pageSize: number;
  }): {
    rows: Array<{
      id: number;
      scene: string;
      prompt_id: number | null;
      student_id: number | null;
      context_snapshot: string | null;
      output_text: string | null;
      model: string | null;
      tokens_in: number | null;
      tokens_out: number | null;
      status: string;
      created_at: string | null;
      student_name: string | null;
    }>;
    total: number;
  } {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.scene) {
      where.push('r.scene = ?');
      params.push(filter.scene);
    }
    if (filter.studentId) {
      where.push('r.student_id = ?');
      params.push(filter.studentId);
    }
    if (filter.status) {
      where.push('r.status = ?');
      params.push(filter.status);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalRow = this.databaseService
      .getDb()
      .prepare(`SELECT COUNT(*) AS c FROM ai_records r ${whereSql}`)
      .get(...params) as { c: number };
    const offset = (filter.page - 1) * filter.pageSize;
    const rows = this.databaseService
      .getDb()
      .prepare(
        `SELECT r.*, s.name AS student_name
         FROM ai_records r
         LEFT JOIN students s ON s.id = r.student_id
         ${whereSql}
         ORDER BY r.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, filter.pageSize, offset) as Array<{
      id: number;
      scene: string;
      prompt_id: number | null;
      student_id: number | null;
      context_snapshot: string | null;
      output_text: string | null;
      model: string | null;
      tokens_in: number | null;
      tokens_out: number | null;
      status: string;
      created_at: string | null;
      student_name: string | null;
    }>;
    return { rows, total: totalRow.c };
  }
}
