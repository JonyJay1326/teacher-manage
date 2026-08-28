import { httpGet } from './http';

/** 总分趋势点 */
export interface TotalTrendPoint {
  examId: number;
  examName: string;
  examDate: string | null;
  classAvg: number | null;
  gradeAvg: number | null;
  studentCount: number;
}

/** 单科比率 */
export interface SubjectRateItem {
  subjectId: number;
  subjectName: string;
  lowRate: number;
  passRate: number;
  excellentRate: number;
  sampleCount: number;
}

/** 进退步条目 */
export interface RankMoverItem {
  studentId: number;
  studentNo: string;
  name: string;
  prevRank: number;
  currRank: number;
  delta: number;
  currTotal: number;
}

/** 关注频率条目 */
export interface FocusFrequencyItem {
  studentId: number;
  studentNo: string;
  name: string;
  incidentCount: number;
  contactCount: number;
  total: number;
}

/** 分析概览 */
export interface AnalysisOverview {
  thresholds: {
    lowScoreRatio: number;
    passRatio: number;
    excellentRatio: number;
    rankJumpThreshold: number;
  };
  totalTrend: TotalTrendPoint[];
  subjectRates: {
    examId: number | null;
    examName: string | null;
    items: SubjectRateItem[];
  };
  rankMovers: {
    prevExamId: number | null;
    prevExamName: string | null;
    currExamId: number | null;
    currExamName: string | null;
    improve: RankMoverItem[];
    decline: RankMoverItem[];
  };
  focusFrequency: {
    days: number;
    items: FocusFrequencyItem[];
  };
  contactHeatmap: {
    days: number;
    rangeStart: string;
    rangeEnd: string;
    cells: Array<[string, number]>;
    maxCount: number;
  };
  categoryDistribution: {
    termId: number | null;
    termName: string | null;
    items: Array<{ category: string; count: number }>;
  };
  subjectHistogram: {
    examId: number | null;
    examName: string | null;
    subjectId: number | null;
    subjectName: string | null;
    fullScore: number | null;
    bins: Array<{ label: string; count: number }>;
    sampleCount: number;
  };
  incidentMonthly: {
    months: number;
    points: Array<{ month: string; count: number }>;
  };
}

/** 分析中心概览 */
export function analysisOverviewApi(
  examId?: number,
  subjectId?: number,
): Promise<AnalysisOverview> {
  const params = new URLSearchParams();
  if (examId) params.set('examId', String(examId));
  if (subjectId) params.set('subjectId', String(subjectId));
  const qs = params.toString();
  return httpGet(`/v1/analysis/overview${qs ? `?${qs}` : ''}`);
}
