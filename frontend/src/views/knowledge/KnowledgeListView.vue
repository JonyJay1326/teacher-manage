<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type UploadFile } from 'element-plus';
import { ApiError } from '@/api/http';
import {
  deleteKbDocumentApi,
  getKbDocumentApi,
  listKbCategoriesApi,
  listKbDocumentsApi,
  pasteKbDocumentApi,
  updateKbDocumentApi,
  uploadKbDocumentApi,
  type KbDocumentDto,
  type KbSegmentDto,
} from '@/api/knowledge';

const router = useRouter();
const loading = ref(false);
const items = ref<KbDocumentDto[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const category = ref('');
const keyword = ref('');
const presets = ref<string[]>([]);

const pasteOpen = ref(false);
const uploadOpen = ref(false);
const detailOpen = ref(false);
const saving = ref(false);

const pasteTitle = ref('');
const pasteCategory = ref('其他');
const pasteTags = ref('');
const pasteContent = ref('');

const uploadTitle = ref('');
const uploadCategory = ref('其他');
const uploadTags = ref('');
const uploadFile = ref<File | null>(null);

const detailDoc = ref<KbDocumentDto | null>(null);
const detailSegments = ref<KbSegmentDto[]>([]);
const editTitle = ref('');
const editCategory = ref('');
const editTags = ref('');

/** 分类选项 */
const categoryOptions = computed(() => {
  const set = new Set<string>([...presets.value]);
  return [...set];
});

/** 加载分类 */
async function loadCategories(): Promise<void> {
  try {
    const data = await listKbCategoriesApi();
    presets.value = data.presets;
  } catch {
    presets.value = [
      '政策法规',
      '特殊教育',
      '心理干预',
      '班会素材',
      '家校沟通话术',
      '其他',
    ];
  }
}

/** 加载列表 */
async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await listKbDocumentsApi({
      category: category.value || undefined,
      keyword: keyword.value || undefined,
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

/** 时间 */
function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN');
}

/** 打开粘贴 */
function openPaste(): void {
  pasteTitle.value = '';
  pasteCategory.value = '其他';
  pasteTags.value = '';
  pasteContent.value = '';
  pasteOpen.value = true;
}

/** 提交粘贴 */
async function submitPaste(): Promise<void> {
  if (!pasteTitle.value.trim() || !pasteContent.value.trim()) {
    ElMessage.warning('请填写标题与正文');
    return;
  }
  saving.value = true;
  try {
    await pasteKbDocumentApi({
      title: pasteTitle.value.trim(),
      categoryPath: pasteCategory.value,
      tags: pasteTags.value,
      content: pasteContent.value,
    });
    ElMessage.success('已入库并完成切段索引');
    pasteOpen.value = false;
    await load();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

/** 打开上传 */
function openUpload(): void {
  uploadTitle.value = '';
  uploadCategory.value = '其他';
  uploadTags.value = '';
  uploadFile.value = null;
  uploadOpen.value = true;
}

/** 选文件 */
function onFileChange(file: UploadFile): void {
  uploadFile.value = file.raw ?? null;
  if (file.raw && !uploadTitle.value) {
    const name = file.raw.name.replace(/\.[^.]+$/, '');
    uploadTitle.value = name.slice(0, 200);
  }
}

/** 提交上传 */
async function submitUpload(): Promise<void> {
  if (!uploadFile.value) {
    ElMessage.warning('请选择文件');
    return;
  }
  saving.value = true;
  try {
    const form = new FormData();
    form.append('file', uploadFile.value);
    if (uploadTitle.value.trim()) {
      form.append('title', uploadTitle.value.trim());
    }
    form.append('categoryPath', uploadCategory.value);
    if (uploadTags.value.trim()) {
      form.append('tags', uploadTags.value.trim());
    }
    await uploadKbDocumentApi(form);
    ElMessage.success('上传成功，已切段入库');
    uploadOpen.value = false;
    await load();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '上传失败');
  } finally {
    saving.value = false;
  }
}

/** 打开详情 */
async function openDetail(row: KbDocumentDto): Promise<void> {
  try {
    const data = await getKbDocumentApi(row.id);
    detailDoc.value = data.document;
    detailSegments.value = data.segments;
    editTitle.value = data.document.title;
    editCategory.value = data.document.categoryPath ?? '其他';
    editTags.value = data.document.tags.join(',');
    detailOpen.value = true;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载详情失败');
  }
}

/** 保存元数据 */
async function saveMeta(): Promise<void> {
  if (!detailDoc.value) return;
  saving.value = true;
  try {
    const updated = await updateKbDocumentApi(detailDoc.value.id, {
      title: editTitle.value.trim(),
      categoryPath: editCategory.value,
      tags: editTags.value,
    });
    detailDoc.value = updated;
    ElMessage.success('已保存');
    await load();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

/** 删除 */
async function removeDoc(row: KbDocumentDto): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除「${row.title}」？`, '删除确认', {
      type: 'warning',
    });
    await deleteKbDocumentApi(row.id);
    ElMessage.success('已删除');
    if (detailDoc.value?.id === row.id) {
      detailOpen.value = false;
    }
    await load();
  } catch (err: unknown) {
    if (err === 'cancel' || err === 'close') return;
    ElMessage.error(err instanceof ApiError ? err.message : '删除失败');
  }
}

/** 去问答 */
function goAsk(): void {
  router.push('/knowledge/ask');
}

watch([category, keyword], () => {
  page.value = 1;
  void load();
});

onMounted(() => {
  void loadCategories();
  void load();
});
</script>

<template>
  <div class="kb-list cp-animate-in">
    <div class="cp-page-header">
      <div>
        <h2 class="cp-page-header__title">知识库文档</h2>
        <p class="cp-page-header__desc">
          上传或粘贴资料，自动切段并建立检索索引（S6）
        </p>
      </div>
      <div class="kb-list__actions">
        <el-button @click="goAsk">智能问答</el-button>
        <el-button @click="openPaste">粘贴文本</el-button>
        <el-button type="primary" @click="openUpload">上传文件</el-button>
      </div>
    </div>

    <div class="cp-card cp-content-card">
      <div class="kb-list__filters">
        <el-select
          v-model="category"
          clearable
          placeholder="分类"
          style="width: 160px"
        >
          <el-option
            v-for="c in categoryOptions"
            :key="c"
            :label="c"
            :value="c"
          />
        </el-select>
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索标题/正文/标签"
          style="width: 240px"
          @keyup.enter="load"
        />
        <el-button @click="load">刷新</el-button>
      </div>

      <el-table :data="items" v-loading="loading" empty-text="暂无文档，先上传或粘贴">
        <el-table-column prop="title" label="标题" min-width="200" />
        <el-table-column label="分类" width="120">
          <template #default="{ row }">{{ row.categoryPath || '—' }}</template>
        </el-table-column>
        <el-table-column label="标签" min-width="140">
          <template #default="{ row }">
            <el-tag
              v-for="t in row.tags"
              :key="t"
              size="small"
              style="margin-right: 4px"
            >
              {{ t }}
            </el-tag>
            <span v-if="!row.tags.length" class="kb-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="段数" width="80" prop="segCount" />
        <el-table-column label="来源" width="90">
          <template #default="{ row }">
            {{ row.source === 'paste' ? '粘贴' : '文件' }}
          </template>
        </el-table-column>
        <el-table-column label="入库时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row as KbDocumentDto)">详情</el-button>
            <el-button link type="danger" @click="removeDoc(row as KbDocumentDto)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="kb-list__pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="load"
        />
      </div>
    </div>

    <!-- 粘贴 -->
    <el-dialog
      v-model="pasteOpen"
      title="粘贴文本入库"
      width="720px"
      append-to-body
      align-center
      destroy-on-close
    >
      <el-form label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="pasteTitle" maxlength="200" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="pasteCategory" allow-create filterable style="width: 100%">
            <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="pasteTags" placeholder="逗号分隔，可选" />
        </el-form-item>
        <el-form-item label="正文" required>
          <el-input
            v-model="pasteContent"
            type="textarea"
            :rows="12"
            placeholder="粘贴政策、话术、班会材料等纯文本"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pasteOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitPaste">入库</el-button>
      </template>
    </el-dialog>

    <!-- 上传 -->
    <el-dialog
      v-model="uploadOpen"
      title="上传文档"
      width="560px"
      append-to-body
      align-center
      destroy-on-close
    >
      <el-form label-width="80px">
        <el-form-item label="文件" required>
          <el-upload
            :auto-upload="false"
            :limit="1"
            accept=".txt,.md,.markdown,.docx,.pdf,.xlsx,.xls"
            :on-change="onFileChange"
            :on-remove="() => (uploadFile = null)"
          >
            <el-button>选择文件</el-button>
            <template #tip>
              <div class="el-upload__tip">支持 txt / md / docx / pdf / xlsx，≤15MB</div>
            </template>
          </el-upload>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="uploadTitle" maxlength="200" placeholder="默认取文件名" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="uploadCategory" allow-create filterable style="width: 100%">
            <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="uploadTags" placeholder="逗号分隔，可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitUpload">上传</el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-drawer
      v-model="detailOpen"
      title="文档详情"
      size="520px"
      append-to-body
      destroy-on-close
    >
      <template v-if="detailDoc">
        <el-form label-width="72px">
          <el-form-item label="标题">
            <el-input v-model="editTitle" />
          </el-form-item>
          <el-form-item label="分类">
            <el-select v-model="editCategory" allow-create filterable style="width: 100%">
              <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
            </el-select>
          </el-form-item>
          <el-form-item label="标签">
            <el-input v-model="editTags" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveMeta">保存</el-button>
          </el-form-item>
        </el-form>
        <p class="kb-muted">共 {{ detailSegments.length }} 段</p>
        <el-collapse>
          <el-collapse-item
            v-for="seg in detailSegments"
            :key="seg.id"
            :title="`第 ${seg.seq} 段`"
            :name="seg.id"
          >
            <pre class="kb-seg">{{ seg.text }}</pre>
          </el-collapse-item>
        </el-collapse>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.kb-list__actions {
  display: flex;
  gap: var(--cp-gap-2);
}
.kb-list__filters {
  display: flex;
  gap: var(--cp-gap-3);
  margin-bottom: var(--cp-gap-4);
  align-items: center;
}
.kb-list__pager {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--cp-gap-4);
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
