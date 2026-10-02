<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { EChartsOption } from 'echarts';
import VChart from '@/components/VChart.vue';
import {
  CHART_COLORS,
  CHART_STYLE,
  chartTooltip,
} from '@/constants/chart';
import { useScoresStore, type ExamScoreSummary } from '@/stores/scores';
import type { SubjectScoreCell } from '@/types';

/** 成绩 tab：某生最近一场考试的单科分、总分总排与「该生 vs 班均」雷达图 */

const props = defineProps<{
  studentId: number;
  /** 父级在切到该 tab 时触发加载，避免首屏无谓请求 */
  active: boolean;
}>();

const scoresStore = useScoresStore();

const latestExamScores = ref<ExamScoreSummary | null>(null);
const scoresLoading = ref(false);

/** 渲染单科成绩 */
function formatSubjectScore(cell: SubjectScoreCell | undefined): string {
  if (!cell || cell.status === 'empty') return '—';
  if (cell.status === 'absent') return '缺';
  if (cell.status === 'exempt') return '免';
  return cell.score !== null ? String(cell.score) : '—';
}

/** 判断是否低分（< 满分 40%） */
function isLowScore(
  cell: SubjectScoreCell | undefined,
  fullScore: number,
): boolean {
  if (!cell || cell.status !== 'normal' || cell.score === null) return false;
  return cell.score < fullScore * 0.4;
}

/** 总分/班排展示文案（显式区分无数据，避免误显示 0） */
function formatScoreStat(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return String(value);
}

/** 班级平均分展示（保留一位小数；无数据为 —） */
function formatClassAvg(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value) || value <= 0) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** 加载指定考试下该生的成绩汇总（数据来自共享 store） */
async function loadSummary(examId: number | null): Promise<void> {
  if (examId === null) {
    latestExamScores.value = null;
    return;
  }
  scoresLoading.value = true;
  try {
    latestExamScores.value = await scoresStore.getStudentSummary(
      props.studentId,
      examId,
    );
  } catch {
    latestExamScores.value = null;
  } finally {
    scoresLoading.value = false;
  }
}

/** 切换考试时同步刷新下方成绩数据 */
async function onScoreExamChange(examId: number): Promise<void> {
  await scoresStore.selectExam(examId);
  await loadSummary(examId);
}

/** 雷达图配置（该生 vs 班均 · 软几何） */
const radarOption = computed<EChartsOption>(() => {
  const data = latestExamScores.value;
  if (!data || data.subjects.length === 0) {
    return {};
  }
  const studentValues = data.subjects.map((subject) => {
    const cell = data.scores[subject.id];
    if (cell && cell.status === 'normal' && cell.score !== null) {
      return cell.score;
    }
    return 0;
  });
  const classValues = data.subjects.map(
    (subject) => data.classAvgs[subject.id] ?? 0,
  );
  const primary = CHART_COLORS[0];
  const secondary = CHART_COLORS[1];
  return {
    color: [primary, secondary],
    animationDuration: CHART_STYLE.animationDuration,
    tooltip: chartTooltip({
      trigger: 'item',
      appendToBody: true,
      confine: false,
      textStyle: { color: CHART_STYLE.text, fontSize: 13 },
      /** 数值统一保留两位小数 */
      formatter: (params: unknown) => {
        const p = params as {
          name?: string;
          value?: number[];
          marker?: string;
          color?: string;
        };
        const values = Array.isArray(p.value) ? p.value : [];
        const subjects = data.subjects;
        const lines = subjects.map((subject, index) => {
          const raw = values[index];
          const num = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
          return `${p.marker ?? ''}${subject.name}：${num.toFixed(2)}`;
        });
        return `${p.name ?? ''}<br/>${lines.join('<br/>')}`;
      },
    }),
    legend: {
      bottom: 8,
      itemWidth: 12,
      itemHeight: 12,
      icon: 'roundRect',
      textStyle: { fontSize: 14, color: CHART_STYLE.muted },
    },
    radar: {
      center: ['50%', '48%'],
      radius: '62%',
      indicator: data.subjects.map((subject) => ({
        name: subject.name,
        max: subject.fullScore,
      })),
      axisName: {
        fontSize: 13,
        color: primary,
        fontWeight: 600,
        padding: [3, 4],
      },
      axisLine: {
        lineStyle: { color: CHART_STYLE.radarAxis, width: 1 },
      },
      splitLine: {
        lineStyle: { color: CHART_STYLE.radarSplitLine, width: 1 },
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: [...CHART_STYLE.radarSplitArea],
        },
      },
    },
    series: [
      {
        type: 'radar',
        symbol: 'circle',
        symbolSize: 6,
        data: [
          {
            value: studentValues,
            name: '该生',
            lineStyle: { color: primary, width: 2.5 },
            itemStyle: {
              color: primary,
              borderColor: CHART_STYLE.seriesBorder,
              borderWidth: 2,
              shadowBlur: 8,
              shadowColor: CHART_STYLE.shadowColor,
            },
            areaStyle: { color: CHART_STYLE.radarStudentArea },
          },
          {
            value: classValues,
            name: '班均',
            lineStyle: { color: secondary, width: 2, type: 'dashed' },
            itemStyle: {
              color: secondary,
              borderColor: CHART_STYLE.seriesBorder,
              borderWidth: 2,
            },
            areaStyle: { color: CHART_STYLE.radarClassArea },
          },
        ],
      },
    ],
  };
});

