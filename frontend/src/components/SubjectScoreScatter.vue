<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EChartsOption } from 'echarts';
import VChart, { type ChartSelectPayload } from '@/components/VChart.vue';
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

/** 用户点击/键盘选中的气泡说明 */
const selectedDetail = ref<Record<number, string>>({});

/** 格式化气泡明细文案 */
function formatBubbleDetail(score: number, count: number, names: string): string {
  return `${score} 分 · ${count} 人：${names}`;
}

/** 默认展示人数最多的气泡，无需悬停即可看到姓名 */
function defaultBubbleDetail(row: SubjectScatterRow): string {
  if (row.bubbles.length === 0) return '';
  let top = row.bubbles[0]!;
  for (const bubble of row.bubbles) {
    if (bubble.count > top.count) top = bubble;
  }
  return formatBubbleDetail(top.score, top.count, top.names.join('、'));
}

/** 当前行应展示的明细 */
function bubbleDetail(row: SubjectScatterRow): string {
  return selectedDetail.value[row.subjectId] ?? defaultBubbleDetail(row);
}

/** 点击或键盘选中某一分数气泡 */
function onBubbleSelect(row: SubjectScatterRow, payload: ChartSelectPayload): void {
  const data = payload.data;
  if (!Array.isArray(data) || data.length < 4) return;
  selectedDetail.value = {
    ...selectedDetail.value,
    [row.subjectId]: formatBubbleDetail(Number(data[0]), Number(data[2]), String(data[3])),
  };
}

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
          borderColor: CHART_STYLE.seriesBorder,
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
            :aria-label="`${row.subjectName}成绩分布`"
            @select="(payload) => onBubbleSelect(row, payload)"
          />
          <div v-else class="score-scatter__empty-axis">本科目暂无计分</div>
          <p v-if="row.sampleCount > 0" class="score-scatter__detail">
            {{ bubbleDetail(row) }}
          </p>
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
  gap: var(--cp-gap-compact);
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
  gap: var(--cp-gap-half);
  padding-left: var(--cp-gap-half);
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
  color: var(--cp-domain-score-text);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.score-scatter__sample {
  font-size: var(--cp-font-xs);
  color: var(--cp-text-3);
}

.score-scatter__chart {
  min-width: 0;
  border-radius: var(--cp-radius-ctl);
  background: var(--cp-bg-card);
  border: 1px solid var(--cp-divider);
}

.score-scatter__empty-axis {
  height: 64px;
  display: flex;
  align-items: center;
  padding-left: var(--cp-gap-4);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}

.score-scatter__detail {
  margin: 0;
  padding: var(--cp-gap-1) var(--cp-gap-3) var(--cp-gap-2);
  font-size: var(--cp-font-xs);
  color: var(--cp-text-2);
  line-height: 1.45;
}
</style>
