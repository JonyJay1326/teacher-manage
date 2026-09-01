<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { EChartsOption } from 'echarts';
import VChart from '@/components/VChart.vue';
import SubjectScoreScatter from '@/components/SubjectScoreScatter.vue';
import { ApiError } from '@/api/http';
import {
  analysisOverviewApi,
  type AnalysisOverview,
} from '@/api/analysis';
import { getExamMatrixApi, listExamsApi } from '@/api/scores';
import type { Exam, ExamScoreRow, Subject } from '@/types';
import {
  CHART_COLORS,
  CHART_HEAT_COLORS,
  CHART_NEGATIVE,
  CHART_POSITIVE,
  CHART_STYLE,
  chartTooltip,
} from '@/constants/chart';

/** 软几何调色板（附录 D.5） */
const chartPalette = [...CHART_COLORS];

const router = useRouter();
const loading = ref(false);
const overview = ref<AnalysisOverview | null>(null);
const exams = ref<Exam[]>([]);
const selectedExamId = ref<number | undefined>(undefined);
const selectedSubjectId = ref<number | undefined>(undefined);
const scatterSubjects = ref<Subject[]>([]);
const scatterRows = ref<ExamScoreRow[]>([]);
const scatterLoading = ref(false);

/** 加载分析数据 */
async function loadOverview(): Promise<void> {
  loading.value = true;
  try {
    overview.value = await analysisOverviewApi(
      selectedExamId.value,
      selectedSubjectId.value,
    );
    if (
      selectedExamId.value === undefined
      && overview.value.subjectRates.examId
    ) {
      selectedExamId.value = overview.value.subjectRates.examId;
    }
    if (
      selectedSubjectId.value === undefined
      && overview.value.subjectHistogram.subjectId
    ) {
      selectedSubjectId.value = overview.value.subjectHistogram.subjectId;
    }
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载分析失败');
  } finally {
    loading.value = false;
  }
}

/** 加载考试矩阵供各科气泡图 */
async function loadScatterMatrix(examId: number | undefined): Promise<void> {
  if (examId === undefined) {
    scatterSubjects.value = [];
    scatterRows.value = [];
    return;
  }
  scatterLoading.value = true;
  try {
    const matrix = await getExamMatrixApi(examId);
    scatterSubjects.value = matrix.subjects;
    scatterRows.value = matrix.rows;
  } catch {
    scatterSubjects.value = [];
    scatterRows.value = [];
  } finally {
    scatterLoading.value = false;
  }
}

/** 加载考试下拉 */
async function loadExams(): Promise<void> {
  try {
    exams.value = await listExamsApi();
  } catch {
    exams.value = [];
  }
}

/** 切换比率图 / 直方图考试 */
async function onExamChange(examId: number | undefined): Promise<void> {
  selectedExamId.value = examId;
  selectedSubjectId.value = undefined;
  await Promise.all([loadOverview(), loadScatterMatrix(examId)]);
}

/** 切换直方图科目 */
async function onSubjectChange(subjectId: number | undefined): Promise<void> {
  selectedSubjectId.value = subjectId;
  await loadOverview();
}

/** 直方图可选科目（来自比率图科目列表） */
const histogramSubjects = computed(() =>
  (overview.value?.subjectRates.items ?? []).map((i) => ({
    id: i.subjectId,
    name: i.subjectName,
  })),
);

/** 班级总分趋势 */
const trendOption = computed<EChartsOption>(() => {
  const points = overview.value?.totalTrend ?? [];
  const hasGrade = points.some((p) => p.gradeAvg !== null);
  const series: EChartsOption['series'] = [
    {
      name: '班均总分',
      type: 'line',
      data: points.map((p) => p.classAvg),
      smooth: true,
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: { width: 3, color: chartPalette[0] },
      itemStyle: {
        color: chartPalette[0],
        borderColor: '#fff',
        borderWidth: 2,
        shadowBlur: 8,
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
      symbolSize: 7,
      lineStyle: { width: 2, type: 'dashed', color: chartPalette[5] },
      itemStyle: { color: chartPalette[5] },
    });
  }
  return {
    color: chartPalette,
    animationDuration: CHART_STYLE.animationDuration,
    tooltip: chartTooltip({ trigger: 'axis' }),
    legend: {
      bottom: 0,
      textStyle: { color: CHART_STYLE.muted, fontSize: 12 },
    },
    grid: { left: 48, right: 24, top: 32, bottom: 48 },
    xAxis: {
      type: 'category',
      data: points.map((p) => p.examName),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART_STYLE.axis } },
      axisLabel: { color: CHART_STYLE.muted, fontSize: 12 },
    },
    yAxis: {
      type: 'value',
      name: '总分',
      axisLine: { show: false },
      axisLabel: { color: CHART_STYLE.muted },
      splitLine: { show: false },
    },
    series,
  };
});

