/**
 * 演示日历「今天」：2026-11-17 星期二。
 * 与种子学期（2026-2027 学年第一学期）及高二上期中考试对齐，
 * 不跟随真实星期，避免看板「今日」与考试/文档年份错位。
 */
export const DEMO_TODAY_YMD = { year: 2026, month: 11, day: 17 } as const;

/** 演示「今天」的本地正午 Date（避免时区把星期算到前一天） */
export function getDemoToday(): Date {
  return new Date(
    DEMO_TODAY_YMD.year,
    DEMO_TODAY_YMD.month - 1,
    DEMO_TODAY_YMD.day,
    12,
    0,
    0,
  );
}
