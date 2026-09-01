import { httpGet } from './http';
import type { IncidentListItem } from './incidents';
import type { Student } from '@/types';

/** 成绩简报 · 趋势点 */
export interface ScoreBriefTrendPoint {
  examId: number;
  examName: string;
  examDate: string | null;
  classAvg: number | null;
  gradeAvg: number | null;
  studentCount: number;
}

/** 成绩简报 · 单科 */
export interface ScoreBriefSubject {
  subjectId: number;
  subjectName: string;
  avgScore: number;
  lowRate: number;
  sampleCount: number;
}

/** 首页成绩简报（无成绩时为 null） */
export interface ScoreBrief {
  latestExamId: number;
  latestExamName: string;
  latestExamDate: string | null;
  latestClassAvg: number | null;
  totalTrend: ScoreBriefTrendPoint[];
  subjects: ScoreBriefSubject[];
}

/** 首页看板数据 */
export interface DashboardHomeData {
  focusStudents: Student[];
  dueFollowUps: IncidentListItem[];
  draftCount: number;
  recentDrafts: IncidentListItem[];
  scoreBrief: ScoreBrief | null;
}

/** 首页看板聚合接口 */
export function dashboardHomeApi(): Promise<DashboardHomeData> {
  return httpGet('/v1/dashboard/home');
}
