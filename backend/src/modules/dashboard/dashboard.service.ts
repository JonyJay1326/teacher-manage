import { Injectable } from '@nestjs/common';
import {
  AnalysisService,
  type ScoreBriefView,
} from '../analysis/analysis.service';
import { IncidentsService, type IncidentView } from '../incidents/incidents.service';
import {
  DashboardRepository,
  type FocusStudentRow,
} from './dashboard.repository';

/** 首页重点关注学生视图 */
export interface DashboardFocusStudent {
  id: number;
  studentNo: string;
  name: string;
  gender: 0 | 1;
  focusLevel: 0 | 1 | 2 | 3;
  status: string;
  boardType?: string;
  cadreRole?: string;
  tagIds: number[];
  photoUrl?: string;
  lastIncidentSummary?: string;
  daysSinceLastContact?: number;
}

/** 首页看板聚合数据 */
export interface DashboardHomeView {
  focusStudents: DashboardFocusStudent[];
  dueFollowUps: IncidentView[];
  draftCount: number;
  recentDrafts: IncidentView[];
  /** 无最新已录成绩时为 null，前端整区隐藏 */
  scoreBrief: ScoreBriefView | null;
}

/** 看板业务服务 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly dashboardRepository: DashboardRepository,
    private readonly incidentsService: IncidentsService,
    private readonly analysisService: AnalysisService,
  ) {}

  /** 首页看板聚合（关注墙 + 待办跟进 + 草稿入口 + 成绩简报） */
  getHome(): DashboardHomeView {
    const focusRows = this.dashboardRepository.findFocusStudents(2);
    const studentIds = focusRows.map((r) => r.id);

    const summaryRows =
      this.dashboardRepository.findLatestIncidentSummaries(studentIds);
    const contactRows =
      this.dashboardRepository.findLastContactDates(studentIds);

    const summaryByStudent = new Map<number, string>();
    for (const row of summaryRows) {
      if (!summaryByStudent.has(row.student_id) && row.content) {
        const text = row.content.trim();
        summaryByStudent.set(
          row.student_id,
          text.length > 50 ? `${text.slice(0, 50)}…` : text,
        );
      }
    }

    const contactByStudent = new Map<number, string>();
    for (const row of contactRows) {
      contactByStudent.set(row.student_id, row.last_contact_at);
    }

    const focusStudents = focusRows.map((row) =>
      this.toFocusStudent(row, summaryByStudent, contactByStudent),
    );

    const dueFollowUps = this.incidentsService.listDueFollowUps(5);
    const draftCount = this.incidentsService.draftCount().count;
    const recentDrafts = this.incidentsService.listRecentDrafts(5);
    const scoreBrief = this.analysisService.getScoreBrief();

    return {
      focusStudents,
      dueFollowUps,
      draftCount,
      recentDrafts,
      scoreBrief,
    };
  }

  /** 行转首页关注学生视图 */
  private toFocusStudent(
    row: FocusStudentRow,
    summaryByStudent: Map<number, string>,
    contactByStudent: Map<number, string>,
  ): DashboardFocusStudent {
    const tagIds = row.tag_ids
      ? row.tag_ids.split(',').map((id) => Number(id)).filter((id) => !Number.isNaN(id))
      : [];

    const lastContact = contactByStudent.get(row.id);
    let daysSinceLastContact: number | undefined;
    if (lastContact) {
      daysSinceLastContact = this.diffDaysFromToday(lastContact);
    }

    return {
      id: row.id,
      studentNo: row.student_no,
      name: row.name,
      gender: row.gender === 1 ? 1 : 0,
      focusLevel: Math.min(3, Math.max(0, row.focus_level)) as 0 | 1 | 2 | 3,
      status: row.status,
      boardType: row.board_type ?? undefined,
      cadreRole: row.cadre_role ?? undefined,
      tagIds,
      photoUrl: row.photo_path ?? undefined,
      lastIncidentSummary: summaryByStudent.get(row.id),
      daysSinceLastContact,
    };
  }

  /** 计算 ISO 日期距今天数（本地日历日） */
  private diffDaysFromToday(iso: string): number {
    const then = new Date(iso);
    const now = new Date();
    const thenDay = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate());
    const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((nowDay - thenDay) / 86400000);
  }
}
