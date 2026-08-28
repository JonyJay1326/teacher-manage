<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ApiError } from '@/api/http';
import { listAiRecordsApi, type AiRecordDto } from '@/api/ai';
import { renderSimpleMarkdown } from '@/utils/simpleMarkdown';

const router = useRouter();
const loading = ref(false);
const items = ref<AiRecordDto[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const scene = ref('');
const status = ref('');
const detail = ref<AiRecordDto | null>(null);

/** 详情输出：Markdown 渲染 */
const detailOutputHtml = computed(() =>
  detail.value?.outputText
    ? renderSimpleMarkdown(detail.value.outputText)
    : '',
);

/** 加载 */
async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await listAiRecordsApi({
      scene: scene.value || undefined,
      status: status.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    items.value = data.items;
    total.value = data.total;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载失败');
  } finally {
    loading.value = false;
  }
}

/** 场景文案 */
function sceneLabel(s: string): string {
  const map: Record<string, string> = {
    comment: '评语',
    score_import_map: '成绩表映射',
    kb_qa: '知识库问答',
    data_qa: '学情问答',
    report: '报告',
    talk_script: '话术',
    work_summary: '总结',
  };
  return map[s] ?? s;
}

/** 状态文案 */
function statusLabel(s: string): string {
  const map: Record<string, string> = {
    generated: '已生成',
    adopted: '已采纳',
    failed: '失败',
  };
  return map[s] ?? s;
}

/** 时间 */
function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN');
}

/** 打开学生 */
function openStudent(id: number | null): void {
  if (!id) return;
  router.push(`/students/${id}`);
}

watch([scene, status], () => {
  page.value = 1;
  void load();
});

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="records cp-animate-in">
    <div class="cp-page-header">
      <div>
        <h2 class="cp-page-header__title">生成历史</h2>
        <p class="cp-page-header__desc">AI 调用记录（含上下文快照与输出，只读）</p>
      </div>
    </div>

    <div class="cp-card cp-content-card">
      <div class="records__filters">
        <el-select v-model="scene" clearable placeholder="场景" style="width: 160px">
          <el-option label="评语" value="comment" />
          <el-option label="成绩表映射" value="score_import_map" />
          <el-option label="知识库问答" value="kb_qa" />
          <el-option label="学情问答" value="data_qa" />
          <el-option label="沟通话术" value="talk_script" />
          <el-option label="工作总结" value="work_summary" />
        </el-select>
        <el-select v-model="status" clearable placeholder="状态" style="width: 140px">
          <el-option label="已生成" value="generated" />
          <el-option label="已采纳" value="adopted" />
          <el-option label="失败" value="failed" />
        </el-select>
        <el-button @click="load">刷新</el-button>
      </div>

      <el-table :data="items" v-loading="loading" empty-text="暂无记录" style="width: 100%">
        <el-table-column prop="id" label="ID" width="72" />
        <el-table-column label="场景" min-width="120">
          <template #default="{ row }">{{ sceneLabel(row.scene) }}</template>
        </el-table-column>
        <el-table-column label="学生" min-width="120">
          <template #default="{ row }">
            <el-button
              v-if="row.studentId"
              link
              type="primary"
              @click="openStudent(row.studentId)"
            >
              {{ row.studentName || row.studentId }}
            </el-button>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="100">
          <template #default="{ row }">{{ statusLabel(row.status) }}</template>
        </el-table-column>
        <el-table-column prop="model" label="模型" min-width="140" />
        <el-table-column label="tokens" min-width="120">
          <template #default="{ row }">
            {{ row.tokensIn ?? 0 }} / {{ row.tokensOut ?? 0 }}
          </template>
        </el-table-column>
        <el-table-column label="时间" min-width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="detail = row as AiRecordDto">
              详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="records__pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="load"
        />
      </div>
    </div>

    <el-drawer
      :model-value="detail !== null"
      title="记录详情"
      size="480px"
      append-to-body
      destroy-on-close
      @update:model-value="(open: boolean) => { if (!open) detail = null }"
    >
      <template v-if="detail">
        <p class="records__label">输出</p>
        <div
          v-if="detailOutputHtml"
          class="records__output"
          v-html="detailOutputHtml"
        />
        <pre v-else class="records__pre">—</pre>
        <p class="records__label">上下文快照</p>
        <pre class="records__pre">{{ detail.contextSnapshot }}</pre>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.records__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cp-gap-3);
  margin-bottom: var(--cp-gap-4);
}

.records__pager {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--cp-gap-3);
}

.records__label {
  margin: var(--cp-gap-3) 0 var(--cp-gap-2);
  font-weight: 600;
  color: var(--cp-text-1);
}

.records__pre {
  margin: 0;
  padding: var(--cp-gap-3);
  background: var(--cp-bg-page);
  border-radius: var(--cp-radius-ctl);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
  line-height: 1.6;
  max-height: 40vh;
  overflow: auto;
}

.records__output {
  margin: 0;
  padding: var(--cp-gap-3);
  background: var(--cp-primary-bg);
  border-radius: var(--cp-radius-ctl);
  word-break: break-word;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-1);
  line-height: 1.7;
  max-height: 40vh;
  overflow: auto;
}

.records__output :deep(p) {
  margin: 0 0 var(--cp-gap-2);
}

.records__output :deep(p:last-child) {
  margin-bottom: 0;
}

.records__output :deep(ul) {
  margin: 0 0 var(--cp-gap-2);
  padding-left: 1.25em;
}

.records__output :deep(li) {
  margin: 2px 0;
}

.records__output :deep(strong) {
  font-weight: 600;
  color: var(--cp-text-1);
}
</style>
