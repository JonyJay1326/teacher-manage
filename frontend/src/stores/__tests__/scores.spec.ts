import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Exam, ExamScoreRow, Subject, SubjectScoreCell } from '@/types';

const listExamsApi = vi.fn();
const listSubjectsApi = vi.fn();
const listTermsApi = vi.fn();
const getExamMatrixApi = vi.fn();

vi.mock('@/api/scores', () => ({
  listExamsApi: (...a: unknown[]) => listExamsApi(...a),
  listSubjectsApi: (...a: unknown[]) => listSubjectsApi(...a),
  listTermsApi: (...a: unknown[]) => listTermsApi(...a),
  getExamMatrixApi: (...a: unknown[]) => getExamMatrixApi(...a),
}));

import { useScoresStore } from '../scores';

const SUBJECTS: Subject[] = [
  { id: 1, code: 'yu', name: '语文', fullScore: 120 },
  { id: 2, code: 'shu', name: '数学', fullScore: 120 },
];

function exam(id: number, name: string, date: string): Exam {
  return { id, name, examType: '月考', examDate: date, subjectIds: [1, 2], status: '已发布' };
}

function cell(score: number | null, status: SubjectScoreCell['status'] = 'normal'): SubjectScoreCell {
  return { score, status, classRank: null };
}

/** 造一行成绩：subjectScores 用分数数组填充 */
function row(
  studentId: number,
  scores: Array<number | null>,
  opts: { absent?: number[] } = {},
): ExamScoreRow {
  const absent = opts.absent ?? [];
  const subjectScores: Record<number, SubjectScoreCell> = {};
  SUBJECTS.forEach((s, i) => {
    subjectScores[s.id] = absent.includes(i)
      ? cell(null, 'absent')
      : cell(scores[i] ?? null, scores[i] === null ? 'empty' : 'normal');
  });
  return {
    studentId,
    studentNo: `S${studentId}`,
    name: `生${studentId}`,
    subjectScores,
    totalScore: null,
    totalRank: null,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  listExamsApi.mockReset();
  listSubjectsApi.mockReset();
  listTermsApi.mockReset();
  getExamMatrixApi.mockReset();
});

describe('scores store · 考试列表', () => {
  it('按考试日期倒序排列', async () => {
    listExamsApi.mockResolvedValue([
      exam(1, '期中考试', '2025-11-15'),
      exam(2, '期末考试', '2026-01-10'),
      exam(3, '十月月考', '2025-10-20'),
    ]);
    const store = useScoresStore();
    await store.loadExams();
    expect(store.sortedExams.map((e) => e.id)).toEqual([2, 1, 3]);
  });

  it('默认选中最近一场（日期最大者）', async () => {
    listExamsApi.mockResolvedValue([
      exam(1, '期中考试', '2025-11-15'),
      exam(2, '期末考试', '2026-01-10'),
    ]);
    const store = useScoresStore();
    await store.loadExams();
    expect(store.selectedExamId).toBe(2);
  });

  it('空考试列表时 selectedExamId 为 null', async () => {
    listExamsApi.mockResolvedValue([]);
    const store = useScoresStore();
    await store.loadExams();
    expect(store.selectedExamId).toBeNull();
  });

  it('已加载时不重复请求', async () => {
    listExamsApi.mockResolvedValue([exam(1, '期中', '2025-11-15')]);
    const store = useScoresStore();
    await store.loadExams();
    await store.loadExams();
    expect(listExamsApi).toHaveBeenCalledTimes(1);
  });

  it('force=true 刷新后保留用户已选的考试（不被打回最新一场）', async () => {
    listExamsApi.mockResolvedValue([exam(1, '期中', '2025-11-15'), exam(2, '期末', '2026-01-10')]);
    const store = useScoresStore();
    await store.loadExams();
    await store.selectExam(1);
    expect(store.selectedExamId).toBe(1);
    // 列表刷新（新增了更新的考试），用户所选仍存在 → 必须保持不变
    listExamsApi.mockResolvedValue([
      exam(1, '期中', '2025-11-15'),
      exam(2, '期末', '2026-01-10'),
      exam(3, '期末二', '2026-07-01'),
    ]);
    await store.loadExams(true);
    expect(listExamsApi).toHaveBeenCalledTimes(2);
    expect(store.selectedExamId).toBe(1);
  });

  it('当前选中的考试被删除后回落到最近一场', async () => {
    listExamsApi.mockResolvedValue([exam(1, '期中', '2025-11-15'), exam(2, '期末', '2026-01-10')]);
    const store = useScoresStore();
    await store.loadExams();
    expect(store.selectedExamId).toBe(2);
    listExamsApi.mockResolvedValue([exam(1, '期中', '2025-11-15')]);
    await store.loadExams(true);
    expect(store.selectedExamId).toBe(1);
  });

  it('加载失败时向上抛出（不静默）', async () => {
    listExamsApi.mockRejectedValue(new Error('boom'));
    const store = useScoresStore();
    await expect(store.loadExams()).rejects.toThrow('boom');
    expect(store.examsLoading).toBe(false);
  });

  it('科目与学期同样只加载一次', async () => {
    listSubjectsApi.mockResolvedValue(SUBJECTS);
    listTermsApi.mockResolvedValue([{ id: 1, name: 'T1' }]);
    const store = useScoresStore();
    await store.loadSubjects();
    await store.loadSubjects();
    await store.loadTerms();
    await store.loadTerms();
    expect(listSubjectsApi).toHaveBeenCalledTimes(1);
    expect(listTermsApi).toHaveBeenCalledTimes(1);
    expect(store.subjects).toHaveLength(2);
  });
});

