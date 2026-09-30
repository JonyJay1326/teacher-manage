<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { ApiError } from '@/api/http';
import { listTimelineApi, type TimelineItem } from '@/api/students';

/** 成长时间线 tab：按类型/关键词筛选成绩、事件、沟通、表扬、评语 */

const props = defineProps<{ studentId: number }>();

const timelineItems = ref<TimelineItem[]>([]);
const timelineLoading = ref(false);
const timelineKind = ref('all');
const timelineKeyword = ref('');

/** 时间线类型标签 */
function timelineKindLabel(item: TimelineItem): string {
  if (item.domain === 'contact') return '家校沟通';
  if (item.domain === 'praise') return '表扬';
  if (item.kind === 'score') return '成绩';
  if (item.kind === 'comment') return '评语';
  return item.category || '事件';
}

/** 格式化时间线日期 */
function formatTimelineDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** 格式化单科展示 */
function formatSubjectCell(subject: {
  subjectName: string;
  score: number | null;
  status: string;
  classRank: number | null;
}): string {
  if (subject.status === '缺考') return '缺';
  if (subject.status === '免考') return '免';
  if (subject.score === null) return '—';
  return String(subject.score);
}

/** 加载成长时间线 */
async function loadTimeline(): Promise<void> {
  timelineLoading.value = true;
  try {
    timelineItems.value = await listTimelineApi(props.studentId, {
      kind: timelineKind.value === 'all' ? undefined : timelineKind.value,
      q: timelineKeyword.value.trim() || undefined,
    });
  } catch (err: unknown) {
    ElMessage.error(err instanceof ApiError ? err.message : '加载时间线失败');
  } finally {
    timelineLoading.value = false;
  }
}

onMounted(() => {
  void loadTimeline();
});

defineExpose({ reload: loadTimeline });
</script>

<template>
  <div>
    <div class="timeline-toolbar">
      <el-radio-group v-model="timelineKind" size="small" @change="loadTimeline">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="score">成绩</el-radio-button>
        <el-radio-button value="incident">事件</el-radio-button>
        <el-radio-button value="contact">沟通</el-radio-button>
        <el-radio-button value="praise">表扬</el-radio-button>
        <el-radio-button value="comment">评语</el-radio-button>
      </el-radio-group>
      <el-input
        v-model="timelineKeyword"
        clearable
        placeholder="关键词"
        style="width: 200px"
        @keyup.enter="loadTimeline"
        @clear="loadTimeline"
      >
        <template #append>
          <el-button @click="loadTimeline">搜索</el-button>
        </template>
      </el-input>
    </div>
    <div v-loading="timelineLoading">
      <div v-if="timelineItems.length > 0" class="timeline">
        <div
          v-for="item in timelineItems"
          :key="item.id"
          class="timeline__item"
        >
          <div class="timeline__axis">
            <span
              class="timeline__dot"
              :class="`timeline__dot--${item.domain}`"
            />
          </div>
          <el-card
            shadow="never"
            class="timeline__card"
            :class="`timeline__card--${item.domain}`"
          >
            <div class="timeline__card-header">
              <span class="timeline__date">{{ formatTimelineDate(item.occurredAt) }}</span>
              <el-tag size="small" effect="plain">{{ timelineKindLabel(item) }}</el-tag>
            </div>
            <h4 class="timeline__title">{{ item.title }}</h4>
            <template v-if="item.kind === 'score' && item.scoreDetail">
              <div class="timeline__score-meta">
                <span class="cp-tabular-nums">
                  总分
                  <strong>{{ item.scoreDetail.totalScore ?? '—' }}</strong>
                </span>
                <span class="cp-tabular-nums">
                  班排
                  <strong>
                    {{
                      item.scoreDetail.totalRank !== null
                        ? `第${item.scoreDetail.totalRank}名`
                        : '—'
                    }}
                  </strong>
                </span>
              </div>
              <div class="timeline__score-grid">
                <div
                  v-for="sub in item.scoreDetail.subjects"
                  :key="sub.subjectId"
                  class="timeline__score-cell"
                >
                  <span class="timeline__score-name">{{ sub.subjectName }}</span>
                  <span class="timeline__score-value cp-tabular-nums">
                    {{ formatSubjectCell(sub) }}
                  </span>
                  <span
                    v-if="sub.classRank !== null && sub.status === '正常'"
                    class="timeline__score-rank cp-tabular-nums"
                  >
                    第{{ sub.classRank }}名
                  </span>
                  <span v-else class="timeline__score-rank">—</span>
                </div>
              </div>
            </template>
            <p v-else-if="item.summary" class="timeline__summary">{{ item.summary }}</p>
          </el-card>
        </div>
      </div>
      <el-empty v-else description="暂无时间线记录" />
    </div>
  </div>
