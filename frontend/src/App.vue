<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterView, useRouter } from 'vue-router';

const router = useRouter();
/** 首屏路由（含守卫与异步页面）是否已就绪 */
const routeReady = ref(false);

onMounted(() => {
  void router.isReady().then(() => {
    routeReady.value = true;
  });
});
</script>

<template>
  <div class="app-root">
    <div
      v-if="!routeReady"
      class="app-boot"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div class="app-boot__spinner" aria-hidden="true" />
      <p class="app-boot__text">加载中…</p>
    </div>
    <RouterView />
  </div>
</template>
