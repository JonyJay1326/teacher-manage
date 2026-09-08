/** Demo 会话标记（仅前端内存 Mock，不写生产库） */
const DEMO_STORAGE_KEY = 'cp_demo_mode';

/** 是否处于演示模式（http 总闸据此拦截真实 /api） */
export function isDemoMode(): boolean {
  try {
    return sessionStorage.getItem(DEMO_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 进入演示：标记会话，后续请求只走内存 Mock */
export function activateDemoMode(): void {
  try {
    sessionStorage.setItem(DEMO_STORAGE_KEY, '1');
  } catch {
    // 隐私模式等无法写 storage 时仍依赖路由前缀判定（由调用方保证）
  }
}

/** 离开演示：清除标记，恢复真实 API */
export function deactivateDemoMode(): void {
  try {
    sessionStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    // ignore
  }
}
