import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { nowIso } from '../../common/api';

/** 事件表行 */
export interface IncidentRow {
  id: number;
  occurred_at: string;
  category: string;
  severity: number;
  title: string | null;
  content: string | null;
  draft_content: string | null;
  ai_suggestion: string | null;
  status: string;
  follow_up_needed: number;
  follow_up_deadline: string | null;
  follow_up_done_at: string | null;
  follow_up_result: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

/** 事件-学生关联行（含姓名） */
export interface IncidentStudentNameRow {
  incident_id: number;
  student_id: number;
  name: string;
}

/** 创建草稿入参 */
export interface CreateDraftInput {
  occurredAt: string;
  category: string;
  title: string;
  content: string;
  draftContent: string;
  studentIds: number[];
}

/** 直接新建正式事件入参 */
export interface CreateConfirmedInput {
  occurredAt: string;
  category: string;
  severity: number;
  title: string;
  content: string;
  followUpNeeded: boolean;
  followUpDeadline: string | null;
  studentIds: number[];
}

/** 更新事件字段入参 */
export interface UpdateIncidentInput {
  occurredAt?: string;
  category?: string;
  severity?: number;
  title?: string;
  content?: string;
  draftContent?: string | null;
  status?: string;
  followUpNeeded?: boolean;
  followUpDeadline?: string | null;
  followUpDoneAt?: string | null;
  followUpResult?: string | null;
}

/** 列表筛选条件 */
export interface IncidentListFilter {
  status?: string;
  category?: string;
  q?: string;
}

/** 事件仓储 */
@Injectable()
export class IncidentsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 分页查询未删除事件 */
  findPage(
    filter: IncidentListFilter,
    page: number,
    pageSize: number,
  ): { rows: IncidentRow[]; total: number } {
    const where: string[] = ['i.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (filter.status) {
      where.push('i.status = ?');
      params.push(filter.status);
    }
    if (filter.category) {
      where.push('i.category = ?');
      params.push(filter.category);
    }
    if (filter.q && filter.q.trim()) {
      const keyword = `%${filter.q.trim()}%`;
      where.push(
        `(i.title LIKE ? OR i.content LIKE ? OR i.draft_content LIKE ?
          OR EXISTS (
            SELECT 1 FROM incident_students ist
            JOIN students s ON s.id = ist.student_id AND s.deleted_at IS NULL
            WHERE ist.incident_id = i.id AND s.name LIKE ?
          ))`,
      );
      params.push(keyword, keyword, keyword, keyword);
    }

    const whereSql = where.join(' AND ');
    const db = this.databaseService.getDb();

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS c FROM incidents i WHERE ${whereSql}`)
      .get(...params) as { c: number };

    const offset = (page - 1) * pageSize;
    const rows = db
      .prepare(
        `SELECT i.* FROM incidents i
         WHERE ${whereSql}
         ORDER BY i.occurred_at DESC, i.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as IncidentRow[];

    return { rows, total: totalRow.c };
  }

  /** 按 ID 查询未删除事件 */
  findById(id: number): IncidentRow | undefined {
    return this.databaseService
      .getDb()
      .prepare('SELECT * FROM incidents WHERE id = ? AND deleted_at IS NULL')
      .get(id) as IncidentRow | undefined;
  }

