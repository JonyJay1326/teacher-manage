<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ApiError } from '@/api/http';
import {
  listIncidentsApi,
  confirmIncidentApi,
  deleteIncidentApi,
  draftCountApi,
  type IncidentListItem,
} from '@/api/incidents';
import { listStudentsApi } from '@/api/students';
import { useIncidentsStore } from '@/stores/incidents';
import type { IncidentCategory, Student } from '@/types';

type StatusTab = 'all' | 'draft' | 'confirmed';

const route = useRoute();
const router = useRouter();
const incidentsStore = useIncidentsStore();

/** 从路由 query 解析初始 Tab */
function resolveInitialTab(): StatusTab {
  const tab = route.query.tab;
  if (tab === 'draft' || tab === 'confirmed' || tab === 'all') return tab;
  return 'all';
}

const activeTab = ref<StatusTab>(resolveInitialTab());
const filterCategory = ref('');
const filterSeverity = ref<number | ''>('');
const loading = ref(false);
const incidents = ref<IncidentListItem[]>([]);
const draftCount = ref(0);
const studentOptions = ref<Student[]>([]);

/** 确认对话框 */
const confirmVisible = ref(false);
const confirmLoading = ref(false);
const confirmingId = ref<number | null>(null);
const confirmTitle = ref('');
const confirmContent = ref('');
const confirmCategory = ref<IncidentCategory>('其他');
const confirmSeverity = ref<1 | 2 | 3>(1);
const confirmStudentIds = ref<number[]>([]);
const confirmFollowUpNeeded = ref(false);
const confirmFollowUpDeadline = ref('');

/** 类别选项 */
const categoryOptions: IncidentCategory[] = [
  '纪律违纪',
  '情绪行为',
  '伤病健康',
  '家校沟通',
  '表扬奖励',
  '学习问题',
  '其他',
];

/** 过滤后的事件列表（类别/严重度本地筛） */
const filteredIncidents = computed(() => {
  let list = incidents.value;
  if (filterCategory.value) {
    list = list.filter((i) => i.category === filterCategory.value);
  }
  if (filterSeverity.value !== '') {
    list = list.filter((i) => i.severity === filterSeverity.value);
  }
  return list;
});

/** 类别对应域色 class 后缀 */
function getCategoryDomainClass(category: string): string {
  const map: Record<string, string> = {
    纪律违纪: 'incident',
    情绪行为: 'incident',
    伤病健康: 'incident',
    家校沟通: 'contact',
    表扬奖励: 'praise',
    学习问题: 'score',
    其他: 'default',
  };
  return map[category] ?? 'default';
}

/** 格式化日期时间 */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 严重度星标 */
function severityStars(severity: number): string {
  const safe = Math.min(3, Math.max(1, severity));
  return '★'.repeat(safe) + '☆'.repeat(3 - safe);
}

/** 跟进状态文字 */
function followUpText(incident: IncidentListItem): string {
  if (!incident.followUpNeeded) return '无需跟进';
  if (incident.followUpDone) return '已跟进';
  return '待跟进';
}

/** 卡片标题展示 */
function displayTitle(incident: IncidentListItem): string {
  if (incident.title) return incident.title;
  if (incident.content) return incident.content.slice(0, 20);
  return '未命名事件';
}

/** 加载事件列表 */
async function loadIncidents(): Promise<void> {
  loading.value = true;
  try {
    const query: {
      status?: string;
      page?: number;
      pageSize?: number;
    } = { page: 1, pageSize: 100 };
    if (activeTab.value === 'draft') query.status = 'draft';
    if (activeTab.value === 'confirmed') query.status = 'confirmed';
    const res = await listIncidentsApi(query);
    incidents.value = res.items;
    if (typeof res.draftCount === 'number') {
      draftCount.value = res.draftCount;
    }
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载事件失败');
  } finally {
    loading.value = false;
  }
}

/** 刷新草稿数量 */
async function refreshDraftCount(): Promise<void> {
  try {
    const res = await draftCountApi();
    draftCount.value = res.count;
  } catch {
    // 角标失败静默
  }
}

/** 加载学生选项（确认表单多选） */
async function loadStudents(): Promise<void> {
  try {
    const res = await listStudentsApi({ pageSize: 100, status: '在读' });
    studentOptions.value = res.items;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载学生失败');
  }
}

