import { httpGet } from './http';
import type { IncidentListItem } from './incidents';
import type { Student } from '@/types';

/** 首页看板数据 */
export interface DashboardHomeData {
  focusStudents: Student[];
  dueFollowUps: IncidentListItem[];
  draftCount: number;
  recentDrafts: IncidentListItem[];
}

/** 首页看板聚合接口 */
export function dashboardHomeApi(): Promise<DashboardHomeData> {
  return httpGet('/v1/dashboard/home');
}