</template>

<style scoped>
.timeline {
  position: relative;
  padding-left: var(--cp-gap-5);
}

.timeline-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--cp-gap-3);
  margin-bottom: var(--cp-gap-4);
}

.timeline__item {
  display: flex;
  gap: var(--cp-gap-4);
  margin-bottom: var(--cp-gap-4);
  position: relative;
  transition: transform 0.2s ease;
}

.timeline__item:hover {
  transform: translateX(4px);
}

.timeline__item::before {
  content: '';
  position: absolute;
  left: -20px;
  top: 20px;
  bottom: -16px;
  width: 2px;
  background: var(--cp-divider);
}

.timeline__item:last-child::before {
  display: none;
}

.timeline__axis {
  position: absolute;
  left: -28px;
  top: 12px;
}

.timeline__dot {
  width: 10px;
  height: 10px;
  border-radius: var(--cp-radius-round);
  background: var(--cp-text-3);
  box-shadow: none;
}

.timeline__dot--score { background: var(--cp-domain-score); }
.timeline__dot--incident { background: var(--cp-domain-incident); }
.timeline__dot--contact { background: var(--cp-domain-contact); }
.timeline__dot--comment { background: var(--cp-domain-comment); }
.timeline__dot--praise { background: var(--cp-domain-praise); }

.timeline__card {
  min-width: 0;
  overflow-wrap: anywhere;
  flex: 1;
  border-left: 5px solid var(--cp-border);
  transition: box-shadow 0.2s ease;
}

.timeline__card--score { border-left-color: var(--cp-domain-score); }
.timeline__card--incident { border-left-color: var(--cp-domain-incident); }
.timeline__card--contact { border-left-color: var(--cp-domain-contact); }
.timeline__card--comment { border-left-color: var(--cp-domain-comment); }
.timeline__card--praise { border-left-color: var(--cp-domain-praise); }

.timeline__card-header {
  display: flex;
  align-items: center;
  gap: var(--cp-gap-2);
  margin-bottom: var(--cp-gap-2);
}

.timeline__date {
  font-size: var(--cp-font-sm);
  color: var(--cp-text-3);
}

.timeline__title {
  margin: 0 0 var(--cp-gap-2);
  font-size: var(--cp-font-base);
  font-weight: 600;
}

.timeline__summary {
  margin: 0;
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
  line-height: 1.65;
}

.timeline__score-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cp-gap-4);
  margin-bottom: var(--cp-gap-3);
  font-size: var(--cp-font-sm);
  color: var(--cp-text-2);
}

.timeline__score-meta strong {
  margin-left: var(--cp-gap-1);
  color: var(--cp-domain-score);
  font-size: var(--cp-font-base);
}

.timeline__score-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: var(--cp-gap-2);
}

.timeline__score-cell {
  display: flex;
  flex-direction: column;
  gap: var(--cp-gap-half);
  padding: var(--cp-gap-2);
  background: var(--cp-bg-page);
  border-radius: var(--cp-radius-ctl);
  border: 1px solid var(--cp-divider);
}

.timeline__score-name {
  font-size: var(--cp-font-xs);
  color: var(--cp-text-3);
}

.timeline__score-value {
  font-size: var(--cp-font-md);
  font-weight: 700;
  color: var(--cp-text-1);
}

.timeline__score-rank {
  font-size: var(--cp-font-xs);
  color: var(--cp-text-2);
}
</style>