/** 打开确认对话框（草稿） */
function openConfirmDialog(incident: IncidentListItem): void {
  if (incident.status !== 'draft') return;
  confirmingId.value = incident.id;
  confirmTitle.value = incident.title || (incident.content ?? '').slice(0, 20);
  confirmContent.value = incident.content ?? '';
  confirmCategory.value = (incident.category as IncidentCategory) || '其他';
  const sev = incident.severity;
  confirmSeverity.value = sev === 2 || sev === 3 ? sev : 1;
  confirmStudentIds.value = [...incident.studentIds];
  confirmFollowUpNeeded.value = false;
  confirmFollowUpDeadline.value = '';
  confirmVisible.value = true;
}

/** 提交确认结构化 */
async function submitConfirm(): Promise<void> {
  if (confirmingId.value === null) return;
  if (!confirmTitle.value.trim()) {
    ElMessage.warning('请填写标题');
    return;
  }
  if (!confirmContent.value.trim()) {
    ElMessage.warning('请填写内容');
    return;
  }
  if (confirmStudentIds.value.length === 0) {
    ElMessage.warning('请至少选择一名学生');
    return;
  }
  confirmLoading.value = true;
  try {
    await confirmIncidentApi(confirmingId.value, {
      title: confirmTitle.value.trim(),
      content: confirmContent.value.trim(),
      category: confirmCategory.value,
      severity: confirmSeverity.value,
      studentIds: [...confirmStudentIds.value],
      followUpNeeded: confirmFollowUpNeeded.value,
      followUpDeadline: confirmFollowUpNeeded.value
        ? confirmFollowUpDeadline.value
          ? new Date(`${confirmFollowUpDeadline.value}T23:59:59`).toISOString()
          : null
        : null,
    });
    ElMessage.success('已确认入库');
    confirmVisible.value = false;
    incidentsStore.bumpDataVersion();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '确认失败');
  } finally {
    confirmLoading.value = false;
  }
}

/** 删除事件（软删） */
async function handleDelete(incident: IncidentListItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除「${displayTitle(incident)}」？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await deleteIncidentApi(incident.id);
    ElMessage.success('已删除');
    incidentsStore.bumpDataVersion();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '删除失败');
  }
}

/** 卡片点击：草稿打开确认，其余暂无操作 */
function onCardClick(incident: IncidentListItem): void {
  router.push(`/incidents/${incident.id}`);
}

/** 打开确认对话框（不跳转） */
function onConfirmClick(incident: IncidentListItem, event: Event): void {
  event.stopPropagation();
  openConfirmDialog(incident);
}

watch(activeTab, () => {
  void loadIncidents();
});

watch(
  () => incidentsStore.dataVersion,
  () => {
    void loadIncidents();
    void refreshDraftCount();
  },
);

onMounted(() => {
  void loadIncidents();
  void refreshDraftCount();
  void loadStudents();
});
</script>

