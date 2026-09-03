import { httpDelete, httpGet, httpPatch, httpPost, httpPut } from './http';
import type { Student, Tag } from '@/types';

/** 学生列表查询 */
export interface StudentListQuery {
  q?: string;
  status?: string;
  focusLevel?: number;
  page?: number;
  pageSize?: number;
  sortBy?: 'studentNo' | 'focusLevel';
  sortOrder?: 'asc' | 'desc';
}

/** 监护人 */
export interface GuardianDto {
  id: number;
  studentId: number;
  relation?: string | null;
  name?: string | null;
  phone?: string | null;
  wechat?: string | null;
  job?: string | null;
  contactPref?: string | null;
  bestTime?: string | null;
  isPrimary: boolean;
  remark?: string | null;
}

/** 学生详情 */
export interface StudentDetailDto extends Student {
  ethnicity?: string | null;
  address?: string | null;
  residence?: string | null;
  enrolledAt?: string | null;
  remark?: string | null;
  guardians: GuardianDto[];
}

/** 分页列表 */
export function listStudentsApi(
  query: StudentListQuery = {},
): Promise<{ items: Student[]; total: number }> {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.focusLevel !== undefined) params.set('focusLevel', String(query.focusLevel));
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortOrder) params.set('sortOrder', query.sortOrder);
  const qs = params.toString();
  return httpGet(`/v1/students${qs ? `?${qs}` : ''}`);
}

/** 学生详情 */
export function getStudentApi(id: number): Promise<StudentDetailDto> {
  return httpGet(`/v1/students/${id}`);
}

/** 创建学生 */
export function createStudentApi(body: Record<string, unknown>): Promise<Student> {
  return httpPost('/v1/students', body);
}

/** 更新学生 */
export function updateStudentApi(
  id: number,
  body: Record<string, unknown>,
): Promise<Student> {
  return httpPatch(`/v1/students/${id}`, body);
}

/** 软删除学生 */
export function deleteStudentApi(id: number): Promise<{ ok: boolean }> {
  return httpDelete(`/v1/students/${id}`);
}

/** 替换标签 */
export function replaceStudentTagsApi(
  id: number,
  tagIds: number[],
): Promise<Student> {
  return httpPost(`/v1/students/${id}/tags`, { tagIds });
}

/** 全部标签 */
export function listTagsApi(): Promise<Tag[]> {
  return httpGet('/v1/tags');
}

/** 新建标签（默认域「其他」、L0） */
export function createTagApi(body: {
  name: string;
  domain?: Tag['domain'];
  color?: string;
}): Promise<Tag> {
  return httpPost('/v1/tags', body);
}

/** 监护人列表 */
export function listGuardiansApi(studentId: number): Promise<GuardianDto[]> {
  return httpGet(`/v1/students/${studentId}/guardians`);
}

/** 创建监护人 */
export function createGuardianApi(
  studentId: number,
  body: Record<string, unknown>,
): Promise<GuardianDto> {
  return httpPost(`/v1/students/${studentId}/guardians`, body);
}

/** 更新监护人 */
export function updateGuardianApi(
  guardianId: number,
  body: Record<string, unknown>,
): Promise<GuardianDto> {
  return httpPatch(`/v1/students/guardians/${guardianId}`, body);
}

/** 删除监护人 */
export function deleteGuardianApi(guardianId: number): Promise<{ ok: boolean }> {
  return httpDelete(`/v1/students/guardians/${guardianId}`);
}

/** 导入预览 */
export function importPreviewApi(text: string): Promise<{
  rows: Array<{
    studentNo?: string;
    name: string;
    gender?: number | null;
    contact1?: string;
    contact2?: string;
    action: string;
    matchedId?: number;
    message?: string;
  }>;
}> {
  return httpPost('/v1/students/import/preview', { text });
}

/** 导入确认 */
export function importConfirmApi(
  rows: Array<{
    studentNo?: string;
    name: string;
    gender?: number | null;
    contact1?: string | null;
    contact2?: string | null;
    action: string;
    matchedId?: number;
  }>,
): Promise<{ created: number; skipped: number; updated: number }> {
  return httpPost('/v1/students/import/confirm', { rows });
}

/** 高敏摘要 */
export interface SensitiveSummary {
  category: string;
  hasContent: boolean;
  updatedAt: string | null;
}

/** 高敏内容 */
export interface SensitiveContent {
  category: string;
  content: string;
  updatedAt: string | null;
}

/** 高敏卡片摘要列表 */
export function listSensitiveApi(studentId: number): Promise<SensitiveSummary[]> {
  return httpGet(`/v1/students/${studentId}/sensitive`);
}

/** 读取一类高敏明文 */
export function getSensitiveApi(
  studentId: number,
  category: string,
): Promise<SensitiveContent> {
  return httpGet(
    `/v1/students/${studentId}/sensitive/${encodeURIComponent(category)}`,
  );
}

/** 写入一类高敏 */
export function upsertSensitiveApi(
  studentId: number,
  category: string,
  content: string,
): Promise<SensitiveContent> {
  return httpPut(
    `/v1/students/${studentId}/sensitive/${encodeURIComponent(category)}`,
    { content },
  );
}

/** 删除一类高敏 */
export function deleteSensitiveApi(
  studentId: number,
  category: string,
): Promise<{ ok: boolean }> {
  return httpDelete(
    `/v1/students/${studentId}/sensitive/${encodeURIComponent(category)}`,
  );
}

/** 时间线单科成绩 */
export interface TimelineSubjectScore {
  subjectId: number;
  subjectName: string;
  score: number | null;
  status: string;
  classRank: number | null;
}

/** 时间线成绩明细 */
export interface TimelineScoreDetail {
  totalScore: number | null;
  totalRank: number | null;
  subjects: TimelineSubjectScore[];
}

/** 时间线条目 */
export interface TimelineItem {
  id: string;
  kind: 'score' | 'incident' | 'comment';
  domain: 'score' | 'incident' | 'contact' | 'comment' | 'praise';
  occurredAt: string;
  title: string;
  summary: string | null;
  category: string | null;
  severity: number | null;
  examId: number | null;
  incidentId: number | null;
  commentId: number | null;
  scoreDetail: TimelineScoreDetail | null;
}

/** 成长时间线 */
export function listTimelineApi(
  studentId: number,
  query: { kind?: string; q?: string } = {},
): Promise<TimelineItem[]> {
  const params = new URLSearchParams();
  if (query.kind) params.set('kind', query.kind);
  if (query.q) params.set('q', query.q);
  const qs = params.toString();
  return httpGet(
    `/v1/students/${studentId}/timeline${qs ? `?${qs}` : ''}`,
  );
}

/** 班主任印象 */
export interface StudentImpressionDto {
  studentId: number;
  content: string;
  updatedAt: string | null;
}

/** 读取班主任印象 */
export function getStudentImpressionApi(
  studentId: number,
): Promise<StudentImpressionDto> {
  return httpGet(`/v1/students/${studentId}/impression`);
}

/** 保存班主任印象 */
export function saveStudentImpressionApi(
  studentId: number,
  content: string,
): Promise<StudentImpressionDto> {
  return httpPut(`/v1/students/${studentId}/impression`, { content });
}
