import { createRouter, createWebHistory } from 'vue-router';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth';

/** 应用路由配置 */
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
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          name: 'Dashboard',
          component: () => import('@/views/dashboard/DashboardView.vue'),
        },
        {
          path: 'students',
          name: 'StudentList',
          component: () => import('@/views/students/StudentListView.vue'),
        },
        {
          path: 'students/:id',
          name: 'StudentDetail',
          component: () => import('@/views/students/StudentDetailView.vue'),
        },
        {
          path: 'scores',
          name: 'ScoreList',
          component: () => import('@/views/scores/ScoreListView.vue'),
        },
        {
          path: 'scores/exams/:id',
          name: 'ExamDetail',
          component: () => import('@/views/scores/ExamDetailView.vue'),
        },
        {
          path: 'incidents',
          name: 'IncidentList',
          component: () => import('@/views/incidents/IncidentListView.vue'),
        },
        {
          path: 'incidents/:id',
          name: 'IncidentDetail',
          component: () => import('@/views/incidents/IncidentDetailView.vue'),
        },
        {
          path: 'knowledge',
          name: 'Knowledge',
          component: () => import('@/views/knowledge/KnowledgeListView.vue'),
        },
        {
          path: 'knowledge/ask',
          name: 'KnowledgeAsk',
          component: () => import('@/views/knowledge/KnowledgeAskView.vue'),
        },
        {
          path: 'ai/comments',
          name: 'AiComments',
          component: () => import('@/views/ai/CommentsWorkbenchView.vue'),
        },
        {
          path: 'ai/ask',
          name: 'AiDataAsk',
          component: () => import('@/views/ai/DataAskView.vue'),
        },
        {
          path: 'ai/talk',
          name: 'AiTalkScript',
          component: () => import('@/views/ai/TalkScriptView.vue'),
        },
        {
          path: 'ai/summary',
          name: 'AiWorkSummary',
          component: () => import('@/views/ai/WorkSummaryView.vue'),
        },
        {
          path: 'ai/prompts',
          name: 'AiPrompts',
          component: () => import('@/views/ai/PromptsView.vue'),
        },
        {
          path: 'ai/records',
          name: 'AiRecords',
          component: () => import('@/views/ai/RecordsView.vue'),
        },
        {
          path: 'analysis',
          name: 'Analysis',
          component: () => import('@/views/analysis/AnalysisView.vue'),
        },
        {
          path: 'recycle',
          name: 'RecycleBin',
          component: () => import('@/views/recycle/RecycleBinView.vue'),
        },
        {
          path: 'settings',
          name: 'Settings',
          component: () => import('@/views/settings/SettingsView.vue'),
        },
      ],
    },
  ],
});

/** 路由守卫：未登录跳转登录页 */
router.beforeEach(async (to) => {
  const authStore = useAuthStore();
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

export default router;
