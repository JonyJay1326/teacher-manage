<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  CollectionTag,
  Delete,
  EditPen,
  Female,
  Flag,
  Male,
  Phone,
  Plus,
  Ticket,
  User,
} from '@element-plus/icons-vue';
import { ApiError } from '@/api/http';
import {
  createGuardianApi,
  deleteGuardianApi,
  listGuardiansApi,
  replaceStudentTagsApi,
  updateGuardianApi,
  type GuardianDto,
  type StudentDetailDto,
} from '@/api/students';
import { useStudentsStore } from '@/stores/students';

/** 档案 tab：基本信息、标签与监护人 */

const props = defineProps<{
  student: StudentDetailDto;
  /** 标签在别处变更后同步刷新显示 */
  tagsVersion: number;
}>();

const studentsStore = useStudentsStore();

/** 监护人表单 */
interface GuardianFormModel {
  name: string;
  relation: string;
  phone: string;
  contactPref: string;
  bestTime: string;
  isPrimary: boolean;
}

/** 创建空监护人表单 */
function emptyGuardianForm(): GuardianFormModel {
  return {
    name: '',
    relation: '',
    phone: '',
    contactPref: '',
    bestTime: '',
    isPrimary: false,
  };
}

const guardians = ref<GuardianDto[]>([]);
const guardianDialogVisible = ref(false);
const guardianSubmitting = ref(false);
const editingGuardianId = ref<number | null>(null);
const guardianForm = ref<GuardianFormModel>(emptyGuardianForm());

const tagDialogVisible = ref(false);
const tagSubmitting = ref(false);
/** 选中的标签 id；输入新建时短暂可为字符串名 */
const tagSelectedIds = ref<Array<number | string>>([]);

/** 脱敏手机号展示 */
function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

/** 组装监护人元信息文案 */
function guardianMetaText(guardian: GuardianDto): string {
  const parts: string[] = [];
  parts.push(maskPhone(guardian.phone));
  if (guardian.contactPref) {
    parts.push(`偏好：${guardian.contactPref}`);
  }
  if (guardian.bestTime) {
    parts.push(`最佳时段：${guardian.bestTime}`);
  }
  return parts.join(' · ');
}

/** 同步监护人列表（优先详情内嵌，否则单独拉取） */
async function syncGuardians(detail: StudentDetailDto): Promise<void> {
  if (Array.isArray(detail.guardians) && detail.guardians.length > 0) {
    guardians.value = detail.guardians;
    return;
  }
  try {
    guardians.value = await listGuardiansApi(detail.id);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载监护人失败');
  }
}

/** 打开编辑标签对话框 */
function openTagDialog(): void {
  const allowedIds = new Set(
    studentsStore.selectableTags.map((tag) => tag.id),
  );
  tagSelectedIds.value = props.student.tagIds.filter((id) => allowedIds.has(id));
  tagDialogVisible.value = true;
}

/** 标签多选变更（支持输入新标签名后创建） */
async function onTagSelectionChange(
  values: Array<number | string>,
): Promise<void> {
  try {
    tagSelectedIds.value = await studentsStore.resolveTagSelection(values);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '创建标签失败');
    const allowedIds = new Set(
      studentsStore.selectableTags.map((tag) => tag.id),
    );
    tagSelectedIds.value = props.student.tagIds.filter((id) =>
      allowedIds.has(id),
    );
  }
}

/** 保存学生标签 */
async function submitTags(): Promise<void> {
  tagSubmitting.value = true;
  try {
    const tagIds = await studentsStore.resolveTagSelection(tagSelectedIds.value);
    tagSelectedIds.value = tagIds;
    const updated = await replaceStudentTagsApi(props.student.id, tagIds);
    props.student.tagIds = updated.tagIds;
    ElMessage.success('标签已更新');
    tagDialogVisible.value = false;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '更新标签失败');
  } finally {
    tagSubmitting.value = false;
  }
}

/** 打开新建监护人对话框 */
function openCreateGuardian(): void {
  editingGuardianId.value = null;
  guardianForm.value = emptyGuardianForm();
  guardianDialogVisible.value = true;
}

/** 打开编辑监护人对话框 */
function openEditGuardian(guardian: GuardianDto): void {
  editingGuardianId.value = guardian.id;
  guardianForm.value = {
    name: guardian.name ?? '',
    relation: guardian.relation ?? '',
    phone: guardian.phone ?? '',
    contactPref: guardian.contactPref ?? '',
    bestTime: guardian.bestTime ?? '',
    isPrimary: guardian.isPrimary,
  };
  guardianDialogVisible.value = true;
}