/** 各科低分/及格/优秀率堆叠 */
const ratesOption = computed<EChartsOption>(() => {
  const items = overview.value?.subjectRates.items ?? [];
  return {
    color: [CHART_NEGATIVE, CHART_POSITIVE, chartPalette[0]],
    animationDuration: CHART_STYLE.animationDuration,
    tooltip: chartTooltip({ trigger: 'axis', axisPointer: { type: 'shadow' } }),
    legend: {
      bottom: 0,
      textStyle: { color: CHART_STYLE.muted, fontSize: 12 },
    },
    grid: { left: 48, right: 24, top: 32, bottom: 48 },
    xAxis: {
      type: 'category',
      data: items.map((i) => i.subjectName),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART_STYLE.axis } },
      axisLabel: { color: CHART_STYLE.muted },
    },
    yAxis: {
      type: 'value',
      name: '%',
      max: 100,
      axisLine: { show: false },
      axisLabel: { color: CHART_STYLE.muted },
      splitLine: { show: false },
    },
    series: [
      {
        name: '低分率',
        type: 'bar',
        data: items.map((i) => i.lowRate),
        barMaxWidth: CHART_STYLE.groupedBarMaxWidth,
        barGap: CHART_STYLE.barGap,
        barCategoryGap: CHART_STYLE.barCategoryGap,
        itemStyle: { borderRadius: CHART_STYLE.capsuleRadius },
      },
      {
        name: '及格率',
        type: 'bar',
        data: items.map((i) => i.passRate),
        barMaxWidth: CHART_STYLE.groupedBarMaxWidth,
        itemStyle: { borderRadius: CHART_STYLE.capsuleRadius },
      },
      {
        name: '优秀率',
        type: 'bar',
        data: items.map((i) => i.excellentRate),
        barMaxWidth: CHART_STYLE.groupedBarMaxWidth,
        itemStyle: { borderRadius: CHART_STYLE.capsuleRadius },
      },
    ],
  };
});

/** 进退步合并横向条（进步正、退步负） */
const moversOption = computed((): EChartsOption => {
  const movers = overview.value?.rankMovers;
  const improve = [...(movers?.improve ?? [])].reverse();
  const decline = movers?.decline ?? [];
  const names = [
    ...improve.map((m) => m.name),
    ...decline.map((m) => m.name),
  ];
  const deltas = [
    ...improve.map((m) => m.delta),
    ...decline.map((m) => m.delta),
  ];
  return {
    animationDuration: CHART_STYLE.animationDuration,
    tooltip: chartTooltip({
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params];
        const first = list[0] as { name?: string; dataIndex?: number };
        const idx = first.dataIndex ?? 0;
        const all = [...improve, ...decline];
        const item = all[idx];
        if (!item) return first.name ?? '';
        const dir = item.delta > 0 ? '进步' : '退步';
        return `${item.name}<br/>${dir} ${Math.abs(item.delta)} 名<br/>第${item.prevRank} → 第${item.currRank}名<br/>总分 ${item.currTotal}`;
      },
    }),
    grid: { left: 72, right: 32, top: 16, bottom: 24 },
    xAxis: {
      type: 'value',
      name: '名次变化',
      axisLine: { show: false },
      axisLabel: { color: CHART_STYLE.muted },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: names,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: CHART_STYLE.text, fontWeight: 600 },
    },
    series: [
      {
        type: 'bar',
        data: deltas.map((d) => ({
          value: d,
          itemStyle: {
            color: d > 0 ? CHART_POSITIVE : CHART_NEGATIVE,
            borderRadius: CHART_STYLE.hBarRadius,
            shadowBlur: 8,
            shadowColor: CHART_STYLE.shadowColor,
          },
        })),
        barWidth: CHART_STYLE.hBarWidth,
        barMaxWidth: CHART_STYLE.hBarMaxWidth,
        barCategoryGap: CHART_STYLE.barCategoryGap,
        label: {
          show: true,
          position: 'right',
          color: CHART_STYLE.muted,
          formatter: (p: { value?: unknown }) => {
            const v = Number(p.value ?? 0);
            return v > 0 ? `+${v}` : String(v);
          },
        },
      },
    ],
  } as EChartsOption;
});

