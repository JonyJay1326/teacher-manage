import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  getExamMatrixApi,
  listExamsApi,
  listSubjectsApi,
  listTermsApi,
  type TermDto,
} from '@/api/scores';
import type { Exam, ExamScoreRow, Subject, SubjectScoreCell } from '@/types';

/** 某场考试下单个学生的成绩汇总（含内存计算的总分/总排与班均） */
export interface ExamScoreSummary {
  exam: Exam;
  subjects: Subject[];
  scores: Record<number, SubjectScoreCell>;
  totalScore: number | null;
  totalRank: number | null;
  classAvgs: Record<number, number>;
}

/** 成绩域共享数据源：考试列表、科目、学期与当前考试矩阵 */

/** 按考试日期倒序排列考试列表 */
function sortExamsByDateDesc(exams: Exam[]): Exam[] {
  return [...exams].sort((a, b) =>
    (b.examDate || '').localeCompare(a.examDate || ''),
  );
}

/** 构造空科目成绩映射 */
function buildEmptySubjectScores(
  subjects: Subject[],
): Record<number, SubjectScoreCell> {
  const scores: Record<number, SubjectScoreCell> = {};
  for (const subject of subjects) {
    scores[subject.id] = { score: null, status: 'empty', classRank: null };
  }
  return scores;
}

/** 汇总单行各科正常分总分 */
function sumRowTotalScore(
  subjects: Subject[],
  scores: Record<number, SubjectScoreCell>,
): number | null {
  let total = 0;
  let hasNormal = false;
  for (const subject of subjects) {
    const cell = scores[subject.id];
    if (cell && cell.status === 'normal' && cell.score !== null) {
      total += cell.score;
      hasNormal = true;
    }
  }
  if (!hasNormal) return null;
  return Math.round(total * 100) / 100;
}

/** 竞赛式排名（并列同名次，下一名跳过空位） */
function assignCompetitionRanks(
  items: Array<{ id: number; score: number }>,
): Map<number, number> {
  const sorted = [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id - b.id;
  });
  const ranks = new Map<number, number>();
  let index = 0;
  while (index < sorted.length) {
    const rank = index + 1;
    const score = sorted[index]!.score;
    let end = index;
    while (end < sorted.length && sorted[end]!.score === score) {
      ranks.set(sorted[end]!.id, rank);
      end += 1;
    }
    index = end;
  }
  return ranks;
}

/** 计算科目班均分 */
function calcClassAvgs(
  subjects: Subject[],
  rows: Array<{ subjectScores: Record<number, SubjectScoreCell> }>,
): Record<number, number> {
  const result: Record<number, number> = {};
  for (const subject of subjects) {
    const nums: number[] = [];
    for (const row of rows) {
      const cell = row.subjectScores[subject.id];
      if (cell && cell.status === 'normal' && cell.score !== null) {
        nums.push(cell.score);
      }
    }
    result[subject.id] =
      nums.length > 0 ? nums.reduce((sum, n) => sum + n, 0) / nums.length : 0;
  }
  return result;
}

/** 根据矩阵各科成绩重算该生总分与班排（避免依赖接口聚合字段展示异常） */
function resolveStudentTotalAndRank(
  subjects: Subject[],
  rows: ExamScoreRow[],
  targetStudentId: number,
): {
  scores: Record<number, SubjectScoreCell>;
  totalScore: number | null;
  totalRank: number | null;
} {
  const withTotals = rows.map((row) => ({
    studentId: row.studentId,
    scores: row.subjectScores,
    totalScore: sumRowTotalScore(subjects, row.subjectScores),
  }));
  const eligible = withTotals
    .filter((row) => row.totalScore !== null)
    .map((row) => ({ id: row.studentId, score: row.totalScore as number }));
  const rankMap = assignCompetitionRanks(eligible);
  const mine = withTotals.find((row) => row.studentId === targetStudentId);
  if (!mine) {
    return {
      scores: buildEmptySubjectScores(subjects),
      totalScore: null,
      totalRank: null,
    };
  }
  return {
    scores: mine.scores,
    totalScore: mine.totalScore,
    totalRank:
      mine.totalScore !== null ? (rankMap.get(targetStudentId) ?? null) : null,
  };
}

/**
 * 成绩域唯一数据源。
 * 学生详情「成绩」tab 与考试管理页共享考试列表，
 * 避免两个页面各自持有一份导致切换后状态不同步。
 */
