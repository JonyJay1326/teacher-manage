/** 考试状态用户可见文案（兼容演示种子遗留的 open/closed） */
export function examStatusLabel(status: string): string {
  const map: Record<string, string> = {
    open: '录入中',
    closed: '已发布',
    未录入: '未录入',
    录入中: '录入中',
    已发布: '已发布',
    已归档: '已归档',
  };
  return map[status] ?? status;
}

/** 考试状态标签类型（按中文展示态映射） */
export function examStatusTagType(
  status: string,
): 'info' | 'warning' | 'success' | undefined {
  const label = examStatusLabel(status);
  const map: Record<string, 'info' | 'warning' | 'success' | undefined> = {
    未录入: 'info',
    录入中: 'warning',
    已发布: 'success',
    已归档: undefined,
  };
  return map[label];
}
