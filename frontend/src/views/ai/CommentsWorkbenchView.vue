<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ApiError } from '@/api/http';
import {
  adoptCommentApi,
  aiHealthApi,
  commentContextApi,
  commentsWorkbenchApi,
  generateCommentApi,
  type CommentLength,
  type CommentTone,
  type CommentType,
  type CommentContextPreview,
  type WorkbenchStudentItem,
  type WorkbenchStatus,
} from '@/api/comments';
import { listPromptsApi, type AiPromptDto } from '@/api/ai';
import { listTermsApi, type TermDto } from '@/api/scores';

/** localStorage 暂存 */
interface CommentDraftPayload {
  termId: number;
  commentType: CommentType;
  studentId: number;
  text: string;
  aiRecordId: number | null;
  savedAt: string;
}

const DRAFT_KEY = 'cp_comment_workbench_draft';

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const generating = ref(false);
const adopting = ref(false);
const batchRunning = ref(false);
const batchProgress = ref({ done: 0, total: 0 });

const terms = ref<TermDto[]>([]);
const termId = ref<number | undefined>(undefined);
const commentType = ref<CommentType>('期末评语');
const tone = ref<CommentTone>('朴实');
const length = ref<CommentLength>('中');
const includeAdvice = ref(true);
const prompts = ref<AiPromptDto[]>([]);
const promptId = ref<number | undefined>(undefined);

const items = ref<WorkbenchStudentItem[]>([]);
const summary = ref({
  total: 0,
  none: 0,
  generated: 0,
  failed: 0,
  adopted: 0,
});
const selectedId = ref<number | null>(null);
const editorText = ref('');
const aiRecordId = ref<number | null>(null);
const context = ref<CommentContextPreview | null>(null);
const contextLoading = ref(false);
const dirty = ref(false);
const draftTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const aiConfigured = ref(false);
const filterStatus = ref<'all' | WorkbenchStatus>('all');

/** 左侧状态筛选 */
const filterOptions: Array<{ value: 'all' | WorkbenchStatus; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'none', label: '未生成' },
  { value: 'generated', label: '已生成' },
  { value: 'adopted', label: '已采纳' },
];

/** 当前选中学生 */
const selected = computed(() =>
  items.value.find((i) => i.studentId === selectedId.value) ?? null,
);

/** 过滤后的列表 */
const filteredItems = computed(() => {
  if (filterStatus.value === 'all') return items.value;
  return items.value.filter((i) => i.status === filterStatus.value);
});

/** 状态文案 */
function statusLabel(status: WorkbenchStatus): string {
  const map: Record<WorkbenchStatus, string> = {
    none: '未生成',
    generated: '已生成',
    failed: '失败',
    adopted: '已采纳',
  };
  return map[status];
}

/** 加载学期 */
async function loadTerms(): Promise<void> {
  terms.value = await listTermsApi();
  if (termId.value === undefined && terms.value.length > 0) {
    termId.value = terms.value[0].id;
  }
}

/** 加载评语模板 */
async function loadPrompts(): Promise<void> {
  try {
    const data = await listPromptsApi('comment');
    prompts.value = data.items;
    const def = data.items.find((p) => p.isDefault) ?? data.items[0];
    promptId.value = def?.id;
    if (def?.styleParams.tone) tone.value = def.styleParams.tone;
    if (def?.styleParams.length) length.value = def.styleParams.length;
    if (def?.styleParams.includeAdvice !== undefined) {
      includeAdvice.value = def.styleParams.includeAdvice;
    }
  } catch {
    prompts.value = [];
  }
}

/** 切换模板时同步风格默认值 */
function onPromptChange(id: number | undefined): void {
  const p = prompts.value.find((x) => x.id === id);
  if (!p) return;
  if (p.styleParams.tone) tone.value = p.styleParams.tone;
  if (p.styleParams.length) length.value = p.styleParams.length;
  if (p.styleParams.includeAdvice !== undefined) {
    includeAdvice.value = p.styleParams.includeAdvice;
  }
}

/** 加载工作台；keepEditor 时只刷新列表状态，不覆盖编辑区 */
async function loadWorkbench(options?: { keepEditor?: boolean }): Promise<void> {
  if (termId.value === undefined) return;
  const keepEditor = options?.keepEditor === true;
  loading.value = true;
  try {
    const data = await commentsWorkbenchApi(termId.value, commentType.value);
    items.value = data.items;
    summary.value = data.summary;
    if (keepEditor && selectedId.value !== null) {
      return;
    }
    if (
      selectedId.value === null
      || !items.value.some((i) => i.studentId === selectedId.value)
    ) {
      const first = items.value[0];
      if (first) await selectStudent(first.studentId, true);
    } else {
      await hydrateSelection(true);
    }
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载工作台失败');
  } finally {
    loading.value = false;
  }
}

