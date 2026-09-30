<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { ApiError } from '@/api/http';
import {
  getStudentImpressionApi,
  saveStudentImpressionApi,
} from '@/api/students';

/** 班主任印象 tab：加载、保存与脏状态跟踪 */

const props = defineProps<{
  studentId: number;
  /** 父级在切到该 tab 时触发加载，避免首屏无谓请求 */
  active: boolean;
}>();

const impressionContent = ref('');
const impressionSavedContent = ref('');
const impressionUpdatedAt = ref<string | null>(null);
const impressionLoading = ref(false);
const impressionSaving = ref(false);
const impressionLoaded = ref(false);

/** 印象是否有未保存修改 */
const impressionDirty = computed(
  () => impressionContent.value !== impressionSavedContent.value,
);

/** 格式化印象更新时间 */
function formatImpressionUpdatedAt(iso: string | null): string {
  if (!iso) return '尚未保存';
  return `上次保存：${new Date(iso).toLocaleString('zh-CN')}`;
}

/** 加载班主任印象 */
async function loadImpression(): Promise<void> {
  if (impressionLoaded.value) return;
  impressionLoading.value = true;
  try {
    const data = await getStudentImpressionApi(props.studentId);
    impressionContent.value = data.content;
    impressionSavedContent.value = data.content;
    impressionUpdatedAt.value = data.updatedAt;
    impressionLoaded.value = true;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载印象失败');
  } finally {
    impressionLoading.value = false;
  }
}

/** 保存班主任印象 */
async function saveImpression(): Promise<void> {
  impressionSaving.value = true;
  try {
    const data = await saveStudentImpressionApi(
      props.studentId,
      impressionContent.value,
    );
    impressionContent.value = data.content;
    impressionSavedContent.value = data.content;
    impressionUpdatedAt.value = data.updatedAt;
    ElMessage.success('印象已保存');
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '保存印象失败');
  } finally {
    impressionSaving.value = false;
  }
}

watch(
  () => props.active,
  (isActive) => {
    if (isActive) void loadImpression();
  },
  { immediate: true },
);
</script>

<template>
  <div class="impression-tab" v-loading="impressionLoading">
    <p class="impression-tab__hint">
      记录你对该生的日常观察，或其他同学/任课教师的看法。保存后会注入学情问答与评语生成等 AI 上下文。
    </p>
    <el-input
      v-model="impressionContent"
      type="textarea"
      :rows="14"
      maxlength="10000"
      show-word-limit
      placeholder="例如：课堂参与积极；同桌反映其近期情绪低落；数学老师认为基础扎实但粗心…"
    />
    <div class="impression-tab__footer">
      <span class="impression-tab__meta">
        {{ formatImpressionUpdatedAt(impressionUpdatedAt) }}
        <template v-if="impressionDirty"> · 有未保存修改</template>
      </span>
      <el-button
        type="primary"
        :loading="impressionSaving"
        :disabled="!impressionDirty"
        @click="saveImpression"
      >
        保存印象
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.impression-tab__hint {
  margin: 0 0 var(--cp-gap-3);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
  line-height: 1.6;
}

.impression-tab__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cp-gap-3);
  margin-top: var(--cp-gap-3);
}

.impression-tab__meta {
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}
</style>
