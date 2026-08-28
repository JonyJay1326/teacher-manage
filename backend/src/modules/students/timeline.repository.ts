import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

/** 时间线单科成绩明细 */
export interface TimelineSubjectScoreRaw {
  subject_id: number;
  subject_name: string;
  score: number | null;
  status: string;
  class_rank: number | null;
  sort: number;
}

/** 时间线考试成绩节点 */
export interface TimelineScoreExamRaw {
  exam_id: number;
  exam_name: string;
  exam_date: string;
  exam_type: string | null;
  subjects: TimelineSubjectScoreRaw[];
  total_score: number | null;
  total_rank: number | null;
}

/** 事件/评语原始行 */
export interface TimelineEventRaw {
  kind: 'incident' | 'comment';
  occurred_at: string;
  title: string;
  summary: string | null;
  category: string | null;
  severity: number | null;
  exam_id: number | null;
  incident_id: number | null;
  comment_id: number | null;
}

/** 学生时间线仓储 */
@Injectable()
export class TimelineRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /** 该生有成绩的考试列表（含各科与总分总排） */
  listScoreExams(studentId: number): TimelineScoreExamRaw[] {
    const db = this.databaseService.getDb();

    const exams = db
      .prepare(
        `SELECT DISTINCT e.id AS exam_id, e.name AS exam_name,
                COALESCE(e.exam_date, '') AS exam_date, e.exam_type
         FROM exams e
         JOIN scores sc ON sc.exam_id = e.id AND sc.student_id = ?
         WHERE e.deleted_at IS NULL
         ORDER BY e.exam_date DESC, e.id DESC`,
      )
      .all(studentId) as Array<{
      exam_id: number;
      exam_name: string;
      exam_date: string;
      exam_type: string | null;
    }>;

    const subjectStmt = db.prepare(
      `SELECT sc.subject_id, sub.name AS subject_name, sc.score, sc.status,
              sc.class_rank, sub.sort
       FROM scores sc
       JOIN subjects sub ON sub.id = sc.subject_id
       WHERE sc.exam_id = ? AND sc.student_id = ?
       ORDER BY sub.sort ASC, sub.id ASC`,
    );

    const totalsStmt = db.prepare(
      `SELECT student_id,
              SUM(CASE WHEN status = '正常' AND score IS NOT NULL THEN score ELSE 0 END) AS total_score,
              SUM(CASE WHEN status = '正常' AND score IS NOT NULL THEN 1 ELSE 0 END) AS scored_count
       FROM scores
       WHERE exam_id = ?
       GROUP BY student_id`,
    );

    return exams.map((exam) => {
      const subjects = subjectStmt.all(
        exam.exam_id,
        studentId,
      ) as TimelineSubjectScoreRaw[];

      const myTotalParts = subjects.filter(
        (s) => s.status === '正常' && s.score !== null,
      );
      const totalScore =
        myTotalParts.length > 0
          ? Math.round(
              myTotalParts.reduce((sum, s) => sum + (s.score as number), 0) * 10,
            ) / 10
          : null;

      const classTotals = totalsStmt.all(exam.exam_id) as Array<{
        student_id: number;
        total_score: number;
        scored_count: number;
      }>;
      const eligible = classTotals
        .filter((r) => r.scored_count > 0)
        .map((r) => ({
          id: r.student_id,
          score: r.total_score,
        }));
      const rankMap = this.assignCompetitionRanks(eligible);
      const totalRank =
        totalScore !== null ? (rankMap.get(studentId) ?? null) : null;

      return {
        exam_id: exam.exam_id,
        exam_name: exam.exam_name,
        exam_date: exam.exam_date,
        exam_type: exam.exam_type,
        subjects,
        total_score: totalScore,
        total_rank: totalRank,
      };
    });
  }

  /** 已确认事件 */
  listIncidents(studentId: number): TimelineEventRaw[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT
           'incident' AS kind,
           i.occurred_at AS occurred_at,
           COALESCE(i.title, substr(COALESCE(i.content, i.draft_content, ''), 1, 40)) AS title,
           i.content AS summary,
           i.category AS category,
           i.severity AS severity,
           NULL AS exam_id,
           i.id AS incident_id,
           NULL AS comment_id
         FROM incidents i
         JOIN incident_students ist ON ist.incident_id = i.id AND ist.student_id = ?
         WHERE i.deleted_at IS NULL AND i.status = 'confirmed'`,
      )
      .all(studentId) as TimelineEventRaw[];
  }

  /** 评语 */
  listComments(studentId: number): TimelineEventRaw[] {
    return this.databaseService
      .getDb()
      .prepare(
        `SELECT
           'comment' AS kind,
           COALESCE(c.created_at, '') AS occurred_at,
           COALESCE(c.comment_type, '评语') AS title,
           c.final_text AS summary,
           c.comment_type AS category,
           NULL AS severity,
           NULL AS exam_id,
           NULL AS incident_id,
           c.id AS comment_id
         FROM comments c
         WHERE c.student_id = ? AND c.deleted_at IS NULL`,
      )
      .all(studentId) as TimelineEventRaw[];
  }

  /** 竞赛式排名（与成绩模块一致） */
  private assignCompetitionRanks(
    items: Array<{ id: number; score: number }>,
  ): Map<number, number> {
    const sorted = [...items].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.id - b.id;
    });
    const ranks = new Map<number, number>();
    let index = 0;
    while (index < sorted.length) {
      const rank = index + 1;
      const score = sorted[index].score;
      let end = index;
      while (end < sorted.length && sorted[end].score === score) {
        ranks.set(sorted[end].id, rank);
        end += 1;
      }
      index = end;
    }
    return ranks;
  }
}
