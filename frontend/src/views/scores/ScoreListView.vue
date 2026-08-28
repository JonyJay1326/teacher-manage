<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ApiError } from '@/api/http';
import {
  createExamApi,
  listExamsApi,
  listSubjectsApi,
  listTermsApi,
} from '@/api/scores';
import type { Exam, Subject } from '@/types';

const router = useRouter();

const exams = ref<Exam[]>([]);
const subjects = ref<Subject[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const submitLoading = ref(false);

/** 新建考试表单 */
const form = reactive({
  name: '',
  examType: '月考',
  examDate: '',
  subjectIds: [] as number[],
});

/** 创建时使用的学期（后端必填，对话框不展示时取列表第一条） */
const defaultTermId = ref<number | null>(null);

/** 考试类型选项 */
const examTypeOptions = ['月考', '期中', '期末', '周测', '其他'] as const;

/** 加载考试与科目、学期 */
async function loadData(): Promise<void> {
  loading.value = true;
  try {
    const [examList, subjectList, termList] = await Promise.all([
      listExamsApi(),
      listSubjectsApi(),
      listTermsApi(),
    ]);
    exams.value = examList;
    subjects.value = subjectList;
    defaultTermId.value = termList[0]?.id ?? null;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载考试列表失败');
  } finally {
    loading.value = false;
  }
}

/** 打开新建对话框 */
function openCreateDialog(): void {
  form.name = '';
  form.examType = '月考';
  form.examDate = '';
  form.subjectIds = subjects.value.map((s) => s.id);
  dialogVisible.value = true;
}

/** 提交新建考试 */
async function handleCreate(): Promise<void> {
  if (!form.name.trim()) {
    ElMessage.warning('请填写考试名称');
    return;
  }
  if (!form.examDate) {
    ElMessage.warning('请选择考试日期');
    return;
  }
  if (form.subjectIds.length === 0) {
    ElMessage.warning('请至少选择一门科目');
    return;
  }
  if (defaultTermId.value === null) {
    ElMessage.warning('暂无学期，请先在系统中配置学期');
    return;
  }

  submitLoading.value = true;
  try {
    await createExamApi({
      name: form.name.trim(),
      examType: form.examType,
      examDate: form.examDate,
      subjectIds: form.subjectIds,
      termId: defaultTermId.value,
    });
    ElMessage.success('考试已创建');
    dialogVisible.value = false;
    await loadData();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '创建考试失败');
  } finally {
    submitLoading.value = false;
  }
}

/** 跳转考试详情（全科成绩） */
function goDetail(examId: number): void {
  router.push(`/scores/exams/${examId}`);
}

/** 跳转录入页 */
function goEntry(examId: number): void {
  router.push(`/scores/exams/${examId}/enter`);
}

/** 状态标签类型 */
function statusType(status: string): 'info' | 'warning' | 'success' | undefined {
  const map: Record<string, 'info' | 'warning' | 'success' | undefined> = {
    未录入: 'info',
    录入中: 'warning',
    已发布: 'success',
    已归档: undefined,
  };
  return map[status];
}

onMounted(() => {
  void loadData();
});
</script>

<template>
  <div class="score-list cp-animate-in">
    <div class="cp-page-header">
      <div>
        <h2 class="cp-page-header__title">考试管理</h2>
        <p class="cp-page-header__desc">管理考试与成绩录入</p>
      </div>
      <el-button type="primary" @click="openCreateDialog">新建考试</el-button>
    </div>

    <el-card shadow="never" class="score-list__table-card" v-loading="loading">
      <el-table :data="exams" :stripe="false">
        <el-table-column prop="name" label="考试名称" min-width="180" />
        <el-table-column prop="examType" label="类型" width="100" align="center" />
        <el-table-column prop="examDate" label="考试日期" width="130" align="center">
          <template #default="{ row }">
            <span class="cp-tabular-nums">{{ row.examDate }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="default">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right" align="center" header-align="center">
          <template #default="{ row }">
            <div class="cp-table-actions score-list__actions">
              <el-button link type="primary" @click="goDetail(row.id)">
                查看成绩
              </el-button>
              <el-button link @click="goEntry(row.id)">
                录入成绩
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      title="新建考试"
      width="520px"
      append-to-body
      align-center
      :close-on-click-modal="false"
    >
      <el-form label-width="88px">
        <el-form-item label="考试名称" required>
          <el-input v-model="form.name" placeholder="如：第一次月考" maxlength="64" />
        </el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="form.examType" style="width: 100%">
            <el-option
              v-for="t in examTypeOptions"
              :key="t"
              :label="t"
              :value="t"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="考试日期" required>
          <el-date-picker
            v-model="form.examDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="参考科目" required>
          <el-select
            v-model="form.subjectIds"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择科目"
            style="width: 100%"
          >
            <el-option
              v-for="s in subjects"
              :key="s.id"
              :label="`${s.name}（满分 ${s.fullScore}）`"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleCreate">
          创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.score-list__table-card {
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-card);
}

.score-list__actions {
  gap: var(--cp-gap-2);
}

.score-list__actions :deep(.el-button) {
  font-weight: 500;
  margin: 0;
}
</style>
