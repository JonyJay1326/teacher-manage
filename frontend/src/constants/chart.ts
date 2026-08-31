/**
 * 全站 ECharts「软几何」主题（PRD 附录 D.5）
 * 新图表须引用本文件，禁止另起调色板或硬编码系列色。
 * 业务域色（tokens --cp-domain-*）与本色板对齐。
 */

import type { EChartsOption } from 'echarts';

/** 系列主色（循环使用；末位灰供参考线/次要系列） */
export const CHART_COLORS = [
  '#5B9CFF',
  '#3DCF9A',
  '#F5B942',
  '#9B8CFF',
  '#FF7A9A',
  '#94A3B8',
] as const;

/** 语义色：进步 / 正向 */
export const CHART_POSITIVE = CHART_COLORS[1];

/** 语义色：退步 / 预警 / 低分 */
export const CHART_NEGATIVE = CHART_COLORS[4];

/** 热力从浅到深（家校沟通日历等） */
export const CHART_HEAT_COLORS = ['#EFF6FF', '#93C5FD', '#5B9CFF', '#3B82F6'] as const;

/** 软几何共享样式常量 */
export const CHART_STYLE = {
  text: '#1E293B',
  muted: '#64748B',
  axis: '#E2E8F0',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#DBEAFE',
  /** 柱/条圆角（小圆角，避免全胶囊） */
  capsuleRadius: 8,
  /** 横条仅圆远端 */
  hBarRadius: [0, 8, 8, 0] as [number, number, number, number],
  /**
   * 单系列柱：类目内占比变宽，空间够时更粗；上限防过粗
   * （ECharts 同时设 barWidth 百分比 + barMaxWidth）
   */
  barWidth: '56%',
  barMaxWidth: 48,
  /** 多系列并排柱上限（低分/及格/优秀等） */
  groupedBarMaxWidth: 32,
  /** 横条：占比 + 上限 */
  hBarWidth: '52%',
  hBarMaxWidth: 28,
  /** 类目间距（越小柱越饱满） */
  barCategoryGap: '28%',
  /** 并排系列间距 */
  barGap: '18%',
  pieRadius: ['58%', '80%'] as [string, string],
  piePadAngle: 5,
  pieBorderWidth: 3,
  pieBorderRadius: 9,
  shadowBlur: 14,
  shadowColor: 'rgba(91,156,255,0.22)',
  bubbleOpacity: 0.88,
  bubbleBorderWidth: 2,
  animationDuration: 600,
  /** 柱底轨 */
  barTrack: 'rgba(91,156,255,0.07)',
  /** 柱纵向渐变顶色 */
  barGradientTop: '#7EB6FF',
  /** 横条渐变起点 */
  hBarGradientStart: '#93C5FD',
} as const;

/** 统一 tooltip（白底、淡蓝边、圆角阴影） */
export function chartTooltip(
  extra?: EChartsOption['tooltip'],
): EChartsOption['tooltip'] {
  return {
    backgroundColor: CHART_STYLE.tooltipBg,
    borderColor: CHART_STYLE.tooltipBorder,
    borderWidth: 1,
    textStyle: { color: CHART_STYLE.text, fontSize: 12 },
    extraCssText:
      'border-radius:12px;box-shadow:0 12px 28px rgba(15,23,42,0.08);padding:10px 12px;',
    ...extra,
  };
}

/** 按索引取系列色（越界循环） */
export function chartColorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
