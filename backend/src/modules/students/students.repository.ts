import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { nowIso } from '../../common/api';

/** 学生表行（snake_case） */
export interface StudentRow {
  id: number;
  student_no: string;
  name: string;
  gender: number | null;
  birth_date: string | null;
  photo_path: string | null;
  ethnicity: string | null;
  address: string | null;
  residence: string | null;
  enrolled_at: string | null;
  status: string;
  board_type: string | null;
  cadre_role: string | null;
  focus_level: number;
  remark: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

/** 标签表行 */
export interface TagRow {
  id: number;
  domain: string;
  name: string;
  color: string | null;
  sensitive_level: number;
  is_builtin: number;
  deleted_at: string | null;
}

/** 监护人表行 */
export interface GuardianRow {
  id: number;
  student_id: number;
  relation: string | null;
  name: string | null;
  phone: string | null;
  wechat: string | null;
  job: string | null;
  contact_pref: string | null;
  best_time: string | null;
  is_primary: number;
  remark: string | null;
  deleted_at: string | null;
}

/** 列表筛选条件 */
export interface StudentListFilter {
  q?: string;
  status?: string;
  focusLevel?: number;
  limit: number;
  offset: number;
}

/** 新建学生写入字段 */
export interface StudentInsertInput {
  studentNo: string;
  name: string;
  gender: number | null;
  birthDate: string | null;
  photoPath: string | null;
  ethnicity: string | null;
  address: string | null;
  residence: string | null;
  enrolledAt: string | null;
  status: string;
  boardType: string;
  cadreRole: string | null;
  focusLevel: number;
  remark: string | null;
}

/** 学生更新补丁（仅包含要改的列） */
export interface StudentUpdatePatch {
  studentNo?: string;
  name?: string;
  gender?: number | null;
  birthDate?: string | null;
  photoPath?: string | null;
  ethnicity?: string | null;
  address?: string | null;
  residence?: string | null;
  enrolledAt?: string | null;
  status?: string;
  boardType?: string | null;
  cadreRole?: string | null;
  focusLevel?: number;
  remark?: string | null;
}

/** 新建监护人写入字段 */
export interface GuardianInsertInput {
  studentId: number;
  relation: string | null;
  name: string | null;
  phone: string | null;
  wechat: string | null;
  job: string | null;
  contactPref: string | null;
  bestTime: string | null;
  isPrimary: number;
  remark: string | null;
}

/** 监护人更新补丁 */
export interface GuardianUpdatePatch {
  relation?: string | null;
  name?: string | null;
  phone?: string | null;
  wechat?: string | null;
  job?: string | null;
  contactPref?: string | null;
  bestTime?: string | null;
  isPrimary?: number;
  remark?: string | null;
}

/** 学生与标签/监护人仓储 */
@Injectable()
export class StudentsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 按条件分页查询学生 */
  listStudents(filter: StudentListFilter): { rows: StudentRow[]; total: number } {
    const where: string[] = ['deleted_at IS NULL'];
    const params: Array<string | number> = [];

    if (filter.q && filter.q.trim()) {
      where.push('(name LIKE ? OR student_no LIKE ?)');
      const like = `%${filter.q.trim()}%`;
      params.push(like, like);
    }
    if (filter.status) {
      where.push('status = ?');
      params.push(filter.status);
    }
    if (filter.focusLevel !== undefined) {
      where.push('focus_level = ?');
      params.push(filter.focusLevel);
    }

    const whereSql = where.join(' AND ');
    const db = this.databaseService.getDb();
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS c FROM students WHERE ${whereSql}`)
      .get(...params) as { c: number };
    const rows = db
      .prepare(
        `SELECT * FROM students WHERE ${whereSql}
         ORDER BY student_no ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, filter.limit, filter.offset) as StudentRow[];