/** 跳转学生详情 */
function goStudent(id: number): void {
  router.push(`/students/${id}`);
}

/** 跳转学情问答（全班） */
function goDataAsk(): void {
  router.push('/ai/ask');
}

/** ④ 关注频率（横向堆叠：事件 / 沟通） */
const focusFreqOption = computed<EChartsOption>(() => {
  const items = overview.value?.focusFrequency?.items ?? [];
  const names = items.map((i) => i.name).reverse();
  const incidents = items.map((i) => i.incidentCount).reverse();
  const contacts = items.map((i) => i.contactCount).reverse();
  return {
    color: [chartPalette[2], chartPalette[1]],
    animationDuration: CHART_STYLE.animationDuration,
    tooltip: chartTooltip({ trigger: 'axis', axisPointer: { type: 'shadow' } }),
    legend: {
      bottom: 0,
      textStyle: { color: CHART_STYLE.muted, fontSize: 12 },
    },
    grid: { left: 72, right: 24, top: 16, bottom: 40 },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisLabel: { color: CHART_STYLE.muted },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: names,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { fontSize: 12, color: CHART_STYLE.text, fontWeight: 600 },
    },
    series: [
      {
        name: '事件',
        type: 'bar',
        stack: 'total',
        data: incidents,
        barWidth: CHART_STYLE.hBarWidth,
        barMaxWidth: CHART_STYLE.hBarMaxWidth,
        barCategoryGap: CHART_STYLE.barCategoryGap,
      },
      {
        name: '家校沟通',
        type: 'bar',
        stack: 'total',
        data: contacts,
        barWidth: CHART_STYLE.hBarWidth,
        barMaxWidth: CHART_STYLE.hBarMaxWidth,
        itemStyle: {
          borderRadius: CHART_STYLE.hBarRadius,
        },
      },
    ],
  };
});

/** 关注频率图高度 */
const focusFreqHeight = computed(() => {
  const n = overview.value?.focusFrequency?.items.length ?? 0;
  return `${Math.max(280, n * 28 + 80)}px`;
});

/** ⑤ 家校沟通日历热力 */
const contactHeatOption = computed<EChartsOption>(() => {
  const heat = overview.value?.contactHeatmap;
  if (!heat?.rangeStart) return {};
  const max = Math.max(heat.maxCount, 1);
  return {
    animationDuration: CHART_STYLE.animationDuration,
    tooltip: chartTooltip({
      formatter: (p: unknown) => {
        const item = p as { value?: [string, number] };
        const v = item.value;
        if (!v) return '';
        return `${v[0]}<br/>沟通 ${v[1]} 次`;
      },
    }),
    visualMap: {
      min: 0,
      max,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 8,
      inRange: {
        color: [...CHART_HEAT_COLORS],
      },
      textStyle: { color: CHART_STYLE.muted },
    },
    calendar: {
      top: 48,
      left: 48,
      right: 24,
      bottom: 64,
      cellSize: ['auto', 16],
      range: [heat.rangeStart, heat.rangeEnd],
      itemStyle: {
        borderWidth: 2,
        borderColor: '#FFFFFF',
        borderRadius: 4,
      },
      yearLabel: { show: false },
      dayLabel: { firstDay: 1, nameMap: 'cn', color: CHART_STYLE.muted },
      monthLabel: { nameMap: 'cn', color: CHART_STYLE.text },
      splitLine: { show: false },
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: heat.cells,
      },
    ],
  };
});

/** ⑥ 事件类别饼图 */
const categoryPieOption = computed<EChartsOption>(() => {
  const items = overview.value?.categoryDistribution?.items ?? [];
  return {
    color: chartPalette,
    animationDuration: CHART_STYLE.animationDuration,
    tooltip: chartTooltip({
      trigger: 'item',
      formatter: '{b}: {c}（{d}%）',
    }),
    legend: {
      bottom: 0,
      type: 'scroll',
      textStyle: { color: CHART_STYLE.muted, fontSize: 12 },
    },
    series: [
      {
        type: 'pie',
        radius: CHART_STYLE.pieRadius,
        center: ['50%', '46%'],
        padAngle: CHART_STYLE.piePadAngle,
        data: items.map((i) => ({ name: i.category, value: i.count })),
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
      },
    ],
  };
});

