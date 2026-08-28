import { httpGet, httpPost, httpPut } from './http';

/** 成绩阈值 */
export interface ThresholdsDto {
  lowScoreRatio: number;
  passRatio: number;
  excellentRatio: number;
  rankJumpThreshold: number;
}

/** 备份项 */
export interface BackupItemDto {
  filename: string;
  size: number;
  createdAt: string;
  quickCheckOk: boolean | null;
  trigger: string | null;
}

/** 审计日志项 */
export interface AuditLogItemDto {
  id: number;
  action: string;
  targetStudentId: number | null;
  detail: string | null;
  createdAt: string;
}

/** 读取阈值 */
export function getThresholdsApi(): Promise<ThresholdsDto> {
  return httpGet('/v1/settings/thresholds');
}

/** 更新阈值 */
export function updateThresholdsApi(body: ThresholdsDto): Promise<ThresholdsDto> {
  return httpPut('/v1/settings/thresholds', body);
}

/** 备份列表 */
export function listBackupsApi(): Promise<BackupItemDto[]> {
  return httpGet('/v1/backup/list');
}

/** 手动备份 */
export function runBackupApi(): Promise<{
  backupPath: string;
  ok: boolean;
  filename: string;
}> {
  return httpPost('/v1/backup/run');
}

/** 恢复备份 */
export function restoreBackupApi(
  filename: string,
): Promise<{ ok: boolean; safetyBackup: string; restoredFrom: string }> {
  return httpPost('/v1/backup/restore', { filename, confirm: true });
}

/** 审计日志 */
export function listAuditLogsApi(query: {
  page?: number;
  pageSize?: number;
  q?: string;
  action?: string;
}): Promise<{ items: AuditLogItemDto[]; total: number }> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.q) params.set('q', query.q);
  if (query.action) params.set('action', query.action);
  const qs = params.toString();
  return httpGet(`/v1/settings/audit-logs${qs ? `?${qs}` : ''}`);
}