describe('scores store · 矩阵缓存', () => {
  it('同一考试只请求一次矩阵', async () => {
    listExamsApi.mockResolvedValue([exam(1, '期中', '2025-11-15')]);
    getExamMatrixApi.mockResolvedValue({ subjects: SUBJECTS, rows: [] });
    const store = useScoresStore();
    await store.loadExams();
    await store.ensureMatrix(1);
    await store.ensureMatrix(1);
    expect(getExamMatrixApi).toHaveBeenCalledTimes(1);
  });

  it('不同考试分别缓存', async () => {
    listExamsApi.mockResolvedValue([exam(1, 'A', '2025-01-01'), exam(2, 'B', '2025-06-01')]);
    getExamMatrixApi.mockResolvedValue({ subjects: SUBJECTS, rows: [] });
    const store = useScoresStore();
    await store.loadExams();
    await store.ensureMatrix(1);
    await store.ensureMatrix(2);
    expect(getExamMatrixApi).toHaveBeenCalledTimes(2);
  });

  it('selectExam 会写入 selectedExamId 并预取矩阵', async () => {
    listExamsApi.mockResolvedValue([exam(1, 'A', '2025-01-01'), exam(2, 'B', '2025-06-01')]);
    getExamMatrixApi.mockResolvedValue({ subjects: SUBJECTS, rows: [] });
    const store = useScoresStore();
    await store.loadExams();
    await store.selectExam(1);
    expect(store.selectedExamId).toBe(1);
    expect(getExamMatrixApi).toHaveBeenCalledWith(1);
  });

  it('selectExam(null) 不请求矩阵', async () => {
    listExamsApi.mockResolvedValue([exam(1, 'A', '2025-01-01')]);
    const store = useScoresStore();
    await store.loadExams();
    await store.selectExam(null);
    expect(store.selectedExamId).toBeNull();
    expect(getExamMatrixApi).not.toHaveBeenCalled();
  });
});

