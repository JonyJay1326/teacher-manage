import { Injectable } from '@nestjs/common';
import { AnalysisRepository } from './analysis.repository';

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

/** 分析中心概览 */
export interface AnalysisOverviewView {
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
  /** 近 30 天关注频率（事件+沟通） */
  focusFrequency: {
    days: number;
    items: FocusFrequencyItem[];
  };
  /** 近 120 天家校沟通日历热力 */
  contactHeatmap: {
    days: number;
    rangeStart: string;
    rangeEnd: string;
    cells: Array<[string, number]>;
    maxCount: number;
  };
  /** 本学期事件类别分布 */
  categoryDistribution: {
    termId: number | null;
    termName: string | null;
    items: Array<{ category: string; count: number }>;
  };
  /** 单科分数直方图（随 examId/subjectId 变化） */
  subjectHistogram: {
    examId: number | null;
    examName: string | null;
    subjectId: number | null;
    subjectName: string | null;
    fullScore: number | null;
    bins: Array<{ label: string; count: number }>;
    sampleCount: number;
  };
  /** 近 36 个月事件趋势 */
  incidentMonthly: {
    months: number;
    points: Array<{ month: string; count: number }>;
  };
}

/** 分析业务服务 */
@Injectable()
export class AnalysisService {
  constructor(private readonly analysisRepository: AnalysisRepository) {}

  /** 分析中心聚合（成绩三图 + 关注频率 + 沟通热力） */
  getOverview(examId?: number, subjectId?: number): AnalysisOverviewView {
    const settings = this.analysisRepository.getSettings();
    const lowScoreRatio = Number(settings.low_score_ratio ?? 0.4);
    const passRatio = Number(settings.pass_ratio ?? 0.6);
    const excellentRatio = Number(settings.excellent_ratio ?? 0.85);
    const rankJumpThreshold = Number(settings.rank_jump_threshold ?? 8);

    const exams = this.analysisRepository.listExamsWithScores();
    const totalTrend = exams.map((exam) => {
      const totals = this.analysisRepository.listStudentTotals(exam.id);
      const classAvg =
        totals.length > 0
          ? Math.round(
              (totals.reduce((s, t) => s + t.total_score, 0) / totals.length) *
                10,
            ) / 10
          : null;
      return {
        examId: exam.id,
        examName: exam.name,
        examDate: exam.exam_date,
        classAvg,
        gradeAvg: this.parseGradeAvg(exam.grade_ref),
        studentCount: totals.length,
      };
    });

    const targetExam =
      (examId ? exams.find((e) => e.id === examId) : undefined) ??
      exams[exams.length - 1] ??
      null;

    const subjectRates = targetExam
      ? {
          examId: targetExam.id,
          examName: targetExam.name,
          items: this.buildSubjectRates(
            targetExam.id,
            lowScoreRatio,
            passRatio,
            excellentRatio,
          ),
        }
      : { examId: null, examName: null, items: [] };

    const rankMovers = this.buildRankMovers(exams, rankJumpThreshold);
    const focusFrequency = this.buildFocusFrequency(30);
    const contactHeatmap = this.buildContactHeatmap(120);
    const categoryDistribution = this.buildCategoryDistribution();
    const subjectHistogram = this.buildSubjectHistogram(
      targetExam?.id ?? null,
      targetExam?.name ?? null,
      subjectId,
    );
    const incidentMonthly = this.buildIncidentMonthly(36);

    return {
      thresholds: {
        lowScoreRatio,
        passRatio,
        excellentRatio,
        rankJumpThreshold,
      },
      totalTrend,
      subjectRates,
      rankMovers,
      focusFrequency,
      contactHeatmap,
      categoryDistribution,
      subjectHistogram,
      incidentMonthly,
    };
  }

  /** 本学期事件类别分布 */
  private buildCategoryDistribution(): AnalysisOverviewView['categoryDistribution'] {
    const term = this.analysisRepository.findActiveTerm();
    const startIso = term?.start_date
      ? `${term.start_date}T00:00:00.000Z`
      : null;
    const endIso = term?.end_date ? `${term.end_date}T23:59:59.999Z` : null;
    const rows = this.analysisRepository.listCategoryCounts(startIso, endIso);
    return {
      termId: term?.id ?? null,
      termName: term?.name ?? null,
      items: rows.map((r) => ({
        category: r.category,
        count: Number(r.count) || 0,
      })),
    };
  }

