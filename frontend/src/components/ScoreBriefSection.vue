<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { EChartsOption } from 'echarts';
import VChart from '@/components/VChart.vue';
import type { ScoreBrief } from '@/api/dashboard';
import {
  CHART_COLORS,
  CHART_STYLE,
  chartTooltip,
} from '@/constants/chart';

const props = defineProps<{
  brief: ScoreBrief;
}>();

const router = useRouter();

/** 格式化考试日期 */
function formatExamDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  });
}

/** 班均总分趋势（软几何迷你折线） */
const trendOption = computed<EChartsOption>(() => {
  const points = props.brief.totalTrend;
  const hasGrade = points.some((p) => p.gradeAvg !== null);
  const series: EChartsOption['series'] = [
    {
      name: '班均总分',
      type: 'line',
      data: points.map((p) => p.classAvg),
      smooth: true,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 3, color: CHART_COLORS[0] },
      itemStyle: {
        color: CHART_COLORS[0],
        borderColor: '#fff',
        borderWidth: 2,
        shadowBlur: 6,
        shadowColor: CHART_STYLE.shadowColor,
      },
    },
  ];
  if (hasGrade) {
    series.push({
      name: '年级参考',
      type: 'line',
      data: points.map((p) => p.gradeAvg),
      smooth: true,
      symbol: 'diamond',
      symbolSize: 6,
      lineStyle: { width: 2, type: 'dashed', color: CHART_COLORS[5] },
      itemStyle: { color: CHART_COLORS[5] },
    });
  }
  return {
    color: [...CHART_COLORS],
    animationDuration: CHART_STYLE.animationDuration,
    tooltip: chartTooltip({ trigger: 'axis' }),
    legend: {
      top: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: CHART_STYLE.muted, fontSize: 11 },
    },
    grid: {
      left: 44,
      right: 16,
      top: hasGrade ? 36 : 24,
      bottom: points.length > 4 ? 52 : 36,
    },
    xAxis: {
      type: 'category',
      data: points.map((p) => p.examName),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART_STYLE.axis } },
      axisLabel: {
        color: CHART_STYLE.muted,
        fontSize: 11,
        interval: 0,
        hideOverlap: true,
        rotate: points.length > 4 ? 28 : 0,
        margin: 10,
      },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLine: { show: false },
      axisLabel: { color: CHART_STYLE.muted, fontSize: 11 },
      splitLine: { show: false },
    },
    series,
  };
});

/** 跳转分析中心 */
function goAnalysis(): void {
  router.push('/analysis');
}

/** 跳转该场考试详情 */
function goExam(): void {
  router.push(`/scores/exams/${props.brief.latestExamId}`);
}
</script>

<template>
  <section class="score-brief cp-animate-in">
    <div class="cp-page-header score-brief__header">
      <div>
        <h2 class="cp-page-header__title">成绩简报</h2>
        <p class="cp-page-header__desc">
          最近一场：{{ brief.latestExamName }}
          <template v-if="brief.latestExamDate">
            · {{ formatExamDate(brief.latestExamDate) }}
          </template>
          <template v-if="brief.latestClassAvg !== null">
            · 班均总分
            <b class="score-brief__avg">{{ brief.latestClassAvg }}</b>
          </template>
        </p>
      </div>
      <div class="score-brief__actions">
        <el-button text type="primary" @click="goExam">考试详情</el-button>
        <el-button text type="primary" @click="goAnalysis">分析中心</el-button>
      </div>
    </div>

    <div class="score-brief__grid">
      <article class="score-brief__panel cp-card">
        <h3 class="score-brief__panel-title">班均总分趋势</h3>
        <p class="score-brief__panel-hint">班整体在追吗</p>
        <VChart :option="trendOption" height="240px" />
      </article>

      <article class="score-brief__panel cp-card">
        <h3 class="score-brief__panel-title">
          {{ brief.latestExamName }} · 各科一览
        </h3>
        <p class="score-brief__panel-hint">班均与低分率（按低分率降序）</p>
        <div class="score-brief__table-wrap">
          <table class="score-brief__table">
            <thead>
              <tr>
                <th>科目</th>
                <th>班均</th>
                <th>低分率</th>
                <th>样本</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in brief.subjects" :key="row.subjectId">
                <td>{{ row.subjectName }}</td>
                <td class="score-brief__num">{{ row.avgScore }}</td>
                <td class="score-brief__num score-brief__num--warn">
                  {{ row.lowRate }}%
                </td>
                <td class="score-brief__num score-brief__num--muted">
                  {{ row.sampleCount }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.score-brief {
  margin-bottom: var(--cp-gap-6);
}

.score-brief__header {
  margin-bottom: var(--cp-gap-4);
}

.score-brief__avg {
  color: var(--cp-domain-score);
  font-variant-numeric: tabular-nums;
}

.score-brief__actions {
  display: flex;
  gap: var(--cp-gap-1);
}

.score-brief__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--cp-gap-5);
}

.score-brief__panel {
  padding: var(--cp-gap-4);
  min-width: 0;
}

.score-brief__panel-title {
  margin: 0;
  font-size: var(--cp-font-base);
  font-weight: 700;
  color: var(--cp-text-1);
}

.score-brief__panel-hint {
  margin: 4px 0 var(--cp-gap-3);
  font-size: var(--cp-font-xs);
  color: var(--cp-text-3);
}

.score-brief__table-wrap {
  overflow: auto;
  max-height: 260px;
}

.score-brief__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--cp-font-sm);
}

.score-brief__table th,
.score-brief__table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--cp-divider);
}

.score-brief__table th {
  color: var(--cp-text-3);
  font-weight: 600;
  font-size: var(--cp-font-xs);
  position: sticky;
  top: 0;
  background: var(--cp-bg-card);
}

.score-brief__table td {
  color: var(--cp-text-1);
}

.score-brief__num {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.score-brief__num--warn {
  color: var(--cp-domain-incident);
}

.score-brief__num--muted {
  color: var(--cp-text-3);
  font-weight: 500;
}
</style>