describe('scores store · 某生成绩汇总', () => {
  beforeEach(() => {
    listExamsApi.mockResolvedValue([exam(1, '期末考试', '2026-01-10')]);
  });

  it('总分与班排按竞赛排名计算', async () => {
    getExamMatrixApi.mockResolvedValue({
      subjects: SUBJECTS,
      rows: [row(1, [110, 100]), row(2, [100, 90])],
    });
    const store = useScoresStore();
    await store.loadExams();
    const sum = await store.getStudentSummary(1, 1);
    expect(sum!.totalScore).toBe(210);
    expect(sum!.totalRank).toBe(1);
  });

  it('班排反映真实名次而非行序', async () => {
    getExamMatrixApi.mockResolvedValue({
      subjects: SUBJECTS,
      rows: [row(1, [80, 70]), row(2, [100, 90])],
    });
    const store = useScoresStore();
    await store.loadExams();
    const sum = await store.getStudentSummary(1, 1);
    expect(sum!.totalRank).toBe(2);
  });

  it('总分相同者同名次，下一名跳过空位', async () => {
    getExamMatrixApi.mockResolvedValue({
      subjects: SUBJECTS,
      rows: [row(1, [100, 100]), row(2, [100, 100]), row(3, [80, 80])],
    });
    const store = useScoresStore();
    await store.loadExams();
    expect((await store.getStudentSummary(1, 1))!.totalRank).toBe(1);
    expect((await store.getStudentSummary(2, 1))!.totalRank).toBe(1);
    expect((await store.getStudentSummary(3, 1))!.totalRank).toBe(3);
  });

  it('缺考科目不计入总分', async () => {
    getExamMatrixApi.mockResolvedValue({
      subjects: SUBJECTS,
      rows: [row(1, [110, null], { absent: [1] }), row(2, [100, 90])],
    });
    const store = useScoresStore();
    await store.loadExams();
    const sum = await store.getStudentSummary(1, 1);
    expect(sum!.totalScore).toBe(110);
  });

  it('全缺考学生总分与班排均为 null', async () => {
    getExamMatrixApi.mockResolvedValue({
      subjects: SUBJECTS,
      rows: [row(1, [null, null], { absent: [0, 1] }), row(2, [100, 90])],
    });
    const store = useScoresStore();
    await store.loadExams();
    const sum = await store.getStudentSummary(1, 1);
    expect(sum!.totalScore).toBeNull();
    expect(sum!.totalRank).toBeNull();
  });

  it('空缺（未录）不计入总分', async () => {
    getExamMatrixApi.mockResolvedValue({
      subjects: SUBJECTS,
      rows: [row(1, [110, null]), row(2, [100, 90])],
    });
    const store = useScoresStore();
    await store.loadExams();
    expect((await store.getStudentSummary(1, 1))!.totalScore).toBe(110);
  });

  it('班均分按科目计算', async () => {
    getExamMatrixApi.mockResolvedValue({
      subjects: SUBJECTS,
      rows: [row(1, [100, 90]), row(2, [80, 70]), row(3, [null, null], { absent: [0, 1] })],
    });
    const store = useScoresStore();
    await store.loadExams();
    const sum = await store.getStudentSummary(1, 1);
    expect(sum!.classAvgs[1]).toBe(90);
    expect(sum!.classAvgs[2]).toBe(80);
  });

  it('缺考的科目不拉低班均', async () => {
    getExamMatrixApi.mockResolvedValue({
      subjects: SUBJECTS,
      rows: [row(1, [100, 90]), row(2, [100, 90]), row(3, [null, 50], { absent: [0] })],
    });
    const store = useScoresStore();
    await store.loadExams();
    expect((await store.getStudentSummary(1, 1))!.classAvgs[1]).toBe(100);
  });

  it('某科全缺考时班均为 0（前端显示为 —）', async () => {
    getExamMatrixApi.mockResolvedValue({
      subjects: SUBJECTS,
      rows: [row(1, [100, null], { absent: [1] }), row(2, [80, null], { absent: [1] })],
    });
    const store = useScoresStore();
    await store.loadExams();
    expect((await store.getStudentSummary(1, 1))!.classAvgs[2]).toBe(0);
  });

  it('examId 为 null 时返回 null', async () => {
    const store = useScoresStore();
    await store.loadExams();
    expect(await store.getStudentSummary(1, null)).toBeNull();
  });

  it('学生不在矩阵中时返回空科目映射', async () => {
    getExamMatrixApi.mockResolvedValue({ subjects: SUBJECTS, rows: [row(1, [100, 90])] });
    const store = useScoresStore();
    await store.loadExams();
    const sum = await store.getStudentSummary(999, 1);
    expect(sum!.scores).toEqual({ 1: cell(null, 'empty'), 2: cell(null, 'empty') });
    expect(sum!.totalScore).toBeNull();
  });

  it('examId 不在考试列表中时返回 null', async () => {
    const store = useScoresStore();
    await store.loadExams();
    expect(await store.getStudentSummary(1, 999)).toBeNull();
  });

  it('返回的 subjects 来自矩阵而非考试配置', async () => {
    getExamMatrixApi.mockResolvedValue({ subjects: SUBJECTS, rows: [row(1, [100, 90])] });
    const store = useScoresStore();
    await store.loadExams();
    expect((await store.getStudentSummary(1, 1))!.subjects).toHaveLength(2);
  });

  it('小数总分保留两位', async () => {
    getExamMatrixApi.mockResolvedValue({
      subjects: SUBJECTS,
      rows: [row(1, [77.5, 82.25])],
    });
    const store = useScoresStore();
    await store.loadExams();
    expect((await store.getStudentSummary(1, 1))!.totalScore).toBe(159.75);
  });

  it('matrixLoading 在请求后复位', async () => {
    getExamMatrixApi.mockResolvedValue({ subjects: SUBJECTS, rows: [] });
    const store = useScoresStore();
    await store.loadExams();
    await store.ensureMatrix(1);
    expect(store.matrixLoading).toBe(false);
  });
});

