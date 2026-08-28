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
  authStore.clearSession();
  if (router.currentRoute.value.path !== '/login') {
    void router.replace({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } });
  }
});

app.mount('#app');
