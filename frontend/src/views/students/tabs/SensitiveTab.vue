<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Lock, Unlock } from '@element-plus/icons-vue';
import { ApiError } from '@/api/http';
import { pinStatusApi, verifyPinApi } from '@/api/auth';
import {
  deleteSensitiveApi,
  getSensitiveApi,
  listSensitiveApi,
  upsertSensitiveApi,
  type SensitiveSummary,
} from '@/api/students';

/** 高敏 tab：需 PIN 解锁的 L2 明细，密文存储 */

const props = defineProps<{ studentId: number }>();

const router = useRouter();

const pinDialogVisible = ref(false);
const pinInput = ref('');
const pinSubmitting = ref(false);
const sensitiveUnlocked = ref(false);
const sensitiveSummaries = ref<SensitiveSummary[]>([]);
const pendingSensitiveCategory = ref('');
const sensitiveViewVisible = ref(false);
const sensitiveViewCategory = ref('');
const sensitiveViewContent = ref('');
const sensitiveViewSaving = ref(false);
const sensitiveViewLoading = ref(false);

/** 高敏类别 */
const sensitiveCategories = ['健康', '心理', '家庭', '其他'];

/** 打开 PIN 解锁对话框 */
function openPinDialog(category: string): void {
  pendingSensitiveCategory.value = category;
  pinInput.value = '';
  pinDialogVisible.value = true;
}

/** 点击高敏卡片 */
async function handleSensitiveCardClick(category: string): Promise<void> {
  try {
    const status = await pinStatusApi();
    if (!status.hasPin) {
      ElMessage.warning('请先在系统设置中设置 PIN');
      await router.push('/settings');
      return;
    }
    if (status.unlocked) {
      sensitiveUnlocked.value = true;
      await openSensitiveView(category);
      return;
    }
    openPinDialog(category);
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '无法检查 PIN 状态');
  }
}

/** 提交 PIN 解锁 */
async function handlePinUnlock(): Promise<void> {
  if (!/^\d{6}$/.test(pinInput.value)) {
    ElMessage.warning('请输入 6 位数字 PIN');
    return;
  }
  pinSubmitting.value = true;
  try {
    await verifyPinApi(pinInput.value);
    sensitiveUnlocked.value = true;
    pinDialogVisible.value = false;
    ElMessage.success('已解锁，10 分钟内有效');
    if (pendingSensitiveCategory.value) {
      await openSensitiveView(pendingSensitiveCategory.value);
    }
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : 'PIN 校验失败');
  } finally {
    pinSubmitting.value = false;
  }
}

/** 打开并加载高敏内容编辑窗 */
async function openSensitiveView(category: string): Promise<void> {
  sensitiveViewCategory.value = category;
  sensitiveViewVisible.value = true;
  sensitiveViewLoading.value = true;
  sensitiveViewContent.value = '';
  try {
    const data = await getSensitiveApi(props.studentId, category);
    sensitiveViewContent.value = data.content;
  } catch (err: unknown) {
    if (err instanceof ApiError && err.code === 2004) {
      sensitiveUnlocked.value = false;
      sensitiveViewVisible.value = false;
      openPinDialog(category);
      return;
    }
    ElMessage.error(err instanceof ApiError ? err.message : '读取高敏失败');
  } finally {
    sensitiveViewLoading.value = false;
  }
}

/** 保存高敏内容 */
async function saveSensitiveContent(): Promise<void> {
  if (!sensitiveViewContent.value.trim()) {
    ElMessage.warning('内容不能为空');
    return;
  }
  sensitiveViewSaving.value = true;
  try {
    await upsertSensitiveApi(
      props.studentId,
      sensitiveViewCategory.value,
      sensitiveViewContent.value.trim(),
    );
    ElMessage.success('已保存');
    await loadSensitiveSummaries();
  } catch (err: unknown) {
    if (err instanceof ApiError && err.code === 2004) {
      sensitiveUnlocked.value = false;
      openPinDialog(sensitiveViewCategory.value);
      return;
    }
    ElMessage.error(err instanceof ApiError ? err.message : '保存失败');
  } finally {
    sensitiveViewSaving.value = false;
  }
}

