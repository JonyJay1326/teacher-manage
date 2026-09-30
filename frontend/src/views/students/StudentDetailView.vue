<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  ChatDotRound,
  Flag,
  Female,
  Male,
  Ticket,
} from '@element-plus/icons-vue';
import { ApiError } from '@/api/http';
import { getStudentApi, updateStudentApi, type StudentDetailDto } from '@/api/students';
import { useStudentsStore } from '@/stores/students';
import ArchiveTab from './tabs/ArchiveTab.vue';
import SensitiveTab from './tabs/SensitiveTab.vue';
import ScoresTab from './tabs/ScoresTab.vue';
import TimelineTab from './tabs/TimelineTab.vue';
import CommentsTab from './tabs/CommentsTab.vue';
import ImpressionTab from './tabs/ImpressionTab.vue';

/**
 * 学生详情壳：只负责头部信息条、tab 调度与详情加载。
 * 各 tab 的业务与局部状态下沉到 tabs/ 子组件。
 */

const route = useRoute();
const router = useRouter();
const studentsStore = useStudentsStore();
const studentId = Number(route.params.id);

const loading = ref(false);
const student = ref<StudentDetailDto | null>(null);
const focusLevel = ref<number>(0);
const activeTab = ref('archive');

/** 关注等级选项 */
const focusLevelOptions = [
  { value: 0, label: '普通' },
  { value: 1, label: '关注' },
  { value: 2, label: '重点' },
  { value: 3, label: '最高' },
];

/** 标签变更计数：子组件保存标签后自增，驱动档案区重渲染 */
const tagsVersion = ref(0);

/** 加载学生详情 */
async function loadDetail(): Promise<void> {
  loading.value = true;
  try {
    const detail = await getStudentApi(studentId);
    student.value = detail;
    focusLevel.value = detail.focusLevel;
  } catch (err: unknown) {
    student.value = null;
    ElMessage.error(err instanceof ApiError ? err.message : '加载学生详情失败');
  } finally {
    loading.value = false;
  }
}

/** 更新关注等级 */
async function handleFocusLevelChange(level: number): Promise<void> {
  const previous = student.value?.focusLevel ?? 0;
  try {
    await updateStudentApi(studentId, { focusLevel: level });
    if (student.value) {
      student.value.focusLevel = level as 0 | 1 | 2 | 3;
    }
    ElMessage.success('关注等级已更新');
  } catch (err: unknown) {
    focusLevel.value = previous;
    ElMessage.error(err instanceof ApiError ? err.message : '更新关注等级失败');
  }
}

/** 跳转学情问答并锁定本生 */
function goDataAsk(): void {
  router.push({ path: '/ai/ask', query: { studentId: String(studentId) } });
}

const studentTags = computed(() => student.value?.tagIds ?? []);

onMounted(() => {
  void studentsStore.loadTags();
  void loadDetail();
});
</script>

