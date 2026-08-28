<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { ApiError } from '@/api/http';
import { workSummaryApi } from '@/api/ai';
import { listTermsApi, type TermDto } from '@/api/scores';
import { renderSimpleMarkdown } from '@/utils/simpleMarkdown';

const terms = ref<TermDto[]>([]);
const termId = ref<number | undefined>(undefined);
const generating = ref(false);
const draft = ref('');
const contextText = ref('');
const termName = ref('');
const message = ref('');

/** 草稿 HTML */
const draftHtml = computed(() =>
  draft.value ? renderSimpleMarkdown(draft.value) : '',
);

/** 加载学期 */
async function loadTerms(): Promise<void> {
  try {
    terms.value = await listTermsApi();
    termId.value = terms.value[0]?.id;
  } catch {
    terms.value = [];
  }
}

/** 生成总结 */
async function generate(): Promise<void> {
  generating.value = true;
  message.value = '';
  try {
    const data = await workSummaryApi({ termId: termId.value });
    draft.value = data.draftText;
    contextText.value = data.contextText;
    termName.value = data.termName;
    if (data.message) {
      message.value = data.message;
      ElMessage.warning(data.message);
    }
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '生成失败');
  } finally {
    generating.value = false;
  }
}

onMounted(() => {
  void loadTerms();
});
</script>

<template>
  <div class="work-summary cp-animate-in">
    <div class="cp-page-header">
      <div>
        <h2 class="cp-page-header__title">学期工作总结</h2>
        <p class="cp-page-header__desc">
          注入本学期班级考试趋势、事件与沟通统计，一次性生成工作总结初稿
        </p>
      </div>
      <div class="work-summary__actions">
        <el-select v-model="termId" placeholder="学期" style="width: 240px" clearable>
          <el-option
            v-for="t in terms"
            :key="t.id"
            :label="t.name"
            :value="t.id"
          />
        </el-select>
        <el-button type="primary" :loading="generating" @click="generate">
          生成总结
        </el-button>
      </div>
    </div>

    <el-card shadow="never" class="work-summary__card">
      <p v-if="message" class="work-summary__msg">{{ message }}</p>
      <p v-if="termName" class="work-summary__term">当前：{{ termName }}</p>
      <div v-if="draftHtml" class="work-summary__draft" v-html="draftHtml" />
      <el-empty v-else description="点击生成后显示初稿" :image-size="80" />
      <template v-if="contextText">
        <h3 class="work-summary__title">注入数据</h3>
        <pre class="work-summary__pre">{{ contextText }}</pre>
      </template>
    </el-card>
  </div>
</template>

<style scoped>
.work-summary__actions {
  display: flex;
  gap: var(--cp-gap-3);
  align-items: center;
}

.work-summary__card {
  border: 1px solid var(--cp-border);
}

.work-summary__msg {
  margin: 0 0 var(--cp-gap-2);
  color: var(--cp-warning);
  font-size: var(--cp-font-sm);
}

.work-summary__term {
  margin: 0 0 var(--cp-gap-3);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}

.work-summary__draft {
  line-height: 1.75;
  padding: var(--cp-gap-4);
  background: var(--cp-primary-bg);
  border-radius: var(--cp-radius-ctl);
  margin-bottom: var(--cp-gap-5);
}

.work-summary__draft :deep(p) {
  margin: 0 0 var(--cp-gap-2);
}

.work-summary__draft :deep(ul) {
  margin: 0 0 var(--cp-gap-2);
  padding-left: 1.25em;
}

.work-summary__title {
  margin: 0 0 var(--cp-gap-2);
  font-size: var(--cp-font-base);
  font-weight: 600;
}

.work-summary__pre {
  margin: 0;
  padding: var(--cp-gap-3);
  background: var(--cp-bg-page);
  border-radius: var(--cp-radius-ctl);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
  max-height: 360px;
  overflow: auto;
}
</style>
