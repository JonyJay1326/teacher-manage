<script setup lang="ts">
import { computed } from 'vue';
import type { EChartsOption } from 'echarts';
import VChart from '@/components/VChart.vue';
import {
  CHART_STYLE,
  chartColorAt,
  chartTooltip,
} from '@/constants/chart';
import type { ExamScoreRow, Subject } from '@/types';
import {
  bubbleSymbolSize,
  buildSubjectScatterRows,
  type SubjectScatterRow,
} from '@/utils/subjectScoreScatter';

const props = defineProps<{
  subjects: Subject[];
  rows: ExamScoreRow[];
  /** 可选标题旁说明 */
  hint?: string;
}>();

/** 各科分布行 */
const scatterRows = computed(() =>
  buildSubjectScatterRows(props.subjects, props.rows),
);

/** 是否有可展示数据 */
const hasData = computed(() =>
  scatterRows.value.some((r) => r.sampleCount > 0),
);

/**
 * 单科横轴气泡图 option（软几何）。
 * data: [score, y, count, namesText]
 */
function rowOption(row: SubjectScatterRow, colorIndex: number): EChartsOption {
  const color = chartColorAt(colorIndex);
  const maxX = Math.max(row.fullScore, 1);
  return {
    animationDuration: CHART_STYLE.animationDuration,
    grid: { left: 12, right: 20, top: 10, bottom: 28, containLabel: false },
    tooltip: chartTooltip({
      trigger: 'item',
      confine: true,
      formatter: (params: unknown) => {
        const p = params as { data?: unknown };
        const data = p.data;
        if (!Array.isArray(data) || data.length < 4) return '';
        const score = Number(data[0]);
        const count = Number(data[2]);
        const names = String(data[3]);
        return [
          `<div style="font-weight:700;margin-bottom:4px">${row.subjectName} · ${score} 分</div>`,
          `<div>人数：<b>${count}</b></div>`,
          `<div style="max-width:280px;white-space:normal;line-height:1.45;margin-top:4px">${names}</div>`,
        ].join('');
      },
    }),
    xAxis: {
      type: 'value',
      min: 0,
      max: maxX,
      interval: maxX <= 100 ? 15 : Math.ceil(maxX / 7),
      axisLine: { lineStyle: { color: CHART_STYLE.axis } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: CHART_STYLE.muted, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      min: -1,
      max: 1,
      show: false,
    },
    series: [
      {
        type: 'scatter',
        symbol: 'circle',
        symbolSize: (val: number | number[]) => {
          const arr = Array.isArray(val) ? val : [];
          if (arr.length < 3) return 10;
          return bubbleSymbolSize(Number(arr[2]));
        },
        itemStyle: {
          color,
          opacity: CHART_STYLE.bubbleOpacity,
          shadowBlur: 10,
          shadowColor: CHART_STYLE.shadowColor,
          borderColor: 'rgba(255,255,255,0.92)',
          borderWidth: CHART_STYLE.bubbleBorderWidth,
        },
        emphasis: {
          scale: 1.15,
          itemStyle: { opacity: 1 },
        },
        data: row.bubbles.map((b) => [
          b.score,
          0,
          b.count,
          b.names.join('、'),
        ]),
      },
    ],
  };
}

/** 格式化均分展示 */
function formatAvg(avg: number | null): string {
  if (avg === null) return '—';
  return Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
}
</script>

<template>
  <div class="score-scatter">
    <div v-if="hint" class="score-scatter__hint">{{ hint }}</div>
    <el-empty v-if="!hasData" description="暂无各科有效成绩分布" :image-size="72" />
    <div v-else class="score-scatter__list">
      <div
        v-for="(row, index) in scatterRows"
        :key="row.subjectId"
        class="score-scatter__row"
      >
        <div class="score-scatter__meta">
          <div class="score-scatter__name">{{ row.subjectName }}</div>
          <div class="score-scatter__avg">
            平均分:
            <span class="score-scatter__avg-num">{{ formatAvg(row.avgScore) }}</span>
            分
          </div>
          <div class="score-scatter__sample">n={{ row.sampleCount }}</div>
        </div>
        <div class="score-scatter__chart">
          <VChart
            v-if="row.sampleCount > 0"
            :option="rowOption(row, index)"
            height="64px"
          />
          <div v-else class="score-scatter__empty-axis">本科目暂无计分</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.score-scatter__hint {
  margin-bottom: var(--cp-gap-3);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
}

.score-scatter__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.score-scatter__row {
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr);
  gap: var(--cp-gap-3);
  align-items: center;
  min-height: 64px;
}

.score-scatter__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 2px;
}

.score-scatter__name {
  font-size: var(--cp-font-base);
  font-weight: 700;
  color: var(--cp-text-1);
  line-height: 1.3;
}

.score-scatter__avg {
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
}

.score-scatter__avg-num {
  color: var(--cp-danger);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.score-scatter__sample {
  font-size: 11px;
  color: var(--cp-text-3);
}

.score-scatter__chart {
  min-width: 0;
  border-radius: 10px;
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
  border: 1px solid var(--cp-divider);
}

.score-scatter__empty-axis {
  height: 64px;
  display: flex;
  align-items: center;
  padding-left: 16px;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}
</style>
