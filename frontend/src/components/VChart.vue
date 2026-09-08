<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, RadarChart, HeatmapChart, PieChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  RadarComponent,
  CalendarComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

echarts.use([
  LineChart,
  BarChart,
  RadarChart,
  HeatmapChart,
  PieChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  RadarComponent,
  CalendarComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

/** 图表选中（点击或键盘）载荷 */
export interface ChartSelectPayload {
  seriesIndex: number;
  dataIndex: number;
  data: unknown;
  name: string;
}

const props = defineProps<{
  option: EChartsOption;
  height?: string;
  /** 无障碍名称，供键盘用户识别图表 */
  ariaLabel?: string;
}>();

const emit = defineEmits<{
  select: [payload: ChartSelectPayload];
}>();

const chartRef = ref<HTMLDivElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;
let resizeFrame: number | null = null;
let disposed = false;
let focusedDataIndex = 0;

/** 容器是否已有有效宽高（隐藏 Tab 内常为 0） */
function hasValidSize(el: HTMLElement): boolean {
  return el.clientWidth > 0 && el.clientHeight > 0;
}

/** 读取第一系列数据长度，供键盘切换 */
function seriesDataLength(): number {
  if (!chartInstance) return 0;
  const option = chartInstance.getOption() as { series?: unknown };
  const series = option.series;
  const first = Array.isArray(series) ? series[0] : series;
  if (!first || typeof first !== 'object') return 0;
  const data = (first as { data?: unknown }).data;
  return Array.isArray(data) ? data.length : 0;
}

/** 从 option 取出指定数据点并发出 select */
function emitSelect(seriesIndex: number, dataIndex: number, fallbackData?: unknown, name = ''): void {
  if (!chartInstance) return;
  const option = chartInstance.getOption() as { series?: unknown };
  const series = option.series;
  const list = Array.isArray(series) ? series : [];
  const target = list[seriesIndex];
  const dataArr =
    target && typeof target === 'object' && Array.isArray((target as { data?: unknown }).data)
      ? (target as { data: unknown[] }).data
      : [];
  const data = fallbackData ?? dataArr[dataIndex];
  emit('select', {
    seriesIndex,
    dataIndex,
    data,
    name,
  });
}

/** 显示指定下标的 tooltip（循环） */
function showTipAt(dataIndex: number): void {
  const len = seriesDataLength();
  if (!chartInstance || len === 0) return;
  focusedDataIndex = ((dataIndex % len) + len) % len;
  chartInstance.dispatchAction({
    type: 'showTip',
    seriesIndex: 0,
    dataIndex: focusedDataIndex,
  });
  emitSelect(0, focusedDataIndex);
}

/** 点击数据点时同步选中态（触摸/鼠标均可） */
function onChartClick(params: unknown): void {
  if (typeof params !== 'object' || params === null) return;
  const p = params as {
    seriesIndex?: number;
    dataIndex?: number;
    data?: unknown;
    name?: string;
  };
  if (typeof p.dataIndex !== 'number') return;
  focusedDataIndex = p.dataIndex;
  emitSelect(
    p.seriesIndex ?? 0,
    p.dataIndex,
    p.data,
    typeof p.name === 'string' ? p.name : '',
  );
}

/** 绑定图表点击（init 后只需一次） */
function bindInteraction(): void {
  if (!chartInstance) return;
  chartInstance.off('click', onChartClick);
  chartInstance.on('click', onChartClick);
}

/** 初始化或在尺寸就绪后补 resize */
function initChart(): void {
  if (disposed || !chartRef.value || !hasValidSize(chartRef.value)) return;
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
    bindInteraction();
  }
  chartInstance.setOption(props.option, true);
  chartInstance.resize();
}

/** 下一帧再 resize，避开首屏布局未完成 */
function scheduleResize(): void {
  if (disposed || resizeFrame !== null) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    if (disposed || !chartRef.value || !hasValidSize(chartRef.value)) return;
    if (!chartInstance) initChart();
    else chartInstance.resize();
  });
}

/** 窗口尺寸变化 */
function handleWindowResize(): void {
  scheduleResize();
}

/** 监听容器本身从隐藏→可见或宽度变化 */
function setupResizeObserver(): void {
  if (!chartRef.value || typeof ResizeObserver === 'undefined') return;
  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(() => {
    scheduleResize();
  });
  resizeObserver.observe(chartRef.value);
}

/** 键盘聚焦时展示当前数据点 tooltip */
function handleFocus(): void {
  showTipAt(focusedDataIndex);
}

/** 失焦时收起 tooltip */
function handleBlur(): void {
  chartInstance?.dispatchAction({ type: 'hideTip' });
}

/** 方向键切换数据点，Enter/空格再展示，Esc 关闭 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    showTipAt(focusedDataIndex + 1);
    return;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    showTipAt(focusedDataIndex - 1);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    chartInstance?.dispatchAction({ type: 'hideTip' });
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    showTipAt(focusedDataIndex);
  }
}

watch(
  () => props.option,
  (newOption) => {
    if (!chartInstance) {
      initChart();
      return;
    }
    chartInstance.setOption(newOption, true);
    scheduleResize();
  },
  { deep: true },
);

onMounted(async () => {
  await nextTick();
  if (disposed) return;
  initChart();
  setupResizeObserver();
  window.addEventListener('resize', handleWindowResize);
});

onUnmounted(() => {
  disposed = true;
  if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
  resizeFrame = null;
  window.removeEventListener('resize', handleWindowResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  chartInstance?.off('click', onChartClick);
  chartInstance?.dispose();
  chartInstance = null;
});
</script>

<template>
  <div
    ref="chartRef"
    class="v-chart"
    tabindex="0"
    :aria-label="ariaLabel ?? '图表，点击或使用方向键查看数据点详情'"
    :style="{ width: '100%', height: height ?? '240px' }"
    @focus="handleFocus"
    @blur="handleBlur"
    @keydown="handleKeydown"
  />
</template>

<style scoped>
.v-chart {
  min-width: 0;
  min-height: 120px;
}

.v-chart:focus-visible {
  outline: 2px solid var(--cp-primary);
  outline-offset: 2px;
  border-radius: var(--cp-radius-ctl);
}
</style>
