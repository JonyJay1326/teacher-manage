import { defineStore } from 'pinia';
import { ref } from 'vue';

/** 事件模块跨页面刷新协调 */
export const useIncidentsStore = defineStore('incidents', () => {
  const dataVersion = ref(0);

  /** 通知事件相关页面刷新列表与角标 */
  function bumpDataVersion(): void {
    dataVersion.value += 1;
  }

  return {
    dataVersion,
    bumpDataVersion,
  };
});
