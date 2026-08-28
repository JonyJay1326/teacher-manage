import { httpDelete, httpGet, httpPatch, httpPost, httpUpload } from './http';
import type { Exam, ExamScoreRow, ScoreEntryRow, Subject } from '@/types';

/** 学期 */
export interface TermDto {
  id: number;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  grade?: number | null;
}

/** Excel 导入预览单元格 */
export interface ExcelImportPreviewCell {
  subjectId: number;
  subjectName: string;
  raw: string;
  score: number | null;
  status: 'normal' | 'absent' | 'exempt' | 'empty';
  ok: boolean;
  message: string;
  willWrite: boolean;
}

/** Excel 导入预览行 */
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

/** Excel 解析结果 */
export interface ExcelImportParseResult {
  mapping: {
    headerRowIndex: number;
    studentNoCol: number | null;
    nameCol: number | null;
    subjects: Array<{ col: number; subjectId: number; header: string }>;
    source: 'ai' | 'rules';
    message?: string;
  };
  subjects: Array<{ id: number; name: string; fullScore: number }>;
  rows: ExcelImportPreviewRow[];
  summary: {
    totalRows: number;
    okRows: number;
    writableCells: number;
  };
}

/** 列出学期 */
export function listTermsApi(): Promise<TermDto[]> {
  return httpGet('/v1/terms');
}

/** 列出科目 */
export function listSubjectsApi(): Promise<Subject[]> {
  return httpGet('/v1/subjects');
}

/** 列出考试 */
export function listExamsApi(): Promise<Exam[]> {
  return httpGet('/v1/exams');
}

/** 创建考试 */
export function createExamApi(body: {
  name: string;
  examType?: string;
  termId?: number;
  examDate?: string;
  subjectIds: number[];
}): Promise<Exam> {
  return httpPost('/v1/exams', body);
}

/** 更新考试 */
export function updateExamApi(id: number, body: Record<string, unknown>): Promise<Exam> {
  return httpPatch(`/v1/exams/${id}`, body);
}

/** 删除考试 */
export function deleteExamApi(id: number): Promise<{ ok: boolean }> {
  return httpDelete(`/v1/exams/${id}`);
}

/** 考试详情 */
export function getExamApi(id: number): Promise<Exam> {
  return httpGet(`/v1/exams/${id}`);
}

/** 全科成绩矩阵 */
export function getExamMatrixApi(
  id: number,
): Promise<{ subjects: Subject[]; rows: ExamScoreRow[] }> {
  return httpGet(`/v1/exams/${id}/matrix`);
}

/** 单科录入行 */
export function getScoreEntryApi(
  examId: number,
  subjectId: number,
): Promise<ScoreEntryRow[]> {
  return httpGet(`/v1/exams/${examId}/entry?subjectId=${subjectId}`);
}

/** 批量保存成绩 */
export function batchSaveScoresApi(body: {
  examId: number;
  subjectId: number;
  items: Array<{ studentId: number; score: number | null; status: string }>;
}): Promise<{ ok: boolean }> {
  return httpPatch('/v1/scores/batch', body);
}

/** 重算排名 */
export function recalcRanksApi(
  examId: number,
  subjectId?: number,
): Promise<{ ok: boolean }> {
  return httpPost(`/v1/exams/${examId}/recalc`, subjectId ? { subjectId } : {});
}

/** 下载导入模板 */
export function downloadScoreImportTemplateApi(examId: number): Promise<{
  filename: string;
  mimeType: string;
  base64: string;
}> {
  return httpGet(`/v1/exams/${examId}/import/template`);
}

/** 上传 Excel 并 AI/规则解析预览 */
export function parseScoreImportApi(
  examId: number,
  file: File,
): Promise<ExcelImportParseResult> {
  const form = new FormData();
  form.append('file', file);
  return httpUpload(`/v1/exams/${examId}/import/parse`, form);
}

/** 确认写入导入成绩 */
export function commitScoreImportApi(
  examId: number,
  body: {
    writeMode: 'overwrite' | 'fillEmpty';
    items: Array<{
      studentId: number;
      subjectId: number;
      score: number | null;
      status: '正常' | '缺考' | '免考';
    }>;
  },
): Promise<{ ok: boolean; written: number }> {
  return httpPost(`/v1/exams/${examId}/import/commit`, body);
}
