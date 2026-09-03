<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { EditPen, Hide } from '@element-plus/icons-vue';
import { ApiError } from '@/api/http';
import { dashboardHomeApi, type ScoreBrief } from '@/api/dashboard';
import WeeklyScheduleCard from '@/components/WeeklyScheduleCard.vue';
import ScoreBriefSection from '@/components/ScoreBriefSection.vue';
import type { Student } from '@/types';
import type { IncidentListItem } from '@/api/incidents';

const router = useRouter();

const focusStudents = ref<Student[]>([]);
const draftCount = ref(0);
const dueFollowUps = ref<IncidentListItem[]>([]);
const recentDrafts = ref<IncidentListItem[]>([]);
const scoreBrief = ref<ScoreBrief | null>(null);
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

/** 跳转学生详情 */
function goStudent(id: number): void {
  router.push(`/students/${id}`);
}

/** 跳转事件详情（待办跟进） */
function goIncident(id: number): void {
  router.push(`/incidents/${id}`);
}

/** 待办区是否为空（空态不限制高度，避免多余滚动条） */
const isTodoEmpty = computed(
  () =>
    dueFollowUps.value.length === 0 &&
    recentDrafts.value.length === 0 &&
    draftCount.value === 0,
);

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
    const home = await dashboardHomeApi();
    focusStudents.value = home.focusStudents;
    draftCount.value = home.draftCount;
    dueFollowUps.value = home.dueFollowUps;
    recentDrafts.value = home.recentDrafts;
    scoreBrief.value = home.scoreBrief;
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
    <!-- 左课表 + 右待办/关注（去掉英雄横幅，优先首屏完整展示课表） -->
    <div class="dashboard__split">
      <WeeklyScheduleCard compact class="dashboard__schedule" />

      <div class="dashboard__side">
        <section class="dashboard__side-block cp-animate-in cp-animate-in--delay-1">
          <div class="cp-page-header dashboard__side-header">
            <div>
              <h2 class="cp-page-header__title">待办跟进</h2>
              <p class="cp-page-header__desc">到期未完成与速记草稿</p>
            </div>
            <router-link to="/incidents">
              <el-button text type="primary">全部</el-button>
            </router-link>
          </div>
          <el-card
            shadow="never"
            class="dashboard__todo-card dashboard__todo-card--side"
            :class="{ 'dashboard__todo-card--empty': isTodoEmpty }"
          >
            <div v-if="isTodoEmpty">
              <el-empty description="暂无待办事项" :image-size="56" />
            </div>
            <div v-else class="todo-list">
              <div
                v-for="item in dueFollowUps"
                :key="`follow-${item.id}`"
                class="todo-item todo-item--clickable"
                role="button"
                tabindex="0"
                @click="goIncident(item.id)"
                @keydown.enter="goIncident(item.id)"
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

        <section class="dashboard__side-block cp-animate-in cp-animate-in--delay-2">
          <div class="cp-page-header dashboard__side-header">
            <div>
              <h2 class="cp-page-header__title">重点关注</h2>
              <p class="cp-page-header__desc">focus_level ≥ 2</p>
            </div>
            <router-link to="/students">
              <el-button text type="primary">花名册</el-button>
            </router-link>
          </div>
          <div v-if="focusStudents.length === 0" class="cp-card dashboard__empty">
            <el-empty description="暂无重点关注学生" :image-size="56" />
          </div>
          <div v-else class="focus-grid focus-grid--side">
            <div
              v-for="student in focusStudents"
              :key="student.id"
              class="focus-card cp-card cp-card--hoverable"
              :class="{ 'focus-card--warning': (student.daysSinceLastContact ?? 0) > 21 }"
              @click="goStudent(student.id)"
            >
              <div class="focus-card__header">
                <el-avatar :size="40" class="focus-card__avatar">
                  {{ student.name.charAt(0) }}
                </el-avatar>
                <div class="focus-card__info">
                  <span class="focus-card__name">{{ student.name }}</span>
                  <el-tag :type="focusLevelType(student.focusLevel)" size="small" round>
                    {{ focusLevelLabel(student.focusLevel) }}
                  </el-tag>
                </div>
              </div>
              <el-tooltip
                v-if="student.lastIncidentSummary"
                :content="student.lastIncidentSummary"
                placement="top"
                effect="light"
                :show-after="280"
                :hide-after="0"
                popper-class="focus-card__summary-popper"
              >
                <p class="focus-card__summary focus-card__summary--masked" @click.stop>
                  <el-icon class="focus-card__summary-icon"><Hide /></el-icon>
                  <span>悬停查看近况</span>
                </p>
              </el-tooltip>
              <div v-if="student.daysSinceLastContact !== undefined" class="focus-card__contact">
                沟通 {{ student.daysSinceLastContact }} 天前
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <ScoreBriefSection v-if="scoreBrief" :brief="scoreBrief" />
  </div>