  /** 单科分数段直方图（按满分 10% 一档） */
  private buildSubjectHistogram(
    examId: number | null,
    examName: string | null,
    subjectId?: number,
  ): AnalysisOverviewView['subjectHistogram'] {
    const empty = {
      examId,
      examName,
      subjectId: null as number | null,
      subjectName: null as string | null,
      fullScore: null as number | null,
      bins: [] as Array<{ label: string; count: number }>,
      sampleCount: 0,
    };
    if (examId == null) return empty;

    let sid = subjectId;
    if (sid == null) {
      const rates = this.buildSubjectRates(examId, 0.4, 0.6, 0.85);
      sid = rates[0]?.subjectId;
    }
    if (sid == null) return empty;

    const values = this.analysisRepository.listSubjectScoreValues(examId, sid);
    if (values.length === 0) {
      return { ...empty, subjectId: sid };
    }
    const fullScore = values[0]!.full_score;
    const subjectName =
      this.analysisRepository
        .listSubjectScores(examId)
        .find((r) => r.subject_id === sid)?.subject_name ?? null;

    const binCount = 10;
    const bins = Array.from({ length: binCount }, (_, i) => ({
      label:
        i === binCount - 1
          ? `${Math.round((fullScore * i) / binCount)}-${fullScore}`
          : `${Math.round((fullScore * i) / binCount)}-${Math.round((fullScore * (i + 1)) / binCount) - 1}`,
      count: 0,
    }));
    for (const row of values) {
      const ratio = row.score / fullScore;
      let idx = Math.floor(ratio * binCount);
      if (idx >= binCount) idx = binCount - 1;
      if (idx < 0) idx = 0;
      bins[idx]!.count += 1;
    }
    return {
      examId,
      examName,
      subjectId: sid,
      subjectName,
      fullScore,
      bins,
      sampleCount: values.length,
    };
  }

