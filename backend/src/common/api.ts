/** 统一 API 响应结构 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T | null;
}

/** 构造成功响应 */
export function ok<T>(data: T, message = 'ok'): ApiResponse<T> {
  return { code: 0, message, data };
}

/** 业务错误码 */
export const ErrorCodes = {
  VALIDATION: 1001,
  PIN_ERROR: 2001,
  UNAUTHORIZED: 2002,
  LOCKED: 2003,
  FORBIDDEN: 2004,
  BAD_CREDENTIALS: 2005,
  CONFLICT: 3001,
  NOT_FOUND: 3003,
  STATE_INVALID: 3002,
  SYSTEM: 5000,
} as const;

/** 应用业务异常 */
export class AppException extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly statusHttp = 400,
  ) {
    super(message);
    this.name = 'AppException';
  }
}

/** 返回当前 UTC ISO 字符串 */
export function nowIso(): string {
  return new Date().toISOString();
}
