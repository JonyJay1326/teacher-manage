<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { Fold, Expand, EditPen, Setting } from '@element-plus/icons-vue';
import { ApiError } from '@/api/http';

defineProps<{
  collapsed: boolean;
  pageTitle: string;
  /** 待整理草稿数量（角标） */
  draftCount?: number;
}>();

const emit = defineEmits<{
  toggleSidebar: [];
  openQuickNote: [];
}>();

const router = useRouter();
const authStore = useAuthStore();

const pwdVisible = ref(false);
const oldPassword = ref('');
const newPassword = ref('');
const pwdLoading = ref(false);

/** 打开修改密码对话框 */
function openChangePassword(): void {
  oldPassword.value = '';
  newPassword.value = '';
  pwdVisible.value = true;
}

/** 提交修改密码 */
async function submitChangePassword(): Promise<void> {
  if (!oldPassword.value || !newPassword.value) {
    ElMessage.warning('请填写完整');
    return;
  }
  if (newPassword.value.length < 6) {
    ElMessage.warning('新密码至少 6 位');
    return;
  }
  pwdLoading.value = true;
  try {
    await authStore.changePassword(oldPassword.value, newPassword.value);
    ElMessage.success('密码已更新');
    pwdVisible.value = false;
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '修改失败');
  } finally {
    pwdLoading.value = false;
  }
}

/** 打开系统设置 */
function openSettings(): void {
  void router.push('/settings');
}

/** 退出登录 */
async function handleLogout(): Promise<void> {
  await authStore.logout();
  ElMessage.success('已退出登录');
  await router.replace('/login');
}
</script>

<template>
  <header class="topbar">
    <div class="topbar__left">
      <el-button
        :icon="collapsed ? Expand : Fold"
        text
        @click="emit('toggleSidebar')"
      />
      <span class="topbar__title">{{ pageTitle }}</span>
    </div>
    <div class="topbar__right">
      <el-tooltip content="速记 Alt+Q" placement="bottom">
        <el-badge :value="draftCount" :hidden="!draftCount" :max="99">
          <el-button type="primary" :icon="EditPen" @click="emit('openQuickNote')">
            速记
            <kbd class="topbar__kbd">Alt+Q</kbd>
          </el-button>
        </el-badge>
      </el-tooltip>
      <el-button :icon="Setting" class="topbar__settings" @click="openSettings">
        系统设置
      </el-button>
      <el-dropdown trigger="click" @command="(cmd: string) => cmd === 'pwd' ? openChangePassword() : handleLogout()">
        <span class="topbar__user">
          <el-avatar :size="32">{{ authStore.displayName.charAt(0) || '师' }}</el-avatar>
          <span class="topbar__username">{{ authStore.displayName }}</span>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="pwd">修改密码</el-dropdown-item>
            <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <el-dialog
      v-model="pwdVisible"
      title="修改密码"
      width="420px"
      append-to-body
      align-center
      destroy-on-close
    >
      <el-form label-width="88px">
        <el-form-item label="原密码">
          <el-input v-model="oldPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="newPassword" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdLoading" @click="submitChangePassword">
          确认
        </el-button>
      </template>
    </el-dialog>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 var(--cp-gap-5);
  background: var(--cp-bg-card);
  border-bottom: 1px solid var(--cp-border);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.04);
  flex-shrink: 0;
}

.topbar__left {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-2);
}

.topbar__title {
  font-size: var(--cp-font-md);
  font-weight: 700;
  color: var(--cp-text-1);
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-4);
}

.topbar__kbd {
  margin-left: var(--cp-gap-2);
  padding: 1px 6px;
  font-size: 11px;
  font-family: inherit;
  color: var(--cp-text-3);
  background: var(--cp-bg-page);
  border: 1px solid var(--cp-border);
  border-radius: 4px;
}

.topbar__settings {
  --el-button-bg-color: var(--cp-bg-page);
  --el-button-border-color: var(--cp-border);
  --el-button-text-color: var(--cp-text-2);
  --el-button-hover-bg-color: var(--cp-primary-bg);
  --el-button-hover-border-color: var(--cp-primary-border);
  --el-button-hover-text-color: var(--cp-primary);
  font-weight: 500;
}

.topbar__user {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-2);
  cursor: pointer;
}

.topbar__username {
  font-size: var(--cp-font-base);
  font-weight: 500;
  color: var(--cp-text-1);
}
</style>
