/**
 * ClassPilot Service Worker
 *
 * 策略：只缓存静态资源（HTML/JS/CSS/图标），API 一律走网络。
 * 原因：成绩、评语、事件等业务数据必须实时，绝不能被缓存出脏数据。
 *
 * 注意：Service Worker 只在 HTTPS 或 localhost 下才会注册。
 */
const VERSION = 'cp-v1';
const SHELL_CACHE = `classpilot-shell-${VERSION}`;
const ASSET_CACHE = `classpilot-asset-${VERSION}`;

/** 预缓存的应用外壳 */
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

/** 安装：预缓存外壳 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

/** 激活：清理旧版本缓存 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** 判断是否 API 请求（必须走网络） */
function isApi(url) {
  return url.pathname.startsWith('/api/');
}

/** 判断是否导航请求（HTML） */
function isNavigation(request) {
  return request.mode === 'navigate';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // API：只走网络，不缓存
  if (isApi(url)) return;

  // 导航：网络优先，失败回落到缓存的 index.html（离线兜底）
  if (isNavigation(request)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    );
    return;
  }

  // 静态资源：缓存优先 + 后台更新
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