  /** 近 N 个月事件趋势（补全空月） */
  private buildIncidentMonthly(
    months: number,
  ): AnalysisOverviewView['incidentMonthly'] {
    const map = new Map(
      this.analysisRepository
        .listIncidentMonthly(months)
        .map((r) => [r.month, Number(r.count) || 0]),
    );
    const points: Array<{ month: string; count: number }> = [];
    const cursor = new Date();
    cursor.setUTCDate(1);
    cursor.setUTCMonth(cursor.getUTCMonth() - (months - 1));
    for (let i = 0; i < months; i += 1) {
      const key = cursor.toISOString().slice(0, 7);
      points.push({ month: key, count: map.get(key) ?? 0 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return { months, points };
  }

  /** 近 N 天每生事件+沟通次数 */
  private buildFocusFrequency(days: number): AnalysisOverviewView['focusFrequency'] {
    const rows = this.analysisRepository.listFocusFrequency(days);
    const items: FocusFrequencyItem[] = rows.map((row) => {
      const incidentCount = Number(row.incident_count) || 0;
      const contactCount = Number(row.contact_count) || 0;
      return {
        studentId: row.student_id,
        studentNo: row.student_no,
        name: row.name,
        incidentCount,
        contactCount,
        total: incidentCount + contactCount,
      };
    });
    return { days, items };
  }

  /** 近 N 天家校沟通按日热力 */
  private buildContactHeatmap(days: number): AnalysisOverviewView['contactHeatmap'] {
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - days);
    const rangeStart = start.toISOString().slice(0, 10);
    const rangeEnd = end.toISOString().slice(0, 10);
    const rows = this.analysisRepository.listContactHeatDays(days);
    const cells: Array<[string, number]> = rows.map((r) => [
      r.day,
      Number(r.count) || 0,
    ]);
    const maxCount = cells.reduce((m, c) => Math.max(m, c[1]), 0);
    return { days, rangeStart, rangeEnd, cells, maxCount };
  }

  /** 各科低分/及格/优秀率（默认按低分率排序） */
  private buildSubjectRates(
    examId: number,
    lowScoreRatio: number,
    passRatio: number,
    excellentRatio: number,
  ): SubjectRateItem[] {
    const rows = this.analysisRepository.listSubjectScores(examId);
    const bySubject = new Map<
      number,
      {
        name: string;
        full: number;
        sort: number;
        scores: number[];
      }
    >();

    for (const row of rows) {
      if (row.status !== '正常' || row.score === null) continue;
      let bucket = bySubject.get(row.subject_id);
      if (!bucket) {
        bucket = {
          name: row.subject_name,
          full: row.full_score,
          sort: row.sort,
          scores: [],
        };
        bySubject.set(row.subject_id, bucket);
      }
      bucket.scores.push(row.score);
    }

    const items: SubjectRateItem[] = [];
    for (const [subjectId, bucket] of bySubject) {
      const n = bucket.scores.length;
      if (n === 0) continue;
      const lowLine = bucket.full * lowScoreRatio;
      const passLine = bucket.full * passRatio;
      const excellentLine = bucket.full * excellentRatio;
      const lowCount = bucket.scores.filter((s) => s < lowLine).length;
      const passCount = bucket.scores.filter((s) => s >= passLine).length;
      const excellentCount = bucket.scores.filter(
        (s) => s >= excellentLine,
      ).length;
      items.push({
        subjectId,
        subjectName: bucket.name,
        lowRate: Math.round((lowCount / n) * 1000) / 10,
        passRate: Math.round((passCount / n) * 1000) / 10,
        excellentRate: Math.round((excellentCount / n) * 1000) / 10,
        sampleCount: n,
      });
    }

    items.sort((a, b) => b.lowRate - a.lowRate);
    return items;
  }

  /** 相邻两场考试进退步榜（按总分名次变化） */
  private buildRankMovers(
    exams: Array<{ id: number; name: string }>,
    threshold: number,
  ): AnalysisOverviewView['rankMovers'] {
    if (exams.length < 2) {
      return {
        prevExamId: null,
        prevExamName: null,
        currExamId: null,
        currExamName: null,
        improve: [],
        decline: [],
      };
    }
    const prev = exams[exams.length - 2];
    const curr = exams[exams.length - 1];
    const prevRanks = this.rankByTotal(prev.id);
    const currRanks = this.rankByTotal(curr.id);

    const movers: RankMoverItem[] = [];
    for (const [studentId, currInfo] of currRanks) {
      const prevInfo = prevRanks.get(studentId);
      if (!prevInfo) continue;
      const delta = prevInfo.rank - currInfo.rank;
      if (Math.abs(delta) < threshold) continue;
      movers.push({
        studentId,
        studentNo: currInfo.studentNo,
        name: currInfo.name,
        prevRank: prevInfo.rank,
        currRank: currInfo.rank,
        delta,
        currTotal: currInfo.total,
      });
    }

    const improve = movers
      .filter((m) => m.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 10);
    const decline = movers
      .filter((m) => m.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 10);

    return {
      prevExamId: prev.id,
      prevExamName: prev.name,
      currExamId: curr.id,
      currExamName: curr.name,
      improve,
      decline,
    };
  }

  /** 考试总分竞赛排名 */
  private rankByTotal(examId: number): Map<
    number,
    { rank: number; total: number; name: string; studentNo: string }
  > {
    const totals = this.analysisRepository.listStudentTotals(examId);
    const sorted = [...totals].sort((a, b) => {
      if (b.total_score !== a.total_score) return b.total_score - a.total_score;
      return a.student_id - b.student_id;
    });
    const map = new Map<
      number,
      { rank: number; total: number; name: string; studentNo: string }
    >();
    let index = 0;
    while (index < sorted.length) {
      const rank = index + 1;
      const score = sorted[index].total_score;
      let end = index;
      while (end < sorted.length && sorted[end].total_score === score) {
        const row = sorted[end];
        map.set(row.student_id, {
          rank,
          total: row.total_score,
          name: row.name,
          studentNo: row.student_no,
        });
        end += 1;
      }
      index = end;
    }
    return map;
  }

  /** 解析 grade_ref 中的年级总分均分（若有） */
  private parseGradeAvg(gradeRef: string | null): number | null {
    if (!gradeRef?.trim()) return null;
    try {
      const parsed: unknown = JSON.parse(gradeRef);
      if (typeof parsed !== 'object' || parsed === null) return null;
      const obj = parsed as Record<string, unknown>;
      const avg = obj.totalAvg ?? obj.gradeAvg ?? obj.avg;
      if (typeof avg === 'number' && !Number.isNaN(avg)) return avg;
      if (typeof avg === 'string') {
        const n = Number(avg);
        return Number.isNaN(n) ? null : n;
      }
      return null;
    } catch {
      return null;
    }
  }
}
