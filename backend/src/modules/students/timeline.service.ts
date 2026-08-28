import { Injectable } from '@nestjs/common';
import { AppException, ErrorCodes } from '../../common/api';
import { StudentsRepository } from './students.repository';
import { TimelineRepository } from './timeline.repository';

/** 时间线单科成绩 */
export interface TimelineSubjectScoreView {
  subjectId: number;
  subjectName: string;
  score: number | null;
  status: string;
  classRank: number | null;
}

/** 时间线成绩明细 */
export interface TimelineScoreDetailView {
  totalScore: number | null;
  totalRank: number | null;
  subjects: TimelineSubjectScoreView[];
}

/** 时间线对外视图 */
export interface TimelineItemView {
  id: string;
  kind: 'score' | 'incident' | 'comment';
  /** 域色用途：score / incident / contact / comment / praise */
  domain: 'score' | 'incident' | 'contact' | 'comment' | 'praise';
  occurredAt: string;
  title: string;
  summary: string | null;
  category: string | null;
  severity: number | null;
  examId: number | null;
  incidentId: number | null;
  commentId: number | null;
  /** 成绩节点专属：总分、班排、各科 */
  scoreDetail: TimelineScoreDetailView | null;
}

/** 成长时间线服务 */
@Injectable()
export class TimelineService {
  constructor(
    private readonly timelineRepository: TimelineRepository,
    private readonly studentsRepository: StudentsRepository,
  ) {}

  /** 学生成长时间线（倒序） */
  list(
    studentId: number,
    filter?: {
      kind?: string;
      q?: string;
    },
  ): TimelineItemView[] {
    const student = this.studentsRepository.findById(studentId);
    if (!student || student.deleted_at) {
      throw new AppException(ErrorCodes.NOT_FOUND, '学生不存在', 404);
    }

    const scoreItems = this.timelineRepository
      .listScoreExams(studentId)
      .map((exam) => this.scoreToView(exam));

    const eventItems = [
      ...this.timelineRepository.listIncidents(studentId),
      ...this.timelineRepository.listComments(studentId),
    ].map((row) => this.eventToView(row));

    let items = [...scoreItems, ...eventItems].sort((a, b) => {
      const ta = new Date(a.occurredAt || 0).getTime();
      const tb = new Date(b.occurredAt || 0).getTime();
      return tb - ta;
    });

    if (filter?.kind && filter.kind !== 'all') {
      if (filter.kind === 'contact') {
        items = items.filter((i) => i.domain === 'contact');
      } else if (filter.kind === 'praise') {
        items = items.filter((i) => i.domain === 'praise');
      } else {
        items = items.filter((i) => i.kind === filter.kind);
      }
    }

    if (filter?.q && filter.q.trim()) {
      const keyword = filter.q.trim().toLowerCase();
      items = items.filter((i) => {
        const subjectText =
          i.scoreDetail?.subjects
            .map((s) => `${s.subjectName}${s.score ?? ''}`)
            .join(' ') ?? '';
        const hay =
          `${i.title} ${i.summary ?? ''} ${i.category ?? ''} ${subjectText}`.toLowerCase();
        return hay.includes(keyword);
      });
    }

    return items;
  }

  /** 考试成绩转时间线视图 */
  private scoreToView(exam: {
    exam_id: number;
    exam_name: string;
    exam_date: string;
    exam_type: string | null;
    subjects: Array<{
      subject_id: number;
      subject_name: string;
      score: number | null;
      status: string;
      class_rank: number | null;
    }>;
    total_score: number | null;
    total_rank: number | null;
  }): TimelineItemView {
    const subjects = exam.subjects.map((s) => ({
      subjectId: s.subject_id,
      subjectName: s.subject_name,
      score: s.score,
      status: s.status,
      classRank: s.class_rank,
    }));

    const subjectSummary = subjects
      .map((s) => {
        if (s.status === '缺考') return `${s.subjectName}缺`;
        if (s.status === '免考') return `${s.subjectName}免`;
        if (s.score === null) return `${s.subjectName}—`;
        const rank =
          s.classRank !== null ? `(第${s.classRank}名)` : '';
        return `${s.subjectName}${s.score}${rank}`;
      })
      .join(' · ');

    const totalPart =
      exam.total_score !== null
        ? `总分 ${exam.total_score}${
            exam.total_rank !== null ? ` · 班排第${exam.total_rank}名` : ''
          }`
        : '暂无总分';

    return {
      id: `score-${exam.exam_id}`,
      kind: 'score',
      domain: 'score',
      occurredAt: exam.exam_date,
      title: exam.exam_name,
      summary: `${totalPart}；${subjectSummary}`,
      category: exam.exam_type,
      severity: null,
      examId: exam.exam_id,
      incidentId: null,
      commentId: null,
      scoreDetail: {
        totalScore: exam.total_score,
        totalRank: exam.total_rank,
        subjects,
      },
    };
  }

  /** 事件/评语转视图 */
  private eventToView(row: {
    kind: 'incident' | 'comment';
    occurred_at: string;
    title: string;
    summary: string | null;
    category: string | null;
    severity: number | null;
    exam_id: number | null;
    incident_id: number | null;
    comment_id: number | null;
  }): TimelineItemView {
    const domain = this.resolveDomain(row.kind, row.category);
    const id =
      row.kind === 'incident'
        ? `incident-${row.incident_id}`
        : `comment-${row.comment_id}`;
    return {
      id,
      kind: row.kind,
      domain,
      occurredAt: row.occurred_at,
      title: row.title || '未命名',
      summary: row.summary,
      category: row.category,
      severity: row.severity,
      examId: row.exam_id,
      incidentId: row.incident_id,
      commentId: row.comment_id,
      scoreDetail: null,
    };
  }

  /** 映射域色类型 */
  private resolveDomain(
    kind: 'incident' | 'comment',
    category: string | null,
  ): TimelineItemView['domain'] {
    if (kind === 'comment') return 'comment';
    if (category === '家校沟通') return 'contact';
    if (category === '表扬奖励') return 'praise';
    return 'incident';
  }
}