  /** 统计未删除草稿数量 */
  countDrafts(): number {
    const row = this.databaseService
      .getDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM incidents
         WHERE deleted_at IS NULL AND status = 'draft'`,
      )
      .get() as { c: number };
    return row.c;
  }

  /** 批量查询事件关联学生（含姓名） */
  findStudentNamesByIncidentIds(
    incidentIds: number[],
  ): IncidentStudentNameRow[] {
    if (incidentIds.length === 0) return [];
    const placeholders = incidentIds.map(() => '?').join(',');
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT ist.incident_id, ist.student_id, s.name
         FROM incident_students ist
         JOIN students s ON s.id = ist.student_id AND s.deleted_at IS NULL
         WHERE ist.incident_id IN (${placeholders})
         ORDER BY ist.is_primary DESC, ist.id ASC`,
      )
      .all(...incidentIds) as IncidentStudentNameRow[];
  }

  /** 校验学生 ID 是否均存在且未删除，返回有效数量 */
  countActiveStudents(studentIds: number[]): number {
    if (studentIds.length === 0) return 0;
    const uniqueIds = [...new Set(studentIds)];
    const placeholders = uniqueIds.map(() => '?').join(',');
    const row = this.databaseService
      .getDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM students
         WHERE deleted_at IS NULL AND id IN (${placeholders})`,
      )
      .get(...uniqueIds) as { c: number };
    return row.c;
  }

  /** 创建草稿事件并关联学生 */
  createDraft(input: CreateDraftInput): number {
    const now = nowIso();
    const db = this.databaseService.getDb();
    const run = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO incidents (
             occurred_at, category, severity, title, content, draft_content,
             status, follow_up_needed, created_at, updated_at
           ) VALUES (?, ?, 1, ?, ?, ?, 'draft', 0, ?, ?)`,
        )
        .run(
          input.occurredAt,
          input.category,
          input.title,
          input.content,
          input.draftContent,
          now,
          now,
        );
      const incidentId = Number(result.lastInsertRowid);
      this.replaceStudentsTx(incidentId, input.studentIds);
      return incidentId;
    });
    return run();
  }

  /** 直接创建已确认事件并关联学生 */
  createConfirmed(input: CreateConfirmedInput): number {
    const now = nowIso();
    const db = this.databaseService.getDb();
    const run = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO incidents (
             occurred_at, category, severity, title, content, draft_content,
             status, follow_up_needed, follow_up_deadline, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, NULL, 'confirmed', ?, ?, ?, ?)`,
        )
        .run(
          input.occurredAt,
          input.category,
          input.severity,
          input.title,
          input.content,
          input.followUpNeeded ? 1 : 0,
          input.followUpDeadline,
          now,
          now,
        );
      const incidentId = Number(result.lastInsertRowid);
      this.replaceStudentsTx(incidentId, input.studentIds);
      return incidentId;
    });
    return run();
  }

  /** 更新事件字段 */
  update(id: number, input: UpdateIncidentInput): void {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.occurredAt !== undefined) {
      sets.push('occurred_at = ?');
      params.push(input.occurredAt);
    }
    if (input.category !== undefined) {
      sets.push('category = ?');
      params.push(input.category);
    }
    if (input.severity !== undefined) {
      sets.push('severity = ?');
      params.push(input.severity);
    }
    if (input.title !== undefined) {
      sets.push('title = ?');
      params.push(input.title);
    }
    if (input.content !== undefined) {
      sets.push('content = ?');
      params.push(input.content);
    }
    if (input.draftContent !== undefined) {
      sets.push('draft_content = ?');
      params.push(input.draftContent);
    }
    if (input.status !== undefined) {
      sets.push('status = ?');
      params.push(input.status);
    }
    if (input.followUpNeeded !== undefined) {
      sets.push('follow_up_needed = ?');
      params.push(input.followUpNeeded ? 1 : 0);
    }
    if (input.followUpDeadline !== undefined) {
      sets.push('follow_up_deadline = ?');
      params.push(input.followUpDeadline);
    }
    if (input.followUpDoneAt !== undefined) {
      sets.push('follow_up_done_at = ?');
      params.push(input.followUpDoneAt);
    }
    if (input.followUpResult !== undefined) {
      sets.push('follow_up_result = ?');
      params.push(input.followUpResult);
    }

    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    params.push(nowIso());
    params.push(id);

    this.databaseService
      .getDb()
      .prepare(
        `UPDATE incidents SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(...params);
  }

  /** 确认事件：更新字段、设为 confirmed，并替换涉事学生 */
  confirm(
    id: number,
    input: UpdateIncidentInput & { studentIds: number[] },
  ): void {
    const db = this.databaseService.getDb();
    db.transaction(() => {
      this.update(id, {
        title: input.title,
        content: input.content,
        category: input.category,
        severity: input.severity,
        draftContent: input.draftContent,
        status: 'confirmed',
        followUpNeeded: input.followUpNeeded,
        followUpDeadline: input.followUpDeadline,
      });
      this.replaceStudentsTx(id, input.studentIds);
    })();
  }

  /** 替换事件关联学生 */
  replaceStudents(incidentId: number, studentIds: number[]): void {
    const db = this.databaseService.getDb();
    db.transaction(() => {
      this.replaceStudentsTx(incidentId, studentIds);
      db.prepare('UPDATE incidents SET updated_at = ? WHERE id = ?').run(
        nowIso(),
        incidentId,
      );
    })();
  }

  /** 软删除事件 */
  softDelete(id: number): void {
    this.databaseService
      .getDb()
      .prepare(
        `UPDATE incidents SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(nowIso(), nowIso(), id);
  }

  /** 查询到期未完成跟进事件 */
  findDueFollowUps(limit: number): IncidentRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM incidents
         WHERE deleted_at IS NULL
           AND status = 'confirmed'
           AND follow_up_needed = 1
           AND follow_up_done_at IS NULL
           AND follow_up_deadline IS NOT NULL
           AND date(follow_up_deadline) <= date('now', 'localtime')
         ORDER BY follow_up_deadline ASC, id ASC
         LIMIT ?`,
      )
      .all(limit) as IncidentRow[];
  }

  /** 查询最近草稿（首页待办入口） */
  findRecentDrafts(limit: number): IncidentRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM incidents
         WHERE deleted_at IS NULL AND status = 'draft'
         ORDER BY occurred_at DESC, id DESC
         LIMIT ?`,
      )
      .all(limit) as IncidentRow[];
  }

  /** 事务内替换 incident_students */
  private replaceStudentsTx(incidentId: number, studentIds: number[]): void {
    const db = this.databaseService.getDb();
    db.prepare('DELETE FROM incident_students WHERE incident_id = ?').run(
      incidentId,
    );
    const insert = db.prepare(
      `INSERT INTO incident_students (incident_id, student_id, is_primary)
       VALUES (?, ?, ?)`,
    );
    studentIds.forEach((studentId, index) => {
      insert.run(incidentId, studentId, index === 0 ? 1 : 0);
    });
  }
}
