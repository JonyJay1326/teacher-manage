import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/** 重点关注学生行（含标签 ID 串） */
export interface FocusStudentRow {
  id: number;
  student_no: string;
  name: string;
  gender: number | null;
  photo_path: string | null;
  focus_level: number;
  status: string;
  board_type: string | null;
  cadre_role: string | null;
  tag_ids: string | null;
}

/** 学生事件摘要行 */
export interface StudentIncidentSummaryRow {
  student_id: number;
  content: string | null;
  occurred_at: string;
}

/** 学生最近家校沟通行 */
export interface StudentContactRow {
  student_id: number;
  last_contact_at: string;
}

/** 看板仓储 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 查询 focus_level ≥ minLevel 的在读学生 */
  findFocusStudents(minLevel: number): FocusStudentRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT s.id, s.student_no, s.name, s.gender, s.photo_path,
                s.focus_level, s.status, s.board_type, s.cadre_role,
                GROUP_CONCAT(st.tag_id) AS tag_ids
         FROM students s
         LEFT JOIN student_tags st ON st.student_id = s.id
         WHERE s.deleted_at IS NULL
           AND s.status = '在读'
           AND s.focus_level >= ?
         GROUP BY s.id
         ORDER BY s.focus_level DESC, s.name ASC`,
      )
      .all(minLevel) as FocusStudentRow[];
  }

  /** 批量查询学生最近一条已确认事件摘要 */
  findLatestIncidentSummaries(
    studentIds: number[],
  ): StudentIncidentSummaryRow[] {
    if (studentIds.length === 0) return [];
    const placeholders = studentIds.map(() => '?').join(',');
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT ist.student_id, i.content, i.occurred_at
         FROM incident_students ist
         JOIN incidents i ON i.id = ist.incident_id
           AND i.deleted_at IS NULL
           AND i.status = 'confirmed'
         WHERE ist.student_id IN (${placeholders})
         ORDER BY i.occurred_at DESC, i.id DESC`,
      )
      .all(...studentIds) as StudentIncidentSummaryRow[];
  }

  /** 批量查询学生最近一次家校沟通时间 */
  findLastContactDates(studentIds: number[]): StudentContactRow[] {
    if (studentIds.length === 0) return [];
    const placeholders = studentIds.map(() => '?').join(',');
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT ist.student_id, MAX(i.occurred_at) AS last_contact_at
         FROM incident_students ist
         JOIN incidents i ON i.id = ist.incident_id
           AND i.deleted_at IS NULL
           AND i.status = 'confirmed'
           AND i.category = '家校沟通'
         WHERE ist.student_id IN (${placeholders})
         GROUP BY ist.student_id`,
      )
      .all(...studentIds) as StudentContactRow[];
  }
}
