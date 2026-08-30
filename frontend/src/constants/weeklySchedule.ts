/** 教师周课表（静态；源自纸质课表，9 月 1 日启用） */

/** 单节课单元格 */
export interface ScheduleCell {
  /** 科目/事项 */
  subject: string;
  /** 班级，如 初一-5；教研/会议可为空 */
  klass?: string;
}

/** 课表科目样式键 */
export type ScheduleKind = 'english' | 'research' | 'activity' | 'meeting' | 'classMeeting' | 'other';

/** 将科目映射到样式种类 */
export function scheduleKindOf(subject: string): ScheduleKind {
  if (subject.includes('英语')) return 'english';
  if (subject.includes('教研')) return 'research';
  if (subject.includes('综')) return 'activity';
  if (subject.includes('会议') && !subject.includes('班会')) return 'meeting';
  if (subject.includes('班会')) return 'classMeeting';
  return 'other';
}

/** 节次定义 */
export const SCHEDULE_PERIODS: ReadonlyArray<{ period: number; slot: '上午' | '下午' }> = [
  { period: 1, slot: '上午' },
  { period: 2, slot: '上午' },
  { period: 3, slot: '上午' },
  { period: 4, slot: '上午' },
  { period: 5, slot: '下午' },
  { period: 6, slot: '下午' },
  { period: 7, slot: '下午' },
  { period: 8, slot: '下午' },
];

/** 周一到周五列标题 */
export const SCHEDULE_WEEKDAYS = ['一', '二', '三', '四', '五'] as const;

/**
 * cells[periodIndex 0-7][dayIndex 0-4]
 * dayIndex: 0=周一 … 4=周五
 */
export const WEEKLY_SCHEDULE: ReadonlyArray<ReadonlyArray<ScheduleCell | null>> = [
  // 第 1 节
  [
    { subject: '英语', klass: '初一-5' },
    { subject: '英语', klass: '初一-3' },
    null,
    { subject: '英语', klass: '初一-5' },
    null,
  ],
  // 第 2 节
  [
    null,
    { subject: '英语', klass: '初一-5' },
    { subject: '教研' },
    { subject: '英语', klass: '初一-3' },
    { subject: '综1', klass: '初一-5' },
  ],
  // 第 3 节
  [
    { subject: '英语', klass: '初一-3' },
    null,
    { subject: '综1', klass: '初一-3' },
    null,
    null,
  ],
  // 第 4 节
  [
    null,
    null,
    { subject: '英语', klass: '初一-5' },
    null,
    { subject: '英语', klass: '初一-3' },
  ],
  // 第 5 节
  [null, null, { subject: '教研' }, null, null],
  // 第 6 节
  [{ subject: '会议' }, null, null, null, null],
  // 第 7 节
  [null, { subject: '班会', klass: '初一-5' }, null, null, null],
  // 第 8 节
  [null, null, null, null, null],
];

/** JS getDay()：0 周日 … 6 周六 → 课表列（周一=0）；周末返回 -1 */
export function scheduleDayIndex(date = new Date()): number {
  const d = date.getDay();
  if (d === 0 || d === 6) return -1;
  return d - 1;
}