export const useScoresStore = defineStore('scores', () => {
  const exams = ref<Exam[]>([]);
  const subjects = ref<Subject[]>([]);
  const terms = ref<TermDto[]>([]);
  const examsLoading = ref(false);

  /** 当前选中的考试 ID（跨页共享，学生详情与考试详情保持一致） */
  const selectedExamId = ref<number | null>(null);
  /** 当前考试矩阵（按 examId 缓存，避免同一场考试重复请求） */
  const matrixByExamId = ref<Record<number, {
    subjects: Subject[];
    rows: ExamScoreRow[];
  }>>({});
  const matrixLoading = ref(false);

  /** 考试列表（按日期倒序） */
  const sortedExams = computed(() => sortExamsByDateDesc(exams.value));

  /**
   * 加载考试列表。
   * 已选中且仍存在的考试会被保留（用户手选的考试不应被刷新打回最新一场）；
   * 仅当没有选中、或选中的已删除时，才回落到最近一场。
   */
  async function loadExams(force = false): Promise<void> {
    if (!force && exams.value.length > 0) return;
    examsLoading.value = true;
    try {
      exams.value = await listExamsApi();
      const current = selectedExamId.value;
      const keepCurrent =
        current !== null && exams.value.some((e) => e.id === current);
      if (!keepCurrent) {
        const first = sortExamsByDateDesc(exams.value)[0];
        selectedExamId.value = first ? first.id : null;
      }
    } finally {
      examsLoading.value = false;
    }
  }

  /** 加载启用科目（已加载时不重复请求） */
  async function loadSubjects(): Promise<void> {
    if (subjects.value.length > 0) return;
    subjects.value = await listSubjectsApi();
  }

  /** 加载学期（已加载时不重复请求） */
  async function loadTerms(): Promise<void> {
    if (terms.value.length > 0) return;
    terms.value = await listTermsApi();
  }

  /** 选中某场考试（同一考试不重复请求矩阵） */
  async function selectExam(examId: number | null): Promise<void> {
    selectedExamId.value = examId;
    if (examId === null) return;
    await ensureMatrix(examId);
  }

  /** 确保某场考试的矩阵已加载 */
  async function ensureMatrix(examId: number): Promise<void> {
    if (matrixByExamId.value[examId]) return;
    matrixLoading.value = true;
    try {
      const matrix = await getExamMatrixApi(examId);
      matrixByExamId.value = { ...matrixByExamId.value, [examId]: matrix };
    } finally {
      matrixLoading.value = false;
    }
  }

  /** 某生在某场考试下的成绩汇总（含总分、总排、班均） */
  async function getStudentSummary(
    studentId: number,
    examId: number | null,
  ): Promise<ExamScoreSummary | null> {
    if (examId === null) return null;
    const exam = exams.value.find((item) => item.id === examId);
    if (!exam) return null;
    await ensureMatrix(examId);
    const matrix = matrixByExamId.value[examId];
    if (!matrix) return null;
    const resolved = resolveStudentTotalAndRank(
      matrix.subjects,
      matrix.rows,
      studentId,
    );
    return {
      exam,
      subjects: matrix.subjects,
      scores: resolved.scores,
      totalScore: resolved.totalScore,
      totalRank: resolved.totalRank,
      classAvgs: calcClassAvgs(matrix.subjects, matrix.rows),
    };
  }

  /**
   * 使矩阵缓存失效。
   * 成绩被写入（录入保存 / Excel 导入 / 重算排名）或考试被删除后必须调用，
   * 否则「学生详情-成绩」等读缓存的页面会一直看到旧数据。
   *
   * @param examId 指定考试；省略则清空全部
   */
  function invalidateMatrix(examId?: number): void {
    if (examId === undefined) {
      matrixByExamId.value = {};
      return;
    }
    if (!(examId in matrixByExamId.value)) return;
    const next = { ...matrixByExamId.value };
    delete next[examId];
    matrixByExamId.value = next;
  }

  return {
    exams,
    subjects,
    terms,
    examsLoading,
    selectedExamId,
    matrixByExamId,
    matrixLoading,
    sortedExams,
    loadExams,
    loadSubjects,
    loadTerms,
    selectExam,
    ensureMatrix,
    getStudentSummary,
    invalidateMatrix,
  };
});
