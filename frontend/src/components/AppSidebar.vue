<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import type { NavGroup } from '@/types';

const route = useRoute();

/** 导航分组配置 */
const navGroups: NavGroup[] = [
  {
    label: '工作台',
    items: [{ path: '/', title: '首页看板', icon: 'Odometer' }],
  },
  {
    label: '学生',
    items: [{ path: '/students', title: '花名册', icon: 'User' }],
  },
  {
    label: '成绩',
    items: [{ path: '/scores', title: '考试管理', icon: 'Document' }],
  },
  {
    label: '事件',
    items: [{ path: '/incidents', title: '事件记录', icon: 'Bell' }],
  },
  {
    label: '知识库',
    items: [
      { path: '/knowledge', title: '文档管理', icon: 'Reading' },
      { path: '/knowledge/ask', title: '智能问答', icon: 'ChatDotRound' },
    ],
  },
  {
    label: 'AI',
    items: [
      { path: '/ai/comments', title: '评语工作台', icon: 'EditPen' },
      { path: '/ai/ask', title: '学情问答', icon: 'ChatLineSquare' },
      { path: '/ai/talk', title: '沟通话术', icon: 'Phone' },
      { path: '/ai/summary', title: '工作总结', icon: 'Memo' },
      { path: '/ai/prompts', title: '模板管理', icon: 'Notebook' },
      { path: '/ai/records', title: '生成历史', icon: 'Clock' },
    ],
  },
  {
    label: '分析',
    items: [{ path: '/analysis', title: '分析中心', icon: 'TrendCharts' }],
  },
  {
    label: '系统',
    items: [{ path: '/recycle', title: '回收站', icon: 'Delete' }],
  },
];

defineProps<{
  collapsed: boolean;
}>();

/** 当前激活菜单路径 */
const activeMenu = computed(() => {
  const path = route.path;
  if (path === '/') return '/';
  if (path.startsWith('/students')) return '/students';
  if (path.startsWith('/scores')) return '/scores';
  if (path.startsWith('/incidents')) return '/incidents';
  if (path.startsWith('/knowledge/ask')) return '/knowledge/ask';
  if (path.startsWith('/knowledge')) return '/knowledge';
  if (path.startsWith('/ai/comments')) return '/ai/comments';
  if (path.startsWith('/ai/ask')) return '/ai/ask';
  if (path.startsWith('/ai/talk')) return '/ai/talk';
  if (path.startsWith('/ai/summary')) return '/ai/summary';
  if (path.startsWith('/ai/prompts')) return '/ai/prompts';
  if (path.startsWith('/ai/records')) return '/ai/records';
  if (path.startsWith('/analysis')) return '/analysis';
  if (path.startsWith('/recycle')) return '/recycle';
  return path;
});
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--collapsed': collapsed }">
    <div class="sidebar__logo">
      <img src="/favicon.svg" alt="ClassPilot" class="sidebar__logo-icon" />
      <div v-show="!collapsed" class="sidebar__brand">
        <span class="sidebar__logo-text">ClassPilot</span>
        <span class="sidebar__logo-tag">班级领航员</span>
      </div>
    </div>
    <el-scrollbar class="sidebar__scroll">
      <el-menu
        :default-active="activeMenu"
        :collapse="collapsed"
        :collapse-transition="false"
        :show-timeout="100"
        :hide-timeout="80"
        popper-class="sidebar-menu-tooltip"
        router
        class="sidebar-menu"
      >
        <template v-for="group in navGroups" :key="group.label">
          <div v-show="!collapsed" class="sidebar__group-label">{{ group.label }}</div>
          <el-menu-item
            v-for="item in group.items"
            :key="item.path"
            :index="item.path"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <template #title>{{ item.title }}</template>
          </el-menu-item>
        </template>
      </el-menu>
    </el-scrollbar>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 244px;
  height: 100%;
  flex-shrink: 0;
  background: var(--cp-bg-card);
  border-right: 1px solid var(--cp-border);
  display: flex;
  flex-direction: column;
  padding: 12px 10px 12px;
  box-shadow: 6px 0 28px rgba(37, 99, 235, 0.06);
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.sidebar--collapsed {
  width: 72px;
  padding: 12px 8px;
}

.sidebar--collapsed .sidebar__logo {
  justify-content: center;
  padding: 10px;
}

.sidebar__logo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 12px;
  margin-bottom: 12px;
  border-radius: 14px;
  background: var(--cp-gradient-brand);
  color: #fff;
  box-shadow: 0 12px 28px rgba(37, 99, 235, 0.28);
  flex-shrink: 0;
}

.sidebar__logo-icon {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 4px;
  box-sizing: border-box;
}

.sidebar__brand {
  min-width: 0;
}

.sidebar__logo-text {
  display: block;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
  line-height: 1.2;
  white-space: nowrap;
}

.sidebar__logo-tag {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.82);
  white-space: nowrap;
}

.sidebar__scroll {
  flex: 1;
  min-height: 0;
}

.sidebar__scroll :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.sidebar__group-label {
  padding: var(--cp-gap-3) var(--cp-gap-3) var(--cp-gap-1);
  font-size: var(--cp-font-xs);
  font-weight: 600;
  color: var(--cp-text-3);
  letter-spacing: 0.04em;
  line-height: 1.4;
}

.sidebar-menu {
  border-right: none;
  padding: var(--cp-gap-1) 0 var(--cp-gap-3);
  background: transparent;
}
</style>
