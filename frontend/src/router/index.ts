import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalized,
  type RouteRecordRaw,
  type Router,
} from 'vue-router';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth';
import { activateDemoMode, deactivateDemoMode, isDemoMode } from '@/demo/mode';
import {
  isDemoPath,
  rewriteToDemoIfNeeded,
  stripDemoPrefix,
  withDemoPrefix,
} from '@/demo/path';
import { resetDemoDb } from '@/demo/db';

/** 业务子路由（正式站与 /demo 共用组件） */
function buildAppChildren(namePrefix: '' | 'Demo'): RouteRecordRaw[] {
  const n = (name: string): string => (namePrefix ? `${namePrefix}${name}` : name);
  return [
    {
      path: '',
      name: n('Dashboard'),
      component: () => import('@/views/dashboard/DashboardView.vue'),
    },
    {
      path: 'students',
      name: n('StudentList'),
      component: () => import('@/views/students/StudentListView.vue'),
    },
    {
      path: 'students/:id',
      name: n('StudentDetail'),
      component: () => import('@/views/students/StudentDetailView.vue'),
    },
    {
      path: 'scores',
      name: n('ScoreList'),
      component: () => import('@/views/scores/ScoreListView.vue'),
    },
    {
      path: 'scores/exams/:id',
      name: n('ExamDetail'),
      component: () => import('@/views/scores/ExamDetailView.vue'),
    },
    {
      path: 'incidents',
      name: n('IncidentList'),
      component: () => import('@/views/incidents/IncidentListView.vue'),
    },
    {
      path: 'incidents/:id',
      name: n('IncidentDetail'),
      component: () => import('@/views/incidents/IncidentDetailView.vue'),
    },
    {
      path: 'knowledge',
      name: n('Knowledge'),
      component: () => import('@/views/knowledge/KnowledgeListView.vue'),
    },
    {
      path: 'knowledge/ask',
      name: n('KnowledgeAsk'),
      component: () => import('@/views/knowledge/KnowledgeAskView.vue'),
    },
    {
      path: 'ai/comments',
      name: n('AiComments'),
      component: () => import('@/views/ai/CommentsWorkbenchView.vue'),
    },
    {
      path: 'ai/ask',
      name: n('AiDataAsk'),
      component: () => import('@/views/ai/DataAskView.vue'),
    },
    {
      path: 'ai/talk',
      name: n('AiTalkScript'),
      component: () => import('@/views/ai/TalkScriptView.vue'),
    },
    {
      path: 'ai/summary',
      name: n('AiWorkSummary'),
      component: () => import('@/views/ai/WorkSummaryView.vue'),
    },
    {
      path: 'ai/prompts',
      name: n('AiPrompts'),
      component: () => import('@/views/ai/PromptsView.vue'),
    },
    {
      path: 'ai/records',
      name: n('AiRecords'),
      component: () => import('@/views/ai/RecordsView.vue'),
    },
    {
      path: 'analysis',
      name: n('Analysis'),
      component: () => import('@/views/analysis/AnalysisView.vue'),
    },
    {
      path: 'recycle',
      name: n('RecycleBin'),
      component: () => import('@/views/recycle/RecycleBinView.vue'),
    },
    {
      path: 'settings',
      name: n('Settings'),
      component: () => import('@/views/settings/SettingsView.vue'),
    },
  ];
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/ui-preview',
      name: 'UiPreview',
      component: () => import('@/views/preview/UiPreviewView.vue'),
      meta: { public: true },
    },
    {
      path: '/chart-styles',
      name: 'ChartStyles',
      component: () => import('@/views/preview/ChartStylesPreviewView.vue'),
      meta: { public: true },
    },
    {
      path: '/scores/exams/:id/enter',
      name: 'ScoreEntry',
      component: () => import('@/views/scores/ScoreEntryView.vue'),
      meta: { layout: 'fullscreen' },
    },
    {
      path: '/demo/scores/exams/:id/enter',
      name: 'DemoScoreEntry',
      component: () => import('@/views/scores/ScoreEntryView.vue'),
      meta: { layout: 'fullscreen', demo: true, public: true },
    },
    {
      path: '/',
      component: AppLayout,
      children: buildAppChildren(''),
    },
    {
      path: '/demo',
      component: AppLayout,
      meta: { demo: true, public: true },
      children: buildAppChildren('Demo'),
    },
  ],
});

/** 包装 push/replace：演示会话内自动加 /demo 前缀 */
function patchRouterNavigation(r: Router): void {
  const rawPush = r.push.bind(r);
  const rawReplace = r.replace.bind(r);
  r.push = ((to, ...rest: unknown[]) => {
    const next = rewriteToDemoIfNeeded(to);
    return (rawPush as (...args: unknown[]) => unknown)(next, ...rest);
  }) as Router['push'];
  r.replace = ((to, ...rest: unknown[]) => {
    const next = rewriteToDemoIfNeeded(to);
    return (rawReplace as (...args: unknown[]) => unknown)(next, ...rest);
  }) as Router['replace'];
}

patchRouterNavigation(router);

/** 进入演示：激活标记、重置/保留内存库、注入假用户 */
function enterDemo(authStore: ReturnType<typeof useAuthStore>, to: RouteLocationNormalized): void {
  const wasDemo = isDemoMode();
  activateDemoMode();
  // 首次进入演示时重置种子，保证数据干净；同会话内跳转不重置
  if (!wasDemo) {
    resetDemoDb();
  }
  authStore.enterDemoSession();
  void to;
}

/** 路由守卫：未登录跳转登录；/demo 免登录且不打真实 API */
router.beforeEach(async (to) => {
  const authStore = useAuthStore();

  if (isDemoPath(to.path) || to.matched.some((r) => r.meta.demo)) {
    enterDemo(authStore, to);
    return true;
  }

  // 演示会话中：除登录/预览外，强制留在 /demo 树，避免误请求生产库
  if (isDemoMode()) {
    if (
      to.path === '/login' ||
      to.path.startsWith('/ui-') ||
      to.path.startsWith('/chart-')
    ) {
      deactivateDemoMode();
      authStore.exitDemoSession();
      return true;
    }
    return {
      path: withDemoPrefix(to.path),
      query: to.query,
      hash: to.hash,
    };
  }

  if (!authStore.bootstrapped) {
    await authStore.fetchMe();
  }

  const isPublic = Boolean(to.meta.public);
  if (!authStore.isLoggedIn && !isPublic) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (authStore.isLoggedIn && to.path === '/login') {
    return { path: '/' };
  }
  return true;
});

export { stripDemoPrefix };
export default router;
