import { defineStore } from 'pinia';
import { ref } from 'vue';

/** UI 状态 store（侧边栏折叠等） */
export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(
    localStorage.getItem('cp-sidebar-collapsed') === 'true',
  );

  /** 切换侧边栏折叠状态 */
  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
    localStorage.setItem('cp-sidebar-collapsed', String(sidebarCollapsed.value));
  }

  /** 设置侧边栏折叠状态 */
  function setSidebarCollapsed(collapsed: boolean): void {
    sidebarCollapsed.value = collapsed;
    localStorage.setItem('cp-sidebar-collapsed', String(collapsed));
  }

  return {
    sidebarCollapsed,
    toggleSidebar,
    setSidebarCollapsed,
  };
});
