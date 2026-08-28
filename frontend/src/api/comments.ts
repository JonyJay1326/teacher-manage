import { httpDelete, httpGet, httpPost } from './http';

/** 评语类型 */
export type CommentType = '期中评语' | '期末评语' | '日常评语';

/** 语气 */
export type CommentTone = '亲切' | '朴实' | '严肃';

/** 篇幅 */
export type CommentLength = '短' | '中' | '长';

/** 工作台状态 */
export type WorkbenchStatus = 'none' | 'generated' | 'failed' | 'adopted';

/** 工作台学生项 */
export interface WorkbenchStudentItem {
  studentId: number;
  studentNo: string;
  name: string;
  focusLevel: number;
  status: WorkbenchStatus;
  aiRecordId: number | null;
  draftText: string | null;
  commentId: number | null;
  finalText: string | null;
}

/** 工作台响应 */
export interface WorkbenchResponse {
  termId: number;
  termName: string | null;
  commentType: string;
  items: WorkbenchStudentItem[];
  summary: {
    total: number;
    none: number;
    generated: number;
    failed: number;
    adopted: number;
  };
}

/** 生成结果 */
export interface GenerateCommentResult {
  available: boolean;
  message?: string;
  aiRecordId: number | null;
  draftText: string;
  contextText: string;
  contextSections: {
    profile: string;
    scores: string;
    incidents: string;
    lastComment: string;
    impression: string;
  };
  approxTokens: number;
}

/** 评语视图 */
export interface CommentView {
  id: number;
  studentId: number;
  termId: number | null;
  commentType: string | null;
  finalText: string;
  sourceAiRecordId: number | null;
  createdAt: string | null;
}

/** 上下文预览 */
export interface CommentContextPreview {
  contextText: string;
  sections: {
    profile: string;
    scores: string;
    incidents: string;
    lastComment: string;
    impression: string;
  };
  approxTokens: number;
}

/** AI 健康 */
export interface AiHealthView {
  configured: boolean;
  available: boolean;
  month: {
    tokensIn: number;
    tokensOut: number;
    callCount: number;
    failCount: number;
  };
}

/** 工作台 */
export function commentsWorkbenchApi(
  termId: number,
  commentType: CommentType,
): Promise<WorkbenchResponse> {
  const params = new URLSearchParams({
    termId: String(termId),
    commentType,
  });
  return httpGet(`/v1/comments/workbench?${params.toString()}`);
}

/** 预览上下文 */
export function commentContextApi(
  studentId: number,
  termId?: number,
): Promise<CommentContextPreview> {
  const qs = termId ? `?termId=${termId}` : '';
  return httpGet(`/v1/comments/context/${studentId}${qs}`);
}

/** 生成草稿 */
export function generateCommentApi(body: {
  studentId: number;
  termId?: number;
  commentType: CommentType;
  tone?: CommentTone;
  length?: CommentLength;
  includeAdvice?: boolean;
  promptId?: number;
}): Promise<GenerateCommentResult> {
  return httpPost('/v1/comments/generate', body);
}

/** 采纳 */
export function adoptCommentApi(body: {
  studentId: number;
  termId?: number;
  commentType: CommentType;
  finalText: string;
  aiRecordId?: number;
}): Promise<CommentView> {
  return httpPost('/v1/comments/adopt', body);
}

/** 手工新建 */
export function createCommentApi(body: {
  studentId: number;
  termId?: number;
  commentType: CommentType;
  finalText: string;
}): Promise<CommentView> {
  return httpPost('/v1/comments', body);
}

/** 某生列表 */
export function listStudentCommentsApi(studentId: number): Promise<CommentView[]> {
  return httpGet(`/v1/comments/student/${studentId}`);
}

/** 删除 */
export function deleteCommentApi(id: number): Promise<{ ok: boolean }> {
  return httpDelete(`/v1/comments/${id}`);
}

/** AI 健康 */
export function aiHealthApi(): Promise<AiHealthView> {
  return httpGet('/v1/ai/health');
}
