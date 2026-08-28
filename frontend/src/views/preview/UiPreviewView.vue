<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  getFocusStudents,
  getVisibleTags,
  mockTodos,
  mockDraftCount,
} from '@/mock';

/** 预览风格：档2 参考 / 档3 淡色品牌强化（已选定） */
type PreviewStyle = 'relaxed' | 'expressive';

const router = useRouter();
const styleMode = ref<PreviewStyle>('expressive');
const activeNav = ref('/');

const focusStudents = getFocusStudents().slice(0, 4);
const todos = mockTodos.filter((t) => t.type === 'follow_up').slice(0, 3);

const navItems = [
  { path: '/', title: '首页看板', icon: 'Odometer' },
  { path: '/students', title: '花名册', icon: 'User' },
  { path: '/scores', title: '考试管理', icon: 'Document' },
  { path: '/incidents', title: '事件记录', icon: 'Bell' },
  { path: '/knowledge', title: '文档管理', icon: 'Reading' },
  { path: '/ai/comments', title: '评语工作台', icon: 'EditPen' },
  { path: '/analysis', title: '分析中心', icon: 'TrendCharts' },
  { path: '/settings', title: '系统设置', icon: 'Setting' },
];

const styleLabel = computed(() =>
  styleMode.value === 'relaxed' ? '档2 · 适度放开' : '档3 · 淡色品牌强化（已选定）',
);

const styleDesc = computed(() =>
  styleMode.value === 'relaxed'
    ? '浅色侧栏淡彩、顶区轻渐变、多一档阴影——偏工具产品'
    : '淡色底 + 品牌色块侧栏 + 主色横幅 + 更大圆角与阴影——正式骨架将按此落地',
);

/** 关注等级标签文字 */
function focusLevelLabel(level: number): string {
  const labels = ['普通', '关注', '重点', '最高'];
  return labels[level] ?? '普通';
}

/** 切换预览风格 */
function setStyle(mode: PreviewStyle): void {
  styleMode.value = mode;
}

/** 返回正式骨架 */
function goBack(): void {
  router.push('/');
}
</script>

<template>
  <div class="ui-preview" :class="`ui-preview--${styleMode}`">
    <!-- 顶部对比条（不进正式产品） -->
    <header class="ui-preview__bar">
      <div class="ui-preview__bar-left">
        <strong>视觉预览</strong>
        <span class="ui-preview__bar-hint">仅供对比 · 未改 PRD · 选定后再同步文档</span>
      </div>
      <div class="ui-preview__bar-switch">
        <button
          type="button"
          class="ui-preview__chip"
          :class="{ 'is-on': styleMode === 'relaxed' }"
          @click="setStyle('relaxed')"
        >
          档2 · 适度放开
        </button>
        <button
          type="button"
          class="ui-preview__chip"
          :class="{ 'is-on': styleMode === 'expressive' }"
          @click="setStyle('expressive')"
        >
          档3 · 已选定
        </button>
      </div>
      <el-button @click="goBack">返回正式骨架</el-button>
    </header>

    <div class="ui-preview__shell">
      <!-- 侧栏 -->
      <aside class="preview-side">
        <div class="preview-side__logo">
          <img src="/favicon.svg" alt="" class="preview-side__logo-icon" />
          <div class="preview-side__brand">
            <span class="preview-side__name">ClassPilot</span>
            <span class="preview-side__tag">班级领航员</span>
          </div>
        </div>
        <nav class="preview-side__nav">
          <button
            v-for="item in navItems"
            :key="item.path"
            type="button"
            class="preview-side__item"
            :class="{ 'is-active': activeNav === item.path }"
            @click="activeNav = item.path"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.title }}</span>
          </button>
        </nav>
      </aside>

      <!-- 主区 -->
      <div class="preview-main">
        <div class="preview-top">
          <div>
            <div class="preview-top__kicker">{{ styleLabel }}</div>
            <h1 class="preview-top__title">首页看板</h1>
            <p class="preview-top__desc">{{ styleDesc }}</p>
          </div>
          <button type="button" class="preview-top__cta">
            <el-icon><EditPen /></el-icon>
            速记
          </button>
        </div>

        <div class="preview-body">
          <section class="preview-section">
            <div class="preview-section__head">
              <h2>重点关注</h2>
              <span>今天该找谁</span>
            </div>
            <div class="preview-focus-grid">
              <article
                v-for="student in focusStudents"
                :key="student.id"
                class="preview-focus-card"
                :class="{
                  'preview-focus-card--alert': (student.daysSinceLastContact ?? 0) > 21,
                }"
              >
                <div class="preview-focus-card__row">
                  <div class="preview-focus-card__avatar">{{ student.name.charAt(0) }}</div>
                  <div>
                    <div class="preview-focus-card__name">{{ student.name }}</div>
                    <span class="preview-focus-card__level">{{ focusLevelLabel(student.focusLevel) }}</span>
                  </div>
                </div>
                <div class="preview-focus-card__tags">
                  <span
                    v-for="tag in getVisibleTags(student.tagIds).slice(0, 2)"
                    :key="tag.id"
                    class="preview-tag"
                  >
                    {{ tag.name }}
                  </span>
                </div>
                <p class="preview-focus-card__summary">{{ student.lastIncidentSummary }}</p>
                <div
                  v-if="student.daysSinceLastContact !== undefined"
                  class="preview-focus-card__meta"
                >
                  上次沟通：{{ student.daysSinceLastContact }} 天前
                </div>
              </article>
            </div>
          </section>

          <section class="preview-section">
            <div class="preview-section__head">
              <h2>待办跟进</h2>
              <span>到期未完成</span>
            </div>
            <div class="preview-todo-card">
              <div v-for="todo in todos" :key="todo.id" class="preview-todo">
                <span class="preview-todo__dot" />
                <div>
                  <div class="preview-todo__title">{{ todo.title }}</div>
                  <div class="preview-todo__meta">
                    {{ todo.studentNames.join('、') }} · 截止 {{ todo.deadline }}
                  </div>
                </div>
              </div>
              <div v-if="mockDraftCount > 0" class="preview-todo preview-todo--draft">
                待整理速记草稿 {{ mockDraftCount }} 条
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 对比条 ========== */
.ui-preview {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ui-preview__bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  height: 52px;
  padding: 0 20px;
  background: #0f172a;
  color: #f8fafc;
  z-index: 20;
}

