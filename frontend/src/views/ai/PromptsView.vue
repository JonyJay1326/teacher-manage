<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ApiError } from '@/api/http';
import {
  clonePromptApi,
  createPromptApi,
  deletePromptApi,
  listPromptsApi,
  setDefaultPromptApi,
  updatePromptApi,
  type AiPromptDto,
  type PromptPlaceholderDto,
  type PromptStyleParams,
} from '@/api/ai';

const scene = ref('comment');
const items = ref<AiPromptDto[]>([]);
const placeholders = ref<PromptPlaceholderDto[]>([]);
const loading = ref(false);
const selectedId = ref<number | null>(null);

const editorName = ref('');
const editorTemplate = ref('');
const editorTone = ref<PromptStyleParams['tone']>('朴实');
const editorLength = ref<PromptStyleParams['length']>('中');
const editorAdvice = ref(true);
const saving = ref(false);

/** 当前选中 */
const selected = computed(
  () => items.value.find((i) => i.id === selectedId.value) ?? null,
);

/** 场景中文 */
function sceneLabel(s: string): string {
  const map: Record<string, string> = {
    comment: '评语',
    report: '综合素质报告',
    talk_script: '沟通话术',
    work_summary: '工作总结',
    data_qa: '学情问答',
  };
  return map[s] ?? s;
}

/** 加载列表 */
async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const data = await listPromptsApi(scene.value);
    items.value = data.items;
    placeholders.value = data.placeholders;
    if (
      selectedId.value === null
      || !items.value.some((i) => i.id === selectedId.value)
    ) {
      selectedId.value = items.value[0]?.id ?? null;
    }
    hydrateEditor();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载模板失败');
  } finally {
    loading.value = false;
  }
}

/** 填充编辑器 */
function hydrateEditor(): void {
  const item = selected.value;
  if (!item) {
    editorName.value = '';
    editorTemplate.value = '';
    return;
  }
  editorName.value = item.name;
  editorTemplate.value = item.template;
  editorTone.value = item.styleParams.tone ?? '朴实';
  editorLength.value = item.styleParams.length ?? '中';
  editorAdvice.value = item.styleParams.includeAdvice !== false;
}

/** 选中模板 */
function selectPrompt(id: number): void {
  selectedId.value = id;
  hydrateEditor();
}

/** 插入占位符 */
function insertPlaceholder(key: string): void {
  editorTemplate.value += `{{${key}}}`;
}

/** 展示用占位符文本，避免模板里嵌套 {{ }} 被编译器截断 */
function formatPlaceholder(key: string): string {
  return `{{${key}}}`;
}

/** 保存 */
async function handleSave(): Promise<void> {
  if (!selected.value) return;
  if (!editorName.value.trim() || !editorTemplate.value.trim()) {
    ElMessage.warning('名称与模板正文不能为空');
    return;
  }
  saving.value = true;
  try {
    await updatePromptApi(selected.value.id, {
      name: editorName.value.trim(),
      template: editorTemplate.value,
      styleParams: {
        tone: editorTone.value,
        length: editorLength.value,
        includeAdvice: editorAdvice.value,
      },
    });
    ElMessage.success('已保存');
    await loadList();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

/** 新建 */
async function handleCreate(): Promise<void> {
  try {
    const created = await createPromptApi({
      scene: scene.value,
      name: '自定义评语模板',
      template:
        '请为 {{student_name}} 撰写评语。语气{{style_tone}}，篇幅{{style_length}}。\n\n成绩：{{score_trend}}\n事件：{{incident_summary}}\n表扬：{{praise_summary}}\n上次：{{last_comment}}',
      styleParams: { tone: '朴实', length: '中', includeAdvice: true },
    });
    ElMessage.success('已创建');
    await loadList();
    selectPrompt(created.id);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '创建失败');
  }
}

/** 克隆 */
async function handleClone(): Promise<void> {
  if (!selected.value) return;
  try {
    const cloned = await clonePromptApi(selected.value.id);
    ElMessage.success('已克隆');
    await loadList();
    selectPrompt(cloned.id);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '克隆失败');
  }
}

/** 设默认 */
async function handleDefault(): Promise<void> {
  if (!selected.value) return;
  try {
    await setDefaultPromptApi(selected.value.id);
    ElMessage.success('已设为默认');
    await loadList();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '设置失败');
  }
}

/** 删除 */
async function handleDelete(): Promise<void> {
  if (!selected.value) return;
  if (selected.value.isBuiltin) {
    ElMessage.warning('内置模板不可删除，请先克隆');
    return;
  }
  try {
    await ElMessageBox.confirm('确认软删除该模板？', '删除确认', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await deletePromptApi(selected.value.id);
    ElMessage.success('已删除');
    selectedId.value = null;
    await loadList();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '删除失败');
  }
}

watch(scene, () => {
  selectedId.value = null;
  void loadList();
});

onMounted(() => {
  void loadList();
});
</script>

