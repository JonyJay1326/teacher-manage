import { describe, expect, it } from 'vitest';
import { ReportsService } from './reports.service';
import type {
  ReportCommentRow,
  ReportExamRow,
  ReportScoreRow,
  ReportStudentRow,
  ReportSubjectRow,
} from './reports.repository';

/** 用可控的假仓储驱动 buildCard，聚焦总分/班排/展示口径 */

const EXAM: ReportExamRow = {
  id: 1,
  name: '期末考试',
  exam_date: '2026-01-10',
  term_name: '2026-2027 第一学期',
};

const SUBJECTS: ReportSubjectRow[] = [
  { id: 1, name: '语文', full_score: 120, sort: 1 },
  { id: 2, name: '数学', full_score: 120, sort: 2 },
  { id: 3, name: '体育', full_score: 100, sort: 3 },
];

function student(id: number, no: string, name: string): ReportStudentRow {
  return { id, student_no: no, name };
}

/** 造 service：注入固定数据 */
function make(overrides: {
  scores?: ReportScoreRow[];
  totals?: Array<{ student_id: number; total: number }>;
  subjects?: ReportSubjectRow[];
  comment?: ReportCommentRow | undefined;
} = {}): ReportsService {
  const scores = overrides.scores ?? [
    { subject_id: 1, subject_name: '语文', full_score: 120, score: 100, status: '正常', class_rank: 1 },
    { subject_id: 2, subject_name: '数学', full_score: 120, score: 90, status: '正常', class_rank: 3 },
    { subject_id: 3, subject_name: '体育', full_score: 100, score: null, status: '缺考', class_rank: null },
  ];
  const totals = overrides.totals ?? [
    { student_id: 1, total: 190 },
    { student_id: 2, total: 200 },
    { student_id: 3, total: 150 },
  ];
  const repo = {
    listExamSubjects: () => overrides.subjects ?? SUBJECTS,
    listStudentScores: () => scores,
    listTotals: () => totals,
    findExamTermId: () => 1,
    findLatestComment: () => overrides.comment,
  };
  return new ReportsService(repo as never, { get: () => '' } as never, {
    insert: () => 1,
  } as never);
}

describe('ReportsService.buildCard — 总分口径', () => {
  it('只累加正常且有分的科目', () => {
    const card = make().buildCard(student(1, 'S1', '甲'), EXAM);
    // 100 + 90，体育缺考不计
    expect(card.totalScore).toBe(190);
  });

  it('全缺考时总分为 null', () => {
    const svc = make({
      scores: [
        { subject_id: 1, subject_name: '语文', full_score: 120, score: null, status: '缺考', class_rank: null },
        { subject_id: 2, subject_name: '数学', full_score: 120, score: null, status: '免考', class_rank: null },
      ],
      totals: [],
    });
    const card = svc.buildCard(student(1, 'S1', '甲'), EXAM);
    expect(card.totalScore).toBeNull();
    expect(card.totalRank).toBeNull();
  });

  it('小数总分保留两位', () => {
    const svc = make({
      scores: [
        { subject_id: 1, subject_name: '语文', full_score: 120, score: 77.5, status: '正常', class_rank: 1 },
        { subject_id: 2, subject_name: '数学', full_score: 120, score: 82.25, status: '正常', class_rank: 2 },
      ],
      totals: [{ student_id: 1, total: 159.75 }],
    });
    expect(svc.buildCard(student(1, 'S1', '甲'), EXAM).totalScore).toBe(159.75);
  });

  it('浮点累加无累积误差', () => {
    const svc = make({
      scores: [
        { subject_id: 1, subject_name: '语文', full_score: 120, score: 0.1, status: '正常', class_rank: 1 },
        { subject_id: 2, subject_name: '数学', full_score: 120, score: 0.2, status: '正常', class_rank: 2 },
      ],
      totals: [{ student_id: 1, total: 0.3 }],
    });
    expect(svc.buildCard(student(1, 'S1', '甲'), EXAM).totalScore).toBe(0.3);
  });
});

