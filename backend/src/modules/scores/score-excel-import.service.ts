import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { AppException, ErrorCodes } from '../../common/api';
import {
  ScoreImportMappingService,
  type ScoreSheetMapping,
} from '../ai/score-import-mapping.service';
import type { ScoreCellStatus, ScoreStatusCn } from './scores.dto';
import { ScoresRepository } from './scores.repository';
import { ScoresService } from './scores.service';

/** 预览单元格 */
export interface ExcelImportPreviewCell {
  subjectId: number;
  subjectName: string;
  raw: string;
  score: number | null;
  status: ScoreCellStatus;
  ok: boolean;
  message: string;
  willWrite: boolean;
}

/** 预览行 */
export interface ExcelImportPreviewRow {
  rowIndex: number;
  studentId: number | null;
  studentNo: string;
  nameInFile: string;
  nameInSystem: string | null;
  ok: boolean;
  message: string;
  cells: ExcelImportPreviewCell[];
}

/** 解析结果 */
export interface ExcelImportParseResult {
  mapping: ScoreSheetMapping;
  subjects: Array<{ id: number; name: string; fullScore: number }>;
  rows: ExcelImportPreviewRow[];
  summary: {
    totalRows: number;
    okRows: number;
    writableCells: number;
  };
}

/** 提交单元格 */
export interface ExcelImportCommitItem {
  studentId: number;
  subjectId: number;
  score: number | null;
  status: ScoreStatusCn;
}

/** Excel 成绩导入（SheetJS 解析 + AI/规则映射，确认后写入） */
@Injectable()
export class ScoreExcelImportService {
  private readonly maxBytes = 2 * 1024 * 1024;

  constructor(
    private readonly scoresRepository: ScoresRepository,
    private readonly scoresService: ScoresService,
    private readonly scoreImportMappingService: ScoreImportMappingService,
  ) {}

