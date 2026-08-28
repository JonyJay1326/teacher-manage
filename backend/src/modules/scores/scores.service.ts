import { Injectable } from '@nestjs/common';
import { AppException, ErrorCodes } from '../../common/api';
import type {
  CreateExamDto,
  UpdateExamDto,
  BatchUpsertScoresDto,
  ScoreCellStatus,
} from './scores.dto';
import {
  ScoresRepository,
  type ExamRow,
  type SubjectRow,
} from './scores.repository';

/** 学期 API 视图 */
export interface TermView {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  grade: number | null;
}

/** 科目 API 视图 */
export interface SubjectView {
  id: number;
  code: string;
  name: string;
  fullScore: number;
  gradeStart: number;
  sort: number;
  enabled: boolean;
}

/** 考试 API 视图 */
export interface ExamView {
  id: number;
  name: string;
  examType: string | null;
  termId: number | null;
  examDate: string | null;
  subjectIds: number[];
  status: string;
  gradeRef: string | null;
}

/** 单科成绩单元格 */
export interface SubjectScoreCellView {
  score: number | null;
  status: ScoreCellStatus;
  classRank: number | null;
}

/** 考试全科成绩行 */
export interface ExamScoreRowView {
  studentId: number;
  studentNo: string;
  name: string;
  subjectScores: Record<number, SubjectScoreCellView>;
  totalScore: number | null;
  totalRank: number | null;
}

/** 成绩录入行 */
export interface ScoreEntryRowView {
  studentId: number;
  studentNo: string;
  name: string;
  lastScore: number | null;
  currentScore: number | null;
  status: ScoreCellStatus;
}

/** 成绩业务服务 */
@Injectable()
export class ScoresService {
  constructor(private readonly scoresRepository: ScoresRepository) {}

  /** 列出学期 */
  listTerms(): TermView[] {
    return this.scoresRepository.listTerms().map((t) => ({
      id: t.id,
      name: t.name,
      startDate: t.start_date,
      endDate: t.end_date,
      grade: t.grade,
    }));
  }

  /** 列出启用科目 */
  listSubjects(): SubjectView[] {
    return this.scoresRepository.listEnabledSubjects().map((s) =>
      this.toSubjectView(s),
    );
  }

  /** 列出未删除考试 */
  listExams(): ExamView[] {
    return this.scoresRepository.listExams().map((e) => this.toExamView(e));
  }

  /** 考试详情 */
  getExam(id: number): ExamView {
    return this.toExamView(this.requireExam(id));
  }

  /** 创建考试 */
  createExam(dto: CreateExamDto): ExamView {
    this.assertSubjectIds(dto.subjectIds);
    const id = this.scoresRepository.createExam({
      name: dto.name,
      examType: dto.examType,
      termId: dto.termId,
      examDate: dto.examDate,
      subjectIdsJson: JSON.stringify(dto.subjectIds),
    });
    return this.getExam(id);
  }

  /** 更新考试 */
  updateExam(id: number, dto: UpdateExamDto): ExamView {
    this.requireExam(id);
    if (dto.subjectIds !== undefined) {
      this.assertSubjectIds(dto.subjectIds);
    }
    this.scoresRepository.updateExam(id, {
      name: dto.name,
      examType: dto.examType,
      termId: dto.termId,
      examDate: dto.examDate,
      subjectIdsJson:
        dto.subjectIds !== undefined
          ? JSON.stringify(dto.subjectIds)
          : undefined,
    });
    return this.getExam(id);
  }

  /** 软删除考试 */
  deleteExam(id: number): { ok: boolean } {
    this.requireExam(id);
    this.scoresRepository.softDeleteExam(id);
    return { ok: true };
  }

