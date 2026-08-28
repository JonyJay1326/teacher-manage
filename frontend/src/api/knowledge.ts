import { httpDelete, httpGet, httpPatch, httpPost, httpUpload } from './http';

/** 知识库文档 */
export interface KbDocumentDto {
  id: number;
  title: string;
  categoryPath: string | null;
  source: string | null;
  filePath: string | null;
  segCount: number;
  tags: string[];
  createdAt: string | null;
  preview: string;
}

/** 段落 */
export interface KbSegmentDto {
  id: number;
  seq: number;
  text: string;
}

/** 问答来源 */
export interface KbAskSourceDto {
  segmentId: number;
  documentId: number;
  documentTitle: string;
  seq: number;
  text: string;
}

/** 问答结果 */
export interface KbAskResultDto {
  available: boolean;
  message?: string;
  answer: string;
  sources: KbAskSourceDto[];
  aiRecordId: number | null;
  contextText: string;
}

/** 分类 */
export function listKbCategoriesApi(): Promise<{
  presets: string[];
  used: string[];
}> {
  return httpGet('/v1/knowledge/categories');
}

/** 文档列表 */
export function listKbDocumentsApi(params: {
  category?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: KbDocumentDto[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const q = new URLSearchParams();
  if (params.category) q.set('category', params.category);
  if (params.keyword) q.set('keyword', params.keyword);
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  const qs = q.toString();
  return httpGet(`/v1/knowledge/documents${qs ? `?${qs}` : ''}`);
}

/** 详情 */
export function getKbDocumentApi(id: number): Promise<{
  document: KbDocumentDto;
  segments: KbSegmentDto[];
}> {
  return httpGet(`/v1/knowledge/documents/${id}`);
}

/** 粘贴入库 */
export function pasteKbDocumentApi(body: {
  title: string;
  categoryPath?: string;
  tags?: string;
  content: string;
}): Promise<KbDocumentDto> {
  return httpPost('/v1/knowledge/documents/paste', body);
}

/** 上传入库 */
export function uploadKbDocumentApi(form: FormData): Promise<KbDocumentDto> {
  return httpUpload('/v1/knowledge/documents/upload', form);
}

/** 更新 */
export function updateKbDocumentApi(
  id: number,
  body: { title?: string; categoryPath?: string; tags?: string },
): Promise<KbDocumentDto> {
  return httpPatch(`/v1/knowledge/documents/${id}`, body);
}

/** 删除 */
export function deleteKbDocumentApi(id: number): Promise<{ ok: true }> {
  return httpDelete(`/v1/knowledge/documents/${id}`);
}

/** RAG 问答 */
export function askKnowledgeApi(question: string): Promise<KbAskResultDto> {
  return httpPost('/v1/knowledge/ask', { question });
}