/** ⑦ 单科直方图 */
const histogramOption = computed<EChartsOption>(() => {
  const bins = overview.value?.subjectHistogram?.bins ?? [];
  return {
    color: [chartPalette[0]],
    animationDuration: CHART_STYLE.animationDuration,
    tooltip: chartTooltip({ trigger: 'axis' }),
    grid: { left: 48, right: 16, top: 24, bottom: 48 },
    xAxis: {
      type: 'category',
      data: bins.map((b) => b.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART_STYLE.axis } },
      axisLabel: { rotate: 30, fontSize: 11, color: CHART_STYLE.muted },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      name: '人数',
      axisLine: { show: false },
      axisLabel: { color: CHART_STYLE.muted },
      splitLine: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: bins.map((b) => b.count),
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
              { offset: 1, color: chartPalette[0] },
            ],
          },
          shadowBlur: CHART_STYLE.shadowBlur,
          shadowColor: CHART_STYLE.shadowColor,
          shadowOffsetY: 3,
        },
      },
    ],
  };
});

/** ⑧ 事件月度趋势 */
const monthlyOption = computed<EChartsOption>(() => {
  const points = overview.value?.incidentMonthly?.points ?? [];
  return {
    color: [chartPalette[3]],
    animationDuration: CHART_STYLE.animationDuration,
    tooltip: chartTooltip({ trigger: 'axis' }),
    grid: { left: 48, right: 24, top: 24, bottom: 40 },
    xAxis: {
      type: 'category',
      data: points.map((p) => p.month),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART_STYLE.axis } },
      axisLabel: { rotate: 40, fontSize: 11, color: CHART_STYLE.muted },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      name: '件数',
      axisLine: { show: false },
      axisLabel: { color: CHART_STYLE.muted },
      splitLine: { show: false },
    },
    series: [
      {
        type: 'line',
        data: points.map((p) => p.count),
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 3 },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 2,
          shadowBlur: 8,
          shadowColor: CHART_STYLE.shadowColor,
        },
        areaStyle: { opacity: 0.12 },
      },
    ],
  };
});

onMounted(() => {
  void (async () => {
    await loadExams();
    await loadOverview();
    await loadScatterMatrix(selectedExamId.value);
  })();
});
</script>

