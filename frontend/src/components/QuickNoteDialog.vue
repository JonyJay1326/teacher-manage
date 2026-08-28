<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import { ApiError } from '@/api/http';
import { createDraftApi } from '@/api/incidents';
import { listStudentsApi } from '@/api/students';
import type { IncidentCategory, Student } from '@/types';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

/** 类别选项 */
const categoryOptions: IncidentCategory[] = [
  '纪律违纪',
  '情绪行为',
  '伤病健康',
  '家校沟通',
  '表扬奖励',
  '学习问题',
  '其他',
];

const studentOptions = ref<Student[]>([]);
const selectedStudentIds = ref<number[]>([]);
const content = ref('');
const category = ref<IncidentCategory>('其他');
const saving = ref(false);
const studentSelectRef = ref<{ focus: () => void } | null>(null);

/** 对话框可见性双向绑定 */
const visible = ref(props.modelValue);

watch(
  () => props.modelValue,
  (val) => {
    visible.value = val;
    if (val) {
      void loadStudents();
      void nextTick(() => {
        studentSelectRef.value?.focus();
      });
    }
  },
);

watch(visible, (val) => {
  emit('update:modelValue', val);
});

/** 加载学生列表供多选过滤 */
async function loadStudents(): Promise<void> {
  try {
    const res = await listStudentsApi({ pageSize: 100, status: '在读' });
    studentOptions.value = res.items;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载学生失败');
  }
}

/** Ctrl+Enter 快捷保存 */
function onContentKeydown(event: Event | KeyboardEvent): void {
  if (!(event instanceof KeyboardEvent)) return;
  if (event.ctrlKey && event.key === 'Enter') {
    event.preventDefault();
    void handleSave();
  }
}

/** 重置速记表单为初始状态 */
function resetForm(): void {
  selectedStudentIds.value = [];
  content.value = '';
  category.value = '其他';
}

/** 保存速记草稿 */
async function handleSave(): Promise<void> {
  if (selectedStudentIds.value.length === 0) {
    ElMessage.warning('请至少选择一名学生');
    return;
  }
  const text = content.value.trim();
  if (!text) {
    ElMessage.warning('请填写速记内容');
    return;
  }
  saving.value = true;
  try {
    await createDraftApi({
      studentIds: [...selectedStudentIds.value],
      content: text,
      category: category.value,
    });
    ElMessage.success('已保存草稿');
    resetForm();
    emit('saved');
    await nextTick();
    studentSelectRef.value?.focus();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

/** 关闭对话框 */
function handleClose(): void {
  visible.value = false;
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="速记"
    width="520px"
    append-to-body
    align-center
    destroy-on-close
  >
    <el-form label-position="top" @submit.prevent>
      <el-form-item label="学生" required>
        <el-select
          ref="studentSelectRef"
          v-model="selectedStudentIds"
          multiple
          filterable
          placeholder="输入姓名筛选，可多选"
          style="width: 100%"
        >
          <el-option
            v-for="s in studentOptions"
            :key="s.id"
            :label="s.name"
            :value="s.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="内容" required>
        <el-input
          v-model="content"
          type="textarea"
          :rows="5"
          placeholder="课间速记… Ctrl+Enter 保存"
          @keydown="onContentKeydown"
        />
      </el-form-item>
      <el-form-item label="类别">
        <el-select v-model="category" style="width: 100%">
          <el-option
            v-for="cat in categoryOptions"
            :key="cat"
            :label="cat"
            :value="cat"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">
        保存草稿
        <kbd class="quick-note__kbd">Ctrl+Enter</kbd>
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.quick-note__kbd {
  margin-left: var(--cp-gap-2);
  padding: 1px 6px;
  font-size: 11px;
  font-family: inherit;
  color: var(--cp-text-3);
  background: var(--cp-bg-page);
  border: 1px solid var(--cp-border);
  border-radius: 4px;
}
</style>