  /** 生成导入模板（base64） */
  buildTemplate(examId: number): {
    filename: string;
    mimeType: string;
    base64: string;
  } {
    const exam = this.scoresService.getExam(examId);
    const subjectIds = exam.subjectIds;
    const subjects = this.scoresRepository.findSubjectsByIds(subjectIds);
    const students = this.scoresRepository.listActiveStudents();

    const header = ['学号', '姓名', ...subjects.map((s) => s.name)];
    const dataRows = students.map((s) => [s.student_no, s.name, ...subjects.map(() => '')]);
    const sheet = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, '成绩导入');
    const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const safeName = exam.name.replace(/[\\/:*?"<>|]/g, '_');
    return {
      filename: `${safeName}_导入模板.xlsx`,
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      base64: buffer.toString('base64'),
    };
  }

  /** 上传解析：AI/规则识别列并生成预览（不写库） */
  async parseUpload(
    examId: number,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ): Promise<ExcelImportParseResult> {
    this.assertXlsxFile(file);
    const exam = this.scoresService.getExam(examId);
    const subjects = this.scoresRepository.findSubjectsByIds(exam.subjectIds);
    if (subjects.length === 0) {
      throw new AppException(ErrorCodes.VALIDATION, '该考试未配置科目');
    }

    const grid = this.readSheetGrid(file.buffer);
    if (grid.length === 0) {
      throw new AppException(ErrorCodes.VALIDATION, 'Excel 内容为空');
    }

    const sampleRows = grid.slice(0, Math.min(grid.length, 30));
    const mapping = await this.scoreImportMappingService.resolveMapping({
      sampleRows,
      subjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        fullScore: s.full_score,
      })),
    });

    if (mapping.subjects.length === 0) {
      throw new AppException(
        ErrorCodes.VALIDATION,
        '未能识别任何科目列，请检查表头或使用模板',
      );
    }
    if (mapping.studentNoCol === null && mapping.nameCol === null) {
      throw new AppException(
        ErrorCodes.VALIDATION,
        '未能识别学号或姓名列，请检查表头',
      );
    }

    const students = this.scoresRepository.listActiveStudents();
    const byNo = new Map(students.map((s) => [s.student_no, s]));
    const byName = new Map<string, typeof students>();
    for (const s of students) {
      const list = byName.get(s.name) ?? [];
      list.push(s);
      byName.set(s.name, list);
    }

    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    const rows: ExcelImportPreviewRow[] = [];
    const dataStart = mapping.headerRowIndex + 1;

    for (let r = dataStart; r < grid.length; r += 1) {
      const line = grid[r] ?? [];
      let studentNo =
        mapping.studentNoCol !== null
          ? String(line[mapping.studentNoCol] ?? '').trim()
          : '';
      const nameInFile =
        mapping.nameCol !== null ? String(line[mapping.nameCol] ?? '').trim() : '';

      if (!studentNo && !nameInFile) {
        const hasAnyScore = mapping.subjects.some((m) => {
          const raw = String(line[m.col] ?? '').trim();
          return raw.length > 0;
        });
        if (!hasAnyScore) continue;
      }

      let studentId: number | null = null;
      let nameInSystem: string | null = null;
      let ok = true;
      let message = '✓';

      if (studentNo) {
        const hit = byNo.get(studentNo);
        if (!hit) {
          ok = false;
          message = '学号不存在';
        } else {
          studentId = hit.id;
          nameInSystem = hit.name;
          if (nameInFile && nameInFile !== hit.name) {
            ok = false;
            message = '姓名与学号不符';
          }
        }
      } else if (nameInFile) {
        const hits = byName.get(nameInFile) ?? [];
        if (hits.length === 0) {
          ok = false;
          message = '姓名不存在';
        } else if (hits.length > 1) {
          ok = false;
          message = '重名，请使用学号列';
        } else {
          studentId = hits[0].id;
          nameInSystem = hits[0].name;
          studentNo = hits[0].student_no;
        }
      } else {
        ok = false;
        message = '缺少学号与姓名';
      }

      const cells: ExcelImportPreviewCell[] = mapping.subjects.map((m) => {
        const subject = subjectMap.get(m.subjectId)!;
        const raw = String(line[m.col] ?? '').trim();
        const parsed = this.parseScoreCell(raw, subject.full_score);
        return {
          subjectId: subject.id,
          subjectName: subject.name,
          raw,
          score: parsed.score,
          status: parsed.status,
          ok: parsed.ok,
          message: parsed.message,
          willWrite: parsed.willWrite && ok && studentId !== null && parsed.ok,
        };
      });

      const hasBadCell = cells.some((c) => c.raw !== '' && !c.ok);
      if (ok && hasBadCell) {
        ok = false;
        message = '存在越界或无法解析的分数';
      }

      rows.push({
        rowIndex: r + 1,
        studentId,
        studentNo: studentNo || '—',
        nameInFile: nameInFile || '—',
        nameInSystem,
        ok,
        message,
        cells,
      });
    }

    const okRows = rows.filter((r) => r.ok).length;
    const writableCells = rows.reduce(
      (sum, r) => sum + r.cells.filter((c) => c.willWrite).length,
      0,
    );

    return {
      mapping,
      subjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        fullScore: s.full_score,
      })),
      rows,
      summary: {
        totalRows: rows.length,
        okRows,
        writableCells,
      },
    };
  }

  /** 确认写入（事务）；空单元格不写 */
  commit(
    examId: number,
    writeMode: 'overwrite' | 'fillEmpty',
    items: ExcelImportCommitItem[],
  ): { ok: boolean; written: number } {
    this.scoresService.getExam(examId);
    if (items.length === 0) {
      throw new AppException(ErrorCodes.VALIDATION, '没有可写入的成绩');
    }

    const exam = this.scoresService.getExam(examId);
    const allowedSubjects = new Set(exam.subjectIds);
    const students = new Set(
      this.scoresRepository.listActiveStudents().map((s) => s.id),
    );

    let written = 0;
    this.scoresRepository.runInTransaction(() => {
      for (const item of items) {
        if (!students.has(item.studentId)) continue;
        if (!allowedSubjects.has(item.subjectId)) continue;

        if (writeMode === 'fillEmpty') {
          const existing = this.scoresRepository.findScore(
            examId,
            item.studentId,
            item.subjectId,
          );
          if (existing && this.hasRecordedScore(existing.status, existing.score)) {
            continue;
          }
        }

        const score =
          item.status === '缺考' || item.status === '免考' ? null : item.score;
        this.scoresRepository.upsertScore({
          examId,
          studentId: item.studentId,
          subjectId: item.subjectId,
          score,
          status: item.status,
        });
        written += 1;
      }
      if (exam.status === '未录入') {
        this.scoresRepository.updateExamStatus(examId, '录入中');
      }
    });

    return { ok: true, written };
  }

  /** 校验上传文件 */
  private assertXlsxFile(file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }): void {
    if (!file || !file.buffer) {
      throw new AppException(ErrorCodes.VALIDATION, '请上传 Excel 文件');
    }
    if (file.size > this.maxBytes) {
      throw new AppException(ErrorCodes.VALIDATION, '文件不能超过 2MB');
    }
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.xls')) {
      throw new AppException(
        ErrorCodes.VALIDATION,
        '暂不支持 .xls，请另存为 .xlsx 后再导入',
      );
    }
    if (!name.endsWith('.xlsx')) {
      throw new AppException(ErrorCodes.VALIDATION, '仅支持 .xlsx 文件');
    }
  }

  /** SheetJS 读为二维字符串表 */
  private readSheetGrid(buffer: Buffer): string[][] {
    const book = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const sheetName = book.SheetNames[0];
    if (!sheetName) return [];
    const sheet = book.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
      sheet,
      {
        header: 1,
        defval: '',
        raw: false,
      },
    );
    return aoa.map((row) =>
      (row ?? []).map((cell) => String(cell ?? '').trim()),
    );
  }

  /** 解析单个成绩格 */
  private parseScoreCell(
    raw: string,
    fullScore: number,
  ): {
    score: number | null;
    status: ScoreCellStatus;
    ok: boolean;
    message: string;
    willWrite: boolean;
  } {
    if (raw === '') {
      return {
        score: null,
        status: 'empty',
        ok: true,
        message: '空（不写入）',
        willWrite: false,
      };
    }
    const upper = raw.toUpperCase();
    if (upper === 'X' || raw === '缺' || raw === '缺考') {
      return {
        score: null,
        status: 'absent',
        ok: true,
        message: '缺考',
        willWrite: true,
      };
    }
    if (upper === 'M' || raw === '免' || raw === '免考') {
      return {
        score: null,
        status: 'exempt',
        ok: true,
        message: '免考',
        willWrite: true,
      };
    }
    const num = Number(raw);
    if (Number.isNaN(num)) {
      return {
        score: null,
        status: 'empty',
        ok: false,
        message: '无法解析',
        willWrite: false,
      };
    }
    if (num < 0 || num > fullScore) {
      return {
        score: num,
        status: 'normal',
        ok: false,
        message: `越界（满分 ${fullScore}）`,
        willWrite: false,
      };
    }
    return {
      score: num,
      status: 'normal',
      ok: true,
      message: '✓',
      willWrite: true,
    };
  }

  /** 是否已有有效录入 */
  private hasRecordedScore(status: string | null, score: number | null): boolean {
    if (status === '缺考' || status === '免考') return true;
    if (status === '正常' && score !== null) return true;
    return false;
  }
}
