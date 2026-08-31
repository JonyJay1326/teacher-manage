<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ApiError } from '@/api/http';
import { getExamApi, getExamMatrixApi } from '@/api/scores';
import SubjectScoreScatter from '@/components/SubjectScoreScatter.vue';
import type { Exam, ExamScoreRow, Subject, SubjectScoreCell } from '@/types';

const route = useRoute();
const router = useRouter();

const examId = Number(route.params.id);
const loading = ref(false);
const exam = ref<Exam | null>(null);
const subjects = ref<Subject[]>([]);
const scoreRows = ref<ExamScoreRow[]>([]);
const sortedRows = ref<ExamScoreRow[]>([]);

/** 同步原始数据到展示列表 */
function resetSortedRows(): void {
  sortedRows.value = [...scoreRows.value];
}

watch(scoreRows, resetSortedRows, { immediate: true });

/** 加载考试详情与成绩矩阵 */
async function loadData(): Promise<void> {
  loading.value = true;
  try {
    const [examData, matrix] = await Promise.all([
      getExamApi(examId),
      getExamMatrixApi(examId),
    ]);
    exam.value = examData;
    subjects.value = matrix.subjects;
    scoreRows.value = matrix.rows;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载考试成绩失败');
  } finally {
    loading.value = false;
  }
}

/** 获取单科可排序分数，未录/缺考/免考返回 null */
function getSubjectSortScore(row: ExamScoreRow, subjectId: number): number | null {
  const cell = row.subjectScores[subjectId];
  if (!cell || cell.status !== 'normal' || cell.score === null) return null;
  return cell.score;
}

/** 获取排序值 */
function getSortValue(row: ExamScoreRow, prop: string): number | null {
  if (prop === 'totalScore') {
    return row.totalScore;
  }
  if (prop.startsWith('subject-')) {
    const subjectId = Number(prop.replace('subject-', ''));
    return getSubjectSortScore(row, subjectId);
  }
  return null;
}

/** 处理列头排序（未录/缺考/免考始终沉底） */
function handleSortChange(data: {
  prop: string | null;
  order: 'ascending' | 'descending' | null;
}): void {
  const { prop, order } = data;
  if (!order || !prop) {
    resetSortedRows();
    return;
  }

  sortedRows.value = [...scoreRows.value].sort((rowA, rowB) => {
    const valueA = getSortValue(rowA, prop);
    const valueB = getSortValue(rowB, prop);
    const aMissing = valueA === null;
    const bMissing = valueB === null;

    if (aMissing && bMissing) {
      return rowA.studentNo.localeCompare(rowB.studentNo);
    }
    if (aMissing) return 1;
    if (bMissing) return -1;

    const diff = valueA - valueB;
    const directed = order === 'ascending' ? diff : -diff;
    if (directed !== 0) return directed;
    return rowA.studentNo.localeCompare(rowB.studentNo);
  });
}

/** 渲染单科成绩文字 */
function formatScoreCell(cell: SubjectScoreCell | undefined): string {
  if (!cell || cell.status === 'empty') return '—';
  if (cell.status === 'absent') return '缺';
  if (cell.status === 'exempt') return '免';
  return cell.score !== null ? String(cell.score) : '—';
}

/** 判断是否低分（< 满分 40%） */
function isLowScore(cell: SubjectScoreCell | undefined, fullScore: number): boolean {
  if (!cell || cell.status !== 'normal' || cell.score === null) return false;
  return cell.score < fullScore * 0.4;
}

/** 跳转录入页 */
function goEntry(): void {
  router.push(`/scores/exams/${examId}/enter`);
}

/** 跳转录入页并打开 Excel 导入（通过 query） */
function goExcelImport(): void {
  router.push({ path: `/scores/exams/${examId}/enter`, query: { import: 'excel' } });
}

/** 返回考试列表 */
function goBack(): void {
  router.push('/scores');
}

onMounted(() => {
  void loadData();
});
</script>

