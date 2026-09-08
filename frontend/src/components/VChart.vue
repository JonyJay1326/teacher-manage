<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, useId } from 'vue';
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
/** 读屏 live 区域 id，与图表 aria-describedby 关联 */
const liveRegionId = useId();
/** 当前数据点的可读说明（读屏朗读，不替代视觉 tooltip） */
const liveDescription = ref('');
let chartInstance: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;
let resizeFrame: number | null = null;
let disposed = false;
let focusedDataIndex = 0;

/** 容器是否已有有效宽高（隐藏 Tab 内常为 0） */
function hasValidSize(el: HTMLElement): boolean {
  return el.clientWidth > 0 && el.clientHeight > 0;
}

/** 把数据点值转成可读短句 */
function formatDatumValue(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (typeof raw === 'string') return raw;
  if (raw == null) return '';
  if (Array.isArray(raw)) {
    if (
      raw.length >= 4
      && typeof raw[0] === 'number'
      && typeof raw[2] === 'number'
      && typeof raw[3] === 'string'
    ) {
      return `${raw[0]} 分，${raw[2]} 人，${raw[3]}`;
    }
    if (raw.length >= 2 && typeof raw[0] === 'string' && typeof raw[1] === 'number') {
      return `${raw[0]}，${raw[1]}`;
    }
    const nums = raw.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    if (nums.length === 1) return String(nums[0]);
    if (nums.length > 1) return nums.map(String).join('，');
    return raw.filter((x): x is string => typeof x === 'string').join('、');
  }
  if (typeof raw === 'object') {
    const obj = raw as { name?: unknown; value?: unknown };
    const valueText = obj.value !== undefined ? formatDatumValue(obj.value) : '';
    const itemName = typeof obj.name === 'string' ? obj.name : '';
    if (itemName && valueText) return `${itemName} ${valueText}`;
    return valueText || itemName;
  }
  return '';
}

/** 根据当前 option 拼出读屏文案（类目轴则汇总各系列） */
function buildLiveDescription(
  seriesIndex: number,
  dataIndex: number,
  fallbackData?: unknown,
  name = '',
): string {
  if (!chartInstance) return '';
  const option = chartInstance.getOption() as { series?: unknown; xAxis?: unknown };
  const seriesRaw = option.series;
  const seriesList = Array.isArray(seriesRaw) ? seriesRaw : seriesRaw ? [seriesRaw] : [];
  if (seriesList.length === 0) return '';

  const xAxisRaw = option.xAxis;
  const xAxis = Array.isArray(xAxisRaw) ? xAxisRaw[0] : xAxisRaw;
  const categories =
    xAxis && typeof xAxis === 'object' && Array.isArray((xAxis as { data?: unknown }).data)
      ? (xAxis as { data: unknown[] }).data
      : [];
  const categoryFromAxis = categories[dataIndex];
  const categoryLabel =
    name
    || (typeof categoryFromAxis === 'string' || typeof categoryFromAxis === 'number'
      ? String(categoryFromAxis)
      : '');

  const lines: string[] = [];
  for (let i = 0; i < seriesList.length; i += 1) {
    const seriesItem = seriesList[i];
    if (!seriesItem || typeof seriesItem !== 'object') continue;
    const rec = seriesItem as { name?: unknown; data?: unknown };
    const dataArr = Array.isArray(rec.data) ? rec.data : [];
    const point = i === seriesIndex && fallbackData !== undefined ? fallbackData : dataArr[dataIndex];
    const seriesName = typeof rec.name === 'string' && rec.name ? rec.name : '';
    const valueText = formatDatumValue(point);
    if (!valueText) continue;
    lines.push(seriesName ? `${seriesName} ${valueText}` : valueText);
  }

  if (lines.length === 0) {
    const fallback = formatDatumValue(fallbackData);
    if (!fallback) return '';
    return categoryLabel ? `${categoryLabel}，${fallback}` : fallback;
  }
  const body = lines.join('，');
  return categoryLabel ? `${categoryLabel}：${body}` : body;
}

/** 刷新读屏 live 区域 */
function updateLiveDescription(
  seriesIndex: number,
  dataIndex: number,
  fallbackData?: unknown,
  name = '',
): void {
  liveDescription.value =
    buildLiveDescription(seriesIndex, dataIndex, fallbackData, name) || '暂无数据点';
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
  updateLiveDescription(seriesIndex, dataIndex, data, name);
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

/** 键盘聚焦时展示当前数据点 tooltip 并朗读 */
function handleFocus(): void {
  showTipAt(focusedDataIndex);
}

/** 失焦时收起视觉 tooltip（读屏文案保留在 describedby 中） */
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
  <div class="v-chart-wrap">
    <div
      ref="chartRef"
      class="v-chart"
      tabindex="0"
      :aria-label="ariaLabel ?? '图表，方向键可浏览数据点'"
      :aria-describedby="liveRegionId"
      :style="{ width: '100%', height: height ?? '240px' }"
      @focus="handleFocus"
      @blur="handleBlur"
      @keydown="handleKeydown"
    />
    <p
      :id="liveRegionId"
      class="v-chart__live"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ liveDescription }}
    </p>
  </div>
</template>

<style scoped>
.v-chart-wrap {
  position: relative;
  width: 100%;
  min-width: 0;
}

.v-chart {
  min-width: 0;
  min-height: 120px;
}

.v-chart:focus-visible {
  outline: 2px solid var(--cp-primary);
  outline-offset: 2px;
  border-radius: var(--cp-radius-ctl);
}

/* 读屏专用：不占视觉空间，避免 display:none 导致 live 不播报 */
.v-chart__live {
  position: absolute;
  width: var(--cp-gap-hairline);
  height: var(--cp-gap-hairline);
  padding: 0;
  margin: calc(var(--cp-gap-hairline) * -1);
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
