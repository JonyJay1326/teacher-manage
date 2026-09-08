import { demoRequest, demoUpload } from '@/demo/request';
import { isDemoMode } from '@/demo/mode';

/** 统一 API 响应 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T | null;
}

/** API 业务错误 */
export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

/** 注册未授权回调（跳转登录） */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler;
}

/** 是否演示态下仍走真实后端（仅 DeepSeek 代理） */
function isDemoLivePath(pathWithQuery: string): boolean {
  const pathname = (pathWithQuery.split('?')[0] ?? '').replace(/\/+$/, '') || '/';
  return pathname === '/v1/ai/demo-complete';
}

/** 解析统一响应 */
async function parseApiResponse<T>(response: Response, path: string): Promise<T> {
  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(5000, '响应解析失败');
  }

  if (payload.code !== 0) {
    if (payload.code === 2002) {
      // 演示态调 DeepSeek 代理失败不踢出演示页
      if (!(isDemoMode() && isDemoLivePath(path))) {
        onUnauthorized?.();
      }
    }
    throw new ApiError(payload.code, payload.message || '请求失败');
  }

  return payload.data as T;
}

/** 始终请求真实 /api（供演示 AI 代理使用） */
export async function requestLive<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  return parseApiResponse<T>(response, path);
}

/** 发起 JSON 请求并解包 { code, message, data } */
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  // 演示模式：业务走内存 Mock；DeepSeek 代理走真实后端
  if (isDemoMode() && !isDemoLivePath(path)) {
    return demoRequest<T>(path, options);
  }

  return requestLive<T>(path, options);
}

/** GET */
export function httpGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

/** POST */
export function httpPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** 强制真实后端 POST（演示 DeepSeek 用） */
export function httpPostLive<T>(path: string, body?: unknown): Promise<T> {
  return requestLive<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** PATCH */
export function httpPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** DELETE */
export function httpDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

/** PUT */
export function httpPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** multipart 上传（勿手动设置 Content-Type，以便带上 boundary） */
export async function httpUpload<T>(path: string, formData: FormData): Promise<T> {
  if (isDemoMode()) {
    return demoUpload<T>(path);
  }

  const response = await fetch(`/api${path}`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  return parseApiResponse<T>(response, path);
}