describe('ReportsService.buildCard — 班级排名', () => {
  it('按总分降序给出名次', () => {
    expect(make().buildCard(student(1, 'S1', '甲'), EXAM).totalRank).toBe(2);
  });

  it('并列总分同名次', () => {
    const svc = make({
      totals: [
        { student_id: 2, total: 200 },
        { student_id: 1, total: 190 },
        { student_id: 3, total: 190 },
      ],
    });
    expect(svc.buildCard(student(1, 'S1', '甲'), EXAM).totalRank).toBe(2);
  });

  it('该生不在总分表里时无排名', () => {
    const svc = make({ totals: [{ student_id: 9, total: 100 }] });
    const card = svc.buildCard(student(1, 'S1', '甲'), EXAM);
    expect(card.totalRank).toBeNull();
    expect(card.totalScore).toBe(190);
  });

  it('classSize 取自总分表长度', () => {
    expect(make().buildCard(student(1, 'S1', '甲'), EXAM).classSize).toBe(3);
  });
});

describe('ReportsService.buildCard — 科目展示口径', () => {
  it('缺考显示「缺考」而非空白', () => {
    const card = make().buildCard(student(1, 'S1', '甲'), EXAM);
    expect(card.subjects[2]!.scoreText).toBe('缺考');
  });

  it('免考显示「免考」', () => {
    const svc = make({
      scores: [
        { subject_id: 1, subject_name: '语文', full_score: 120, score: null, status: '免考', class_rank: null },
      ],
    });
    expect(svc.buildCard(student(1, 'S1', '甲'), EXAM).subjects[0]!.scoreText).toBe('免考');
  });

  it('未录入（正常但无分）显示「—」', () => {
    const svc = make({
      scores: [
        { subject_id: 1, subject_name: '语文', full_score: 120, score: null, status: '正常', class_rank: null },
      ],
    });
    expect(svc.buildCard(student(1, 'S1', '甲'), EXAM).subjects[0]!.scoreText).toBe('—');
  });

  it('有正常分时显示数值', () => {
    expect(make().buildCard(student(1, 'S1', '甲'), EXAM).subjects[0]!.scoreText).toBe('100');
  });

  it('非缺考免考的班排显示「第 N 名」', () => {
    const card = make().buildCard(student(1, 'S1', '甲'), EXAM);
    expect(card.subjects[0]!.rankText).toBe('第 1 名');
    expect(card.subjects[2]!.rankText).toBe('—');
  });

  it('低于满分 40% 标记为低分（用于红色高亮）', () => {
    const svc = make({
      scores: [
        { subject_id: 1, subject_name: '语文', full_score: 120, score: 40, status: '正常', class_rank: 20 },
      ],
    });
    const card = svc.buildCard(student(1, 'S1', '甲'), EXAM);
    expect(card.subjects[0]!.isLow).toBe(true);
  });

  it('恰好等于 40% 不算低分', () => {
    const svc = make({
      scores: [
        { subject_id: 1, subject_name: '语文', full_score: 120, score: 48, status: '正常', class_rank: 5 },
      ],
    });
    expect(svc.buildCard(student(1, 'S1', '甲'), EXAM).subjects[0]!.isLow).toBe(false);
  });

  it('缺考科目不会被误判低分', () => {
    const svc = make({
      scores: [
        { subject_id: 1, subject_name: '语文', full_score: 120, score: null, status: '缺考', class_rank: null },
      ],
    });
    expect(svc.buildCard(student(1, 'S1', '甲'), EXAM).subjects[0]!.isLow).toBe(false);
  });

  it('考试科目按 sort 顺序输出', () => {
    const subjects = make().buildCard(student(1, 'S1', '甲'), EXAM).subjects;
    expect(subjects.map((s) => s.name)).toEqual(['语文', '数学', '体育']);
  });

  it('库里缺考的科目也会出现在表中（保证家长看到完整结构）', () => {
    const svc = make({ scores: [] });
    const card = svc.buildCard(student(1, 'S1', '甲'), EXAM);
    expect(card.subjects).toHaveLength(3);
    expect(card.subjects.every((s) => s.scoreText === '缺考')).toBe(true);
  });
});

describe('ReportsService.buildCard — 评语', () => {
  it('无评语时为 null', () => {
    expect(make().buildCard(student(1, 'S1', '甲'), EXAM).comment).toBeNull();
  });

  it('有评语时透传', () => {
    const svc = make({
      comment: { final_text: '本学期表现良好。', comment_type: '期末评语', created_at: '2026-01-11' },
    });
    expect(svc.buildCard(student(1, 'S1', '甲'), EXAM).comment?.final_text).toBe('本学期表现良好。');
  });
});
