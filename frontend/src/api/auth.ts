import { httpGet, httpPost } from './http';

/** 登录用户信息 */
export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
}

/** 登录 */
export function loginApi(username: string, password: string): Promise<AuthUser> {
  return httpPost<AuthUser>('/v1/auth/login', { username, password });
}

/** 登出 */
export function logoutApi(): Promise<{ ok: boolean }> {
  return httpPost<{ ok: boolean }>('/v1/auth/logout');
}

/** 当前用户 */
export function meApi(): Promise<AuthUser> {
  return httpGet<AuthUser>('/v1/auth/me');
}

/** 修改密码 */
export function changePasswordApi(
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return httpPost<{ ok: boolean }>('/v1/auth/change-password', {
    oldPassword,
    newPassword,
  });
}

/** PIN 状态 */
export interface PinStatus {
  hasPin: boolean;
  unlocked: boolean;
  unlockedUntil: string | null;
  pinLocked: boolean;
  pinLockedUntil: string | null;
}

/** 查询 PIN 状态 */
export function pinStatusApi(): Promise<PinStatus> {
  return httpGet<PinStatus>('/v1/auth/pin/status');
}

/** 设置/修改 PIN */
export function setPinApi(password: string, pin: string): Promise<{ ok: boolean }> {
  return httpPost<{ ok: boolean }>('/v1/auth/pin/set', { password, pin });
}

/** 校验 PIN 解锁 */
export function verifyPinApi(pin: string): Promise<{ unlockedUntil: string }> {
  return httpPost<{ unlockedUntil: string }>('/v1/auth/pin/verify', { pin });
}
