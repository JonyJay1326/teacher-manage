import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  changePasswordApi,
  loginApi,
  logoutApi,
  meApi,
  type AuthUser,
} from '@/api/auth';

/** 认证状态 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const bootstrapped = ref(false);

  const isLoggedIn = computed(() => user.value !== null);
  const displayName = computed(() => user.value?.displayName ?? '');

  /** 拉取当前会话 */
  async function fetchMe(): Promise<boolean> {
    try {
      user.value = await meApi();
      return true;
    } catch {
      user.value = null;
      return false;
    } finally {
      bootstrapped.value = true;
    }
  }

  /** 登录 */
  async function login(username: string, password: string): Promise<void> {
    user.value = await loginApi(username, password);
    bootstrapped.value = true;
  }

  /** 登出 */
  async function logout(): Promise<void> {
    try {
      await logoutApi();
    } catch {
      // 忽略网络错误，仍清理本地会话
    }
    user.value = null;
  }

  /** 修改密码 */
  async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await changePasswordApi(oldPassword, newPassword);
  }

  /** 清空本地会话（未授权时） */
  function clearSession(): void {
    user.value = null;
  }

  return {
    user,
    bootstrapped,
    isLoggedIn,
    displayName,
    fetchMe,
    login,
    logout,
    changePassword,
    clearSession,
  };
});
