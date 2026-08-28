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

const uiStore = useUiStore();
const incidentsStore = useIncidentsStore();
const route = useRoute();
const sidebarRef = ref<InstanceType<typeof AppSidebar> | null>(null);

const quickNoteVisible = ref(false);
const draftCount = ref(0);

/** 当前页面标题 */
const pageTitle = computed(() => {
  if (route.path.match(/^\/students\/\d+/)) return '学生详情';
  if (route.path.match(/^\/scores\/exams\/\d+\/enter/)) return '成绩录入';
  if (route.path.match(/^\/scores\/exams\/\d+$/)) return '考试详情';
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
    '/analysis': '分析中心',
    '/settings': '系统设置',
  };
  return titleMap[route.path] ?? 'ClassPilot';
});

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
  void refreshDraftCount();
});

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
});
</script>

<template>
  <div class="app-layout">
    <AppSidebar
      ref="sidebarRef"
      :collapsed="uiStore.sidebarCollapsed"
    />
    <div class="app-layout__main">
      <AppTopbar
        :collapsed="uiStore.sidebarCollapsed"
        :page-title="pageTitle"
        :draft-count="draftCount"
        @toggle-sidebar="uiStore.toggleSidebar()"
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
  overflow-x: hidden;
  background: var(--cp-page-atmosphere);
}
</style>
