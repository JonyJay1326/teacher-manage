<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import VChart from '@/components/VChart.vue';
import {
  CHART_STYLE_METAS,
  buildBarOption,
  buildBubbleOption,
  buildHBarOption,
  buildPieOption,
  type ChartStyleId,
} from '@/constants/chartStyles';

const router = useRouter();
const activeId = ref<ChartStyleId>('softGeo');

const activeMeta = computed(
  () => CHART_STYLE_METAS.find((m) => m.id === activeId.value) ?? CHART_STYLE_METAS[0],
);

/** 返回首页 */
function goHome(): void {
  router.push('/');
}
</script>

<template>
  <div class="chart-preview">
    <header class="chart-preview__bar">
      <div>
        <strong>图表风格 · 软几何</strong>
        <span class="chart-preview__hint">
          全站唯一规范（PRD 附录 D.5）· 实现源 constants/chart.ts
        </span>
      </div>
      <el-button @click="goHome">返回首页</el-button>
    </header>

    <section class="chart-shell" :class="activeMeta.shellClass">
      <div class="chart-shell__head">
        <h1 class="chart-shell__title">{{ activeMeta.name }}</h1>
        <p class="chart-shell__sub">{{ activeMeta.tagline }}</p>
      </div>

      <div class="chart-shell__grid">
        <article class="chart-panel">
          <h3 class="chart-panel__title">柱状图 · 各科班均</h3>
          <VChart :option="buildBarOption(activeId)" height="240px" />
        </article>
        <article class="chart-panel">
          <h3 class="chart-panel__title">饼图 · 事件类别</h3>
          <VChart :option="buildPieOption(activeId)" height="240px" />
        </article>
        <article class="chart-panel">
          <h3 class="chart-panel__title">条形图 · 关注频次 Top</h3>
          <VChart :option="buildHBarOption(activeId)" height="240px" />
        </article>
        <article class="chart-panel chart-panel--wide">
          <h3 class="chart-panel__title">气泡带 · 单科分数分布</h3>
          <div class="chart-panel__bubble-meta">
            <div class="chart-panel__bubble-name">英语</div>
            <div class="chart-panel__bubble-avg">平均分: <b>76.5</b> 分</div>
          </div>
          <VChart :option="buildBubbleOption(activeId)" height="88px" />
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.chart-preview {
  height: 100%;
  overflow: auto;
  padding: var(--cp-gap-5);
  background: var(--cp-page-atmosphere);
}

.chart-preview__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cp-gap-4);
  margin-bottom: var(--cp-gap-4);
}

.chart-preview__bar strong {
  font-size: var(--cp-font-md);
  margin-right: var(--cp-gap-2);
}

.chart-preview__hint {
  font-size: var(--cp-font-xs);
  color: var(--cp-text-3);
}

.chart-shell {
  border-radius: var(--cp-radius-card);
  padding: var(--cp-gap-5);
  border: 1px solid var(--cp-border);
  background: var(--cp-bg-card);
  box-shadow: var(--cp-shadow-1);
}

.chart-shell__head {
  margin-bottom: var(--cp-gap-4);
}

.chart-shell__title {
  margin: 0;
  font-size: var(--cp-font-lg);
  font-weight: 800;
  color: var(--cp-primary-active);
}

.chart-shell__sub {
  margin: var(--cp-gap-2) 0 0;
  font-size: var(--cp-font-xs);
  color: var(--cp-text-3);
}

.chart-shell__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--cp-gap-3);
}

.chart-panel {
  border-radius: var(--cp-radius-card);
  padding: var(--cp-gap-4);
  border: 1px solid var(--cp-divider);
  background: var(--cp-bg-card);
  min-width: 0;
}

.chart-panel--wide {
  grid-column: 1 / -1;
}

.chart-panel__title {
  margin: 0 0 var(--cp-gap-2);
  font-size: var(--cp-font-xs);
  font-weight: 700;
  color: var(--cp-primary);
  letter-spacing: 0.02em;
}

.chart-panel__bubble-meta {
  display: flex;
  align-items: baseline;
  gap: var(--cp-gap-3);
  margin-bottom: var(--cp-gap-1);
  padding-left: var(--cp-gap-1);
}

.chart-panel__bubble-name {
  font-weight: 800;
  color: var(--cp-text-1);
}

.chart-panel__bubble-avg {
  font-size: var(--cp-font-xs);
  color: var(--cp-text-3);
}

.chart-panel__bubble-avg b {
  color: var(--cp-domain-score-text);
}
</style>