    return { rows, total: totalRow.c };
  }

  /** 按 ID 查询未删除学生 */
  findById(id: number): StudentRow | undefined {
    return this.databaseService
      .getDb()
      .prepare('SELECT * FROM students WHERE id = ? AND deleted_at IS NULL')
      .get(id) as StudentRow | undefined;
  }

  /** 按学号查询未删除学生 */
  findByStudentNo(studentNo: string): StudentRow | undefined {
    return this.databaseService
      .getDb()
      .prepare('SELECT * FROM students WHERE student_no = ? AND deleted_at IS NULL')
      .get(studentNo) as StudentRow | undefined;
  }

  /** 按姓名精确匹配未删除学生（可能多条） */
  findByName(name: string): StudentRow[] {
    return this.databaseService
      .getDb()
      .prepare('SELECT * FROM students WHERE name = ? AND deleted_at IS NULL')
      .all(name) as StudentRow[];
  }

  /** 插入学生并返回新 ID */
  insertStudent(input: StudentInsertInput): number {
    const now = nowIso();
    const result = this.databaseService
      .getDb()
      .prepare(
        `INSERT INTO students (
           student_no, name, gender, birth_date, photo_path, ethnicity,
           address, residence, enrolled_at, status, board_type, cadre_role,
           focus_level, remark, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.studentNo,
        input.name,
        input.gender,
        input.birthDate,
        input.photoPath,
        input.ethnicity,
        input.address,
        input.residence,
        input.enrolledAt,
        input.status,
        input.boardType,
        input.cadreRole,
        input.focusLevel,
        input.remark,
        now,
        now,
      );
    return Number(result.lastInsertRowid);
  }

  /** 按补丁更新学生字段 */
  updateStudent(id: number, patch: StudentUpdatePatch): void {
    const columnMap: Record<keyof StudentUpdatePatch, string> = {
      studentNo: 'student_no',
      name: 'name',
      gender: 'gender',
      birthDate: 'birth_date',
      photoPath: 'photo_path',
      ethnicity: 'ethnicity',
      address: 'address',
      residence: 'residence',
      enrolledAt: 'enrolled_at',
      status: 'status',
      boardType: 'board_type',
      cadreRole: 'cadre_role',
      focusLevel: 'focus_level',
      remark: 'remark',
    };

    const sets: string[] = [];
    const values: Array<string | number | null> = [];
    for (const key of Object.keys(patch) as Array<keyof StudentUpdatePatch>) {
      if (patch[key] === undefined) continue;
      sets.push(`${columnMap[key]} = ?`);
      values.push(patch[key] as string | number | null);
    }
    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    values.push(nowIso());
    values.push(id);

    this.databaseService
      .getDb()
      .prepare(`UPDATE students SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`)
      .run(...values);
  }

  /** 软删除学生 */
  softDeleteStudent(id: number): void {
    const now = nowIso();
    const db = this.databaseService.getDb();
    db.prepare(
      `UPDATE students SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
    ).run(now, now, id);
    db.prepare(
      `UPDATE student_impressions SET deleted_at = ?, updated_at = ? WHERE student_id = ? AND deleted_at IS NULL`,
    ).run(now, now, id);
  }

  /** 读取学生印象（未删除） */
  findImpressionByStudentId(studentId: number): {
    id: number;
    student_id: number;
    content: string;
    created_at: string;
    updated_at: string;
  } | null {
    const row = this.databaseService
      .getDb()
      .prepare(
        `SELECT id, student_id, content, created_at, updated_at
         FROM student_impressions
         WHERE student_id = ? AND deleted_at IS NULL`,
      )
      .get(studentId) as
      | {
          id: number;
          student_id: number;
          content: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    return row ?? null;
  }

  /** 新建或更新学生印象 */
  upsertImpression(studentId: number, content: string): {
    id: number;
    student_id: number;
    content: string;
    created_at: string;
    updated_at: string;
  } {
    const now = nowIso();
    const existing = this.findImpressionByStudentId(studentId);
    const db = this.databaseService.getDb();
    if (existing) {
      db.prepare(
        `UPDATE student_impressions
         SET content = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      ).run(content, now, existing.id);
    } else {
      db.prepare(
        `INSERT INTO student_impressions (student_id, content, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      ).run(studentId, content, now, now);
    }
    const row = this.findImpressionByStudentId(studentId);
    if (!row) {
      throw new Error('印象写入后读取失败');
    }
    return row;
  }

  /** 查询学生标签 ID 列表 */
  listTagIdsByStudentId(studentId: number): number[] {
    const rows = this.databaseService
      .getDb()
      .prepare('SELECT tag_id FROM student_tags WHERE student_id = ?')
      .all(studentId) as Array<{ tag_id: number }>;
    return rows.map((r) => r.tag_id);
  }

  /** 批量查询多个学生的标签 ID */
  listTagIdsByStudentIds(studentIds: number[]): Map<number, number[]> {
    const map = new Map<number, number[]>();
    if (studentIds.length === 0) return map;
    for (const id of studentIds) {
      map.set(id, []);
    }
    const placeholders = studentIds.map(() => '?').join(',');
    const rows = this.databaseService
      .getDb()
      .prepare(
        `SELECT student_id, tag_id FROM student_tags WHERE student_id IN (${placeholders})`,
      )
      .all(...studentIds) as Array<{ student_id: number; tag_id: number }>;
    for (const row of rows) {
      const list = map.get(row.student_id);
      if (list) list.push(row.tag_id);
    }
    return map;
  }

  /** 替换学生标签（事务内先删后插） */
  replaceStudentTags(studentId: number, tagIds: number[]): void {
    const db = this.databaseService.getDb();
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM student_tags WHERE student_id = ?').run(studentId);
      const insert = db.prepare(
        'INSERT INTO student_tags (student_id, tag_id) VALUES (?, ?)',
      );
      for (const tagId of tagIds) {
        insert.run(studentId, tagId);
      }
    });
    tx();
  }

  /** 统计指定标签 ID 中仍有效的数量 */
  countActiveTagsByIds(tagIds: number[]): number {
    if (tagIds.length === 0) return 0;
    const placeholders = tagIds.map(() => '?').join(',');
    const row = this.databaseService
      .getDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM tags WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      )
      .get(...tagIds) as { c: number };
    return row.c;
  }

  /** 列出全部未删除标签 */
  listAllTags(): TagRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM tags WHERE deleted_at IS NULL
         ORDER BY domain ASC, id ASC`,
      )
      .all() as TagRow[];
  }

  /** 查询学生的监护人列表 */
  listGuardiansByStudentId(studentId: number): GuardianRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT * FROM guardians
         WHERE student_id = ? AND deleted_at IS NULL
         ORDER BY is_primary DESC, id ASC`,
      )
      .all(studentId) as GuardianRow[];
  }

  /** 按 ID 查询未删除监护人 */
  findGuardianById(guardianId: number): GuardianRow | undefined {
    return this.databaseService
      .getDb()
      .prepare('SELECT * FROM guardians WHERE id = ? AND deleted_at IS NULL')
      .get(guardianId) as GuardianRow | undefined;
  }

  /** 插入监护人并返回新 ID */
  insertGuardian(input: GuardianInsertInput): number {
    const result = this.databaseService
      .getDb()
      .prepare(
        `INSERT INTO guardians (
           student_id, relation, name, phone, wechat, job,
           contact_pref, best_time, is_primary, remark
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.studentId,
        input.relation,
        input.name,
        input.phone,
        input.wechat,
        input.job,
        input.contactPref,
        input.bestTime,
        input.isPrimary,
        input.remark,
      );
    return Number(result.lastInsertRowid);
  }

  /** 按补丁更新监护人 */
  updateGuardian(guardianId: number, patch: GuardianUpdatePatch): void {
    const columnMap: Record<keyof GuardianUpdatePatch, string> = {
      relation: 'relation',
      name: 'name',
      phone: 'phone',
      wechat: 'wechat',
      job: 'job',
      contactPref: 'contact_pref',
      bestTime: 'best_time',
      isPrimary: 'is_primary',
      remark: 'remark',
    };

    const sets: string[] = [];
    const values: Array<string | number | null> = [];
    for (const key of Object.keys(patch) as Array<keyof GuardianUpdatePatch>) {
      if (patch[key] === undefined) continue;
      sets.push(`${columnMap[key]} = ?`);
      values.push(patch[key] as string | number | null);
    }
    if (sets.length === 0) return;

    values.push(guardianId);
    this.databaseService
      .getDb()
      .prepare(
        `UPDATE guardians SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(...values);
  }

  /** 软删除监护人 */
  softDeleteGuardian(guardianId: number): void {
    this.databaseService
      .getDb()
      .prepare(`UPDATE guardians SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(nowIso(), guardianId);
  }

  /** 批量导入创建学生（事务） */
  insertStudentsBatch(inputs: StudentInsertInput[]): number[] {
    const db = this.databaseService.getDb();
    const ids: number[] = [];
    const tx = db.transaction(() => {
      for (const input of inputs) {
        ids.push(this.insertStudent(input));
      }
    });
    tx();
    return ids;
  }
}
