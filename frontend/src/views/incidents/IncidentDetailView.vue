<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ApiError } from '@/api/http';
import {
  attachmentFileUrl,
  confirmIncidentApi,
  deleteAttachmentApi,
  deleteIncidentApi,
  getIncidentApi,
  listIncidentAttachmentsApi,
  updateIncidentApi,
  uploadIncidentAttachmentApi,
  type AttachmentDto,
  type IncidentListItem,
} from '@/api/incidents';
import { listStudentsApi } from '@/api/students';
import type { IncidentCategory, Student } from '@/types';

const route = useRoute();
const router = useRouter();
const incidentId = Number(route.params.id);

const loading = ref(false);
const saving = ref(false);
const incident = ref<IncidentListItem | null>(null);
const studentOptions = ref<Student[]>([]);
const attachments = ref<AttachmentDto[]>([]);
const uploading = ref(false);

const formTitle = ref('');
const formContent = ref('');
const formCategory = ref<IncidentCategory>('其他');
const formSeverity = ref<1 | 2 | 3>(1);
const formStudentIds = ref<number[]>([]);
const formFollowUpNeeded = ref(false);
const formFollowUpDeadline = ref('');
const formFollowUpDone = ref(false);

const categoryOptions: IncidentCategory[] = [
  '纪律违纪',
  '情绪行为',
  '伤病健康',
  '家校沟通',
  '表扬奖励',
  '学习问题',
  '其他',
];

/** 加载详情 */
async function loadDetail(): Promise<void> {
  loading.value = true;
  try {
    const data = await getIncidentApi(incidentId);
    incident.value = data;
    formTitle.value = data.title ?? '';
    formContent.value = data.content ?? data.draftContent ?? '';
    formCategory.value = (data.category as IncidentCategory) || '其他';
    formSeverity.value = (data.severity as 1 | 2 | 3) || 1;
    formStudentIds.value = [...data.studentIds];
    formFollowUpNeeded.value = data.followUpNeeded;
    formFollowUpDeadline.value = data.followUpDeadline
      ? data.followUpDeadline.slice(0, 10)
      : '';
    formFollowUpDone.value = data.followUpDone;
    await loadAttachments();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载失败');
    incident.value = null;
  } finally {
    loading.value = false;
  }
}

/** 加载附件 */
async function loadAttachments(): Promise<void> {
  try {
    attachments.value = await listIncidentAttachmentsApi(incidentId);
  } catch {
    attachments.value = [];
  }
}

/** 上传附件 */
async function onUploadChange(file: { raw?: File }): Promise<void> {
  const raw = file.raw;
  if (!raw) return;
  uploading.value = true;
  try {
    await uploadIncidentAttachmentApi(incidentId, raw);
    ElMessage.success('附件已上传');
    await loadAttachments();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '上传失败');
  } finally {
    uploading.value = false;
  }
}

/** 删除附件 */
async function removeAttachment(att: AttachmentDto): Promise<void> {
  try {
    await ElMessageBox.confirm('确认删除该附件？', '删除确认', {
      type: 'warning',
    });
    await deleteAttachmentApi(att.id);
    ElMessage.success('已删除');
    await loadAttachments();
  } catch (err: unknown) {
    if (err === 'cancel') return;
    ElMessage.error(err instanceof ApiError ? err.message : '删除失败');
  }
}

/** 是否图片 */
function isImageMime(mime: string | null): boolean {
  return Boolean(mime && mime.startsWith('image/'));
}

/** 加载学生选项 */
async function loadStudents(): Promise<void> {
  try {
    const res = await listStudentsApi({ page: 1, pageSize: 200 });
    studentOptions.value = res.items;
  } catch {
    studentOptions.value = [];
  }
}