/** 加载 AI 健康 */
async function loadAiHealth(): Promise<void> {
  try {
    const health = await aiHealthApi();
    aiConfigured.value = health.configured;
  } catch {
    aiConfigured.value = false;
  }
}

/** 选中学生 */
async function selectStudent(
  studentId: number,
  forceReload = false,
): Promise<void> {
  if (!forceReload && dirty.value && selectedId.value !== studentId) {
    try {
      await ElMessageBox.confirm('当前评语尚未采纳，切换将保留本地暂存。是否继续？', '提示', {
        type: 'warning',
        confirmButtonText: '继续',
        cancelButtonText: '取消',
      });
    } catch {
      return;
    }
  }
  selectedId.value = studentId;
  await hydrateSelection(true);
}

/** 根据选中学生填充编辑区（服务端新草稿优先于过期本地暂存） */
async function hydrateSelection(loadCtx: boolean): Promise<void> {
  const item = selected.value;
  if (!item || termId.value === undefined) return;

  const local = readLocalDraft(item.studentId);
  const localText = local?.text.trim() ?? '';
  // 本地暂存仅在「同一条 AI 记录」上保留未采纳编辑，避免旧暂存盖住重新生成
  const localMatchesServer =
    localText.length > 0
    && (item.aiRecordId === null || local?.aiRecordId === item.aiRecordId);

  if (item.status === 'adopted' && item.finalText) {
    editorText.value = item.finalText;
    aiRecordId.value = item.aiRecordId;
    dirty.value = false;
  } else if (localMatchesServer) {
    editorText.value = local!.text;
    aiRecordId.value = local!.aiRecordId;
    dirty.value = true;
  } else if (item.draftText) {
    editorText.value = item.draftText;
    aiRecordId.value = item.aiRecordId;
    dirty.value = false;
  } else if (localText.length > 0) {
    editorText.value = local!.text;
    aiRecordId.value = local!.aiRecordId;
    dirty.value = true;
  } else {
    editorText.value = '';
    aiRecordId.value = item.aiRecordId;
    dirty.value = false;
  }

  if (loadCtx) {
    await loadContext(item.studentId);
  }
}

/** 加载引用数据 */
async function loadContext(studentId: number): Promise<void> {
  contextLoading.value = true;
  try {
    context.value = await commentContextApi(studentId, termId.value);
  } catch (err: unknown) {
    context.value = null;
    ElMessage.error(err instanceof ApiError ? err.message : '加载上下文失败');
  } finally {
    contextLoading.value = false;
  }
}

/** 生成当前学生 */
async function handleGenerate(): Promise<void> {
  if (!selected.value || termId.value === undefined) return;
  generating.value = true;
  try {
    const result = await generateCommentApi({
      studentId: selected.value.studentId,
      termId: termId.value,
      commentType: commentType.value,
      tone: tone.value,
      length: length.value,
      includeAdvice: includeAdvice.value,
      promptId: promptId.value,
    });
    editorText.value = result.draftText;
    aiRecordId.value = result.aiRecordId;
    context.value = {
      contextText: result.contextText,
      sections: result.contextSections,
      approxTokens: result.approxTokens,
    };
    dirty.value = true;
    // 立即写入本地，避免防抖未落盘时被旧暂存回填覆盖
    if (draftTimer.value) {
      clearTimeout(draftTimer.value);
      draftTimer.value = null;
    }
    saveLocalDraft();
    if (result.message) {
      ElMessage.warning(result.message);
    } else {
      ElMessage.success('已生成草稿');
    }
    await loadWorkbench({ keepEditor: true });
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '生成失败');
  } finally {
    generating.value = false;
  }
}

/** 采纳当前 */
async function handleAdopt(): Promise<void> {
  if (!selected.value || termId.value === undefined) return;
  const text = editorText.value.trim();
  if (!text) {
    ElMessage.warning('评语内容不能为空');
    return;
  }
  adopting.value = true;
  try {
    await adoptCommentApi({
      studentId: selected.value.studentId,
      termId: termId.value,
      commentType: commentType.value,
      finalText: text,
      aiRecordId: aiRecordId.value ?? undefined,
    });
    clearLocalDraft(selected.value.studentId);
    dirty.value = false;
    ElMessage.success('已采纳');
    await loadWorkbench({ keepEditor: true });
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '采纳失败');
  } finally {
    adopting.value = false;
  }
}