<template>
  <div class="incident-list" v-loading="loading">
    <div class="cp-page-header">
      <div>
        <h2 class="cp-page-header__title">事件记录</h2>
        <p class="cp-page-header__desc">班级事件、家校沟通与速记草稿</p>
      </div>
    </div>

    <!-- 筛选条 -->
    <div class="cp-card cp-filter-bar incident-list__filter">
      <el-tabs v-model="activeTab" class="incident-list__tabs">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane name="draft">
          <template #label>
            草稿池
            <el-badge v-if="draftCount > 0" :value="draftCount" class="incident-list__badge" />
          </template>
        </el-tab-pane>
        <el-tab-pane label="已确认" name="confirmed" />
      </el-tabs>
      <div class="incident-list__filters">
        <el-select v-model="filterCategory" placeholder="类别" clearable size="small" style="width: 120px">
          <el-option v-for="cat in categoryOptions" :key="cat" :label="cat" :value="cat" />
        </el-select>
        <el-select v-model="filterSeverity" placeholder="严重度" clearable size="small" style="width: 100px">
          <el-option label="轻" :value="1" />
          <el-option label="中" :value="2" />
          <el-option label="重" :value="3" />
        </el-select>
      </div>
    </div>

    <!-- 卡片栅格 -->
    <div class="incident-grid">
      <div
        v-for="incident in filteredIncidents"
        :key="incident.id"
        class="incident-card cp-card cp-card--hoverable"
        :class="`incident-card--${getCategoryDomainClass(incident.category)}`"
        @click="onCardClick(incident)"
      >
        <div class="incident-card__head">
          <h3 class="incident-card__title">{{ displayTitle(incident) }}</h3>
          <el-tag v-if="incident.status === 'draft'" type="warning" size="small">草稿</el-tag>
        </div>
        <div class="incident-card__students">
          <el-tag
            v-for="name in incident.studentNames"
            :key="name"
            size="small"
            type="info"
          >
            {{ name }}
          </el-tag>
        </div>
        <p v-if="incident.content" class="incident-card__content">
          {{ incident.content }}
        </p>
        <div class="incident-card__meta">
          <span>{{ formatDateTime(incident.occurredAt) }}</span>
          <span>·</span>
          <span>{{ incident.category }}</span>
          <span>·</span>
          <span class="incident-card__severity">{{ severityStars(incident.severity) }}</span>
          <span>·</span>
          <span
            :class="{
              'incident-card__follow--pending': incident.followUpNeeded && !incident.followUpDone,
            }"
          >
            {{ followUpText(incident) }}
          </span>
        </div>
        <div class="incident-card__actions" @click.stop>
          <el-button
            v-if="incident.status === 'draft'"
            type="primary"
            link
            size="small"
            @click="onConfirmClick(incident, $event)"
          >
            确认入库
          </el-button>
          <el-button type="primary" link size="small" @click.stop="router.push(`/incidents/${incident.id}`)">
            详情
          </el-button>
          <el-button type="danger" link size="small" @click.stop="handleDelete(incident)">
            删除
          </el-button>
        </div>
      </div>
    </div>

    <div v-if="!loading && filteredIncidents.length === 0" class="incident-list__empty cp-card">
      <p>暂无事件记录</p>
    </div>

    <!-- 草稿确认对话框 -->
    <el-dialog
      v-model="confirmVisible"
      title="确认事件"
      width="560px"
      append-to-body
      align-center
      destroy-on-close
    >
      <el-form label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="confirmTitle" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="confirmContent" type="textarea" :rows="5" />
        </el-form-item>
        <el-form-item label="类别" required>
          <el-select v-model="confirmCategory" style="width: 100%">
            <el-option v-for="cat in categoryOptions" :key="cat" :label="cat" :value="cat" />
          </el-select>
        </el-form-item>
        <el-form-item label="严重度" required>
          <el-radio-group v-model="confirmSeverity">
            <el-radio :value="1">轻</el-radio>
            <el-radio :value="2">中</el-radio>
            <el-radio :value="3">重</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="学生" required>
          <el-select
            v-model="confirmStudentIds"
            multiple
            filterable
            placeholder="选择涉事学生"
            style="width: 100%"
          >
            <el-option
              v-for="s in studentOptions"
              :key="s.id"
              :label="s.name"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="需要跟进">
          <el-switch v-model="confirmFollowUpNeeded" />
        </el-form-item>
        <el-form-item v-if="confirmFollowUpNeeded" label="截止日期">
          <el-date-picker
            v-model="confirmFollowUpDeadline"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择跟进截止日期"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="confirmVisible = false">取消</el-button>
        <el-button type="primary" :loading="confirmLoading" @click="submitConfirm">
          确认入库
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.incident-list__filter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--cp-gap-3);
}

.incident-list__tabs {
  flex-shrink: 0;
}

.incident-list__tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}

.incident-list__badge {
  margin-left: var(--cp-gap-1);
}

.incident-list__filters {
  display: flex;
  gap: var(--cp-gap-2);
  flex-wrap: wrap;
}

.incident-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--cp-gap-4);
}

@media (min-width: 1600px) {
  .incident-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.incident-card {
  padding: var(--cp-gap-4);
  border-left: 5px solid var(--cp-border);
  cursor: pointer;
}

.incident-card--incident { border-left-color: var(--cp-domain-incident); }
.incident-card--contact { border-left-color: var(--cp-domain-contact); }
.incident-card--praise { border-left-color: var(--cp-domain-praise); }
.incident-card--score { border-left-color: var(--cp-domain-score); }
.incident-card--default { border-left-color: var(--cp-text-3); }

.incident-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cp-gap-2);
  margin-bottom: var(--cp-gap-2);
}

.incident-card__title {
  margin: 0;
  font-size: var(--cp-font-base);
  font-weight: 600;
  color: var(--cp-text-1);
}

.incident-card__students {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cp-gap-1);
  margin-bottom: var(--cp-gap-2);
}

.incident-card__content {
  margin: 0 0 var(--cp-gap-2);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.incident-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cp-gap-1);
  font-size: 12px;
  color: var(--cp-text-3);
}

.incident-card__severity {
  color: var(--cp-warning);
  letter-spacing: -1px;
}

.incident-card__follow--pending {
  color: var(--cp-danger);
  font-weight: 500;
}

.incident-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--cp-gap-1);
  margin-top: var(--cp-gap-2);
  padding-top: var(--cp-gap-2);
  border-top: 1px solid var(--cp-divider);
}

.incident-list__empty {
  text-align: center;
  padding: var(--cp-gap-6);
  color: var(--cp-text-3);
}
</style>
