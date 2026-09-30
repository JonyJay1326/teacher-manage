import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from './App.vue';
import router from './router';
import { setUnauthorizedHandler } from './api/http';
import { useAuthStore } from './stores/auth';
import './styles/global.css';
import './styles/mobile.css';

/** Element Plus 与日期组件使用中文 */
dayjs.locale('zh-cn');

const app = createApp(App);

/** 注册 Element Plus 图标 */
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

const pinia = createPinia();
app.use(pinia);
app.use(router);
app.use(ElementPlus, { locale: zhCn });

setUnauthorizedHandler(() => {
  const authStore = useAuthStore(pinia);
  // 演示模式永不踢到登录（也不应打到真实 API）
  if (router.currentRoute.value.path.startsWith('/demo')) {
    return;
  }
  authStore.clearSession();
  if (router.currentRoute.value.path !== '/login') {
    void router.replace({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } });
  }
});

app.mount('#app');

/**
 * 注册 Service Worker（仅生产构建）。
 *
 * 浏览器只在 HTTPS 或 localhost 下允许注册；HTTP + 局域网 IP 下会静默失败，
 * 因此注册失败不影响任何业务功能。
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 非 HTTPS 环境下必然失败，属预期情况，不打扰用户
    });
  });
}

