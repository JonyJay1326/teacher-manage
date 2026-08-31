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

const props = defineProps<{
  option: EChartsOption;
  height?: string;
}>();

const chartRef = ref<HTMLDivElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

/** 容器是否已有有效宽高（隐藏 Tab 内常为 0） */
function hasValidSize(el: HTMLElement): boolean {
  return el.clientWidth > 0 && el.clientHeight > 0;
}

/** 初始化或在尺寸就绪后补 resize */
function initChart(): void {
  if (!chartRef.value) return;
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
  }
  chartInstance.setOption(props.option, true);
  scheduleResize();
}

/** 下一帧再 resize，避开首屏布局未完成 */
function scheduleResize(): void {
  requestAnimationFrame(() => {
    if (!chartRef.value || !chartInstance) return;
    if (hasValidSize(chartRef.value)) {
      chartInstance.resize();
    }
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
    if (!chartRef.value || !chartInstance) return;
    if (hasValidSize(chartRef.value)) {
      chartInstance.resize();
    }
  });
  resizeObserver.observe(chartRef.value);
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
  initChart();
  setupResizeObserver();
  window.addEventListener('resize', handleWindowResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  chartInstance?.dispose();
  chartInstance = null;
});
</script>

<template>
  <div
    ref="chartRef"
    class="v-chart"
    :style="{ width: '100%', height: height ?? '240px' }"
  />
</template>

<style scoped>
.v-chart {
  min-width: 0;
  min-height: 120px;
}
</style>
