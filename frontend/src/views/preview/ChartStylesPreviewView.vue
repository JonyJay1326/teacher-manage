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
  min-height: 100vh;
  padding: 20px 28px 40px;
  background:
    radial-gradient(900px 400px at 90% -10%, rgba(14, 165, 233, 0.1), transparent 55%),
    radial-gradient(700px 320px at 5% 0%, rgba(37, 99, 235, 0.08), transparent 50%),
    #f3f7ff;
}

.chart-preview__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.chart-preview__bar strong {
  font-size: 18px;
  margin-right: 10px;
}

.chart-preview__hint {
  font-size: 13px;
  color: #64748b;
}

.chart-shell {
  border-radius: 22px;
  padding: 22px;
  border: 1px solid #bfdbfe;
  background: linear-gradient(155deg, #eff6ff 0%, #f0fdf4 48%, #fffbeb 100%);
  box-shadow: 0 20px 44px rgba(59, 130, 246, 0.12);
}

.chart-shell__head {
  margin-bottom: 16px;
}

.chart-shell__title {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: #1e3a8a;
}

.chart-shell__sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: #64748b;
}

.chart-shell__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.chart-panel {
  border-radius: 22px;
  padding: 14px 14px 8px;
  border: none;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 14px 32px rgba(37, 99, 235, 0.1);
  min-width: 0;
}

.chart-panel--wide {
  grid-column: 1 / -1;
}

.chart-panel__title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: #3b82f6;
  letter-spacing: 0.02em;
}

.chart-panel__bubble-meta {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 4px;
  padding-left: 4px;
}

.chart-panel__bubble-name {
  font-weight: 800;
  color: #0f172a;
}

.chart-panel__bubble-avg {
  font-size: 13px;
  color: #64748b;
}

.chart-panel__bubble-avg b {
  color: #dc2626;
}
</style>