/** 清空一类高敏 */
async function clearSensitiveContent(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定清空「${sensitiveViewCategory.value}」高敏内容？`,
      '清空确认',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    await deleteSensitiveApi(props.studentId, sensitiveViewCategory.value);
    sensitiveViewContent.value = '';
    ElMessage.success('已清空');
    await loadSensitiveSummaries();
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '清空失败');
  }
}

/** 加载高敏摘要卡片 */
async function loadSensitiveSummaries(): Promise<void> {
  try {
    sensitiveSummaries.value = await listSensitiveApi(props.studentId);
  } catch {
    sensitiveSummaries.value = sensitiveCategories.map((category) => ({
      category,
      hasContent: false,
      updatedAt: null,
    }));
  }
}

/** 摘要是否有内容 */
function sensitiveHasContent(category: string): boolean {
  return sensitiveSummaries.value.some(
    (s) => s.category === category && s.hasContent,
  );
}

onMounted(() => {
  void loadSensitiveSummaries();
  void pinStatusApi()
    .then((s) => {
      sensitiveUnlocked.value = s.unlocked;
    })
    .catch(() => {
      // 忽略：未登录/未设置 PIN 时保持锁定态
    });
});
</script>

<template>
  <div>
    <div class="sensitive-grid">
      <el-card
        v-for="cat in sensitiveCategories"
        :key="cat"
        shadow="hover"
        class="sensitive-card cp-card--hoverable"
        @click="handleSensitiveCardClick(cat)"
      >
        <div class="sensitive-card__header">
          <el-icon :size="22" color="var(--cp-warning)">
            <Unlock v-if="sensitiveUnlocked" />
            <Lock v-else />
          </el-icon>
          <span class="sensitive-card__title">{{ cat }}</span>
          <el-tag
            v-if="sensitiveHasContent(cat)"
            size="small"
            type="warning"
            effect="plain"
          >
            已录入
          </el-tag>
        </div>
        <p class="sensitive-card__hint">
          {{
            sensitiveUnlocked
              ? '已解锁，点击查看或编辑'
              : '点击查看需输入 PIN 码解锁'
          }}
        </p>
      </el-card>
    </div>

    <!-- PIN 解锁对话框 -->
    <el-dialog
      v-model="pinDialogVisible"
      title="解锁高敏信息"
      width="480px"
      append-to-body
      align-center
      :close-on-click-modal="false"
    >
      <p class="pin-dialog__hint">输入 6 位 PIN，解锁后 10 分钟内可连续查看高敏内容</p>
      <el-input
        v-model="pinInput"
        type="password"
        maxlength="6"
        placeholder="请输入 PIN 码"
        show-password
        size="large"
        style="margin-top: 16px"
        @keyup.enter="handlePinUnlock"
      />
      <template #footer>
        <el-button @click="pinDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="pinSubmitting" @click="handlePinUnlock">
          解锁
        </el-button>
      </template>
    </el-dialog>

    <!-- 高敏内容查看/编辑 -->
    <el-dialog
      v-model="sensitiveViewVisible"
      :title="`高敏 · ${sensitiveViewCategory}`"
      width="560px"
      append-to-body
      align-center
      :close-on-click-modal="false"
    >
      <div v-loading="sensitiveViewLoading">
        <el-input
          v-model="sensitiveViewContent"
          type="textarea"
          :rows="10"
          placeholder="记录健康/心理/家庭等敏感明细（加密存储）"
        />
      </div>
      <template #footer>
        <el-button
          v-if="sensitiveHasContent(sensitiveViewCategory)"
          type="danger"
          text
          @click="clearSensitiveContent"
        >
          清空
        </el-button>
        <el-button @click="sensitiveViewVisible = false">关闭</el-button>
        <el-button type="primary" :loading="sensitiveViewSaving" @click="saveSensitiveContent">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.sensitive-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cp-gap-4);
}

.sensitive-card {
  cursor: pointer;
  border: 1px solid var(--cp-border);
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.sensitive-card:hover {
  border-color: var(--cp-warning);
  transform: translateY(-2px);
}

.sensitive-card__header {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-2);
  margin-bottom: var(--cp-gap-2);
}

.sensitive-card__title {
  font-size: var(--cp-font-base);
  font-weight: 600;
}

.sensitive-card__hint {
  margin: 0;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}

.pin-dialog__hint {
  margin: 0;
  font-size: var(--cp-font-base);
  color: var(--cp-text-2);
}
</style>