/** tab 首次激活时加载考试列表并默认选中最近一场 */
async function ensureLoaded(): Promise<void> {
  scoresLoading.value = true;
  try {
    await scoresStore.loadExams();
    await loadSummary(scoresStore.selectedExamId);
  } finally {
    scoresLoading.value = false;
  }
}

watch(
  () => props.active,
  (isActive) => {
    if (isActive) void ensureLoaded();
  },
  { immediate: true },
);
</script>

<template>
  <div
    v-if="scoresStore.sortedExams.length > 0"
    v-loading="scoresLoading"
    class="scores-section"
  >
    <div class="scores-section__header">
      <el-select
        v-model="scoresStore.selectedExamId"
        class="scores-section__exam-select"
        placeholder="选择考试"
        @change="onScoreExamChange"
      >
        <el-option
          v-for="exam in scoresStore.sortedExams"
          :key="exam.id"
          :label="`${exam.name}（${exam.examDate.slice(0, 10)}）`"
          :value="exam.id"
        />
      </el-select>
      <div v-if="latestExamScores" class="scores-section__stats">
        <div class="scores-section__stat">
          <span class="scores-section__stat-label">总分</span>
          <span class="cp-tabular-nums scores-section__stat-value">
            {{ formatScoreStat(latestExamScores.totalScore) }}
          </span>
        </div>
        <div class="scores-section__stat">
          <span class="scores-section__stat-label">班排</span>
          <span class="cp-tabular-nums scores-section__stat-value">
            {{ formatScoreStat(latestExamScores.totalRank) }}
          </span>
        </div>
      </div>
    </div>
    <template v-if="latestExamScores">
      <el-table :data="[latestExamScores.scores]" :stripe="false" class="scores-section__table">
        <el-table-column
          v-for="subject in latestExamScores.subjects"
          :key="subject.id"
          :label="subject.name"
          align="center"
          min-width="90"
        >
          <template #header>
            <div class="scores-section__col-header">
              <span>{{ subject.name }}</span>
              <span class="scores-section__col-full cp-tabular-nums">
                班级平均分：{{ formatClassAvg(latestExamScores.classAvgs[subject.id]) }}
              </span>
            </div>
          </template>
          <template #default>
            <span
              class="cp-tabular-nums scores-section__score"
              :class="{
                'scores-section__score--low': isLowScore(latestExamScores.scores[subject.id], subject.fullScore),
              }"
            >
              {{ formatSubjectScore(latestExamScores.scores[subject.id]) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
      <h3 class="scores-section__chart-title">雷达图 vs 班均分</h3>
      <div class="scores-section__chart-panel">
        <VChart :option="radarOption" height="340px" />
      </div>
    </template>
  </div>
  <el-empty v-else description="暂无成绩数据" />
</template>

<style scoped>
.scores-section__header {
  flex-wrap: wrap;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--cp-gap-4);
  margin-bottom: var(--cp-gap-4);
}

.scores-section__exam-select {
  width: 280px;
}

.scores-section__stats {
  display: flex;
  align-items: flex-end;
  gap: var(--cp-gap-5);
}

.scores-section__stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--cp-gap-half);
  min-width: 56px;
}

.scores-section__stat-label {
  font-size: var(--cp-font-xs);
  color: var(--cp-text-3);
  line-height: 1.2;
}

.scores-section__stat-value {
  font-size: var(--cp-font-lg);
  font-weight: 600;
  color: var(--cp-text-1);
  line-height: 1.2;
}

.scores-section__table {
  margin-bottom: var(--cp-gap-5);
}

.scores-section__col-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.4;
  font-size: var(--cp-font-base);
}

.scores-section__col-full {
  font-size: var(--cp-font-xs);
  font-weight: 400;
  color: var(--cp-text-3);
}

.scores-section__score {
  font-size: var(--cp-font-md);
  font-weight: 600;
}

.scores-section__score--low {
  color: var(--cp-danger);
}

.scores-section__chart-title {
  margin: var(--cp-gap-4) 0 var(--cp-gap-3);
  font-size: var(--cp-font-base);
  font-weight: 600;
  color: var(--cp-text-1);
}

.scores-section__chart-panel {
  position: relative;
  padding: var(--cp-gap-3) var(--cp-gap-4) var(--cp-gap-2);
  border-radius: var(--cp-radius-card);
  border: 1px solid var(--cp-primary-border);
  background: var(--cp-bg-card);
  box-shadow: var(--cp-shadow-1);
  overflow: visible;
}
</style>
