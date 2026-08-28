<script setup lang="ts">
import { nextTick, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ApiError } from '@/api/http';
import {
  askKnowledgeApi,
  type KbAskResultDto,
  type KbAskSourceDto,
} from '@/api/knowledge';
import { renderSimpleMarkdown } from '@/utils/simpleMarkdown';

const router = useRouter();
const question = ref('');
const asking = ref(false);
const result = ref<KbAskResultDto | null>(null);
const history = ref<Array<{ q: string; a: string; sources: KbAskSourceDto[] }>>([]);

/** 回答区 HTML */
const answerHtml = computed(() =>
  result.value ? renderSimpleMarkdown(result.value.answer) : '',
);

/** 提问 */
async function ask(): Promise<void> {
  const q = question.value.trim();
  if (!q) {
    ElMessage.warning('请输入问题');
    return;
  }
  asking.value = true;
  result.value = null;
  try {
    const data = await askKnowledgeApi(q);
    result.value = data;
    history.value.unshift({
      q,
      a: data.answer,
      sources: data.sources,
    });
    if (history.value.length > 20) {
      history.value = history.value.slice(0, 20);
    }
    if (data.message) {
      ElMessage.warning(data.message);
    }
    await nextTick();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '问答失败');
  } finally {
    asking.value = false;
  }
}

/** 示例问题 */
function useExample(text: string): void {
  question.value = text;
}

/** 去文档库 */
function goDocs(): void {
  router.push('/knowledge');
}
</script>

<template>
  <div class="kb-ask cp-animate-in">
    <div class="cp-page-header">
      <div>
        <h2 class="cp-page-header__title">知识库问答</h2>
        <p class="cp-page-header__desc">
          检索资料后由 AI 作答，并标注来源段落（可核对）
        </p>
      </div>
      <el-button @click="goDocs">文档管理</el-button>
    </div>

    <div class="kb-ask__layout">
      <div class="cp-card cp-content-card kb-ask__main">
        <div class="kb-ask__examples">
          <span class="kb-muted">试试：</span>
          <el-button
            link
            type="primary"
            @click="useExample('初中生课堂违纪，如何与家长沟通？')"
          >
            家校沟通
          </el-button>
          <el-button
            link
            type="primary"
            @click="useExample('学生出现厌学情绪，班主任可以怎么介入？')"
          >
            心理干预
          </el-button>
        </div>

        <el-input
          v-model="question"
          type="textarea"
          :rows="3"
          maxlength="1000"
          show-word-limit
          placeholder="描述你遇到的问题，例如政策条款、沟通话术、班会主题…"
          @keydown.ctrl.enter="ask"
        />
        <div class="kb-ask__submit">
          <span class="kb-muted">Ctrl + Enter 发送</span>
          <el-button type="primary" :loading="asking" @click="ask">提问</el-button>
        </div>

        <div v-if="result" class="kb-ask__result">
          <h3 class="kb-ask__answer-title">回答</h3>
          <div class="kb-ask__answer" v-html="answerHtml" />

          <h3 class="kb-ask__answer-title">命中原文</h3>
          <el-empty
            v-if="!result.sources.length"
            description="无命中段落"
            :image-size="64"
          />
          <el-collapse v-else>
            <el-collapse-item
              v-for="s in result.sources"
              :key="s.segmentId"
              :title="`${s.documentTitle} · 第${s.seq}段`"
              :name="s.segmentId"
            >
              <pre class="kb-seg">{{ s.text }}</pre>
            </el-collapse-item>
          </el-collapse>
        </div>
      </div>

      <div class="cp-card cp-content-card kb-ask__side">
        <h3 class="kb-ask__side-title">本会话历史</h3>
        <p v-if="!history.length" class="kb-muted">提问后会显示在这里</p>
        <div
          v-for="(h, idx) in history"
          :key="idx"
          class="kb-ask__hist"
          @click="question = h.q; result = { available: true, answer: h.a, sources: h.sources, aiRecordId: null, contextText: '' }"
        >
          <div class="kb-ask__hist-q">{{ h.q }}</div>
          <div class="kb-ask__hist-a">{{ h.a.slice(0, 80) }}{{ h.a.length > 80 ? '…' : '' }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-ask__layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: var(--cp-gap-4);
  align-items: start;
}
.kb-ask__examples {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-2);
  margin-bottom: var(--cp-gap-3);
  flex-wrap: wrap;
}
.kb-ask__submit {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--cp-gap-3);
}
.kb-ask__result {
  margin-top: var(--cp-gap-5);
  padding-top: var(--cp-gap-4);
  border-top: 1px solid var(--cp-divider);
}
.kb-ask__answer-title {
  margin: 0 0 var(--cp-gap-2);
  font-size: 15px;
  color: var(--cp-text-1);
}
.kb-ask__answer {
  line-height: 1.7;
  color: var(--cp-text-1);
  margin-bottom: var(--cp-gap-5);
  padding: var(--cp-gap-4);
  background: var(--cp-primary-bg);
  border-radius: var(--cp-radius-ctl);
}
.kb-ask__answer :deep(p) {
  margin: 0 0 var(--cp-gap-2);
}
.kb-ask__answer :deep(p:last-child) {
  margin-bottom: 0;
}
.kb-ask__answer :deep(ul) {
  margin: 0 0 var(--cp-gap-2);
  padding-left: 1.25em;
}
.kb-ask__answer :deep(li) {
  margin: 2px 0;
}
.kb-ask__answer :deep(strong) {
  font-weight: 600;
}
.kb-ask__side-title {
  margin: 0 0 var(--cp-gap-3);
  font-size: 15px;
}
.kb-ask__hist {
  padding: var(--cp-gap-3);
  border-radius: var(--cp-radius-ctl);
  cursor: pointer;
  margin-bottom: var(--cp-gap-2);
  border: 1px solid var(--cp-divider);
}
.kb-ask__hist:hover {
  background: var(--cp-primary-bg);
}
.kb-ask__hist-q {
  font-size: 13px;
  color: var(--cp-text-1);
  margin-bottom: 4px;
}
.kb-ask__hist-a {
  font-size: 12px;
  color: var(--cp-text-3);
  line-height: 1.4;
}
.kb-muted {
  color: var(--cp-text-3);
  font-size: 13px;
}
.kb-seg {
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  color: var(--cp-text-2);
}
</style>