/** 提交监护人新建/编辑 */
async function submitGuardian(): Promise<void> {
  const form = guardianForm.value;
  if (!form.name.trim()) {
    ElMessage.warning('请填写监护人姓名');
    return;
  }
  const body: Record<string, unknown> = {
    name: form.name.trim(),
    relation: form.relation.trim() || undefined,
    phone: form.phone.trim() || undefined,
    contactPref: form.contactPref.trim() || undefined,
    bestTime: form.bestTime.trim() || undefined,
    isPrimary: form.isPrimary ? 1 : 0,
  };
  guardianSubmitting.value = true;
  try {
    if (editingGuardianId.value === null) {
      await createGuardianApi(props.student.id, body);
      ElMessage.success('监护人已添加');
    } else {
      await updateGuardianApi(editingGuardianId.value, body);
      ElMessage.success('监护人已更新');
    }
    guardianDialogVisible.value = false;
    guardians.value = await listGuardiansApi(props.student.id);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '保存监护人失败');
  } finally {
    guardianSubmitting.value = false;
  }
}

/** 删除监护人 */
async function handleDeleteGuardian(guardian: GuardianDto): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除监护人「${guardian.name ?? '未命名'}」吗？`,
      '删除确认',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await deleteGuardianApi(guardian.id);
    ElMessage.success('监护人已删除');
    guardians.value = await listGuardiansApi(props.student.id);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '删除监护人失败');
  }
}

watch(
  () => [props.student.id, props.student.guardians, props.tagsVersion] as const,
  () => {
    void syncGuardians(props.student);
  },
  { immediate: true, deep: true },
);

defineExpose({ reloadGuardians: () => syncGuardians(props.student) });
</script>

<template>
  <div class="archive-grid">
    <el-card shadow="never" class="archive-block">
      <template #header>
        <div class="archive-block__heading">
          <el-icon class="archive-block__icon"><User /></el-icon>
          <span class="archive-block__title">基本信息</span>
        </div>
      </template>
      <div class="archive-info-grid">
        <div class="archive-info-item">
          <span class="archive-info-item__label">
            <el-icon><Ticket /></el-icon>
            学号
          </span>
          <span class="archive-info-item__value cp-tabular-nums">{{
            student.studentNo
          }}</span>
        </div>
        <div class="archive-info-item">
          <span class="archive-info-item__label">
            <el-icon>
              <Male v-if="student.gender === 1" />
              <Female v-else />
            </el-icon>
            性别
          </span>
          <span class="archive-info-item__value">{{
            student.gender === 1 ? '男' : '女'
          }}</span>
        </div>
        <div class="archive-info-item">
          <span class="archive-info-item__label">
            <el-icon><Flag /></el-icon>
            班干部
          </span>
          <span class="archive-info-item__value">{{
            student.cadreRole ?? '—'
          }}</span>
        </div>
        <div class="archive-info-item">
          <span class="archive-info-item__label">
            <el-icon><User /></el-icon>
            状态
          </span>
          <span class="archive-info-item__value">{{ student.status }}</span>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="archive-block">
      <template #header>
        <div class="archive-block__heading archive-block__heading--spread">
          <div class="archive-block__heading-main">
            <el-icon class="archive-block__icon"><CollectionTag /></el-icon>
            <span class="archive-block__title">标签</span>
          </div>
          <el-button text type="primary" @click="openTagDialog">
            <el-icon><EditPen /></el-icon>
            编辑标签
          </el-button>
        </div>
      </template>
      <el-space
        v-if="studentsStore.getVisibleTags(student.tagIds).length > 0"
        wrap
        :size="8"
      >
        <el-tag
          v-for="tag in studentsStore.getVisibleTags(student.tagIds)"
          :key="tag.id"
          type="info"
          effect="plain"
          size="default"
        >
          {{ tag.name }}
        </el-tag>
      </el-space>
      <p v-else class="archive-empty">暂无标签，点击右上角添加</p>
    </el-card>

    <el-card shadow="never" class="archive-block">
      <template #header>
        <div class="archive-block__heading archive-block__heading--spread">
          <div class="archive-block__heading-main">
            <el-icon class="archive-block__icon"><Phone /></el-icon>
            <span class="archive-block__title">监护人</span>
          </div>
          <el-button type="primary" text @click="openCreateGuardian">
            <el-icon><Plus /></el-icon>
            添加监护人
          </el-button>
        </div>
      </template>
      <el-empty
        v-if="guardians.length === 0"
        description="暂无监护人"
        :image-size="64"
      />
      <div v-else class="guardian-list">
        <div
          v-for="guardian in guardians"
          :key="guardian.id"
          class="guardian-card"
        >
          <div class="guardian-card__avatar" aria-hidden="true">
            {{ (guardian.name ?? '监').charAt(0) }}
          </div>
          <div class="guardian-card__body">
            <div class="guardian-card__row">
              <span class="guardian-card__name">
                {{ guardian.name ?? '未命名' }}
                <template v-if="guardian.relation">（{{ guardian.relation }}）</template>
              </span>
              <el-tag
                v-if="guardian.isPrimary"
                type="primary"
                effect="plain"
                size="small"
              >
                主联系人
              </el-tag>
            </div>
            <p class="guardian-card__meta">
              <el-icon><Phone /></el-icon>
              {{ guardianMetaText(guardian) }}
            </p>
          </div>
          <el-space :size="4" class="guardian-card__actions">
            <el-button
              text
              type="primary"
              @click="openEditGuardian(guardian)"
            >
              <el-icon><EditPen /></el-icon>
              编辑
            </el-button>
            <el-button
              text
              type="danger"
              @click="handleDeleteGuardian(guardian)"
            >
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </el-space>
        </div>
      </div>
    </el-card>
  </div>

  <!-- 监护人新建/编辑 -->
  <el-dialog
    v-model="guardianDialogVisible"
    :title="editingGuardianId === null ? '添加监护人' : '编辑监护人'"
    width="480px"
    append-to-body
    align-center
    :close-on-click-modal="false"
  >
    <el-form label-width="96px">
      <el-form-item label="姓名" required>
        <el-input v-model="guardianForm.name" maxlength="64" placeholder="监护人姓名" />
      </el-form-item>
      <el-form-item label="关系">
        <el-input v-model="guardianForm.relation" placeholder="如：父亲 / 母亲" />
      </el-form-item>
      <el-form-item label="电话">
        <el-input v-model="guardianForm.phone" placeholder="联系电话" />
      </el-form-item>
      <el-form-item label="沟通偏好">
        <el-input v-model="guardianForm.contactPref" placeholder="如：微信 / 电话" />
      </el-form-item>
      <el-form-item label="最佳时段">
        <el-input v-model="guardianForm.bestTime" placeholder="如：工作日 18 点后" />
      </el-form-item>
      <el-form-item label="主联系人">
        <el-switch v-model="guardianForm.isPrimary" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="guardianDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="guardianSubmitting" @click="submitGuardian">
        保存
      </el-button>
    </template>
  </el-dialog>

  <!-- 编辑标签 -->
  <el-dialog
    v-model="tagDialogVisible"
    title="编辑标签"
    width="520px"
    append-to-body
    align-center
    :close-on-click-modal="false"
  >
    <el-form label-width="72px">
      <el-form-item label="标签">
        <el-select
          v-model="tagSelectedIds"
          multiple
          filterable
          allow-create
          default-first-option
          :reserve-keyword="false"
          collapse-tags
          collapse-tags-tooltip
          placeholder="选择或输入新标签后回车"
          style="width: 100%"
          @change="onTagSelectionChange"
        >
          <el-option-group
            v-for="group in studentsStore.tagOptionGroups"
            :key="group.domain"
            :label="group.domain"
          >
            <el-option
              v-for="tag in group.tags"
              :key="tag.id"
              :label="tag.name"
              :value="tag.id"
            />
          </el-option-group>
        </el-select>
        <p class="tag-dialog__hint">新标签将归入「其他」域，敏感级别为普通</p>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="tagDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="tagSubmitting" @click="submitTags">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.tag-dialog__hint {
  margin: var(--cp-gap-2) 0 0;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
  line-height: 1.5;
}

.archive-grid {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-4);
}

.archive-block {
  border: 1px solid var(--cp-divider);
  border-radius: var(--cp-radius-card);
}

.archive-block :deep(.el-card__header) {
  padding: var(--cp-gap-3) var(--cp-gap-4);
  border-bottom: 1px solid var(--cp-divider);
  background: var(--cp-bg-page);
}

.archive-block__heading {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-2);
}

.archive-block__heading--spread {
  justify-content: space-between;
}

.archive-block__heading-main {
  display: inline-flex;
  align-items: center;
  gap: var(--cp-gap-2);
}

.archive-block__icon {
  font-size: var(--cp-font-md);
  color: var(--cp-primary);
}

.archive-block__title {
  line-height: 1.6;
  font-size: var(--cp-font-base);
  font-weight: 600;
  color: var(--cp-text-1);
}

.archive-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cp-gap-3);
}

.archive-info-item {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-compact);
  padding: var(--cp-gap-3);
  border-radius: var(--cp-radius-ctl);
  background: var(--cp-bg-page);
  border: 1px solid var(--cp-divider);
}

.archive-info-item__label {
  display: inline-flex;
  align-items: center;
  gap: var(--cp-gap-compact);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}

.archive-info-item__value {
  font-size: var(--cp-font-base);
  font-weight: 600;
  color: var(--cp-text-1);
  line-height: 1.35;
}

.archive-empty {
  margin: 0;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
  line-height: 1.6;
}

.guardian-list {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-3);
}

.guardian-card {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-3);
  padding: var(--cp-gap-3);
  border: 1px solid var(--cp-divider);
  border-radius: var(--cp-radius-card);
  background: var(--cp-bg-card);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.guardian-card:hover {
  border-color: var(--cp-primary-border);
  box-shadow: var(--cp-shadow-1);
}

.guardian-card__avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--cp-radius-round);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--cp-primary-bg);
  color: var(--cp-primary);
  font-weight: 700;
  font-size: var(--cp-font-base);
}

.guardian-card__body {
  flex: 1;
  min-width: 0;
}

.guardian-card__row {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-2);
  margin-bottom: var(--cp-gap-1);
}

.guardian-card__actions {
  flex-shrink: 0;
}

.guardian-card__name {
  font-size: var(--cp-font-base);
  font-weight: 600;
}

.guardian-card__meta {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--cp-gap-compact);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
  line-height: 1.6;
}
</style>