/** 全部生成（串行） */
async function handleGenerateAll(): Promise<void> {
  if (termId.value === undefined) return;
  const targets = items.value.filter(
    (i) => i.status === 'none' || i.status === 'failed',
  );
  if (targets.length === 0) {
    ElMessage.info('没有待生成的学生');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `将串行生成 ${targets.length} 名学生的评语草稿，单条失败不中断。继续？`,
      '全部生成',
      { type: 'warning' },
    );
  } catch {
    return;
  }

  batchRunning.value = true;
  batchProgress.value = { done: 0, total: targets.length };
  let failCount = 0;
  for (const item of targets) {
    try {
      await generateCommentApi({
        studentId: item.studentId,
        termId: termId.value,
        commentType: commentType.value,
        tone: tone.value,
        length: length.value,
        includeAdvice: includeAdvice.value,
        promptId: promptId.value,
      });
    } catch {
      failCount += 1;
    }
    batchProgress.value = {
      done: batchProgress.value.done + 1,
      total: targets.length,
    };
  }
  batchRunning.value = false;
  await loadWorkbench({ keepEditor: true });
  if (failCount > 0) {
    ElMessage.warning(`完成：成功 ${targets.length - failCount}，失败 ${failCount}`);
  } else {
    ElMessage.success(`已全部生成 ${targets.length} 条草稿`);
  }
}

