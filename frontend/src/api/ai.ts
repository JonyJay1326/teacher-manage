import { httpDelete, httpGet, httpPatch, httpPost } from './http';

/** 模板风格 */
export interface PromptStyleParams {
  tone?: '亲切' | '朴实' | '严肃';
  length?: '短' | '中' | '长';
  includeAdvice?: boolean;
}

/** 模板 */
export interface AiPromptDto {
  id: number;
  scene: string;
  name: string;
  template: string;
  styleParams: PromptStyleParams;
  isBuiltin: boolean;
  isDefault: boolean;
}

/** 占位符 */
export interface PromptPlaceholderDto {
  key: string;
  label: string;
  sample: string;
}

/** AI 记录 */
export interface AiRecordDto {
  id: number;
  scene: string;
  promptId: number | null;
  studentId: number | null;
  studentName: string | null;
  contextSnapshot: string | null;
  outputText: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  status: string;
  createdAt: string | null;
}

/** 列出模板 */
export function listPromptsApi(scene?: string): Promise<{
  items: AiPromptDto[];
  placeholders: PromptPlaceholderDto[];
}> {
  const qs = scene ? `?scene=${encodeURIComponent(scene)}` : '';
  return httpGet(`/v1/ai/prompts${qs}`);
}

/** 创建模板 */
export function createPromptApi(body: {
  scene: string;
  name: string;
  template: string;
  styleParams?: PromptStyleParams;
  isDefault?: boolean;
}): Promise<AiPromptDto> {
  return httpPost('/v1/ai/prompts', body);
}

/** 克隆 */
export function clonePromptApi(id: number): Promise<AiPromptDto> {
  return httpPost(`/v1/ai/prompts/${id}/clone`);
}

/** 更新 */
export function updatePromptApi(
  id: number,
  body: {
    name?: string;
    template?: string;
    styleParams?: PromptStyleParams;
    isDefault?: boolean;
  },
): Promise<AiPromptDto> {
  return httpPatch(`/v1/ai/prompts/${id}`, body);
}

/** 设默认 */
export function setDefaultPromptApi(id: number): Promise<AiPromptDto> {
  return httpPost(`/v1/ai/prompts/${id}/default`);
}

/** 删除 */
export function deletePromptApi(id: number): Promise<{ ok: boolean }> {
  return httpDelete(`/v1/ai/prompts/${id}`);
}

/** 学情问答引用 */
export interface DataQaCitationDto {
  kind: string;
  label: string;
  detail: string;
}

/** 学情问答结果 */
export interface DataAskResultDto {
  available: boolean;
  message?: string;
  answer: string;
  citations: DataQaCitationDto[];
  aiRecordId: number | null;
  contextText: string;
  scopeLabel: string;
  studentId: number | null;
}

/** 学情问答 */
export function dataAskApi(body: {
  question: string;
  studentId?: number;
}): Promise<DataAskResultDto> {
  return httpPost('/v1/ai/data-ask', body);
}

/** 沟通话术结果 */
export interface TalkScriptResultDto {
  available: boolean;
  message?: string;
  aiRecordId: number | null;
  draftText: string;
  contextText: string;
  promptId: number | null;
}

/** 沟通话术 */
export function talkScriptApi(body: {
  scene: string;
  studentId?: number;
  includeContext?: boolean;
  promptId?: number;
}): Promise<TalkScriptResultDto> {
  return httpPost('/v1/ai/talk-script', body);
}

/** 工作总结结果 */
export interface WorkSummaryResultDto {
  available: boolean;
  message?: string;
  aiRecordId: number | null;
  draftText: string;
  contextText: string;
  termName: string;
  promptId: number | null;
}

/** 学期工作总结 */
export function workSummaryApi(body: {
  termId?: number;
  promptId?: number;
}): Promise<WorkSummaryResultDto> {
  return httpPost('/v1/ai/work-summary', body);
}

/** 生成历史 */
export function listAiRecordsApi(query: {
  scene?: string;
  studentId?: number;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: AiRecordDto[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  if (query.scene) params.set('scene', query.scene);
  if (query.studentId) params.set('studentId', String(query.studentId));
  if (query.status) params.set('status', query.status);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  const qs = params.toString();
  return httpGet(`/v1/ai/records${qs ? `?${qs}` : ''}`);
}
