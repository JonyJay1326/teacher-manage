<script setup lang="ts">
import { nextTick, onMounted, ref, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ApiError } from '@/api/http';
import {
  dataAskApi,
  type DataAskResultDto,
  type DataQaCitationDto,
} from '@/api/ai';
import { listStudentsApi } from '@/api/students';
import { renderSimpleMarkdown } from '@/utils/simpleMarkdown';

const route = useRoute();
const question = ref('');
const asking = ref(false);
const result = ref<DataAskResultDto | null>(null);
const studentId = ref<number | undefined>(undefined);
const students = ref<Array<{ id: number; name: string }>>([]);
const history = ref<
  Array<{
    q: string;
    a: string;
    citations: DataQaCitationDto[];
    scopeLabel: string;
  }>
>([]);

/** 回答区 HTML（Markdown 子集） */
const answerHtml = computed(() =>
  result.value ? renderSimpleMarkdown(result.value.answer) : '',
);

/** 加载花名册（范围选择） */
async function loadStudents(): Promise<void> {
  try {
    const data = await listStudentsApi({ page: 1, pageSize: 200, status: '在读' });
    students.value = data.items.map((s) => ({ id: s.id, name: s.name }));
  } catch {
    students.value = [];
  }
}

/** 从路由带入学生 */
function applyRouteStudent(): void {
  const raw = route.query.studentId;
  const id = typeof raw === 'string' ? Number(raw) : Number(raw?.[0]);
  if (Number.isFinite(id) && id > 0) {
    studentId.value = id;
  }
}

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
    const data = await dataAskApi({
      question: q,
      studentId: studentId.value,
    });
    result.value = data;
    history.value.unshift({
      q,
      a: data.answer,
      citations: data.citations,
      scopeLabel: data.scopeLabel,
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

/** 回看历史 */
function restoreHist(item: {
  q: string;
  a: string;
  citations: DataQaCitationDto[];
  scopeLabel: string;
}): void {
  question.value = item.q;
  result.value = {
    available: true,
    answer: item.a,
    citations: item.citations,
    aiRecordId: null,
    contextText: '',
    scopeLabel: item.scopeLabel,
    studentId: studentId.value ?? null,
  };
}

watch(
  () => route.query.studentId,
  () => {
    applyRouteStudent();
  },
);

onMounted(() => {
  applyRouteStudent();
  void loadStudents();
});
</script>

<template>
  <div class="data-ask cp-animate-in">
    <div class="cp-page-header">
      <div>
        <h2 class="cp-page-header__title">学情问答</h2>
        <p class="cp-page-header__desc">
          用自然语言查询班级或个人成绩、事件等系统数据（与知识库问答不同）
        </p>
      </div>
    </div>

    <div class="data-ask__layout">
      <div class="cp-card cp-content-card data-ask__main">
        <div class="data-ask__scope">
          <span class="data-ask__label">范围</span>
          <el-select
            v-model="studentId"
            clearable
            filterable
            placeholder="全班（或问句中写姓名）"
            style="width: 280px"
          >
            <el-option
              v-for="s in students"
              :key="s.id"
              :label="s.name"
              :value="s.id"
            />
          </el-select>
        </div>

        <div class="data-ask__examples">
          <span class="data-ask__muted">试试：</span>
          <el-button
            link
            type="primary"
            @click="useExample('上次考试谁进步最大？各科低分率怎么样？')"
          >
            进退步/低分率
          </el-button>
          <el-button
            link
            type="primary"
            @click="useExample('这学期家校沟通偏少的学生有哪些？')"
          >
            沟通偏少
          </el-button>
          <el-button
            link
            type="primary"
            @click="useExample('重点关注的学生最近情况如何？')"
          >
            重点关注
          </el-button>
        </div>

        <el-input
          v-model="question"
          type="textarea"
          :rows="3"
          maxlength="1000"
          show-word-limit
          placeholder="例如：张三最近两次大考各科班排怎么变的？"
          @keydown.ctrl.enter="ask"
        />
        <div class="data-ask__submit">
          <span class="data-ask__muted">Ctrl + Enter 发送</span>
          <el-button type="primary" :loading="asking" @click="ask">提问</el-button>
        </div>

        <div v-if="result" class="data-ask__result">
          <div class="data-ask__scope-tag">
            本次范围：{{ result.scopeLabel }}
          </div>
          <h3 class="data-ask__answer-title">回答</h3>
          <div class="data-ask__answer" v-html="answerHtml" />

          <h3 class="data-ask__answer-title">引用数据</h3>
          <el-empty
            v-if="!result.citations.length"
            description="无引用条目"
            :image-size="64"
          />
          <el-collapse v-else>
            <el-collapse-item
              v-for="(c, idx) in result.citations"
              :key="`${c.kind}-${idx}`"
              :title="c.label"
              :name="idx"
            >
              <pre class="data-ask__pre">{{ c.detail }}</pre>
            </el-collapse-item>
          </el-collapse>
        </div>
      </div>

      <div class="cp-card cp-content-card data-ask__side">
        <h3 class="data-ask__side-title">本会话历史</h3>
        <p v-if="!history.length" class="data-ask__muted">提问后会显示在这里</p>
        <div
          v-for="(h, idx) in history"
          :key="idx"
          class="data-ask__hist"
          @click="restoreHist(h)"
        >
          <div class="data-ask__hist-scope">{{ h.scopeLabel }}</div>
          <div class="data-ask__hist-q">{{ h.q }}</div>
          <div class="data-ask__hist-a">
            {{ h.a.slice(0, 80) }}{{ h.a.length > 80 ? '…' : '' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.data-ask__layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: var(--cp-gap-4);
  align-items: start;
}
.data-ask__scope {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-3);
  margin-bottom: var(--cp-gap-3);
}
.data-ask__label {
  color: var(--cp-text-2);
  font-size: var(--cp-font-sm);
}
.data-ask__examples {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-2);
  margin-bottom: var(--cp-gap-3);
  flex-wrap: wrap;
}
.data-ask__submit {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--cp-gap-3);
}
.data-ask__result {
  margin-top: var(--cp-gap-5);
  padding-top: var(--cp-gap-4);
  border-top: 1px solid var(--cp-divider);
}
.data-ask__scope-tag {
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
  margin-bottom: var(--cp-gap-2);
}
.data-ask__answer-title {
  margin: 0 0 var(--cp-gap-2);
  font-size: 15px;
  color: var(--cp-text-1);
}
.data-ask__answer {
  line-height: 1.7;
  color: var(--cp-text-1);
  margin-bottom: var(--cp-gap-5);
  padding: var(--cp-gap-4);
  background: var(--cp-primary-bg);
  border-radius: var(--cp-radius-ctl);
}
.data-ask__answer :deep(p) {
  margin: 0 0 var(--cp-gap-2);
}
.data-ask__answer :deep(p:last-child) {
  margin-bottom: 0;
}
.data-ask__answer :deep(ul) {
  margin: 0 0 var(--cp-gap-2);
  padding-left: 1.25em;
}
.data-ask__answer :deep(li) {
  margin: 2px 0;
}
.data-ask__answer :deep(strong) {
  font-weight: 600;
  color: var(--cp-text-1);
}
.data-ask__side-title {
  margin: 0 0 var(--cp-gap-3);
  font-size: 15px;
}
.data-ask__hist {
  padding: var(--cp-gap-3);
  border-radius: var(--cp-radius-ctl);
  cursor: pointer;
  margin-bottom: var(--cp-gap-2);
  border: 1px solid var(--cp-divider);
}
.data-ask__hist:hover {
  background: var(--cp-primary-bg);
}
.data-ask__hist-scope {
  font-size: 12px;
  color: var(--cp-primary);
  margin-bottom: 2px;
}
.data-ask__hist-q {
  font-size: 13px;
  color: var(--cp-text-1);
  margin-bottom: 4px;
}
.data-ask__hist-a {
  font-size: 12px;
  color: var(--cp-text-3);
  line-height: 1.4;
}
.data-ask__muted {
  color: var(--cp-text-3);
  font-size: 13px;
}
.data-ask__pre {
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  color: var(--cp-text-2);
}
</style>