/** 导出已采纳 HTML */
function handleExportHtml(): void {
  const adopted = items.value.filter((i) => i.status === 'adopted' && i.finalText);
  if (adopted.length === 0) {
    ElMessage.warning('暂无已采纳评语可导出');
    return;
  }
  const termName = terms.value.find((t) => t.id === termId.value)?.name ?? '';
  const body = adopted
    .map(
      (i) =>
        `<section style="margin-bottom:24px"><h3>${i.studentNo} ${i.name}</h3><p style="white-space:pre-wrap;line-height:1.7">${escapeHtml(i.finalText ?? '')}</p></section>`,
    )
    .join('\n');
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${termName} ${commentType.value}</title></head><body style="font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 16px"><h1>${termName} · ${commentType.value}</h1>${body}</body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `评语_${termName}_${commentType.value}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/** HTML 转义 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 编辑变更 */
function onEditorInput(): void {
  dirty.value = true;
  scheduleDraftSave();
}

/** 防抖暂存 */
function scheduleDraftSave(): void {
  if (draftTimer.value) clearTimeout(draftTimer.value);
  draftTimer.value = setTimeout(() => {
    saveLocalDraft();
  }, 400);
}

/** 写 localStorage */
function saveLocalDraft(): void {
  if (!selected.value || termId.value === undefined) return;
  const payload: CommentDraftPayload = {
    termId: termId.value,
    commentType: commentType.value,
    studentId: selected.value.studentId,
    text: editorText.value,
    aiRecordId: aiRecordId.value,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
}

/** 读本地草稿（匹配当前学期/类型/学生） */
function readLocalDraft(studentId: number): CommentDraftPayload | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CommentDraftPayload;
    if (
      data.termId === termId.value
      && data.commentType === commentType.value
      && data.studentId === studentId
    ) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/** 清本地草稿 */
function clearLocalDraft(studentId: number): void {
  const cur = readLocalDraft(studentId);
  if (cur) localStorage.removeItem(DRAFT_KEY);
}

/** 离开前提示 */
function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (!dirty.value) return;
  e.preventDefault();
  e.returnValue = '';
}

watch([termId, commentType], async () => {
  selectedId.value = null;
  dirty.value = false;
  await loadWorkbench();
});

onMounted(async () => {
  window.addEventListener('beforeunload', onBeforeUnload);
  await Promise.all([loadTerms(), loadAiHealth(), loadPrompts()]);
  const qStudent = Number(route.query.studentId);
  if (Number.isFinite(qStudent) && qStudent > 0) {
    selectedId.value = qStudent;
  }
  await loadWorkbench();
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload);
  if (draftTimer.value) clearTimeout(draftTimer.value);
});

/** 打开学生详情 */
function openStudent(): void {
  if (!selected.value) return;
  router.push(`/students/${selected.value.studentId}`);
}
</script>

<template>
  <div class="comments-wb" v-loading="loading">
    <div class="cp-hero cp-animate-in comments-wb__hero">
      <div>
        <div class="cp-hero__kicker">ClassPilot · AI</div>
        <h1 class="cp-hero__title">评语工作台</h1>
        <p class="cp-hero__desc">
          逐个确认生成草稿；全部采纳后可导出 HTML。AI 未配置时仍可手工撰写并采纳。
        </p>
      </div>
      <el-tag :type="aiConfigured ? 'success' : 'info'" effect="dark">
        {{ aiConfigured ? 'DeepSeek 已配置' : 'AI 未配置 · 手工模式' }}
      </el-tag>
    </div>

    <el-card shadow="never" class="comments-wb__toolbar">
      <div class="comments-wb__filters">
        <el-select v-model="termId" placeholder="学期" style="width: 220px">
          <el-option
            v-for="t in terms"
            :key="t.id"
            :label="t.name"
            :value="t.id"
          />
        </el-select>
        <el-select v-model="commentType" style="width: 140px">
          <el-option label="期末评语" value="期末评语" />
          <el-option label="期中评语" value="期中评语" />
          <el-option label="日常评语" value="日常评语" />
        </el-select>
        <el-select
          v-model="promptId"
          placeholder="模板"
          clearable
          style="width: 160px"
          @change="onPromptChange"
        >
          <el-option
            v-for="p in prompts"
            :key="p.id"
            :label="p.isDefault ? `${p.name}（默认）` : p.name"
            :value="p.id"
          />
        </el-select>
        <el-select v-model="tone" style="width: 110px">
          <el-option label="亲切" value="亲切" />
          <el-option label="朴实" value="朴实" />
          <el-option label="严肃" value="严肃" />
        </el-select>
        <el-select v-model="length" style="width: 100px">
          <el-option label="短" value="短" />
          <el-option label="中" value="中" />
          <el-option label="长" value="长" />
        </el-select>
        <el-checkbox v-model="includeAdvice">含建议</el-checkbox>
        <div class="comments-wb__spacer" />
        <el-button
          :loading="batchRunning"
          :disabled="batchRunning"
          @click="handleGenerateAll"
        >
          全部生成
        </el-button>
        <el-button @click="handleExportHtml">导出 HTML</el-button>
      </div>
      <div class="comments-wb__summary">
        <span>共 {{ summary.total }} 人</span>
        <span>未生成 {{ summary.none }}</span>
        <span>已生成 {{ summary.generated }}</span>
        <span>失败 {{ summary.failed }}</span>
        <span>已采纳 {{ summary.adopted }}</span>
        <span v-if="batchRunning" class="comments-wb__batch">
          批量进度 {{ batchProgress.done }}/{{ batchProgress.total }}
        </span>
      </div>
    </el-card>

    <div class="comments-wb__main">
      <aside class="comments-wb__list">
        <div class="comments-wb__list-head">
          <button
            v-for="opt in filterOptions"
            :key="opt.value"
            type="button"
            class="comments-wb__filter-btn"
            :class="{ 'is-active': filterStatus === opt.value }"
            @click="filterStatus = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
        <div class="comments-wb__list-body">
          <button
            v-for="item in filteredItems"
            :key="item.studentId"
            type="button"
            class="comments-wb__item"
            :class="{ 'is-active': item.studentId === selectedId }"
            @click="selectStudent(item.studentId)"
          >
            <span class="comments-wb__no">{{ item.studentNo }}</span>
            <span class="comments-wb__name">{{ item.name }}</span>
            <span
              class="comments-wb__status"
              :class="`comments-wb__status--${item.status}`"
            >
              {{ statusLabel(item.status) }}
            </span>
          </button>
          <el-empty
            v-if="filteredItems.length === 0"
            description="无匹配学生"
            :image-size="64"
          />
        </div>
      </aside>

      <section class="comments-wb__editor" v-if="selected">
        <div class="comments-wb__editor-head">
          <div>
            <h3>{{ selected.studentNo }} {{ selected.name }}</h3>
            <el-button link type="primary" @click="openStudent">学生详情</el-button>
          </div>
          <div class="comments-wb__actions">
            <el-button :loading="generating" :disabled="batchRunning" @click="handleGenerate">
              {{ selected.status === 'none' ? '生成' : '重新生成' }}
            </el-button>
            <el-button
              type="primary"
              :loading="adopting"
              :disabled="!editorText.trim()"
              @click="handleAdopt"
            >
              采纳
            </el-button>
          </div>
        </div>
        <el-input
          v-model="editorText"
          type="textarea"
          :rows="14"
          placeholder="AI 草稿或手工撰写评语…"
          @input="onEditorInput"
        />
        <p class="comments-wb__hint">
          编辑内容自动暂存本地；采纳后写入正式评语。字数约 {{ editorText.trim().length }}。
        </p>
      </section>
      <section v-else class="comments-wb__editor comments-wb__editor--empty">
        <el-empty description="请选择左侧学生" />
      </section>

      <aside class="comments-wb__context" v-loading="contextLoading">
        <h4>引用数据</h4>
        <p v-if="context" class="comments-wb__tokens">
          约 {{ context.approxTokens }} tokens（预算 2500）
        </p>
        <el-collapse v-if="context">
          <el-collapse-item title="学生档案" name="profile">
            <pre class="comments-wb__pre">{{ context.sections.profile }}</pre>
          </el-collapse-item>
          <el-collapse-item title="成绩摘要" name="scores">
            <pre class="comments-wb__pre">{{ context.sections.scores }}</pre>
          </el-collapse-item>
          <el-collapse-item title="事件摘要" name="incidents">
            <pre class="comments-wb__pre">{{ context.sections.incidents }}</pre>
          </el-collapse-item>
          <el-collapse-item title="上次评语" name="last">
            <pre class="comments-wb__pre">{{ context.sections.lastComment }}</pre>
          </el-collapse-item>
          <el-collapse-item title="班主任印象" name="impression">
            <pre class="comments-wb__pre">{{ context.sections.impression }}</pre>
          </el-collapse-item>
        </el-collapse>
        <el-empty v-else description="选择学生后显示注入上下文" :image-size="72" />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.comments-wb {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-4);
  min-height: calc(100vh - 120px);
}

.comments-wb__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cp-gap-4);
}

.comments-wb__toolbar {
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-card);
}

.comments-wb__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cp-gap-3);
}

.comments-wb__spacer {
  flex: 1;
}

.comments-wb__summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cp-gap-4);
  margin-top: var(--cp-gap-3);
  color: var(--cp-text-3);
  font-size: var(--cp-font-sm);
}

.comments-wb__batch {
  color: var(--cp-primary);
  font-weight: 600;
}

.comments-wb__main {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 280px;
  gap: var(--cp-gap-4);
  min-height: 560px;
  align-items: stretch;
}

.comments-wb__list,
.comments-wb__editor,
.comments-wb__context {
  background: var(--cp-bg-card);
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-card);
  padding: var(--cp-gap-3);
  min-width: 0;
}

.comments-wb__list {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-3);
  max-height: 70vh;
  overflow: hidden;
}

.comments-wb__list-head {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
  flex-shrink: 0;
}

.comments-wb__filter-btn {
  height: 28px;
  padding: 0 2px;
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-ctl);
  background: var(--cp-bg-card);
  color: var(--cp-text-2);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
}

.comments-wb__filter-btn.is-active {
  border-color: var(--cp-primary);
  background: var(--cp-primary);
  color: #fff;
  font-weight: 600;
}

.comments-wb__list-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-1);
}

.comments-wb__item {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 52px;
  align-items: center;
  column-gap: var(--cp-gap-2);
  width: 100%;
  min-height: 36px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: var(--cp-radius-ctl);
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: var(--cp-text-1);
}

.comments-wb__item:hover {
  background: var(--cp-primary-bg);
}

.comments-wb__item.is-active {
  border-color: var(--cp-primary-border);
  background: var(--cp-primary-bg);
}

.comments-wb__no {
  color: var(--cp-text-3);
  font-size: var(--cp-font-sm);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.comments-wb__name {
  font-weight: 600;
  font-size: var(--cp-font-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comments-wb__status {
  justify-self: end;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  color: var(--cp-text-3);
}

.comments-wb__status--none {
  color: var(--cp-text-3);
}

.comments-wb__status--generated {
  color: var(--cp-warning);
}

.comments-wb__status--failed {
  color: var(--cp-danger);
}

.comments-wb__status--adopted {
  color: var(--cp-success);
}

.comments-wb__editor {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-3);
}

.comments-wb__editor--empty {
  align-items: center;
  justify-content: center;
}

.comments-wb__editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cp-gap-3);
}

.comments-wb__editor-head > div:first-child {
  display: flex;
  align-items: baseline;
  gap: var(--cp-gap-3);
  min-width: 0;
}

.comments-wb__editor-head h3 {
  margin: 0;
  font-size: var(--cp-font-md);
  white-space: nowrap;
}

.comments-wb__actions {
  display: flex;
  gap: var(--cp-gap-2);
}

.comments-wb__hint {
  margin: 0;
  color: var(--cp-text-3);
  font-size: var(--cp-font-sm);
}

.comments-wb__context h4 {
  margin: 0 0 var(--cp-gap-2);
  font-size: var(--cp-font-md);
}

.comments-wb__tokens {
  margin: 0 0 var(--cp-gap-3);
  color: var(--cp-text-3);
  font-size: var(--cp-font-sm);
}

.comments-wb__pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
  line-height: 1.6;
}
</style>
