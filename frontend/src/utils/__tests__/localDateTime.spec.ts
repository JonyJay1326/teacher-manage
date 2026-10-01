import { describe, expect, it } from 'vitest';
import { localInputToIso, toLocalInput } from '../localDateTime';

/**
 * 本地时间 ↔ UTC 往返。
 *
 * 回归背景：事件新建曾用 toISOString().slice(0,16) 预填 datetime 控件，
 * 该值是 UTC 墙上时间，导致入库后时间偏移（东八区差 8 小时）。
 */

describe('toLocalInput', () => {
  it('输出本地墙上时间而非 UTC', () => {
    const d = new Date(2026, 8, 30, 20, 30, 0);
    expect(toLocalInput(d)).toBe('2026-09-30T20:30');
  });

  it('月/日/时/分均补零', () => {
    const d = new Date(2026, 0, 5, 7, 8, 0);
    expect(toLocalInput(d)).toBe('2026-01-05T07:08');
  });

  it('忽略秒与毫秒（控件只到分钟）', () => {
    const d = new Date(2026, 5, 15, 13, 45, 59, 999);
    expect(toLocalInput(d)).toBe('2026-06-15T13:45');
  });
});

describe('localInputToIso', () => {
  it('本地墙上时间按本地时区解析为 UTC', () => {
    const iso = localInputToIso('2026-09-30T20:30');
    expect(iso).toBeDefined();
    const back = new Date(iso!);
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(8);
    expect(back.getDate()).toBe(30);
    expect(back.getHours()).toBe(20);
    expect(back.getMinutes()).toBe(30);
  });

  it('与 toLocalInput 构成无损往返', () => {
    const original = new Date(2026, 10, 3, 9, 5, 0);
    const iso = localInputToIso(toLocalInput(original));
    expect(iso).toBe(original.toISOString());
  });

  it('空值/空白返回 undefined（交由后端按未指定处理）', () => {
    expect(localInputToIso('')).toBeUndefined();
    expect(localInputToIso('   ')).toBeUndefined();
    expect(localInputToIso(null)).toBeUndefined();
    expect(localInputToIso(undefined)).toBeUndefined();
  });

  it('非法值返回 undefined 而非抛错', () => {
    expect(localInputToIso('not-a-date')).toBeUndefined();
  });

  it('结果始终是 ISO 8601 UTC 字符串', () => {
    const iso = localInputToIso('2026-09-30T20:30')!;
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