.ui-preview__bar-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}

.ui-preview__bar-hint {
  font-size: 13px;
  color: #94a3b8;
  white-space: nowrap;
}

.ui-preview__bar-switch {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.ui-preview__chip {
  border: 1px solid #334155;
  background: transparent;
  color: #e2e8f0;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
}

.ui-preview__chip.is-on {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.ui-preview__shell {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.preview-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.preview-section {
  margin-bottom: 28px;
}

.preview-section__head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 14px;
}

.preview-section__head h2 {
  margin: 0;
  font-size: 18px;
}

.preview-section__head span {
  font-size: 13px;
  opacity: 0.7;
}

.preview-focus-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.preview-focus-card__row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.preview-focus-card__name {
  font-weight: 600;
  font-size: 15px;
}

.preview-focus-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.preview-focus-card__summary {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.preview-todo {
  display: flex;
  gap: 12px;
  padding: 12px 0;
}

.preview-todo__title {
  font-size: 15px;
  font-weight: 500;
}

.preview-todo__meta {
  font-size: 13px;
  margin-top: 4px;
  opacity: 0.75;
}

.preview-todo__dot {
  width: 10px;
  height: 10px;
  margin-top: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
}

.preview-todo__dot::before,
.preview-todo__dot::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid currentColor;
  animation: preview-pulse 2.2s ease-out infinite;
}

.preview-todo__dot::after {
  animation-delay: 1.1s;
}

@keyframes preview-pulse {
  from {
    transform: scale(1);
    opacity: 0.45;
  }
  to {
    transform: scale(2.6);
    opacity: 0;
  }
}

/* ========== 档2：适度放开 ========== */
.ui-preview--relaxed {
  --p-primary: #2563eb;
  --p-primary-soft: #dbeafe;
  --p-page: #eef2ff;
  --p-card: #ffffff;
  --p-text: #0f172a;
  --p-muted: #64748b;
  --p-side: linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
  --p-side-text: #334155;
  --p-side-active-bg: #dbeafe;
  --p-side-active-text: #1d4ed8;
  --p-top: linear-gradient(135deg, #eff6ff 0%, #f8fafc 55%, #eef2ff 100%);
  --p-shadow: 0 8px 28px rgba(37, 99, 235, 0.1);
  --p-radius: 12px;
  --p-danger: #dc2626;
  --p-warning: #ea580c;
  background: var(--p-page);
  color: var(--p-text);
}

.ui-preview--relaxed .preview-side {
  width: 232px;
  background: var(--p-side);
  border-right: 1px solid #c7d2fe;
  display: flex;
  flex-direction: column;
  padding: 8px 10px 16px;
}

.ui-preview--relaxed .preview-side__logo {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 56px;
  padding: 0 10px;
  margin-bottom: 8px;
}

.ui-preview--relaxed .preview-side__logo-icon {
  width: 28px;
  height: 28px;
}

.ui-preview--relaxed .preview-side__name {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: var(--p-primary);
  line-height: 1.2;
}

.ui-preview--relaxed .preview-side__tag {
  display: block;
  font-size: 12px;
  color: var(--p-muted);
}

.ui-preview--relaxed .preview-side__item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  background: transparent;
  color: var(--p-side-text);
  height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 15px;
  margin-bottom: 2px;
}

.ui-preview--relaxed .preview-side__item.is-active {
  background: var(--p-side-active-bg);
  color: var(--p-side-active-text);
  font-weight: 600;
  box-shadow: inset 3px 0 0 var(--p-primary);
}

.ui-preview--relaxed .preview-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 28px 28px 22px;
  background: var(--p-top);
  border-bottom: 1px solid #dbeafe;
}

.ui-preview--relaxed .preview-top__kicker {
  font-size: 12px;
  font-weight: 600;
  color: var(--p-primary);
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}

.ui-preview--relaxed .preview-top__title {
  margin: 0;
  font-size: 28px;
  letter-spacing: -0.02em;
}

.ui-preview--relaxed .preview-top__desc {
  margin: 8px 0 0;
  color: var(--p-muted);
  font-size: 14px;
  max-width: 520px;
}

.ui-preview--relaxed .preview-top__cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: var(--p-primary);
  color: #fff;
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.28);
}

