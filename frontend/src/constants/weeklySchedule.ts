/** 教师周课表（静态；源自纸质课表，9 月 1 日启用） */

/** 单节课单元格 */
export interface ScheduleCell {
  /** 科目/事项 */
  subject: string;
  /** 班级，如 5班；教研/会议可为空 */
  klass?: string;
  /** 附加说明，如 9月 */
  note?: string;
}

/** 课表行类型 */
export type ScheduleRowKind = 'period' | 'morningRead' | 'lunchStudy' | 'extension';

/** 课表行定义 */
export interface ScheduleRowMeta {
  id: string;
  kind: ScheduleRowKind;
  /** 左侧主标签 */
  label: string;
  /** 副标签：上午/下午 */
  subLabel?: string;
  /** 午自习等整行合并文案 */
  fullSpanText?: string;
}

/** 课表科目样式键 */
export type ScheduleKind =
  | 'english'
  | 'research'
  | 'activity'
  | 'meeting'
  | 'classMeeting'
  | 'morningRead'
  | 'extension'
  | 'other';

/** 将科目映射到样式种类 */
export function scheduleKindOf(subject: string): ScheduleKind {
  if (subject.includes('早读')) return 'morningRead';
  if (subject.includes('英语')) return 'english';
  if (subject.includes('教研')) return 'research';
  if (subject.includes('综')) return 'activity';
  if (subject.includes('会议') && !subject.includes('班会')) return 'meeting';
  if (subject.includes('班会')) return 'classMeeting';
  if (subject.includes('延时') || subject.includes('轮流')) return 'extension';
  return 'other';
}

/** 周一到周五列标题 */
export const SCHEDULE_WEEKDAYS = ['一', '二', '三', '四', '五'] as const;

/** 课表行（含早读 / 午自习 / 延时） */
export const SCHEDULE_ROWS: ReadonlyArray<ScheduleRowMeta> = [
  { id: 'morning-read', kind: 'morningRead', label: '早读' },
  { id: 'p1', kind: 'period', label: '1', subLabel: '上午' },
  { id: 'p2', kind: 'period', label: '2', subLabel: '上午' },
  { id: 'p3', kind: 'period', label: '3', subLabel: '上午' },
  { id: 'p4', kind: 'period', label: '4', subLabel: '上午' },
  { id: 'lunch', kind: 'lunchStudy', label: '午自习', fullSpanText: '先3后5' },
  { id: 'p5', kind: 'period', label: '5', subLabel: '下午' },
  { id: 'p6', kind: 'period', label: '6', subLabel: '下午' },
  { id: 'p7', kind: 'period', label: '7', subLabel: '下午' },
  { id: 'p8', kind: 'period', label: '8', subLabel: '下午' },
  { id: 'extension', kind: 'extension', label: '延时' },
];

/** @deprecated 兼容旧引用：仅正课 1–8 节 */
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

/**
 * cells[rowIndex][dayIndex 0-4]
 * dayIndex: 0=周一 … 4=周五
 */
export const WEEKLY_SCHEDULE: ReadonlyArray<ReadonlyArray<ScheduleCell | null>> = [
  // 早读
  [
    { subject: '早读', klass: '5班' },
    { subject: '早读', klass: '3班' },
    { subject: '早读', klass: '5班' },
    { subject: '早读', klass: '3班' },
    { subject: '早读', klass: '5班' },
  ],
  // 第 1 节
  [
    { subject: '英语', klass: '5班' },
    { subject: '英语', klass: '3班' },
    null,
    { subject: '英语', klass: '5班' },
    null,
  ],
  // 第 2 节
  [
    null,
    { subject: '英语', klass: '5班' },
    { subject: '教研' },
    { subject: '英语', klass: '3班' },
    { subject: '英语', klass: '5班' },
  ],
  // 第 3 节
  [
    { subject: '英语', klass: '3班' },
    null,
    { subject: '英语', klass: '3班' },
    null,
    null,
  ],
  // 第 4 节
  [
    null,
    null,
    { subject: '英语', klass: '5班' },
    null,
    { subject: '英语', klass: '3班' },
  ],
  // 午自习（整行合并，cells 仅占位）
  [null, null, null, null, null],
  // 第 5 节
  [null, null, { subject: '教研' }, null, null],
  // 第 6 节
  [{ subject: '会议' }, null, null, null, null],
  // 第 7 节
  [null, { subject: '班会' }, null, null, null],
  // 第 8 节
  [
    { subject: '英语', klass: '5班' },
    null,
    { subject: '英语', klass: '3班' },
    null,
    { subject: '英语', klass: '5班' },
  ],
  // 延时
  [
    { subject: '延时', klass: '3班' },
    null,
    { subject: '延时', klass: '5班', note: '9月' },
    { subject: '延时', klass: '5班' },
    { subject: '轮流' },
  ],
];

/** 行左侧展示标签 */
export function scheduleRowLabel(row: ScheduleRowMeta): string {
  return row.label;
}

/** 今日事项在 chip 上显示的时段名 */
export function scheduleSlotLabel(row: ScheduleRowMeta): string {
  if (row.kind === 'morningRead') return '早读';
  if (row.kind === 'lunchStudy') return '午自习';
  if (row.kind === 'extension') return '延时';
  return `第${row.label}节`;
}

/** JS getDay()：0 周日 … 6 周六 → 课表列（周一=0）；周末返回 -1 */
export function scheduleDayIndex(date = new Date()): number {
  const d = date.getDay();
  if (d === 0 || d === 6) return -1;
  return d - 1;
}
