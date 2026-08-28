<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

/** 返回首页 */
function goHome(): void {
  router.push('/');
}
</script>

<template>
  <div class="coming-soon">
    <div class="coming-soon__content cp-card">
      <svg class="coming-soon__icon" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="30" width="80" height="60" rx="8" stroke="var(--cp-primary)" stroke-width="2" fill="var(--cp-primary-bg)" />
        <path d="M40 55h40M40 65h28" stroke="var(--cp-primary)" stroke-width="2" stroke-linecap="round" />
        <circle cx="85" cy="75" r="18" fill="var(--cp-primary-bg)" stroke="var(--cp-primary)" stroke-width="2" />
        <path d="M79 75l4 4 8-8" stroke="var(--cp-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <h2 class="coming-soon__title">功能开发中，敬请期待</h2>
      <p class="coming-soon__desc">该模块将在后续迭代中上线，当前为静态骨架阶段。</p>
      <el-button type="primary" @click="goHome">返回首页</el-button>
    </div>
  </div>
</template>

<style scoped>
.coming-soon {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

.coming-soon__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--cp-gap-6);
  text-align: center;
}

.coming-soon__icon {
  width: 120px;
  height: 120px;
  margin-bottom: var(--cp-gap-5);
}

.coming-soon__title {
  margin: 0 0 var(--cp-gap-2);
  font-size: 16px;
  font-weight: 600;
  color: var(--cp-text-1);
}

.coming-soon__desc {
  margin: 0 0 var(--cp-gap-5);
  font-size: 13px;
  color: var(--cp-text-2);
}
</style>
