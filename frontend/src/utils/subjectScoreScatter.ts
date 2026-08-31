/** 各科成绩气泡散点：按分数聚合同分学生 */

import type { ExamScoreRow, Subject } from '@/types';

/** 同一分数上的气泡 */
export interface ScoreBubble {
  /** 分数 */
  score: number;
  /** 人数 */
  count: number;
  /** 学生姓名（同分列表） */
  names: string[];
}

/** 单科一行分布 */
export interface SubjectScatterRow {
  subjectId: number;
  subjectName: string;
  fullScore: number;
  /** 班均分（仅统计 status=normal 且有分）；无样本为 null */
  avgScore: number | null;
  /** 有效样本数 */
  sampleCount: number;
  bubbles: ScoreBubble[];
}

/**
 * 从考试矩阵生成各科气泡行数据。
 * 仅纳入正常计分；缺考/免考/未录不进分布。
 */
export function buildSubjectScatterRows(
  subjects: Subject[],
  rows: ExamScoreRow[],
): SubjectScatterRow[] {
  return subjects.map((subject) => {
    const nameByScore = new Map<number, string[]>();
    let sum = 0;
    let sampleCount = 0;

    for (const row of rows) {
      const cell = row.subjectScores[subject.id];
      if (!cell || cell.status !== 'normal' || cell.score === null) continue;
      const score = cell.score;
      sum += score;
      sampleCount += 1;
      const list = nameByScore.get(score) ?? [];
      list.push(row.name);
      nameByScore.set(score, list);
    }

    const bubbles: ScoreBubble[] = [...nameByScore.entries()]
      .map(([score, names]) => ({
        score,
        count: names.length,
        names: [...names].sort((a, b) => a.localeCompare(b, 'zh-CN')),
      }))
      .sort((a, b) => a.score - b.score);

    return {
      subjectId: subject.id,
      subjectName: subject.name,
      fullScore: subject.fullScore,
      avgScore: sampleCount > 0 ? Math.round((sum / sampleCount) * 10) / 10 : null,
      sampleCount,
      bubbles,
    };
  });
}

/**
 * 气泡半径：人数越多越大。
 * @param count 同分人数
 */
export function bubbleSymbolSize(count: number): number {
  return Math.min(10 + count * 6, 40);
}
