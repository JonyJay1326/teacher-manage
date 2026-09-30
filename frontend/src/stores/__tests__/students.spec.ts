import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const listStudentsApi = vi.fn();
const listTagsApi = vi.fn();
const createTagApi = vi.fn();

vi.mock('@/api/http', () => ({
  ApiError: class ApiError extends Error {
    constructor(public readonly code: number, message: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

vi.mock('@/api/students', () => ({
  listStudentsApi: (...a: unknown[]) => listStudentsApi(...a),
  listTagsApi: (...a: unknown[]) => listTagsApi(...a),
  createTagApi: (...a: unknown[]) => createTagApi(...a),
}));

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { useStudentsStore } from '../students';
import type { Tag } from '@/types';

/** 构造一个合法 Tag */
function tag(id: number, name: string, domain: Tag['domain'], level: 0 | 1 | 2): Tag {
  return { id, name, domain, sensitiveLevel: level };
}

beforeEach(() => {
  setActivePinia(createPinia());
  listStudentsApi.mockReset();
  listTagsApi.mockReset();
  createTagApi.mockReset();
});

describe('students store · 标签字典', () => {
  it('loadTags 首次请求并写入', async () => {
    listTagsApi.mockResolvedValue([tag(1, '偏科', '学业', 0)]);
    const store = useStudentsStore();
    await store.loadTags();
    expect(store.tags).toHaveLength(1);
  });

  it('已加载时不重复请求（同一 store 只打一次 API）', async () => {
    listTagsApi.mockResolvedValue([tag(1, '偏科', '学业', 0)]);
    const store = useStudentsStore();
    await store.loadTags();
    await store.loadTags();
    expect(listTagsApi).toHaveBeenCalledTimes(1);
  });

  it('force=true 时强制刷新', async () => {
    listTagsApi.mockResolvedValue([tag(1, '偏科', '学业', 0)]);
    const store = useStudentsStore();
    await store.loadTags();
    listTagsApi.mockResolvedValue([tag(1, '偏科', '学业', 0), tag(2, '进步快', '学业', 0)]);
    await store.loadTags(true);
    expect(listTagsApi).toHaveBeenCalledTimes(2);
    expect(store.tags).toHaveLength(2);
  });

  it('加载失败时 tags 保持为空且不抛出', async () => {
    listTagsApi.mockRejectedValue(new Error('network'));
    const store = useStudentsStore();
    await expect(store.loadTags()).resolves.toBeUndefined();
    expect(store.tags).toEqual([]);
  });

  it('selectableTags 只含 L0 标签', async () => {
    listTagsApi.mockResolvedValue([
      tag(1, '偏科', '学业', 0),
      tag(2, '情绪易波动', '行为情绪', 1),
      tag(3, '慢性疾病', '健康', 2),
    ]);
    const store = useStudentsStore();
    await store.loadTags();
    expect(store.selectableTags.map((t) => t.id)).toEqual([1]);
  });

  it('tagOptionGroups 按业务域分组', async () => {
    listTagsApi.mockResolvedValue([
      tag(1, '偏科', '学业', 0),
      tag(2, '进步快', '学业', 0),
      tag(3, '视力问题', '健康', 0),
    ]);
    const store = useStudentsStore();
    await store.loadTags();
    const groups = store.tagOptionGroups;
    expect(groups.map((g) => g.domain).join(',')).toBe('学业,健康');
    expect(groups.find((g) => g.domain === '学业')!.tags).toHaveLength(2);
  });

  it('getVisibleTags 过滤未选中的与高敏感的', async () => {
    listTagsApi.mockResolvedValue([
      tag(1, '偏科', '学业', 0),
      tag(2, '慢性疾病', '健康', 2),
      tag(3, '进步快', '学业', 0),
    ]);
    const store = useStudentsStore();
    await store.loadTags();
    expect(store.getVisibleTags([1, 2, 3, 999]).map((t) => t.id)).toEqual([1, 3]);
  });

  it('getVisibleTags 空入参返回空数组', async () => {
    const store = useStudentsStore();
    expect(store.getVisibleTags([])).toEqual([]);
  });
});

describe('students store · resolveTagSelection', () => {
  it('纯数字 id 原样保留', async () => {
    listTagsApi.mockResolvedValue([tag(1, '偏科', '学业', 0)]);
    const store = useStudentsStore();
    await store.loadTags();
    expect(await store.resolveTagSelection([1])).toEqual([1]);
  });

  it('同名标签复用已有 id，不重复创建', async () => {
    listTagsApi.mockResolvedValue([tag(1, '偏科', '学业', 0)]);
    const store = useStudentsStore();
    await store.loadTags();
    const out = await store.resolveTagSelection(['偏科']);
    expect(out).toEqual([1]);
    expect(createTagApi).not.toHaveBeenCalled();
  });

  it('新名字调用创建接口并写入 store', async () => {
    listTagsApi.mockResolvedValue([]);
    createTagApi.mockResolvedValue(tag(9, '新标签', '其他', 0));
    const store = useStudentsStore();
    await store.loadTags();
    const out = await store.resolveTagSelection(['新标签']);
    expect(createTagApi).toHaveBeenCalledWith({ name: '新标签', domain: '其他' });
    expect(out).toEqual([9]);
    expect(store.tags).toHaveLength(1);
  });

  it('去重（重复 id 与新建同名只保留一份）', async () => {
    listTagsApi.mockResolvedValue([]);
    createTagApi.mockResolvedValue(tag(9, '新标签', '其他', 0));
    const store = useStudentsStore();
    await store.loadTags();
    expect(await store.resolveTagSelection([1, 1, '新标签', '新标签'])).toEqual([1, 9]);
    expect(createTagApi).toHaveBeenCalledTimes(1);
  });

  it('空字符串被忽略', async () => {
    listTagsApi.mockResolvedValue([]);
    const store = useStudentsStore();
    await store.loadTags();
    expect(await store.resolveTagSelection(['', '  '])).toEqual([]);
  });

  it('名称前后空白被 trim 后复用', async () => {
    listTagsApi.mockResolvedValue([tag(1, '偏科', '学业', 0)]);
    const store = useStudentsStore();
    await store.loadTags();
    expect(await store.resolveTagSelection(['  偏科  '])).toEqual([1]);
    expect(createTagApi).not.toHaveBeenCalled();
  });

  it('创建失败时向上抛错（不静默吞掉）', async () => {
    listTagsApi.mockResolvedValue([]);
    createTagApi.mockRejectedValue(new Error('boom'));
    const store = useStudentsStore();
    await store.loadTags();
    await expect(store.resolveTagSelection(['新标签'])).rejects.toThrow('boom');
  });

  it('空数组入参返回空数组', async () => {
    const store = useStudentsStore();
    expect(await store.resolveTagSelection([])).toEqual([]);
  });
});

describe('students store · 学生列表', () => {
  it('loadStudents 写入 items 与 total', async () => {
    listStudentsApi.mockResolvedValue({ items: [{ id: 1 }], total: 1 });
    const store = useStudentsStore();
    await store.loadStudents({ page: 1, pageSize: 200 });
    expect(store.students).toHaveLength(1);
    expect(store.total).toBe(1);
  });

  it('透传查询条件给 API', async () => {
    listStudentsApi.mockResolvedValue({ items: [], total: 0 });
    const store = useStudentsStore();
    await store.loadStudents({ q: '李', page: 2, pageSize: 50, sortBy: 'focusLevel', sortOrder: 'desc' });
    expect(listStudentsApi).toHaveBeenCalledWith({
      q: '李',
      page: 2,
      pageSize: 50,
      sortBy: 'focusLevel',
      sortOrder: 'desc',
    });
  });

  it('加载失败时抛出且不写入脏数据', async () => {
    listStudentsApi.mockRejectedValue(new Error('fail'));
    const store = useStudentsStore();
    await expect(store.loadStudents({ page: 1, pageSize: 10 })).rejects.toThrow('fail');
    expect(store.students).toEqual([]);
  });

  it('请求结束后 listLoading 复位（含失败路径）', async () => {
    listStudentsApi.mockRejectedValue(new Error('fail'));
    const store = useStudentsStore();
    await store.loadStudents({ page: 1, pageSize: 10 }).catch(() => undefined);
    expect(store.listLoading).toBe(false);
  });

  it('成功路径 listLoading 也复位', async () => {
    listStudentsApi.mockResolvedValue({ items: [], total: 0 });
    const store = useStudentsStore();
    await store.loadStudents({ page: 1, pageSize: 10 });
    expect(store.listLoading).toBe(false);
  });
});
