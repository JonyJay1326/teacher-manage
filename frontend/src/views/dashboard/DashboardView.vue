<script setup lang="ts">
import { ref, onMounted, inject } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { EditPen } from '@element-plus/icons-vue';
import { ApiError } from '@/api/http';
import { listTagsApi } from '@/api/students';
import { dashboardHomeApi } from '@/api/dashboard';
import type { Student, Tag } from '@/types';
import type { IncidentListItem } from '@/api/incidents';

const router = useRouter();
const openQuickNote = inject<() => void>('openQuickNote');

const focusStudents = ref<Student[]>([]);
const tagsById = ref<Map<number, Tag>>(new Map());
const draftCount = ref(0);
const dueFollowUps = ref<IncidentListItem[]>([]);
const recentDrafts = ref<IncidentListItem[]>([]);
const loading = ref(false);

/** 关注等级标签文字 */
function focusLevelLabel(level: number): string {
  const labels = ['普通', '关注', '重点', '最高'];
  return labels[level] ?? '普通';
}

/** 关注等级标签类型 */
function focusLevelType(level: number): 'info' | 'warning' | 'danger' {
  if (level >= 3) return 'danger';
  if (level >= 2) return 'warning';
  return 'info';
}

/** 可见标签（仅 L0） */
function visibleTags(tagIds: number[]): Tag[] {
  return tagIds
    .map((id) => tagsById.value.get(id))
    .filter((t): t is Tag => t !== undefined && t.sensitiveLevel === 0);
}

/** 跳转学生详情 */
function goStudent(id: number): void {
  router.push(`/students/${id}`);
}

/** 打开速记窗 */
function handleOpenQuickNote(): void {
  openQuickNote?.();
}

/** 待办标题展示 */
function todoTitle(item: IncidentListItem): string {
  if (item.title) return item.title;
  if (item.content) return item.content.slice(0, 24);
  return '未命名';
}

/** 格式化发生时间 */
function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 加载看板数据 */
async function loadDashboard(): Promise<void> {
  loading.value = true;
  try {
    const [home, tags] = await Promise.all([dashboardHomeApi(), listTagsApi()]);
    focusStudents.value = home.focusStudents;
    tagsById.value = new Map(tags.map((t) => [t.id, t]));
    draftCount.value = home.draftCount;
    dueFollowUps.value = home.dueFollowUps;
    recentDrafts.value = home.recentDrafts;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载看板失败');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadDashboard();
});
</script>

<template>
  <div class="dashboard" v-loading="loading">
    <div class="cp-hero cp-animate-in">
      <div>
        <div class="cp-hero__kicker">ClassPilot</div>
        <h1 class="cp-hero__title">首页看板</h1>
        <p class="cp-hero__desc">今天该找谁、哪些事还没收尾——先看重点关注与待办跟进</p>
      </div>
      <el-button
        type="primary"
        class="dashboard__hero-cta"
        :icon="EditPen"
        @click="handleOpenQuickNote"
      >
        速记
      </el-button>
    </div>

    <!-- ① 重点关注卡片墙 -->
    <section class="dashboard__section cp-animate-in cp-animate-in--delay-1">
      <div class="cp-page-header">
        <div>
          <h2 class="cp-page-header__title">重点关注</h2>
          <p class="cp-page-header__desc">focus_level ≥ 2 的学生，今天该找谁</p>
        </div>
      </div>
      <div v-if="focusStudents.length === 0" class="cp-card dashboard__empty">
        <el-empty description="暂无重点关注学生" :image-size="72" />
      </div>
      <div v-else class="focus-grid">
        <div
          v-for="student in focusStudents"
          :key="student.id"
          class="focus-card cp-card cp-card--hoverable"
          :class="{ 'focus-card--warning': (student.daysSinceLastContact ?? 0) > 21 }"
          @click="goStudent(student.id)"
        >
          <div class="focus-card__header">
            <el-avatar :size="48" class="focus-card__avatar">
              {{ student.name.charAt(0) }}
            </el-avatar>
            <div class="focus-card__info">
              <span class="focus-card__name">{{ student.name }}</span>
              <el-tag :type="focusLevelType(student.focusLevel)" size="default" round>
                {{ focusLevelLabel(student.focusLevel) }}
              </el-tag>
            </div>
          </div>
          <div class="focus-card__tags">
            <el-tag
              v-for="tag in visibleTags(student.tagIds)"
              :key="tag.id"
              type="info"
              effect="plain"
              size="default"
              round
            >
              {{ tag.name }}
            </el-tag>
          </div>
          <p v-if="student.lastIncidentSummary" class="focus-card__summary">
            {{ student.lastIncidentSummary }}
          </p>
          <div v-if="student.daysSinceLastContact !== undefined" class="focus-card__contact">
            上次家校沟通：{{ student.daysSinceLastContact }} 天前
          </div>
        </div>
      </div>
    </section>

    <!-- ② 待办跟进 -->
    <section class="dashboard__section cp-animate-in cp-animate-in--delay-2">
      <div class="cp-page-header">
        <div>
          <h2 class="cp-page-header__title">待办跟进</h2>
          <p class="cp-page-header__desc">到期未完成的事件与速记草稿</p>
        </div>
        <router-link to="/incidents">
          <el-button text type="primary">查看全部</el-button>
        </router-link>
      </div>
      <el-card shadow="never" class="dashboard__todo-card">
        <div
          v-if="dueFollowUps.length === 0 && recentDrafts.length === 0 && draftCount === 0"
        >
          <el-empty description="暂无待办事项" :image-size="80" />
        </div>
        <div v-else class="todo-list">
          <div
            v-for="item in dueFollowUps"
            :key="`follow-${item.id}`"
            class="todo-item"
          >
            <span class="todo-item__dot cp-pulse-dot" />
            <div class="todo-item__content">
              <span class="todo-item__title">{{ todoTitle(item) }}</span>
              <span class="todo-item__meta">
                {{ item.studentNames.join('、') || '未关联学生' }}
                · 截止 {{ formatShortDate(item.followUpDeadline ?? item.occurredAt) }}
              </span>
            </div>
          </div>
          <div
            v-for="draft in recentDrafts"
            :key="`draft-${draft.id}`"
            class="todo-item todo-item--draft-entry"
          >
            <el-icon color="var(--cp-warning)"><EditPen /></el-icon>
            <div class="todo-item__content">
              <router-link to="/incidents?tab=draft" class="todo-item__draft-link">
                {{ todoTitle(draft) }}
              </router-link>
              <span class="todo-item__meta">
                {{ draft.studentNames.join('、') || '未关联学生' }}
                · {{ formatShortDate(draft.occurredAt) }}
              </span>
            </div>
          </div>
          <div v-if="draftCount > recentDrafts.length" class="todo-item todo-item--draft">
            <router-link to="/incidents?tab=draft" class="todo-item__draft-link">
              还有 {{ draftCount - recentDrafts.length }} 条速记草稿待整理
            </router-link>
          </div>
        </div>
      </el-card>
    </section>
  </div>