<template>
  <div class="prompts cp-animate-in" v-loading="loading">
    <div class="cp-page-header">
      <div>
        <h2 class="cp-page-header__title">模板管理</h2>
        <p class="cp-page-header__desc">
          场景 × 正文 × 风格参数；内置可克隆不可删。评语工作台优先使用默认模板。
        </p>
      </div>
      <div class="prompts__header-actions">
        <el-select v-model="scene" style="width: 160px">
          <el-option label="评语" value="comment" />
          <el-option label="学情问答" value="data_qa" />
          <el-option label="综合素质报告" value="report" />
          <el-option label="沟通话术" value="talk_script" />
          <el-option label="工作总结" value="work_summary" />
        </el-select>
        <el-button type="primary" @click="handleCreate">新建</el-button>
      </div>
    </div>

    <div class="prompts__main">
      <aside class="prompts__list">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="prompts__item"
          :class="{ 'is-active': item.id === selectedId }"
          @click="selectPrompt(item.id)"
        >
          <div class="prompts__item-title">
            {{ item.name }}
            <el-tag v-if="item.isDefault" size="small" type="success" effect="plain">
              默认
            </el-tag>
            <el-tag v-if="item.isBuiltin" size="small" effect="plain">内置</el-tag>
          </div>
          <div class="prompts__item-meta">{{ sceneLabel(item.scene) }}</div>
        </button>
        <el-empty v-if="items.length === 0" description="暂无模板" :image-size="64" />
      </aside>

      <section class="prompts__editor" v-if="selected">
        <el-form label-width="88px">
          <el-form-item label="名称">
            <el-input v-model="editorName" />
          </el-form-item>
          <el-form-item label="语气">
            <el-radio-group v-model="editorTone">
              <el-radio-button value="亲切">亲切</el-radio-button>
              <el-radio-button value="朴实">朴实</el-radio-button>
              <el-radio-button value="严肃">严肃</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="篇幅">
            <el-radio-group v-model="editorLength">
              <el-radio-button value="短">短</el-radio-button>
              <el-radio-button value="中">中</el-radio-button>
              <el-radio-button value="长">长</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="含建议">
            <el-switch v-model="editorAdvice" />
          </el-form-item>
          <el-form-item label="模板正文">
            <el-input v-model="editorTemplate" type="textarea" :rows="16" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
            <el-button @click="handleClone">克隆</el-button>
            <el-button @click="handleDefault">设为默认</el-button>
            <el-button
              type="danger"
              plain
              :disabled="selected.isBuiltin"
              @click="handleDelete"
            >
              删除
            </el-button>
          </el-form-item>
        </el-form>
      </section>
      <section v-else class="prompts__editor prompts__editor--empty">
        <el-empty description="请选择或新建模板" />
      </section>

      <aside class="prompts__placeholders">
        <h4>可用占位符</h4>
        <p class="prompts__ph-hint">点击插入到正文光标末尾（示例值仅供参考）</p>
        <button
          v-for="ph in placeholders"
          :key="ph.key"
          type="button"
          class="prompts__ph"
          @click="insertPlaceholder(ph.key)"
        >
          <code>{{ formatPlaceholder(ph.key) }}</code>
          <span>{{ ph.label }}</span>
          <small>{{ ph.sample }}</small>
        </button>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.prompts__header-actions {
  display: flex;
  gap: var(--cp-gap-2);
}

.prompts__main {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 240px;
  gap: var(--cp-gap-4);
  min-height: 560px;
}

.prompts__list,
.prompts__editor,
.prompts__placeholders {
  background: var(--cp-bg-card);
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-card);
  padding: var(--cp-gap-3);
  min-width: 0;
}

.prompts__list {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-2);
  max-height: 70vh;
  overflow: auto;
}

.prompts__item {
  text-align: left;
  border: 1px solid transparent;
  border-radius: var(--cp-radius-ctl);
  background: transparent;
  padding: var(--cp-gap-2) var(--cp-gap-3);
  cursor: pointer;
  color: var(--cp-text-1);
}

.prompts__item:hover {
  background: var(--cp-primary-bg);
}

.prompts__item.is-active {
  border-color: var(--cp-primary-border);
  background: var(--cp-primary-bg);
}

.prompts__item-title {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cp-gap-1);
  align-items: center;
  font-weight: 600;
  font-size: var(--cp-font-sm);
}

.prompts__item-meta {
  margin-top: 2px;
  color: var(--cp-text-3);
  font-size: 12px;
}

.prompts__editor--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.prompts__placeholders h4 {
  margin: 0 0 var(--cp-gap-2);
  font-size: var(--cp-font-md);
}

.prompts__ph-hint {
  margin: 0 0 var(--cp-gap-3);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}

.prompts__ph {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  margin-bottom: var(--cp-gap-2);
  padding: var(--cp-gap-2);
  border: 1px solid var(--cp-divider);
  border-radius: var(--cp-radius-ctl);
  background: var(--cp-bg-page);
  cursor: pointer;
  text-align: left;
  color: var(--cp-text-1);
}

.prompts__ph code {
  font-size: 12px;
  color: var(--cp-primary);
}

.prompts__ph small {
  color: var(--cp-text-3);
  font-size: 12px;
}
</style>
