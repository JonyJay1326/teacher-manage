<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ApiError } from '@/api/http';
import {
  createCommentApi,
  deleteCommentApi,
  listStudentCommentsApi,
  type CommentType,
  type CommentView,
} from '@/api/comments';
import { listTermsApi, type TermDto } from '@/api/scores';

/** 评语 tab：某生历次评语列表 + 手工新建 + 删除 */

const props = defineProps<{ studentId: number }>();

const router = useRouter();

const comments = ref<CommentView[]>([]);
const commentsLoading = ref(false);
const commentDialogVisible = ref(false);
const commentSubmitting = ref(false);
const commentTerms = ref<TermDto[]>([]);
const commentForm = ref({
  termId: undefined as number | undefined,
  commentType: '期末评语' as CommentType,
  finalText: '',
});

/** 格式化评语时间 */
function formatCommentDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString('zh-CN');
}

/** 加载评语列表 */
async function loadComments(): Promise<void> {
  commentsLoading.value = true;
  try {
    comments.value = await listStudentCommentsApi(props.studentId);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载评语失败');
  } finally {
    commentsLoading.value = false;
  }
}

/** 打开手工新建评语 */
async function openCommentDialog(): Promise<void> {
  if (commentTerms.value.length === 0) {
    try {
      commentTerms.value = await listTermsApi();
    } catch {
      commentTerms.value = [];
    }
  }
  commentForm.value = {
    termId: commentTerms.value[0]?.id,
    commentType: '期末评语',
    finalText: '',
  };
  commentDialogVisible.value = true;
}

/** 提交手工评语 */
async function submitComment(): Promise<void> {
  const text = commentForm.value.finalText.trim();
  if (!text) {
    ElMessage.warning('请填写评语内容');
    return;
  }
  commentSubmitting.value = true;
  try {
    await createCommentApi({
      studentId: props.studentId,
      termId: commentForm.value.termId,
      commentType: commentForm.value.commentType,
      finalText: text,
    });
    ElMessage.success('评语已保存');
    commentDialogVisible.value = false;
    await loadComments();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '保存失败');
  } finally {
    commentSubmitting.value = false;
  }
}

/** 删除评语 */
async function handleDeleteComment(item: CommentView): Promise<void> {
  try {
    await ElMessageBox.confirm('确认软删除该条评语？', '删除确认', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await deleteCommentApi(item.id);
    ElMessage.success('已删除');
    await loadComments();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '删除失败');
  }
}

/** 跳转评语工作台并选中本生 */
function goCommentWorkbench(): void {
  router.push({
    path: '/ai/comments',
    query: { studentId: String(props.studentId) },
  });
}

onMounted(() => {
  void loadComments();
});

defineExpose({ reload: loadComments });
</script>

<template>
  <div class="comments-tab" v-loading="commentsLoading">
    <div class="comments-tab__actions">
      <el-button type="primary" @click="openCommentDialog">手工新建</el-button>
      <el-button @click="goCommentWorkbench">AI 工作台</el-button>
    </div>
    <div v-if="comments.length > 0" class="comments-tab__list">
      <el-card
        v-for="item in comments"
        :key="item.id"
        shadow="never"
        class="comments-tab__card"
      >
        <div class="comments-tab__meta">
          <el-tag size="small" type="primary" effect="plain">
            {{ item.commentType || '评语' }}
          </el-tag>
          <span class="comments-tab__time">{{ formatCommentDate(item.createdAt) }}</span>
          <el-tag
            v-if="item.sourceAiRecordId"
            size="small"
            type="info"
            effect="plain"
          >
            来自 AI
          </el-tag>
          <div class="comments-tab__spacer" />
          <el-button link type="danger" @click="handleDeleteComment(item)">
            删除
          </el-button>
        </div>
        <p class="comments-tab__text">{{ item.finalText }}</p>
      </el-card>
    </div>
    <el-empty v-else description="暂无评语">
      <el-button type="primary" @click="openCommentDialog">新建评语</el-button>
    </el-empty>
  </div>

  <!-- 新建评语 -->
  <el-dialog
    v-model="commentDialogVisible"
    title="新建评语"
    width="560px"
    append-to-body
    align-center
  >
    <el-form label-width="88px">
      <el-form-item label="学期">
        <el-select v-model="commentForm.termId" placeholder="选择学期" style="width: 100%">
          <el-option
            v-for="t in commentTerms"
            :key="t.id"
            :label="t.name"
            :value="t.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="类型">
        <el-select v-model="commentForm.commentType" style="width: 100%">
          <el-option label="期末评语" value="期末评语" />
          <el-option label="期中评语" value="期中评语" />
          <el-option label="日常评语" value="日常评语" />
        </el-select>
      </el-form-item>
      <el-form-item label="正文" required>
        <el-input
          v-model="commentForm.finalText"
          type="textarea"
          :rows="8"
          placeholder="填写评语正文"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="commentDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="commentSubmitting" @click="submitComment">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.comments-tab__actions {
  display: flex;
  gap: var(--cp-gap-2);
  margin-bottom: var(--cp-gap-4);
}

.comments-tab__list {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-3);
}

.comments-tab__card {
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-card);
}

.comments-tab__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cp-gap-2);
  margin-bottom: var(--cp-gap-2);
}

.comments-tab__time {
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}

.comments-tab__spacer {
  flex: 1;
}

.comments-tab__text {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.7;
  color: var(--cp-text-1);
  font-size: var(--cp-font-base);
}
</style>
