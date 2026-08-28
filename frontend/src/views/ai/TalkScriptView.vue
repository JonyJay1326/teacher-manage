<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ApiError } from '@/api/http';
import { talkScriptApi } from '@/api/ai';
import { listStudentsApi } from '@/api/students';
import { renderSimpleMarkdown } from '@/utils/simpleMarkdown';

const route = useRoute();
const scene = ref('');
const studentId = ref<number | undefined>(undefined);
const includeContext = ref(true);
const generating = ref(false);
const draft = ref('');
const contextText = ref('');
const message = ref('');
const students = ref<Array<{ id: number; name: string }>>([]);

/** 草稿 HTML */
const draftHtml = computed(() =>
  draft.value ? renderSimpleMarkdown(draft.value) : '',
);

/** 加载花名册 */
async function loadStudents(): Promise<void> {
  try {
    const data = await listStudentsApi({ page: 1, pageSize: 200, status: '在读' });
    students.value = data.items.map((s) => ({ id: s.id, name: s.name }));
  } catch {
    students.value = [];
  }
}

/** 路由带入学生 */
function applyRouteStudent(): void {
  const raw = route.query.studentId;
  const id = typeof raw === 'string' ? Number(raw) : Number(raw?.[0]);
  if (Number.isFinite(id) && id > 0) {
    studentId.value = id;
  }
}

/** 生成话术 */
async function generate(): Promise<void> {
  if (!scene.value.trim()) {
    ElMessage.warning('请填写场景描述');
    return;
  }
  generating.value = true;
  message.value = '';
  try {
    const data = await talkScriptApi({
      scene: scene.value.trim(),
      studentId: studentId.value,
      includeContext: includeContext.value,
    });
    draft.value = data.draftText;
    contextText.value = data.contextText;
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
  applyRouteStudent();
  void loadStudents();
});
</script>

<template>
  <div class="talk-script cp-animate-in">
    <div class="cp-page-header">
      <div>
        <h2 class="cp-page-header__title">沟通话术</h2>
        <p class="cp-page-header__desc">
          描述场景后生成沟通策略草稿；可关联学生并注入档案与事件摘要
        </p>
      </div>
    </div>

    <div class="talk-script__grid">
      <el-card shadow="never" class="talk-script__panel">
        <el-form label-position="top">
          <el-form-item label="场景描述">
            <el-input
              v-model="scene"
              type="textarea"
              :rows="6"
              maxlength="4000"
              show-word-limit
              placeholder="例如：李敏妈妈来电，认为同桌欺负孩子，对方家长不认…"
            />
          </el-form-item>
          <el-form-item label="关联学生（可选）">
            <el-select
              v-model="studentId"
              clearable
              filterable
              placeholder="不关联则仅按场景生成"
              style="width: 100%"
            >
              <el-option
                v-for="s in students"
                :key="s.id"
                :label="s.name"
                :value="s.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="includeContext" :disabled="!studentId">
              注入该生档案与事件摘要
            </el-checkbox>
          </el-form-item>
          <el-button type="primary" :loading="generating" @click="generate">
            生成话术
          </el-button>
        </el-form>
      </el-card>

      <el-card shadow="never" class="talk-script__panel">
        <h3 class="talk-script__title">生成结果</h3>
        <p v-if="message" class="talk-script__msg">{{ message }}</p>
        <div v-if="draftHtml" class="talk-script__draft" v-html="draftHtml" />
        <el-empty v-else description="生成后显示草稿" :image-size="72" />
        <template v-if="contextText">
          <h3 class="talk-script__title">注入上下文</h3>
          <pre class="talk-script__pre">{{ contextText }}</pre>
        </template>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.talk-script__grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: var(--cp-gap-4);
  align-items: start;
}

.talk-script__panel {
  border: 1px solid var(--cp-border);
}

.talk-script__title {
  margin: 0 0 var(--cp-gap-2);
  font-size: var(--cp-font-base);
  font-weight: 600;
}

.talk-script__msg {
  margin: 0 0 var(--cp-gap-2);
  font-size: var(--cp-font-sm);
  color: var(--cp-warning);
}

.talk-script__draft {
  line-height: 1.7;
  padding: var(--cp-gap-3);
  background: var(--cp-primary-bg);
  border-radius: var(--cp-radius-ctl);
  margin-bottom: var(--cp-gap-4);
}

.talk-script__draft :deep(p) {
  margin: 0 0 var(--cp-gap-2);
}

.talk-script__pre {
  margin: 0;
  padding: var(--cp-gap-3);
  background: var(--cp-bg-page);
  border-radius: var(--cp-radius-ctl);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
  max-height: 280px;
  overflow: auto;
}
</style>