describe('scores store · 矩阵缓存失效', () => {
  it('invalidateMatrix(指定) 只清该场考试', async () => {
    listExamsApi.mockResolvedValue([exam(1, 'A', '2025-01-01'), exam(2, 'B', '2025-06-01')]);
    getExamMatrixApi.mockResolvedValue({ subjects: SUBJECTS, rows: [] });
    const store = useScoresStore();
    await store.loadExams();
    await store.ensureMatrix(1);
    await store.ensureMatrix(2);
    expect(Object.keys(store.matrixByExamId).sort()).toEqual(['1', '2']);

    store.invalidateMatrix(1);
    expect(Object.keys(store.matrixByExamId)).toEqual(['2']);
  });

  it('失效后 ensureMatrix 会重新请求', async () => {
    listExamsApi.mockResolvedValue([exam(1, 'A', '2025-01-01')]);
    getExamMatrixApi.mockResolvedValue({ subjects: SUBJECTS, rows: [] });
    const store = useScoresStore();
    await store.loadExams();
    await store.ensureMatrix(1);
    expect(getExamMatrixApi).toHaveBeenCalledTimes(1);

    store.invalidateMatrix(1);
    await store.ensureMatrix(1);
    expect(getExamMatrixApi).toHaveBeenCalledTimes(2);
  });

  it('invalidateMatrix() 无参清空全部', async () => {
    listExamsApi.mockResolvedValue([exam(1, 'A', '2025-01-01'), exam(2, 'B', '2025-06-01')]);
    getExamMatrixApi.mockResolvedValue({ subjects: SUBJECTS, rows: [] });
    const store = useScoresStore();
    await store.loadExams();
    await store.ensureMatrix(1);
    await store.ensureMatrix(2);

    store.invalidateMatrix();
    expect(store.matrixByExamId).toEqual({});
  });

  it('失效不存在的考试不报错、也不误清其它', async () => {
    listExamsApi.mockResolvedValue([exam(1, 'A', '2025-01-01')]);
    getExamMatrixApi.mockResolvedValue({ subjects: SUBJECTS, rows: [] });
    const store = useScoresStore();
    await store.loadExams();
    await store.ensureMatrix(1);

    store.invalidateMatrix(999);
    expect(Object.keys(store.matrixByExamId)).toEqual(['1']);
  });

  it('成绩变化并失效后 getStudentSummary 返回新数据', async () => {
    listExamsApi.mockResolvedValue([exam(1, '期末', '2026-01-10')]);
    getExamMatrixApi.mockResolvedValue({
      subjects: SUBJECTS,
      rows: [row(1, [100, 90])],
    });
    const store = useScoresStore();
    await store.loadExams();
    const before = await store.getStudentSummary(1, 1);
    expect(before!.totalScore).toBe(190);

    // 模拟保存后服务端数据变化 + 缓存失效
    getExamMatrixApi.mockResolvedValue({
      subjects: SUBJECTS,
      rows: [row(1, [60, 50])],
    });
    store.invalidateMatrix(1);
    const after = await store.getStudentSummary(1, 1);
    expect(after!.totalScore).toBe(110);
  });
});
