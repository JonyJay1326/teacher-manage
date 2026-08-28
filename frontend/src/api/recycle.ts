import { httpGet, httpPost } from './http';

/** 回收站类型 */
export type RecycleEntityType =
  | 'students'
  | 'incidents'
  | 'comments'
  | 'exams'
  | 'kb_documents';

/** 回收站条目 */
export interface RecycleItemDto {
  id: number;
  entityType: string;
  title: string;
  deletedAt: string;
  extra: string | null;
}

/** 列表 */
export function listRecycleApi(
  type: RecycleEntityType,
): Promise<{ items: RecycleItemDto[] }> {
  return httpGet(`/v1/recycle?type=${encodeURIComponent(type)}`);
}

/** 恢复 */
export function restoreRecycleApi(
  type: RecycleEntityType,
  id: number,
): Promise<{ ok: boolean }> {
  return httpPost(`/v1/recycle/${type}/${id}/restore`);
}