<template>
  <div class="analysis cp-animate-in" v-loading="loading">
    <div class="cp-page-header">
      <div>
        <h2 class="cp-page-header__title">分析中心</h2>
        <p class="cp-page-header__desc">
          九张图：成绩趋势/比率/进退步 · 关注频率 · 沟通热力 · 类别分布 · 单科直方图 · 月度趋势 · 各科气泡
        </p>
      </div>
      <el-button type="primary" @click="goDataAsk">用自然语言问</el-button>
    </div>

    <!-- ① 总分趋势 -->
    <section class="analysis__section cp-card">
      <div class="analysis__section-head">
        <h3 class="cp-section-title">班级总分趋势</h3>
        <p class="analysis__hint">班整体在追吗？有年级参考时显示虚线</p>
      </div>
      <VChart
        v-if="(overview?.totalTrend.length ?? 0) > 0"
        :option="trendOption"
        height="320px"
      />
      <el-empty v-else description="暂无考试成绩数据" :image-size="72" />
    </section>

    <!-- ② 各科比率 -->
    <section class="analysis__section cp-card">
      <div class="analysis__section-head">
        <div>
          <h3 class="cp-section-title">各科低分率 / 及格率 / 优秀率</h3>
          <p class="analysis__hint">
            默认按低分率排序；阈值来自设置
            （低分 {{ ((overview?.thresholds.lowScoreRatio ?? 0.4) * 100).toFixed(0) }}% /
            及格 {{ ((overview?.thresholds.passRatio ?? 0.6) * 100).toFixed(0) }}% /
            优秀 {{ ((overview?.thresholds.excellentRatio ?? 0.85) * 100).toFixed(0) }}%）
          </p>
        </div>
        <el-select
          :model-value="selectedExamId"
          placeholder="选择考试"
          style="width: 220px"
          @change="onExamChange"
        >
          <el-option
            v-for="exam in exams"
            :key="exam.id"
            :label="exam.name"
            :value="exam.id"
          />
        </el-select>
      </div>
      <p v-if="overview?.subjectRates.examName" class="analysis__exam-label">
        当前：{{ overview.subjectRates.examName }}
      </p>
      <VChart
        v-if="(overview?.subjectRates.items.length ?? 0) > 0"
        :option="ratesOption"
        height="320px"
      />
      <el-empty v-else description="该考试暂无科目比率数据" :image-size="72" />
    </section>

    <!-- ③ 进退步 -->
    <section class="analysis__section cp-card">
      <div class="analysis__section-head">
        <div>
          <h3 class="cp-section-title">进步 / 退步榜</h3>
          <p class="analysis__hint">
            对比最近两场考试总分名次变化 ≥
            {{ overview?.thresholds.rankJumpThreshold ?? 8 }} 名
            <template v-if="overview?.rankMovers.prevExamName && overview?.rankMovers.currExamName">
              （{{ overview.rankMovers.prevExamName }} → {{ overview.rankMovers.currExamName }}）
            </template>
          </p>
        </div>
      </div>
      <div
        v-if="
          (overview?.rankMovers.improve.length ?? 0) > 0
          || (overview?.rankMovers.decline.length ?? 0) > 0
        "
        class="analysis__movers"
      >
        <VChart :option="moversOption" height="360px" />
        <div class="analysis__mover-lists">
          <div>
            <h4 class="analysis__list-title analysis__list-title--up">进步</h4>
            <ul class="analysis__list">
              <li
                v-for="item in overview?.rankMovers.improve ?? []"
                :key="`up-${item.studentId}`"
                @click="goStudent(item.studentId)"
              >
                {{ item.name }}
                <span class="cp-tabular-nums">+{{ item.delta }}</span>
              </li>
            </ul>
            <el-empty
              v-if="(overview?.rankMovers.improve.length ?? 0) === 0"
              description="暂无"
              :image-size="48"
            />
          </div>
          <div>
            <h4 class="analysis__list-title analysis__list-title--down">退步</h4>
            <ul class="analysis__list">
              <li
                v-for="item in overview?.rankMovers.decline ?? []"
                :key="`down-${item.studentId}`"
                @click="goStudent(item.studentId)"
              >
                {{ item.name }}
                <span class="cp-tabular-nums">{{ item.delta }}</span>
              </li>
            </ul>
            <el-empty
              v-if="(overview?.rankMovers.decline.length ?? 0) === 0"
              description="暂无"
              :image-size="48"
            />
          </div>
        </div>
      </div>
      <el-empty v-else description="至少需要两场已录成绩考试才能对比进退步" :image-size="72" />
    </section>

    <!-- ④ 关注频率 -->
    <section class="analysis__section cp-card">
      <div class="analysis__section-head">
        <div>
          <h3 class="cp-section-title">关注频率分布</h3>
          <p class="analysis__hint">
            近 {{ overview?.focusFrequency?.days ?? 30 }} 天已确认事件 + 家校沟通次数（降序）。
            若头部过高、尾部沉默，说明可能只盯住「尖叫」的学生。
          </p>
        </div>
      </div>
      <VChart
        v-if="(overview?.focusFrequency?.items.length ?? 0) > 0"
        :option="focusFreqOption"
        :height="focusFreqHeight"
      />
      <el-empty v-else description="近 30 天暂无已确认事件或家校沟通" :image-size="72" />
    </section>

    <!-- ⑤ 沟通热力 -->
    <section class="analysis__section cp-card">
      <div class="analysis__section-head">
        <div>
          <h3 class="cp-section-title">家校沟通日历热力</h3>
          <p class="analysis__hint">
            近 {{ overview?.contactHeatmap?.days ?? 120 }} 天「家校沟通」类事件按日计数（{{
              overview?.contactHeatmap?.rangeStart ?? '—'
            }}
            ~
            {{ overview?.contactHeatmap?.rangeEnd ?? '—' }}）
          </p>
        </div>
      </div>
      <VChart
        v-if="(overview?.contactHeatmap?.cells.length ?? 0) > 0"
        :option="contactHeatOption"
        height="260px"
      />
      <el-empty v-else description="近 120 天暂无家校沟通记录" :image-size="72" />
    </section>

    <!-- ⑥ 类别分布 -->
    <section class="analysis__section cp-card">
      <div class="analysis__section-head">
        <div>
          <h3 class="cp-section-title">事件类别分布</h3>
          <p class="analysis__hint">
            {{ overview?.categoryDistribution?.termName ?? '当前学期' }}已确认事件按类别占比
          </p>
        </div>
      </div>
      <VChart
        v-if="(overview?.categoryDistribution?.items.length ?? 0) > 0"
        :option="categoryPieOption"
        height="320px"
      />
      <el-empty v-else description="本学期暂无已确认事件" :image-size="72" />
    </section>

    <!-- ⑦ 单科直方图 -->
    <section class="analysis__section cp-card">
      <div class="analysis__section-head">
        <div>
          <h3 class="cp-section-title">单科分数分布</h3>
          <p class="analysis__hint">
            按满分十等分统计人数
            <template v-if="overview?.subjectHistogram?.sampleCount">
              （样本 {{ overview.subjectHistogram.sampleCount }} 人）
            </template>
          </p>
        </div>
        <div class="analysis__filters">
          <el-select
            :model-value="selectedExamId"
            placeholder="考试"
            style="width: 200px"
            @change="onExamChange"
          >
            <el-option
              v-for="exam in exams"
              :key="exam.id"
              :label="exam.name"
              :value="exam.id"
            />
          </el-select>
          <el-select
            :model-value="selectedSubjectId"
            placeholder="科目"
            style="width: 140px"
            @change="onSubjectChange"
          >
            <el-option
              v-for="sub in histogramSubjects"
              :key="sub.id"
              :label="sub.name"
              :value="sub.id"
            />
          </el-select>
        </div>
      </div>
      <VChart
        v-if="(overview?.subjectHistogram?.bins.length ?? 0) > 0"
        :option="histogramOption"
        height="300px"
      />
      <el-empty v-else description="请选择考试与科目查看分布" :image-size="72" />
    </section>

    <!-- ⑦b 各科气泡分布 -->
    <section class="analysis__section cp-card" v-loading="scatterLoading">
      <div class="analysis__section-head">
        <div>
          <h3 class="cp-section-title">各科成绩气泡分布</h3>
          <p class="analysis__hint">
            与上方同一考试：气泡位置=分数、大小=同分人数；悬停显示姓名；左侧红字为班均分
          </p>
        </div>
        <div class="analysis__filters">
          <el-select
            :model-value="selectedExamId"
            placeholder="考试"
            style="width: 200px"
            @change="onExamChange"
          >
            <el-option
              v-for="exam in exams"
              :key="`scatter-${exam.id}`"
              :label="exam.name"
              :value="exam.id"
            />
          </el-select>
        </div>
      </div>
      <SubjectScoreScatter
        v-if="scatterSubjects.length > 0"
        :subjects="scatterSubjects"
        :rows="scatterRows"
      />
      <el-empty v-else description="请选择有成绩的考试" :image-size="72" />
    </section>

    <!-- ⑧ 月度趋势 -->
    <section class="analysis__section cp-card">
      <div class="analysis__section-head">
        <div>
          <h3 class="cp-section-title">事件月度趋势</h3>
          <p class="analysis__hint">
            近 {{ overview?.incidentMonthly?.months ?? 36 }} 个月已确认事件件数
          </p>
        </div>
      </div>
      <VChart
        v-if="(overview?.incidentMonthly?.points.length ?? 0) > 0"
        :option="monthlyOption"
        height="300px"
      />
      <el-empty v-else description="暂无事件趋势数据" :image-size="72" />
    </section>
  </div>
</template>

<style scoped>
.analysis__section {
  margin-bottom: var(--cp-gap-5);
  padding: var(--cp-gap-5);
}

.analysis__section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cp-gap-4);
  margin-bottom: var(--cp-gap-3);
}

.analysis__hint {
  margin: var(--cp-gap-1) 0 0;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
}

.analysis__exam-label {
  margin: 0 0 var(--cp-gap-2);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}

.analysis__movers {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: var(--cp-gap-5);
}

.analysis__mover-lists {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--cp-gap-4);
}

.analysis__list-title {
  margin: 0 0 var(--cp-gap-2);
  font-size: var(--cp-font-base);
  font-weight: 600;
}

.analysis__list-title--up {
  color: var(--cp-success);
}

.analysis__list-title--down {
  color: var(--cp-warning);
}

.analysis__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.analysis__list li {
  display: flex;
  justify-content: space-between;
  padding: var(--cp-gap-2) 0;
  border-bottom: 1px solid var(--cp-divider);
  cursor: pointer;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-1);
}

.analysis__list li:hover {
  color: var(--cp-primary);
}

.analysis__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cp-gap-2);
  justify-content: flex-end;
}
</style>
