/** 学生状态枚举 */
export type StudentStatus = '在读' | '转出' | '休学' | '毕业';

/** 标签敏感级别 */
export type TagSensitiveLevel = 0 | 1 | 2;

/** 标签域 */
export type TagDomain = '学业' | '行为情绪' | '健康' | '家庭' | '特长' | '其他';

/** 标签 */
export interface Tag {
  id: number;
  domain: TagDomain;
  name: string;
  color?: string;
  sensitiveLevel: TagSensitiveLevel;
}

/** 学生 */
export interface Student {
  id: number;
  studentNo: string;
  name: string;
  gender: 0 | 1;
  focusLevel: 0 | 1 | 2 | 3;
  status: StudentStatus;
  cadreRole?: string;
  boardType?: string;
  tagIds: number[];
  photoUrl?: string;
  lastIncidentSummary?: string;
  daysSinceLastContact?: number;
  /** 是否存在 L2 高敏明细（不含内容） */
  hasSensitive?: boolean;
}

/** 科目 */
export interface Subject {
  id: number;
  code: string;
  name: string;
  fullScore: number;
}

/** 考试 */
export interface Exam {
  id: number;
  name: string;
  examType: string;
  examDate: string;
  subjectIds: number[];
  status: string;
}

/** 成绩录入行状态 */
export type ScoreCellStatus = 'normal' | 'absent' | 'exempt' | 'empty';

/** 成绩录入行 */
export interface ScoreEntryRow {
  studentId: number;
  studentNo: string;
  name: string;
  lastScore: number | null;
  currentScore: number | null;
  status: ScoreCellStatus;
}

/** 单科成绩单元格 */
export interface SubjectScoreCell {
  score: number | null;
  status: ScoreCellStatus;
  classRank?: number | null;
}

/** 考试全科成绩行（查看用） */
export interface ExamScoreRow {
  studentId: number;
  studentNo: string;
  name: string;
  subjectScores: Record<number, SubjectScoreCell>;
  totalScore: number | null;
  totalRank: number | null;
}

/** 事件类别 */
export type IncidentCategory =
  | '纪律违纪'
  | '情绪行为'
  | '伤病健康'
  | '家校沟通'
  | '表扬奖励'
  | '学习问题'
  | '其他';

/** 事件 */
export interface Incident {
  id: number;
  occurredAt: string;
  category: IncidentCategory;
  severity: 1 | 2 | 3;
  title: string;
  content?: string;
  draftContent?: string | null;
  studentIds: number[];
  studentNames: string[];
  followUpNeeded: boolean;
  followUpDone: boolean;
  followUpDeadline?: string;
  status: 'draft' | 'confirmed';
}

/** 时间线项类型 */
export type TimelineItemType = 'score' | 'incident' | 'contact' | 'comment' | 'praise';

/** 时间线项 */
export interface TimelineItem {
  id: number;
  type: TimelineItemType;
  occurredAt: string;
  title: string;
  summary: string;
}

/** 待办项 */
export interface TodoItem {
  id: number;
  title: string;
  deadline: string;
  studentNames: string[];
  type: 'follow_up' | 'draft';
}

/** 成绩简报科目统计 */
export interface SubjectBriefStat {
  subjectName: string;
  avgScore: number;
  lowRate: number;
}

/** 导航菜单项 */
export interface NavItem {
  path: string;
  title: string;
  icon: string;
}

/** 导航分组 */
export interface NavGroup {
  label: string;
  items: NavItem[];
}
