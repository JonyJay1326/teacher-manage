import { httpDelete, httpGet, httpPatch, httpPost, httpUpload } from './http';
import type { Incident, IncidentCategory } from '@/types';

/** 事件列表项（含学生名） */
export interface IncidentListItem extends Incident {
  studentNames: string[];
}

/** 附件 */
export interface AttachmentDto {
  id: number;
  incidentId: number;
  mime: string | null;
  size: number | null;
  createdAt: string | null;
  hasThumb: boolean;
}

/** 列表 */
export function listIncidentsApi(query: {
  status?: string;
  category?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: IncidentListItem[]; total: number; draftCount?: number }> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.category) params.set('category', query.category);
  if (query.q) params.set('q', query.q);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  const qs = params.toString();
  return httpGet(`/v1/incidents${qs ? `?${qs}` : ''}`);
}

/** 草稿数量 */
export function draftCountApi(): Promise<{ count: number }> {
  return httpGet('/v1/incidents/draft-count');
}

/** 创建速记草稿 */
export function createDraftApi(body: {
  studentIds: number[];
  content: string;
  category?: IncidentCategory | string;
  occurredAt?: string;
}): Promise<IncidentListItem> {
  return httpPost('/v1/incidents/draft', body);
}

/** 确认结构化 */
export function confirmIncidentApi(
  id: number,
  body: Record<string, unknown>,
): Promise<IncidentListItem> {
  return httpPatch(`/v1/incidents/${id}/confirm`, body);
}

/** 更新事件 */
export function updateIncidentApi(
  id: number,
  body: Record<string, unknown>,
): Promise<IncidentListItem> {
  return httpPatch(`/v1/incidents/${id}`, body);
}

/** 删除事件 */
export function deleteIncidentApi(id: number): Promise<{ ok: boolean }> {
  return httpDelete(`/v1/incidents/${id}`);
}

/** 事件详情 */
export function getIncidentApi(id: number): Promise<IncidentListItem> {
  return httpGet(`/v1/incidents/${id}`);
}

/** 到期跟进列表 */
export function dueFollowUpsApi(): Promise<IncidentListItem[]> {
  return httpGet('/v1/incidents/follow-ups/due');
}

/** 事件附件列表 */
export function listIncidentAttachmentsApi(
  incidentId: number,
): Promise<AttachmentDto[]> {
  return httpGet(`/v1/incidents/${incidentId}/attachments`);
}

/** 上传事件附件 */
export function uploadIncidentAttachmentApi(
  incidentId: number,
  file: File,
): Promise<AttachmentDto> {
  const form = new FormData();
  form.append('file', file);
  return httpUpload(`/v1/incidents/${incidentId}/attachments`, form);
}

/** 删除附件 */
export function deleteAttachmentApi(id: number): Promise<{ ok: boolean }> {
  return httpDelete(`/v1/attachments/${id}`);
}

/** 附件文件 URL（浏览器带 cookie 请求） */
export function attachmentFileUrl(id: number, thumb = false): string {
  return `/api/v1/attachments/${id}/file${thumb ? '?thumb=1' : ''}`;
}
