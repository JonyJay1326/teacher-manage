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

/** 发起 JSON 请求并解包 { code, message, data } */
export async function request<T>(
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

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(5000, '响应解析失败');
  }

  if (payload.code !== 0) {
    // 仅登录过期踢出；PIN 错误等 2xxx 不应当作会话失效
    if (payload.code === 2002) {
      onUnauthorized?.();
    }
    throw new ApiError(payload.code, payload.message || '请求失败');
  }

  return payload.data as T;
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
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(5000, '响应解析失败');
  }

  if (payload.code !== 0) {
    if (payload.code === 2002) {
      onUnauthorized?.();
    }
    throw new ApiError(payload.code, payload.message || '请求失败');
  }

  return payload.data as T;
}