.ui-preview--relaxed .preview-focus-card,
.ui-preview--relaxed .preview-todo-card {
  background: var(--p-card);
  border: 1px solid #dbeafe;
  border-radius: var(--p-radius);
  box-shadow: var(--p-shadow);
}

.ui-preview--relaxed .preview-focus-card {
  padding: 16px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.ui-preview--relaxed .preview-focus-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 32px rgba(37, 99, 235, 0.14);
}

.ui-preview--relaxed .preview-focus-card--alert {
  border-color: #fdba74;
  background: linear-gradient(180deg, #fff7ed 0%, #ffffff 70%);
}

.ui-preview--relaxed .preview-focus-card__avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #bfdbfe, #93c5fd);
  color: #1e3a8a;
  font-weight: 700;
}

.ui-preview--relaxed .preview-focus-card__level {
  display: inline-block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--p-primary);
  background: var(--p-primary-soft);
  border-radius: 999px;
  padding: 1px 8px;
}

.ui-preview--relaxed .preview-tag {
  font-size: 12px;
  color: #334155;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 2px 8px;
}

.ui-preview--relaxed .preview-focus-card__summary,
.ui-preview--relaxed .preview-todo__meta,
.ui-preview--relaxed .preview-section__head span {
  color: var(--p-muted);
}

.ui-preview--relaxed .preview-focus-card__meta {
  font-size: 12px;
  font-weight: 600;
  color: var(--p-warning);
}

.ui-preview--relaxed .preview-todo-card {
  padding: 4px 18px 10px;
}

.ui-preview--relaxed .preview-todo__dot {
  background: var(--p-danger);
  color: var(--p-danger);
  box-shadow: 0 0 0 3px #fee2e2;
}

.ui-preview--relaxed .preview-todo--draft {
  border-top: 1px solid #e2e8f0;
  color: var(--p-warning);
  font-weight: 600;
  font-size: 14px;
}

/* ========== 档3：淡色品牌强化（已选定） ========== */
.ui-preview--expressive {
  --p-primary: #1d4ed8;
  --p-accent: #0ea5e9;
  --p-page: #f3f7ff;
  --p-card: #ffffff;
  --p-text: #0f172a;
  --p-muted: #64748b;
  --p-danger: #dc2626;
  --p-warning: #ea580c;
  background:
    radial-gradient(1000px 420px at 90% -5%, rgba(14, 165, 233, 0.14), transparent 55%),
    radial-gradient(800px 360px at 8% 0%, rgba(37, 99, 235, 0.12), transparent 50%),
    var(--p-page);
  color: var(--p-text);
}

.ui-preview--expressive .preview-side {
  width: 244px;
  background: #ffffff;
  border-right: 1px solid #c7d2fe;
  display: flex;
  flex-direction: column;
  padding: 12px;
  box-shadow: 6px 0 28px rgba(37, 99, 235, 0.06);
}

