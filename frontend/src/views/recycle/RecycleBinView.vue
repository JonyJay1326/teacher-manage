<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ApiError } from '@/api/http';
import {
  listRecycleApi,
  restoreRecycleApi,
  type RecycleEntityType,
  type RecycleItemDto,
} from '@/api/recycle';

const type = ref<RecycleEntityType>('students');
const loading = ref(false);
const items = ref<RecycleItemDto[]>([]);

/** 类型文案 */
function typeLabel(t: RecycleEntityType): string {
  const map: Record<RecycleEntityType, string> = {
    students: '学生',
    incidents: '事件',
    comments: '评语',
    exams: '考试',
    kb_documents: '知识库文档',
  };
  return map[t];
}

/** 加载 */
async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await listRecycleApi(type.value);
    items.value = data.items;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载失败');
  } finally {
    loading.value = false;
  }
}

/** 恢复 */
async function restore(row: RecycleItemDto): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认恢复「${row.title}」？`,
      '恢复确认',
      { type: 'info' },
    );
    await restoreRecycleApi(type.value, row.id);
    ElMessage.success('已恢复');
    await load();
  } catch (err: unknown) {
    if (err === 'cancel') return;
    ElMessage.error(err instanceof ApiError ? err.message : '恢复失败');
  }
}

/** 时间 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN');
}

watch(type, () => {
  void load();
});

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="recycle cp-animate-in">
    <div class="cp-page-header">
      <div>
        <h2 class="cp-page-header__title">回收站</h2>
        <p class="cp-page-header__desc">恢复误删的学生、事件、评语、考试与知识库文档</p>
      </div>
    </div>

    <div class="cp-card cp-content-card">
      <el-radio-group v-model="type" class="recycle__tabs">
        <el-radio-button value="students">学生</el-radio-button>
        <el-radio-button value="incidents">事件</el-radio-button>
        <el-radio-button value="comments">评语</el-radio-button>
        <el-radio-button value="exams">考试</el-radio-button>
        <el-radio-button value="kb_documents">知识库</el-radio-button>
      </el-radio-group>

      <el-table :data="items" v-loading="loading" empty-text="回收站为空">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="title" label="标题" min-width="220" />
        <el-table-column label="备注" min-width="140">
          <template #default="{ row }">{{ row.extra || '—' }}</template>
        </el-table-column>
        <el-table-column label="删除时间" min-width="180">
          <template #default="{ row }">{{ formatTime(row.deletedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="restore(row)">恢复</el-button>
          </template>
        </el-table-column>
      </el-table>
      <p class="recycle__hint">当前类型：{{ typeLabel(type) }}</p>
    </div>
  </div>
</template>

<style scoped>
.recycle__tabs {
  margin-bottom: var(--cp-gap-4);
}

.recycle__hint {
  margin: var(--cp-gap-3) 0 0;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}
</style>
