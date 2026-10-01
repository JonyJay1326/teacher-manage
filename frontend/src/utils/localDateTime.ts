/**
 * 本地时间与 ISO 8601 UTC 的互转。
 *
 * 项目规范：时间入库/传输一律 ISO 8601 UTC，展示时再本地化。
 * el-date-picker 用 value-format="YYYY-MM-DDTHH:mm" 时绑定的是
 * 「本地墙上时间」字符串（无时区信息），不能直接 toISOString，
 * 否则会按 UTC 解读导致偏移。此处统一收口。
 */

/** Date → 本地墙上时间串（YYYY-MM-DDTHH:mm），供 datetime 控件绑定 */
export function toLocalInput(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 本地墙上时间串 → ISO 8601 UTC。
 * 空值或非法值返回 undefined，由后端按「未指定」处理。
 */
export function localInputToIso(value: string | null | undefined): string | undefined {
  const raw = (value ?? '').trim();
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}
