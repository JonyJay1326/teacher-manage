import type { RouteLocationRaw } from 'vue-router';
import { isDemoMode } from './mode';

const DEMO_PREFIX = '/demo';

/** 当前是否在 /demo 路径树下 */
export function isDemoPath(path: string): boolean {
  return path === DEMO_PREFIX || path.startsWith(`${DEMO_PREFIX}/`);
}

/** 去掉 /demo 前缀，得到业务路径（用于标题映射等） */
export function stripDemoPrefix(path: string): string {
  if (path === DEMO_PREFIX || path === `${DEMO_PREFIX}/`) return '/';
  if (path.startsWith(`${DEMO_PREFIX}/`)) {
    const rest = path.slice(DEMO_PREFIX.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return path;
}

/** 为业务路径加上 /demo 前缀（已带前缀则原样返回） */
export function withDemoPrefix(path: string): string {
  if (!path.startsWith('/')) path = `/${path}`;
  if (isDemoPath(path)) return path;
  if (path === '/') return DEMO_PREFIX;
  return `${DEMO_PREFIX}${path}`;
}

/** 演示模式下把跳转目标改写到 /demo 树（登录/预览页除外） */
export function rewriteToDemoIfNeeded(to: RouteLocationRaw): RouteLocationRaw {
  if (!isDemoMode()) return to;

  if (typeof to === 'string') {
    if (
      to.startsWith('/login') ||
      to.startsWith('/ui-') ||
      to.startsWith('/chart-') ||
      isDemoPath(to)
    ) {
      return to;
    }
    const [pathname, search = ''] = to.split('?');
    const next = withDemoPrefix(pathname || '/');
    return search ? `${next}?${search}` : next;
  }

  if (typeof to === 'object' && to !== null && 'path' in to && typeof to.path === 'string') {
    const path = to.path;
    if (
      path.startsWith('/login') ||
      path.startsWith('/ui-') ||
      path.startsWith('/chart-') ||
      isDemoPath(path)
    ) {
      return to;
    }
    return { ...to, path: withDemoPrefix(path) };
  }

  return to;
}