.ui-preview--expressive .preview-side__logo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 12px;
  margin-bottom: 12px;
  border-radius: 14px;
  background: linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%);
  color: #fff;
  box-shadow: 0 12px 28px rgba(37, 99, 235, 0.28);
}

.ui-preview--expressive .preview-side__logo-icon {
  width: 30px;
  height: 30px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 4px;
  box-sizing: border-box;
}

.ui-preview--expressive .preview-side__name {
  display: block;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
  line-height: 1.2;
}

.ui-preview--expressive .preview-side__tag {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.82);
  margin-top: 2px;
}

.ui-preview--expressive .preview-side__item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 0;
  background: transparent;
  color: #334155;
  height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 15px;
  margin-bottom: 4px;
  transition: background 0.15s ease, color 0.15s ease;
}

.ui-preview--expressive .preview-side__item:hover {
  background: #eff6ff;
  color: #1d4ed8;
}

.ui-preview--expressive .preview-side__item.is-active {
  background: linear-gradient(90deg, #dbeafe 0%, #e0f2fe 100%);
  color: #1d4ed8;
  font-weight: 700;
  box-shadow: inset 3px 0 0 #2563eb, 0 8px 18px rgba(37, 99, 235, 0.1);
}

.ui-preview--expressive .preview-top {
  margin: 20px 24px 0;
  padding: 28px 28px;
  border-radius: 18px;
  background: linear-gradient(120deg, #2563eb 0%, #1d4ed8 42%, #0ea5e9 100%);
  box-shadow: 0 18px 40px rgba(37, 99, 235, 0.28);
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  color: #fff;
}

.ui-preview--expressive .preview-top__kicker {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.88;
  margin-bottom: 8px;
}

.ui-preview--expressive .preview-top__title {
  margin: 0;
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.ui-preview--expressive .preview-top__desc {
  margin: 10px 0 0;
  max-width: 540px;
  font-size: 14px;
  opacity: 0.92;
}

.ui-preview--expressive .preview-top__cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: #fff;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 12px 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
}

.ui-preview--expressive .preview-body {
  padding: 20px 24px 28px;
}

.ui-preview--expressive .preview-section__head h2 {
  font-size: 20px;
  font-weight: 800;
}

.ui-preview--expressive .preview-focus-card,
.ui-preview--expressive .preview-todo-card {
  background: var(--p-card);
  border: 1px solid #dbeafe;
  border-radius: 16px;
  box-shadow: 0 14px 36px rgba(37, 99, 235, 0.1);
}

.ui-preview--expressive .preview-focus-card {
  padding: 18px;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.ui-preview--expressive .preview-focus-card:hover {
  transform: translateY(-4px);
  border-color: #93c5fd;
  box-shadow: 0 18px 40px rgba(37, 99, 235, 0.16);
}

.ui-preview--expressive .preview-focus-card--alert {
  border-color: #fdba74;
  background: linear-gradient(180deg, #fff7ed 0%, #ffffff 65%);
  box-shadow: 0 14px 36px rgba(234, 88, 12, 0.12);
}

.ui-preview--expressive .preview-focus-card__avatar {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #2563eb, #38bdf8);
  color: #fff;
  font-weight: 800;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.28);
}

.ui-preview--expressive .preview-focus-card__level {
  display: inline-block;
  margin-top: 4px;
  font-size: 12px;
  color: #1d4ed8;
  background: #dbeafe;
  border-radius: 999px;
  padding: 2px 8px;
  font-weight: 600;
}

.ui-preview--expressive .preview-tag {
  font-size: 12px;
  color: #1e3a8a;
  background: #eff6ff;
  border-radius: 999px;
  padding: 2px 8px;
}

.ui-preview--expressive .preview-focus-card__summary,
.ui-preview--expressive .preview-todo__meta,
.ui-preview--expressive .preview-section__head span {
  color: var(--p-muted);
}

.ui-preview--expressive .preview-focus-card__meta {
  font-size: 12px;
  font-weight: 700;
  color: var(--p-warning);
}

.ui-preview--expressive .preview-todo-card {
  padding: 6px 20px 12px;
}

.ui-preview--expressive .preview-todo__dot {
  background: var(--p-danger);
  color: var(--p-danger);
  box-shadow: 0 0 0 4px #fee2e2;
}

.ui-preview--expressive .preview-todo--draft {
  border-top: 1px solid #e2e8f0;
  color: var(--p-warning);
  font-weight: 700;
  font-size: 14px;
}
</style>
