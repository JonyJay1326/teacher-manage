import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  changePasswordApi,
  loginApi,
  logoutApi,
  meApi,
  type AuthUser,
} from '@/api/auth';
import { deactivateDemoMode, isDemoMode } from '@/demo/mode';

const DEMO_USER: AuthUser = {
  id: 9001,
  username: 'demo',
  displayName: '演示班主任',
};

/** 认证状态 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const bootstrapped = ref(false);

  const isLoggedIn = computed(() => user.value !== null);
  const displayName = computed(() => user.value?.displayName ?? '');

  /** 拉取当前会话 */
  async function fetchMe(): Promise<boolean> {
    if (isDemoMode()) {
      user.value = { ...DEMO_USER };
      bootstrapped.value = true;
      return true;
    }
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
    if (isDemoMode()) {
      deactivateDemoMode();
      user.value = null;
      return;
    }
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

  /** 进入演示：注入假用户（不请求后端） */
  function enterDemoSession(): void {
    user.value = { ...DEMO_USER };
    bootstrapped.value = true;
  }

  /** 离开演示：清演示用户（真实会话由后续 fetchMe 恢复） */
  function exitDemoSession(): void {
    if (user.value?.username === 'demo') {
      user.value = null;
      bootstrapped.value = false;
    }
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
    enterDemoSession,
    exitDemoSession,
  };
});