  /** 全科成绩矩阵（含内存计算的总分/总排） */
  getExamMatrix(examId: number): {
    subjects: SubjectView[];
    rows: ExamScoreRowView[];
  } {
    const exam = this.requireExam(examId);
    const subjectIds = this.parseSubjectIds(exam.subject_ids);
    const subjects = this.scoresRepository
      .findSubjectsByIds(subjectIds)
      .map((s) => this.toSubjectView(s));
    const students = this.scoresRepository.listActiveStudents();
    const scores = this.scoresRepository.listScoresByExam(examId);
    const scoreMap = new Map<string, (typeof scores)[number]>();
    for (const s of scores) {
      scoreMap.set(`${s.student_id}:${s.subject_id}`, s);
    }

    const rows: ExamScoreRowView[] = students.map((stu) => {
      const subjectScores: Record<number, SubjectScoreCellView> = {};
      let totalScore = 0;
      let hasNormal = false;

      for (const sid of subjectIds) {
        const row = scoreMap.get(`${stu.id}:${sid}`);
        const cell = this.toSubjectCell(row);
        subjectScores[sid] = cell;
        if (cell.status === 'normal' && cell.score !== null) {
          totalScore += cell.score;
          hasNormal = true;
        }
      }

      return {
        studentId: stu.id,
        studentNo: stu.student_no,
        name: stu.name,
        subjectScores,
        totalScore: hasNormal ? totalScore : null,
        totalRank: null,
      };
    });

    this.recalcTotalRanks(rows);
    return { subjects, rows };
  }

  /** 单科录入行（含上次成绩） */
  getEntryRows(examId: number, subjectId: number): ScoreEntryRowView[] {
    const exam = this.requireExam(examId);
    const subjectIds = this.parseSubjectIds(exam.subject_ids);
    if (!subjectIds.includes(subjectId)) {
      throw new AppException(
        ErrorCodes.VALIDATION,
        '该考试未包含此科目',
        400,
      );
    }

    const students = this.scoresRepository.listActiveStudents();
    const currentScores = this.scoresRepository.listScoresByExamSubject(
      examId,
      subjectId,
    );
    const currentMap = new Map(
      currentScores.map((s) => [s.student_id, s] as const),
    );

    return students.map((stu) => {
      const current = currentMap.get(stu.id);
      const lastScore = this.scoresRepository.findLastNormalScore({
        studentId: stu.id,
        subjectId,
        currentExamId: examId,
        currentExamDate: exam.exam_date,
      });
      return {
        studentId: stu.id,
        studentNo: stu.student_no,
        name: stu.name,
        lastScore,
        currentScore: current?.score ?? null,
        status: this.mapStatusToCell(current?.status, current?.score ?? null),
      };
    });
  }

  /** 批量 upsert 成绩；考试为「未录入」时改为「录入中」 */
  batchUpsertScores(dto: BatchUpsertScoresDto): { ok: boolean; count: number } {
    const exam = this.requireExam(dto.examId);
    const subjectIds = this.parseSubjectIds(exam.subject_ids);
    if (!subjectIds.includes(dto.subjectId)) {
      throw new AppException(
        ErrorCodes.VALIDATION,
        '该考试未包含此科目',
        400,
      );
    }

    this.scoresRepository.runInTransaction(() => {
      for (const item of dto.items) {
        const status = item.status;
        const score =
          status === '缺考' || status === '免考' ? null : item.score;
        this.scoresRepository.upsertScore({
          examId: dto.examId,
          studentId: item.studentId,
          subjectId: dto.subjectId,
          score,
          status,
        });
      }
      if (exam.status === '未录入') {
        this.scoresRepository.updateExamStatus(dto.examId, '录入中');
      }
    });

    return { ok: true, count: dto.items.length };
  }

  /**
   * 重算排名：有 subjectId 则重算该科；无则重算考试下全部科目。
   * 总排不落库，矩阵接口按需内存计算。
   */
  recalcRanks(
    examId: number,
    subjectId?: number,
  ): { ok: boolean; subjectsRecalculated: number[] } {
    const exam = this.requireExam(examId);
    const subjectIds = this.parseSubjectIds(exam.subject_ids);
    let targets: number[];
    if (subjectId !== undefined) {
      if (!subjectIds.includes(subjectId)) {
        throw new AppException(
          ErrorCodes.VALIDATION,
          '该考试未包含此科目',
          400,
        );
      }
      targets = [subjectId];
    } else {
      targets = subjectIds;
    }

    this.scoresRepository.runInTransaction(() => {
      for (const sid of targets) {
        this.recalcSubjectRank(examId, sid);
      }
    });

    return { ok: true, subjectsRecalculated: targets };
  }