/** 保存更新 */
async function handleSave(): Promise<void> {
  if (!incident.value) return;
  saving.value = true;
  try {
    if (incident.value.status === 'draft') {
      await confirmIncidentApi(incident.value.id, {
        title: formTitle.value.trim() || formContent.value.trim().slice(0, 20) || '未命名事件',
        content: formContent.value.trim(),
        category: formCategory.value,
        severity: formSeverity.value,
        studentIds: formStudentIds.value,
        followUpNeeded: formFollowUpNeeded.value,
        followUpDeadline: formFollowUpNeeded.value
          ? formFollowUpDeadline.value || undefined
          : undefined,
      });
      ElMessage.success('已确认入库');
    } else {
      await updateIncidentApi(incident.value.id, {
        title: formTitle.value.trim() || null,
        content: formContent.value.trim(),
        category: formCategory.value,
        severity: formSeverity.value,
        studentIds: formStudentIds.value,
        followUpNeeded: formFollowUpNeeded.value,
        followUpDeadline: formFollowUpNeeded.value
          ? formFollowUpDeadline.value || null
          : null,
        followUpDone: formFollowUpDone.value,
      });
      ElMessage.success('已保存');
    }
    await loadDetail();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

/** 删除 */
async function handleDelete(): Promise<void> {
  try {
    await ElMessageBox.confirm('确认软删除该事件？', '删除确认', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await deleteIncidentApi(incidentId);
    ElMessage.success('已删除');
    router.push('/incidents');
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '删除失败');
  }
}

/** 返回 */
function goBack(): void {
  router.push('/incidents');
}

onMounted(() => {
  void loadStudents();
  void loadDetail();
});
</script>

<template>
  <div class="incident-detail cp-animate-in" v-loading="loading">
    <div class="cp-page-header">
      <div>
        <h2 class="cp-page-header__title">
          事件详情
          <el-tag
            v-if="incident"
            size="small"
            :type="incident.status === 'draft' ? 'warning' : 'success'"
            effect="plain"
            style="margin-left: 8px"
          >
            {{ incident.status === 'draft' ? '草稿' : '已确认' }}
          </el-tag>
        </h2>
        <p class="cp-page-header__desc">
          {{ incident ? `发生时间 ${new Date(incident.occurredAt).toLocaleString('zh-CN')}` : '—' }}
        </p>
      </div>
      <div class="incident-detail__actions">
        <el-button @click="goBack">返回列表</el-button>
        <el-button type="danger" plain @click="handleDelete">删除</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ incident?.status === 'draft' ? '确认入库' : '保存' }}
        </el-button>
      </div>
    </div>

    <div v-if="incident" class="cp-card cp-content-card">
      <el-form label-width="100px" class="incident-detail__form">
        <el-form-item label="标题">
          <el-input v-model="formTitle" maxlength="80" />
        </el-form-item>
        <el-form-item label="正文" required>
          <el-input v-model="formContent" type="textarea" :rows="8" />
        </el-form-item>
        <el-form-item label="类别">
          <el-select v-model="formCategory" style="width: 220px">
            <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="严重度">
          <el-radio-group v-model="formSeverity">
            <el-radio :value="1">1 星</el-radio>
            <el-radio :value="2">2 星</el-radio>
            <el-radio :value="3">3 星</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="关联学生">
          <el-select
            v-model="formStudentIds"
            multiple
            filterable
            style="width: 100%; max-width: 520px"
          >
            <el-option
              v-for="s in studentOptions"
              :key="s.id"
              :label="`${s.studentNo} ${s.name}`"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="需要跟进">
          <el-switch v-model="formFollowUpNeeded" />
        </el-form-item>
        <el-form-item v-if="formFollowUpNeeded" label="跟进截止">
          <el-date-picker
            v-model="formFollowUpDeadline"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
          />
        </el-form-item>
        <el-form-item
          v-if="formFollowUpNeeded && incident.status === 'confirmed'"
          label="已跟进"
        >
          <el-switch v-model="formFollowUpDone" />
        </el-form-item>
        <el-form-item v-if="incident.draftContent" label="原始速记">
          <pre class="incident-detail__draft">{{ incident.draftContent }}</pre>
        </el-form-item>
        <el-form-item label="附件">
          <div class="incident-detail__attachments">
            <el-upload
              :show-file-list="false"
              :auto-upload="false"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              :disabled="uploading || attachments.length >= 3"
              :on-change="onUploadChange"
            >
              <el-button :loading="uploading" :disabled="attachments.length >= 3">
                上传图片/PDF（最多 3 个）
              </el-button>
            </el-upload>
            <div v-if="attachments.length" class="incident-detail__att-list">
              <div
                v-for="att in attachments"
                :key="att.id"
                class="incident-detail__att-item"
              >
                <el-image
                  v-if="isImageMime(att.mime)"
                  :src="attachmentFileUrl(att.id, true)"
                  :preview-src-list="[attachmentFileUrl(att.id, false)]"
                  fit="cover"
                  class="incident-detail__att-thumb"
                />
                <a
                  v-else
                  class="incident-detail__att-pdf"
                  :href="attachmentFileUrl(att.id, false)"
                  target="_blank"
                  rel="noopener"
                >
                  PDF #{{ att.id }}
                </a>
                <el-button link type="danger" @click="removeAttachment(att)">
                  删除
                </el-button>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
    </div>
    <el-empty v-else-if="!loading" description="未找到事件" />
  </div>
</template>

<style scoped>
.incident-detail__actions {
  display: flex;
  gap: var(--cp-gap-2);
}

.incident-detail__form {
  max-width: 720px;
}

.incident-detail__draft {
  margin: 0;
  width: 100%;
  padding: var(--cp-gap-3);
  background: var(--cp-bg-page);
  border-radius: var(--cp-radius-ctl);
  white-space: pre-wrap;
  color: var(--cp-text-2);
  font-size: var(--cp-font-sm);
}

.incident-detail__attachments {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-3);
  width: 100%;
}

.incident-detail__att-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cp-gap-3);
}

.incident-detail__att-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--cp-gap-1);
}

.incident-detail__att-thumb {
  width: 120px;
  height: 120px;
  border-radius: var(--cp-radius-ctl);
  border: 1px solid var(--cp-border);
}

.incident-detail__att-pdf {
  color: var(--cp-primary);
  font-size: var(--cp-font-sm);
}
</style>
