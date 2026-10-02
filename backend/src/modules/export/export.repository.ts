import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/** 导出行：字段名与列顺序即 sheet 表头顺序 */
export type ExportRow = Array<string | number | null>;

/** 学生导出行（含监护人主号、标签、班主任印象） */
export interface StudentExportRow {
  student_no: string;
  name: string;
  gender: number | null;
  birth_date: string | null;
  status: string;
  board_type: string | null;
  cadre_role: string | null;
  focus_level: number;
  address: string | null;
  residence: string | null;
  ethnicity: string | null;
  enrolled_at: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_relation: string | null;
  tags: string | null;
  impression: string | null;
  remark: string | null;
}

/** 成绩导出行（按考试 × 学生摊平成一行，便于筛选） */
export interface ScoreExportRow {
  exam_name: string;
  exam_date: string | null;
  term_name: string | null;
  student_no: string;
  name: string;
  subject_name: string;
  full_score: number;
  score: number | null;
  status: string;
  class_rank: number | null;
  total_score: number | null;
  total_rank: number | null;
}

/** 事件导出行 */
export interface IncidentExportRow {
  occurred_at: string;
  category: string;
  severity: number;
  title: string | null;
  content: string | null;
  status: string;
  student_names: string | null;
  follow_up_needed: number;
  follow_up_done_at: string | null;
  follow_up_result: string | null;
}

/** 评语导出行 */
export interface CommentExportRow {
  student_no: string;
  name: string;
  term_name: string | null;
  comment_type: string | null;
  final_text: string;
  created_at: string | null;
  source: string;
}

/**
 * 全量导出仓储：本模块唯一允许 SQL 的层。
 * 只导出业务表明文列，L2 高敏（student_sensitive）一律不落导出。
 */
@Injectable()
export class ExportRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 未删除学生（含监护人/标签/印象聚合） */
  listStudents(): StudentExportRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT
           s.student_no,
           s.name,
           s.gender,
           s.birth_date,
           s.status,
           s.board_type,
           s.cadre_role,
           s.focus_level,
           s.address,
           s.residence,
           s.ethnicity,
           s.enrolled_at,
           (SELECT g.name FROM guardians g
             WHERE g.student_id = s.id AND g.deleted_at IS NULL
             ORDER BY g.is_primary DESC, g.id ASC LIMIT 1) AS guardian_name,
           (SELECT g.phone FROM guardians g
             WHERE g.student_id = s.id AND g.deleted_at IS NULL
             ORDER BY g.is_primary DESC, g.id ASC LIMIT 1) AS guardian_phone,
           (SELECT g.relation FROM guardians g
             WHERE g.student_id = s.id AND g.deleted_at IS NULL
             ORDER BY g.is_primary DESC, g.id ASC LIMIT 1) AS guardian_relation,
           (SELECT GROUP_CONCAT(t.name, '、') FROM student_tags st
             JOIN tags t ON t.id = st.tag_id AND t.deleted_at IS NULL
             WHERE st.student_id = s.id) AS tags,
           (SELECT i.content FROM student_impressions i
             WHERE i.student_id = s.id AND i.deleted_at IS NULL
             LIMIT 1) AS impression,
           s.remark
         FROM students s
         WHERE s.deleted_at IS NULL
         ORDER BY CAST(s.student_no AS INTEGER) ASC, s.student_no ASC`,
      )
      .all() as StudentExportRow[];
  }

  /**
   * 成绩明细（考试 × 学生 × 科目一行）。
   * 总分/总排按竞赛排名口径在 SQL 内用窗口函数算出，
   * 仅统计 status='正常' 且 score 非空的科目。
   */
  listScores(): ScoreExportRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `WITH normal AS (
           SELECT
             sc.exam_id,
             sc.student_id,
             sc.subject_id,
             sc.score,
             sc.status,
             sc.class_rank,
             sub.name AS subject_name,
             sub.full_score
           FROM scores sc
           JOIN subjects sub ON sub.id = sc.subject_id
           JOIN exams e ON e.id = sc.exam_id AND e.deleted_at IS NULL
           WHERE sub.deleted_at IS NULL
         ),
         totals AS (
           SELECT exam_id, student_id,
                  SUM(score) AS total_score
           FROM normal
           WHERE status = '正常' AND score IS NOT NULL
           GROUP BY exam_id, student_id
         ),
         ranked AS (
           SELECT exam_id, student_id, total_score,
                  RANK() OVER (
                    PARTITION BY exam_id
                    ORDER BY total_score DESC
                  ) AS total_rank
           FROM totals
         )
         SELECT
           e.name AS exam_name,
           e.exam_date,
           t.name AS term_name,
           s.student_no,
           s.name,
           n.subject_name,
           n.full_score,
           n.score,
           n.status,
           n.class_rank,
           CASE WHEN r.total_score IS NULL THEN NULL ELSE ROUND(r.total_score, 1) END AS total_score,
           r.total_rank
         FROM normal n
         JOIN exams e ON e.id = n.exam_id
         LEFT JOIN terms t ON t.id = e.term_id
         JOIN students s ON s.id = n.student_id AND s.deleted_at IS NULL
         LEFT JOIN ranked r ON r.exam_id = n.exam_id AND r.student_id = n.student_id
         ORDER BY e.exam_date DESC, e.id DESC,
                  CAST(s.student_no AS INTEGER) ASC, s.student_no ASC,
                  n.full_score DESC, n.subject_name ASC`,
      )
      .all() as ScoreExportRow[];
  }

  /** 未删除事件（含关联学生姓名） */
  listIncidents(): IncidentExportRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT
           i.occurred_at,
           i.category,
           i.severity,
           i.title,
           i.content,
           i.status,
           (SELECT GROUP_CONCAT(s.name, '、') FROM incident_students ist
             JOIN students s ON s.id = ist.student_id AND s.deleted_at IS NULL
             WHERE ist.incident_id = i.id) AS student_names,
           i.follow_up_needed,
           i.follow_up_done_at,
           i.follow_up_result
         FROM incidents i
         WHERE i.deleted_at IS NULL
         ORDER BY i.occurred_at DESC, i.id DESC`,
      )
      .all() as IncidentExportRow[];
  }

  /** 未删除评语 */
  listComments(): CommentExportRow[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT
           s.student_no,
           s.name,
           t.name AS term_name,
           c.comment_type,
           c.final_text,
           c.created_at,
           CASE WHEN c.source_ai_record_id IS NULL THEN '手工' ELSE 'AI 采纳' END AS source
         FROM comments c
         JOIN students s ON s.id = c.student_id AND s.deleted_at IS NULL
         LEFT JOIN terms t ON t.id = c.term_id
         WHERE c.deleted_at IS NULL
         ORDER BY c.id DESC`,
      )
      .all() as CommentExportRow[];
  }
}
