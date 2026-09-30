<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { useIncidentsStore } from '@/stores/incidents';
import AppSidebar from '@/components/AppSidebar.vue';
import AppTopbar from '@/components/AppTopbar.vue';
import QuickNoteDialog from '@/components/QuickNoteDialog.vue';
import { draftCountApi } from '@/api/incidents';
import { ApiError } from '@/api/http';
import { stripDemoPrefix } from '@/demo/path';

const uiStore = useUiStore();
const incidentsStore = useIncidentsStore();
const route = useRoute();
const sidebarRef = ref<InstanceType<typeof AppSidebar> | null>(null);

const quickNoteVisible = ref(false);
/** 窄屏下侧栏以抽屉形式展开 */
const mobileNavOpen = ref(false);
/** 移动端断点（与 styles/mobile.css 的 768px 保持一致） */
const MOBILE_BP = 768;
const isMobile = ref(false);
const draftCount = ref(0);

/** 当前页面标题 */
const pageTitle = computed(() => {
  const path = stripDemoPrefix(route.path);
  if (path.match(/^\/students\/\d+/)) return '学生详情';
  if (path.match(/^\/incidents\/\d+/)) return '事件详情';
  if (path.match(/^\/scores\/exams\/\d+\/enter/)) return '成绩录入';
  if (path.match(/^\/scores\/exams\/\d+$/)) return '考试详情';
  const titleMap: Record<string, string> = {
    '/': '首页看板',
    '/students': '花名册',
    '/scores': '考试管理',
    '/incidents': '事件记录',
    '/knowledge': '文档管理',
    '/knowledge/ask': '智能问答',
    '/ai/comments': '评语工作台',
    '/ai/ask': '学情问答',
    '/ai/prompts': '模板管理',
    '/ai/records': '生成历史',
    '/ai/talk': '沟通话术',
    '/ai/summary': '学期工作总结',
    '/recycle': '回收站',
    '/analysis': '分析中心',
    '/settings': '系统设置',
  };
  return titleMap[path] ?? 'ClassPilot';
});

/** 窄屏用抽屉，宽屏沿用原有折叠行为 */
function onToggleSidebar(): void {
  if (isMobile.value) {
    mobileNavOpen.value = !mobileNavOpen.value;
    return;
  }
  uiStore.toggleSidebar();
}

/** 视口跨越断点时复位窄屏抽屉，避免状态残留 */
function syncViewport(): void {
  const mobile = window.innerWidth <= MOBILE_BP;
  if (mobile !== isMobile.value) {
    isMobile.value = mobile;
    if (!mobile) {
      mobileNavOpen.value = false;
    }
  }
}

/** 打开速记弹窗 */
function openQuickNote(): void {
  quickNoteVisible.value = true;
}

/** 刷新待整理草稿角标 */
async function refreshDraftCount(): Promise<void> {
  try {
    const res = await draftCountApi();
    draftCount.value = res.count;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      // 角标失败静默，避免打扰主流程
      return;
    }
  }
}

/** 全局 Alt+Q 唤起速记 */
function onGlobalKeydown(event: KeyboardEvent): void {
  if (event.altKey && (event.key === 'q' || event.key === 'Q')) {
    event.preventDefault();
    openQuickNote();
  }
}

/** 速记保存后刷新角标，并通知事件记录页更新 */
function handleQuickNoteSaved(): void {
  incidentsStore.bumpDataVersion();
}

watch(
  () => incidentsStore.dataVersion,
  () => {
    void refreshDraftCount();
  },
);

provide('openQuickNote', openQuickNote);

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('resize', syncViewport);
  syncViewport();
  void refreshDraftCount();
});

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  window.removeEventListener('resize', syncViewport);
});
</script>

<template>
  <div
    class="app-layout"
    :class="{ 'app-layout--mobile': isMobile, 'app-layout--nav-open': isMobile && mobileNavOpen }"
  >
    <AppSidebar
      ref="sidebarRef"
      :collapsed="uiStore.sidebarCollapsed"
      :mobile-open="mobileNavOpen"
      @navigate="mobileNavOpen = false"
    />
    <div
      v-if="isMobile && mobileNavOpen"
      class="sidebar__mask"
      @click="mobileNavOpen = false"
    />
    <div class="app-layout__main">
      <AppTopbar
        :collapsed="uiStore.sidebarCollapsed"
        :page-title="pageTitle"
        :draft-count="draftCount"
        @toggle-sidebar="onToggleSidebar"
        @open-quick-note="openQuickNote"
      />
      <main class="app-layout__content cp-animate-in">
        <RouterView v-slot="{ Component }">
          <transition name="cp-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </RouterView>
      </main>
    </div>

    <QuickNoteDialog
      v-model="quickNoteVisible"
      @saved="handleQuickNoteSaved"
    />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.app-layout__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.app-layout__content {
  flex: 1;
  min-height: 0;
  padding: var(--cp-gap-5);
  overflow-y: auto;
  overflow-x: auto;
  background: var(--cp-page-atmosphere);
}
</style>