<template>
  <div v-loading="loading" class="student-detail cp-animate-in">
    <template v-if="student">
      <!-- 头部信息条 -->
      <el-card shadow="never" class="student-detail__header">
        <div class="student-detail__header-inner">
          <el-avatar :size="72" shape="square" class="student-detail__photo">
            {{ student.name.charAt(0) }}
          </el-avatar>
          <div class="student-detail__info">
            <div class="student-detail__name-row">
              <h2 class="student-detail__name">{{ student.name }}</h2>
              <span class="student-detail__no cp-tabular-nums">
                <el-icon class="student-detail__no-icon"><Ticket /></el-icon>
                {{ student.studentNo }}
              </span>
              <el-tag v-if="student.cadreRole" type="primary" effect="dark" size="default">
                {{ student.cadreRole }}
              </el-tag>
            </div>
            <el-space :size="8" wrap class="student-detail__meta">
              <el-tag effect="plain" class="student-detail__meta-tag">
                <el-icon>
                  <Male v-if="student.gender === 1" />
                  <Female v-else />
                </el-icon>
                {{ student.gender === 1 ? '男' : '女' }}
              </el-tag>
              <el-tag type="success" effect="plain" class="student-detail__meta-tag">
                {{ student.status }}
              </el-tag>
            </el-space>
          </div>
          <div class="student-detail__focus">
            <el-button type="primary" plain @click="goDataAsk">
              <el-icon><ChatDotRound /></el-icon>
              问该生学情
            </el-button>
            <div class="student-detail__focus-block">
              <span class="student-detail__focus-label">
                <el-icon><Flag /></el-icon>
                关注等级
              </span>
              <el-select
                v-model="focusLevel"
                style="width: 120px"
                @change="handleFocusLevelChange"
              >
                <el-option
                  v-for="opt in focusLevelOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </div>
          </div>
        </div>
      </el-card>

      <!-- Tab 白卡区 -->
      <el-card shadow="never" class="student-detail__tabs">
        <el-tabs v-model="activeTab">
          <el-tab-pane label="档案" name="archive">
            <transition name="cp-fade" mode="out-in">
              <ArchiveTab
                v-if="activeTab === 'archive'"
                :key="studentTags.join(',') + ':' + tagsVersion"
                :student="student"
                :tags-version="tagsVersion"
              />
            </transition>
          </el-tab-pane>

          <el-tab-pane label="高敏" name="sensitive">
            <SensitiveTab :student-id="studentId" />
          </el-tab-pane>

          <el-tab-pane label="成绩" name="scores" lazy>
            <ScoresTab :student-id="studentId" :active="activeTab === 'scores'" />
          </el-tab-pane>

          <el-tab-pane label="时间线" name="timeline">
            <TimelineTab :student-id="studentId" />
          </el-tab-pane>

          <el-tab-pane label="评语" name="comments">
            <CommentsTab :student-id="studentId" />
          </el-tab-pane>

          <el-tab-pane label="我的印象" name="impression" lazy>
            <ImpressionTab
              :student-id="studentId"
              :active="activeTab === 'impression'"
            />
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>
    <el-empty v-else-if="!loading" description="未找到该学生" />
  </div>
</template>

<style scoped>
.student-detail__header {
  margin-bottom: var(--cp-gap-4);
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-card);
  background: var(--cp-bg-card);
}

.student-detail__header-inner {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-5);
}

.student-detail__photo {
  border-radius: var(--cp-radius-card);
  background: var(--cp-gradient-avatar);
  color: var(--cp-text-on-brand);
  font-size: var(--cp-font-lg);
  font-weight: 700;
  flex-shrink: 0;
  box-shadow: var(--cp-shadow-1);
}

.student-detail__info {
  min-width: 0;
  flex: 1;
}

.student-detail__name-row {
  flex-wrap: wrap;
  display: flex;
  align-items: center;
  gap: var(--cp-gap-3);
  margin-bottom: var(--cp-gap-2);
}

.student-detail__name {
  margin: 0;
  font-size: var(--cp-font-lg);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
}

.student-detail__name-row :deep(.el-tag) {
  flex-shrink: 0;
}

.student-detail__no {
  display: inline-flex;
  align-items: center;
  gap: var(--cp-gap-1);
  font-size: var(--cp-font-base);
  color: var(--cp-text-2);
}

.student-detail__no-icon {
  font-size: var(--cp-font-sm);
  color: var(--cp-primary);
}

.student-detail__meta-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--cp-gap-1);
}

.student-detail__focus {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: var(--cp-gap-3);
}

.student-detail__focus-block {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-2);
  align-items: flex-end;
}

.student-detail__focus-label {
  display: inline-flex;
  align-items: center;
  gap: var(--cp-gap-1);
  font-size: var(--cp-font-sm);
  font-weight: 500;
  color: var(--cp-text-2);
}

.student-detail__tabs {
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-card);
}

.student-detail__tabs :deep(.el-tabs__item) {
  font-size: var(--cp-font-base);
  font-weight: 500;
}

.student-detail__tabs :deep(.el-tabs__item.is-active) {
  font-weight: 600;
  color: var(--cp-primary);
}

</style>
