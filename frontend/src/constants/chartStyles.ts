/**
 * 软几何图表预览 demo option（正式业务请用 constants/chart.ts）
 */

import type { EChartsOption } from 'echarts';
import {
  CHART_COLORS,
  CHART_STYLE,
  chartColorAt,
  chartTooltip,
} from '@/constants/chart';

/** 风格标识（仅软几何为全站规范） */
export type ChartStyleId = 'softGeo';

/** 风格元信息 */
export interface ChartStyleMeta {
  id: ChartStyleId;
  name: string;
  tagline: string;
  shellClass: string;
}

/** 预览列表 */
export const CHART_STYLE_METAS: ChartStyleMeta[] = [
  {
    id: 'softGeo',
    name: '软几何（全站规范）',
    tagline: '胶囊圆角 · 厚环饼图 · 轻阴影 · 白描边气泡 · 见 PRD 附录 D.5',
    shellClass: 'chart-shell--soft',
  },
];

/** @deprecated 请改用 CHART_COLORS */
export const SOFT_GEO_COLORS = [...CHART_COLORS];

const demoBarCats = ['语文', '数学', '英语', '道法', '地生'];
const demoBarVals = [72, 68, 81, 77, 74];
const demoPie = [
  { name: '纪律', value: 12 },
  { name: '学业', value: 18 },
  { name: '家校', value: 9 },
  { name: '表扬', value: 7 },
  { name: '其他', value: 5 },
];
const demoHBarCats = ['张强', '李梅', '王芳', '赵磊', '陈晨'];
const demoHBarVals = [18, 14, 11, 9, 8];
const demoBubbles = [
  [42, 0, 3],
  [58, 0, 5],
  [71, 0, 2],
  [86, 0, 1],
  [93, 0, 1],
];

/** 柱状图 demo */
export function buildBarOption(_id?: ChartStyleId): EChartsOption {
  const primary = chartColorAt(0);
  return {
    color: [...CHART_COLORS],
    textStyle: { color: CHART_STYLE.text },
    tooltip: chartTooltip({ trigger: 'axis' }),
    grid: { left: 40, right: 16, top: 28, bottom: 32 },
    xAxis: {
      type: 'category',
      data: demoBarCats,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART_STYLE.axis, width: 1 } },
      axisLabel: { color: CHART_STYLE.muted, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      splitNumber: 4,
      axisLine: { show: false },
      axisLabel: { color: CHART_STYLE.muted, fontSize: 11 },
      splitLine: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: demoBarVals,
        barWidth: CHART_STYLE.barWidth,
        barMaxWidth: CHART_STYLE.barMaxWidth,
        barCategoryGap: CHART_STYLE.barCategoryGap,
        showBackground: true,
        backgroundStyle: {
          color: CHART_STYLE.barTrack,
          borderRadius: CHART_STYLE.capsuleRadius,
        },
        itemStyle: {
          borderRadius: CHART_STYLE.capsuleRadius,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: CHART_STYLE.barGradientTop },
              { offset: 1, color: primary },
            ],
          },
          shadowBlur: CHART_STYLE.shadowBlur,
          shadowColor: CHART_STYLE.shadowColor,
          shadowOffsetY: 3,
        },
        emphasis: { focus: 'series' },
      },
    ],
  };
}

/** 饼图 / 环图 demo */
export function buildPieOption(_id?: ChartStyleId): EChartsOption {
  return {
    color: [...CHART_COLORS],
    textStyle: { color: CHART_STYLE.text },
    tooltip: chartTooltip({ trigger: 'item' }),
    legend: {
      bottom: 0,
      textStyle: { color: CHART_STYLE.muted, fontSize: 11 },
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 14,
    },
    series: [
      {
        type: 'pie',
        radius: CHART_STYLE.pieRadius,
        center: ['50%', '45%'],
        padAngle: CHART_STYLE.piePadAngle,
        itemStyle: {
          borderRadius: CHART_STYLE.pieBorderRadius,
          borderColor: '#fff',
          borderWidth: CHART_STYLE.pieBorderWidth,
          shadowBlur: 8,
          shadowColor: CHART_STYLE.shadowColor,
        },
        label: {
          color: CHART_STYLE.text,
          fontSize: 11,
          formatter: '{b}\n{d}%',
        },
        labelLine: {
          length: 11,
          length2: 9,
          lineStyle: { color: CHART_STYLE.muted, width: 1 },
        },
        data: demoPie,
        emphasis: {
          scale: true,
          scaleSize: 5,
          itemStyle: {
            shadowBlur: 14,
            shadowColor: 'rgba(15,23,42,0.1)',
          },
        },
      },
    ],
  };
}

/** 横向条形图 demo */
export function buildHBarOption(_id?: ChartStyleId): EChartsOption {
  const primary = chartColorAt(0);
  return {
    color: [...CHART_COLORS],
    textStyle: { color: CHART_STYLE.text },
    tooltip: chartTooltip({
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    }),
    grid: { left: 56, right: 36, top: 12, bottom: 20 },
    xAxis: {
      type: 'value',
      axisLabel: { color: CHART_STYLE.muted, fontSize: 11 },
      splitLine: { show: false },
      axisLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: demoHBarCats,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: CHART_STYLE.text,
        fontSize: 12,
        fontWeight: 600,
      },
    },
    series: [
      {
        type: 'bar',
        data: demoHBarVals,
        barWidth: CHART_STYLE.hBarWidth,
        barMaxWidth: CHART_STYLE.hBarMaxWidth,
        barCategoryGap: CHART_STYLE.barCategoryGap,
        itemStyle: {
          borderRadius: CHART_STYLE.hBarRadius,
          shadowBlur: CHART_STYLE.shadowBlur,
          shadowColor: CHART_STYLE.shadowColor,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: CHART_STYLE.hBarGradientStart },
              { offset: 1, color: primary },
            ],
          },
        },
        label: {
          show: true,
          position: 'right',
          color: CHART_STYLE.muted,
          fontSize: 11,
        },
      },
    ],
  };
}

/** 气泡带 demo */
export function buildBubbleOption(_id?: ChartStyleId): EChartsOption {
  const primary = chartColorAt(0);
  return {
    color: [...CHART_COLORS],
    textStyle: { color: CHART_STYLE.text },
    tooltip: chartTooltip({
      trigger: 'item',
      formatter: (p: unknown) => {
        const item = p as { data?: number[] };
        const d = item.data ?? [];
        return `${d[0]} 分 · ${d[2]} 人`;
      },
    }),
    grid: { left: 16, right: 16, top: 16, bottom: 26 },
    xAxis: {
      type: 'value',
      min: 0,
      max: 105,
      interval: 15,
      axisLine: { lineStyle: { color: CHART_STYLE.axis } },
      axisLabel: { color: CHART_STYLE.muted, fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: { type: 'value', min: -1, max: 1, show: false },
    series: [
      {
        type: 'scatter',
        symbolSize: (val: number | number[]) => {
          const arr = Array.isArray(val) ? val : [];
          return Math.min(13 + Number(arr[2] ?? 1) * 7, 36);
        },
        itemStyle: {
          color: primary,
          opacity: CHART_STYLE.bubbleOpacity,
          shadowBlur: 10,
          shadowColor: CHART_STYLE.shadowColor,
          borderColor: 'rgba(255,255,255,0.92)',
          borderWidth: CHART_STYLE.bubbleBorderWidth,
        },
        data: demoBubbles,
      },
    ],
  };
}