<template>
  <div class="exam-detail cp-animate-in" v-loading="loading">
    <div class="cp-page-header">
      <div>
        <h2 class="cp-page-header__title">{{ exam?.name ?? '考试详情' }}</h2>
        <p class="cp-page-header__desc">
          {{ exam?.examType }} · {{ exam?.examDate }} · {{ exam?.status }}
        </p>
      </div>
      <div class="exam-detail__actions">
        <el-button @click="goBack">返回列表</el-button>
        <el-button @click="goExcelImport">Excel 导入</el-button>
        <el-button type="primary" @click="goEntry">录入成绩</el-button>
      </div>
    </div>

    <div class="cp-card cp-content-card exam-detail__scatter-card">
      <div class="exam-detail__table-hint">
        各科成绩分布 · 气泡位置为分数，大小为同分人数 · 悬停查看姓名 · 左侧红字为班均分
      </div>
      <SubjectScoreScatter :subjects="subjects" :rows="scoreRows" />
    </div>

    <div class="cp-card cp-content-card exam-detail__table-card">
      <div class="exam-detail__table-hint">
        全科成绩总表 · 共 {{ scoreRows.length }} 人 · {{ subjects.length }} 科 · 点击各科/总分列头排序
      </div>
      <el-table
        :data="sortedRows"
        class="exam-detail__table"
        :stripe="false"
        max-height="calc(100vh - 280px)"
        @sort-change="handleSortChange"
      >
        <el-table-column prop="studentNo" label="学号" width="100" fixed>
          <template #default="{ row }">
            <span class="cp-tabular-nums">{{ row.studentNo }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="姓名" width="90" fixed />
        <el-table-column
          v-for="subject in subjects"
          :key="subject.id"
          :prop="`subject-${subject.id}`"
          :label="`${subject.name}(${subject.fullScore})`"
          sortable="custom"
          width="104"
          align="center"
          header-align="center"
        >
          <template #default="{ row }">
            <span
              class="cp-tabular-nums exam-detail__score"
              :class="{
                'exam-detail__score--low': isLowScore(row.subjectScores[subject.id], subject.fullScore),
                'exam-detail__score--absent': row.subjectScores[subject.id]?.status === 'absent',
                'exam-detail__score--exempt': row.subjectScores[subject.id]?.status === 'exempt',
                'exam-detail__score--empty': !row.subjectScores[subject.id] || row.subjectScores[subject.id]?.status === 'empty',
              }"
            >
              {{ formatScoreCell(row.subjectScores[subject.id]) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          prop="totalScore"
          label="总分"
          sortable="custom"
          width="96"
          align="center"
          header-align="center"
          fixed="right"
        >
          <template #default="{ row }">
            <span class="cp-tabular-nums exam-detail__total">
              {{ row.totalScore ?? '—' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="总排" width="72" align="center" header-align="center" fixed="right">
          <template #default="{ row }">
            <span class="cp-tabular-nums">{{ row.totalRank ?? '—' }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.exam-detail__actions {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-2);
  flex-shrink: 0;
}

.exam-detail__scatter-card {
  margin-bottom: var(--cp-gap-5);
}

.exam-detail__table-card {
  overflow: hidden;
}

.exam-detail__table-hint {
  margin-bottom: var(--cp-gap-3);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
}

.exam-detail__score {
  font-size: var(--cp-font-md);
  font-weight: 600;
  color: var(--cp-text-1);
}

.exam-detail__score--low {
  color: var(--cp-danger);
  font-weight: 700;
}

.exam-detail__score--absent,
.exam-detail__score--empty {
  color: var(--cp-text-3);
  font-weight: 500;
  font-size: var(--cp-font-base);
}

.exam-detail__score--exempt {
  color: var(--cp-text-2);
  font-size: var(--cp-font-base);
}

.exam-detail__total {
  font-size: var(--cp-font-md);
  font-weight: 700;
  color: var(--cp-text-1);
}

.exam-detail__table :deep(.el-table__row) {
  height: 48px;
}

.exam-detail__table :deep(td.el-table__cell) {
  font-size: var(--cp-font-base);
}
</style>
