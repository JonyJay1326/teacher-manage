<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { User, Lock } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { ApiError } from '@/api/http';

const router = useRouter();
const authStore = useAuthStore();
const username = ref('');
const password = ref('');
const loading = ref(false);

/** 提交登录 */
async function handleLogin(): Promise<void> {
  if (!username.value || !password.value) {
    ElMessage.warning('请输入用户名和密码');
    return;
  }
  loading.value = true;
  try {
    await authStore.login(username.value, password.value);
    ElMessage.success('登录成功');
    await router.replace('/');
  } catch (err: unknown) {
    const message = err instanceof ApiError ? err.message : '登录失败';
    ElMessage.error(message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card cp-card">
      <div class="login-card__header">
        <img src="/favicon.svg" alt="ClassPilot" class="login-card__logo" />
        <h1 class="login-card__title">ClassPilot 班级领航员</h1>
        <p class="login-card__desc">班主任班级管理系统</p>
      </div>
      <el-form label-width="0" @submit.prevent="handleLogin">
        <el-form-item>
          <el-input
            v-model="username"
            placeholder="用户名"
            size="large"
            :prefix-icon="User"
            autocomplete="username"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="password"
            type="password"
            placeholder="密码"
            size="large"
            :prefix-icon="Lock"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            native-type="submit"
            style="width: 100%"
            :loading="loading"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>
      <p class="login-card__hint">请使用 cli:create-user 创建的账号登录</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--cp-page-atmosphere);
}

.login-card {
  width: 400px;
  padding: var(--cp-gap-6);
  box-shadow: var(--cp-shadow-2);
}

.login-card__header {
  text-align: center;
  margin-bottom: var(--cp-gap-5);
}

.login-card__logo {
  width: 48px;
  height: 48px;
  margin-bottom: var(--cp-gap-3);
}

.login-card__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--cp-text-1);
}

.login-card__desc {
  margin: var(--cp-gap-1) 0 0;
  font-size: 13px;
  color: var(--cp-text-2);
}

.login-card__hint {
  margin: var(--cp-gap-4) 0 0;
  font-size: 12px;
  color: var(--cp-text-3);
  text-align: center;
}
</style>
