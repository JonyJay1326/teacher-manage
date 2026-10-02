import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { ApiError } from '@/api/http';
import {
  createTagApi,
  listStudentsApi,
  listTagsApi,
  type StudentListQuery,
} from '@/api/students';
import type { Student, Tag } from '@/types';

/**
 * 学生域唯一数据源。
 * 花名册与学生详情页共用同一份列表/标签状态，
 * 任一处新增标签或学生，另一处读到的是同一份数据。
 */
export const useStudentsStore = defineStore('students', () => {
  /** 花名册列表（分页结果） */
  const students = ref<Student[]>([]);
  const total = ref(0);
  /** 标签字典（全局共享，避免各页各拉一份） */
  const tags = ref<Tag[]>([]);
  const listLoading = ref(false);
  const tagsLoading = ref(false);

  /** 非敏感标签（可分配给学生的 L0 标签） */
  const selectableTags = computed(() =>
    tags.value.filter((tag) => tag.sensitiveLevel === 0),
  );

  /** 按业务域分组，供多选下拉使用 */
  const tagOptionGroups = computed(() => {
    const map = new Map<string, Tag[]>();
    for (const tag of selectableTags.value) {
      const list = map.get(tag.domain) ?? [];
      list.push(tag);
      map.set(tag.domain, list);
    }
    return [...map.entries()].map(([domain, domainTags]) => ({
      domain,
      tags: domainTags,
    }));
  });

  /** 按敏感级别过滤可见标签（档案页仅展示 L0） */
  function getVisibleTags(tagIds: number[]): Tag[] {
    const idSet = new Set(tagIds);
    return tags.value.filter(
      (tag) => idSet.has(tag.id) && tag.sensitiveLevel === 0,
    );
  }

  /** 加载标签字典；已加载时不重复请求 */
  async function loadTags(force = false): Promise<void> {
    if (!force && tags.value.length > 0) return;
    tagsLoading.value = true;
    try {
      tags.value = await listTagsApi();
    } catch (err: unknown) {
      ElMessage.error(err instanceof ApiError ? err.message : '加载标签失败');
    } finally {
      tagsLoading.value = false;
    }
  }

  /** 加载学生列表 */
  async function loadStudents(query: StudentListQuery): Promise<void> {
    listLoading.value = true;
    try {
      const result = await listStudentsApi(query);
      students.value = result.items;
      total.value = result.total;
    } finally {
      listLoading.value = false;
    }
  }

  /**
   * 解析标签选择：数字为已有标签；字符串为新建名（回车创建后归入「其他」域）。
   * 新建标签直接写入 store 缓存，其他页面立即可见。
   */
  async function resolveTagSelection(
    values: Array<number | string>,
  ): Promise<number[]> {
    const nextIds: number[] = [];
    for (const value of values) {
      if (typeof value === 'number') {
        nextIds.push(value);
        continue;
      }
      const name = String(value).trim();
      if (!name) continue;
      const existing = selectableTags.value.find((tag) => tag.name === name);
      if (existing) {
        nextIds.push(existing.id);
        continue;
      }
      const created = await createTagApi({ name, domain: '其他' });
      tags.value.push(created);
      nextIds.push(created.id);
    }
    return [...new Set(nextIds)];
  }

  return {
    students,
    total,
    tags,
    listLoading,
    tagsLoading,
    selectableTags,
    tagOptionGroups,
    getVisibleTags,
    loadTags,
    loadStudents,
    resolveTagSelection,
  };
});