</template>

<style scoped>
.dashboard__split {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: var(--cp-gap-5);
  align-items: stretch;
  margin-bottom: var(--cp-gap-6);
}

.dashboard__schedule {
  min-width: 0;
}

.dashboard__side {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-5);
  min-width: 0;
}

.dashboard__side-block {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-3);
  min-height: 0;
}

.dashboard__side-header {
  margin-bottom: 0;
}

.dashboard__side-header .cp-page-header__title {
  font-size: var(--cp-font-md);
}

.dashboard__todo-card {
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-card);
  box-shadow: var(--cp-shadow-1);
}

.dashboard__todo-card--side {
  flex: 1;
}

/* 有待办时才限高滚动；空态去掉 overflow，避免空白滚动条 */
.dashboard__todo-card--side:not(.dashboard__todo-card--empty) :deep(.el-card__body) {
  max-height: 220px;
  overflow-y: auto;
}

.dashboard__todo-card--empty :deep(.el-card__body) {
  overflow: hidden;
}

.dashboard__todo-card--empty :deep(.el-empty) {
  padding: var(--cp-gap-3) 0;
}

.dashboard__empty {
  padding: var(--cp-gap-3);
}

.focus-grid--side {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cp-gap-3);
}

.focus-grid--side .focus-card {
  padding: 12px;
}

.focus-grid--side .focus-card__summary {
  margin-bottom: var(--cp-gap-1);
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
  margin-bottom: var(--cp-gap-2);
}

.focus-card__info {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-1);
}

.focus-card__avatar {
  background: var(--cp-gradient-avatar);
  color: #fff;
  font-weight: 800;
  font-size: var(--cp-font-base);
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
  color: var(--cp-text-3);
  line-height: 1.55;
}

/* 近况摘要默认脱敏：仅悬停 tooltip 展示全文，降低被旁人瞥见的风险 */
.focus-card__summary--masked {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: var(--cp-radius-ctl);
  background: var(--cp-bg-page);
  border: 1px dashed var(--cp-divider);
  cursor: help;
  user-select: none;
}

.focus-card__summary-icon {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--cp-text-3);
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

.todo-item--clickable {
  cursor: pointer;
  border-radius: var(--cp-radius-ctl);
  margin: 0 calc(var(--cp-gap-2) * -1);
  padding-left: var(--cp-gap-2);
  padding-right: var(--cp-gap-2);
  transition: background-color 0.15s ease;
}

.todo-item--clickable:hover {
  background: var(--cp-primary-bg);
}

.todo-item--clickable:hover .todo-item__title {
  color: var(--cp-primary);
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
</style>

<style>
/* tooltip 挂到 body，需非 scoped；白色气泡与设计令牌对齐 */
.focus-card__summary-popper.el-popper {
  max-width: 320px;
  padding: 12px 14px;
  border-radius: var(--cp-radius-card);
  border: 1px solid var(--cp-border);
  background: var(--cp-bg-card);
  color: var(--cp-text-1);
  font-size: var(--cp-font-sm);
  line-height: 1.6;
  word-break: break-word;
  box-shadow: var(--cp-shadow-2);
}

.focus-card__summary-popper .el-popper__arrow::before {
  border: 1px solid var(--cp-border);
  background: var(--cp-bg-card);
}
</style>