</template>

<style scoped>
.dashboard__hero-cta {
  --el-button-bg-color: #fff;
  --el-button-border-color: #fff;
  --el-button-text-color: var(--cp-primary-active);
  --el-button-hover-bg-color: #f8fafc;
  --el-button-hover-border-color: #f8fafc;
  --el-button-hover-text-color: var(--cp-primary-active);
  border-radius: 999px;
  font-weight: 700;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
}

.dashboard__section {
  margin-bottom: var(--cp-gap-6);
}

.dashboard__todo-card {
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-card);
  box-shadow: var(--cp-shadow-1);
}

.dashboard__empty {
  padding: var(--cp-gap-4);
}

.focus-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--cp-gap-4);
}

.focus-card {
  padding: 18px;
}

.focus-card--warning {
  border-color: #fdba74;
  background: linear-gradient(180deg, #fff7ed 0%, #ffffff 65%);
  box-shadow: 0 14px 36px rgba(234, 88, 12, 0.12);
}

.focus-card__header {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-3);
  margin-bottom: var(--cp-gap-3);
}

.focus-card__info {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-1);
}

.focus-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cp-gap-1);
  margin-bottom: var(--cp-gap-2);
}

.focus-card__avatar {
  background: var(--cp-gradient-avatar);
  color: #fff;
  font-weight: 800;
  font-size: var(--cp-font-md);
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.28);
}

.focus-card__name {
  font-size: var(--cp-font-base);
  font-weight: 600;
  color: var(--cp-text-1);
}

.focus-card__summary {
  margin: 0 0 var(--cp-gap-2);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.focus-card__contact {
  font-size: var(--cp-font-xs);
  font-weight: 700;
  color: var(--cp-warning);
}

.focus-card--warning .focus-card__contact {
  color: var(--cp-danger);
}

.todo-list {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-3);
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: var(--cp-gap-3);
  padding: var(--cp-gap-2) 0;
}

.todo-item__dot {
  width: 10px;
  height: 10px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--cp-danger);
  flex-shrink: 0;
  box-shadow: 0 0 0 4px var(--cp-danger-bg);
  z-index: 1;
}

.todo-item__content {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-1);
}

.todo-item__title {
  font-size: var(--cp-font-base);
  font-weight: 500;
  color: var(--cp-text-1);
}

.todo-item__meta {
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
}

.todo-item--draft-entry {
  align-items: flex-start;
}

.todo-item--draft {
  padding-top: var(--cp-gap-3);
  border-top: 1px solid var(--cp-divider);
}

.todo-item__draft-link {
  font-size: var(--cp-font-sm);
  font-weight: 700;
  color: var(--cp-warning);
  text-decoration: none;
}

.todo-item__draft-link:hover {
  text-decoration: underline;
}

@media (min-width: 1600px) {
  .focus-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