  /**
   * 重算单科班排（竞赛排名：同分同名次，下一名跳过）。
   * 缺考/免考不参与，class_rank 置 null；无分的正常状态也不排名。
   */
  recalcSubjectRank(examId: number, subjectId: number): void {
    const rows = this.scoresRepository.listScoresByExamSubject(
      examId,
      subjectId,
    );
    const ranked = rows.filter(
      (r) => r.status === '正常' && r.score !== null,
    );
    const rankMap = this.assignCompetitionRanks(
      ranked.map((r) => ({
        id: r.student_id,
        score: r.score as number,
      })),
    );

    for (const row of rows) {
      const classRank =
        row.status === '正常' && row.score !== null
          ? (rankMap.get(row.student_id) ?? null)
          : null;
      this.scoresRepository.updateClassRank(
        examId,
        row.student_id,
        subjectId,
        classRank,
      );
    }
  }

  /**
   * 为矩阵行写入总分总排（内存，不落库）。
   * 仅对有至少一科「正常」分数的学生参与排名；全缺考/免考/未录者不参与。
   */
  recalcTotalRanks(rows: ExamScoreRowView[]): void {
    const eligible = rows.filter((r) => r.totalScore !== null);
    const rankMap = this.assignCompetitionRanks(
      eligible.map((r) => ({
        id: r.studentId,
        score: r.totalScore as number,
      })),
    );
    for (const row of rows) {
      row.totalRank =
        row.totalScore !== null ? (rankMap.get(row.studentId) ?? null) : null;
    }
  }

  /**
   * 竞赛式排名：按分数降序；并列同名次；下一名跳过名次空位。
   * 例：两人并列第 3，则下一名为第 5。
   */
  assignCompetitionRanks(
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
      const score = sorted[index].score;
      let end = index;
      while (end < sorted.length && sorted[end].score === score) {
        ranks.set(sorted[end].id, rank);
        end += 1;
      }
      index = end;
    }
    return ranks;
  }

  /** 校验考试存在 */
  private requireExam(id: number): ExamRow {
    const exam = this.scoresRepository.findExamById(id);
    if (!exam) {
      throw new AppException(ErrorCodes.NOT_FOUND, '考试不存在', 404);
    }
    return exam;
  }

  /** 校验科目 ID 均存在、未删除且启用 */
  private assertSubjectIds(subjectIds: number[]): void {
    const uniqueIds = [...new Set(subjectIds)];
    if (uniqueIds.length !== subjectIds.length) {
      throw new AppException(ErrorCodes.VALIDATION, '科目列表含重复项', 400);
    }
    const found = this.scoresRepository.findSubjectsByIds(uniqueIds);
    if (found.length !== uniqueIds.length) {
      throw new AppException(
        ErrorCodes.VALIDATION,
        '存在无效或已删除的科目',
        400,
      );
    }
    if (found.some((s) => s.enabled !== 1)) {
      throw new AppException(ErrorCodes.VALIDATION, '存在未启用的科目', 400);
    }
  }

  /** 解析 subject_ids JSON */
  private parseSubjectIds(raw: string): number[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new AppException(
        ErrorCodes.SYSTEM,
        '考试科目数据损坏',
        500,
      );
    }
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'number')) {
      throw new AppException(
        ErrorCodes.SYSTEM,
        '考试科目数据格式错误',
        500,
      );
    }
    return parsed;
  }

  /** 科目行转视图 */
  private toSubjectView(s: SubjectRow): SubjectView {
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      fullScore: s.full_score,
      gradeStart: s.grade_start,
      sort: s.sort,
      enabled: s.enabled === 1,
    };
  }

  /** 考试行转视图 */
  private toExamView(e: ExamRow): ExamView {
    return {
      id: e.id,
      name: e.name,
      examType: e.exam_type,
      termId: e.term_id,
      examDate: e.exam_date,
      subjectIds: this.parseSubjectIds(e.subject_ids),
      status: e.status,
      gradeRef: e.grade_ref,
    };
  }

  /** 成绩行转单元格 */
  private toSubjectCell(
    row: { score: number | null; status: string; class_rank: number | null } | undefined,
  ): SubjectScoreCellView {
    if (!row) {
      return { score: null, status: 'empty', classRank: null };
    }
    return {
      score: row.score,
      status: this.mapStatusToCell(row.status, row.score),
      classRank: row.class_rank,
    };
  }

  /** 中文状态 + 分数映射为录入单元格状态 */
  private mapStatusToCell(
    status: string | undefined,
    score: number | null,
  ): ScoreCellStatus {
    if (!status) return 'empty';
    if (status === '缺考') return 'absent';
    if (status === '免考') return 'exempt';
    if (status === '正常') {
      return score === null ? 'empty' : 'normal';
    }
    return 'empty';
  }
}
