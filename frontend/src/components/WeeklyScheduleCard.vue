<script setup lang="ts">
import { computed } from 'vue';
import {
  SCHEDULE_ROWS,
  SCHEDULE_WEEKDAYS,
  WEEKLY_SCHEDULE,
  scheduleDayIndex,
  scheduleKindOf,
  scheduleSlotLabel,
  type ScheduleCell,
  type ScheduleRowMeta,
} from '@/constants/weeklySchedule';

/** 紧凑模式（首页半宽并排） */
withDefaults(
  defineProps<{
    compact?: boolean;
  }>(),
  { compact: false },
);

const todayCol = scheduleDayIndex();

const todayLabel = computed(() => {
  if (todayCol < 0) return '周末休息';
  return `星期${SCHEDULE_WEEKDAYS[todayCol]}`;
});

/** 今日有课列表 */
const todayLessons = computed(() => {
  if (todayCol < 0) return [] as Array<{ slot: string; cell: ScheduleCell }>;
  const list: Array<{ slot: string; cell: ScheduleCell }> = [];
  SCHEDULE_ROWS.forEach((row, i) => {
    if (row.fullSpanText) return;
    const cell = WEEKLY_SCHEDULE[i]?.[todayCol] ?? null;
    if (cell) list.push({ slot: scheduleSlotLabel(row), cell });
  });
  return list;
});

/** 行是否在下午区块前留空（午自习后） */
function rowBreakBefore(row: ScheduleRowMeta): boolean {
  return row.id === 'p5';
}

/** 单元格样式类 */
function cellClass(cell: ScheduleCell | null, dayIndex: number): string[] {
  const classes = ['tt-cell'];
  if (!cell) {
    classes.push('tt-cell--empty');
    return classes;
  }
  classes.push(`tt-cell--${scheduleKindOf(cell.subject)}`);
  if (dayIndex === todayCol) classes.push('tt-cell--today');
  return classes;
}

/** 英语/早读仅展示班级，不重复科目字样 */
function showSubjectText(cell: ScheduleCell): boolean {
  return cell.subject !== '英语' && cell.subject !== '早读';
}
</script>

<template>
  <section class="tt cp-animate-in" :class="{ 'tt--compact': compact }">
    <header class="tt__header">
      <div>
        <p class="tt__eyebrow">Teacher Schedule · 雪浪中学</p>
        <h2 class="tt__title">周课表</h2>
        <p class="tt__sub">Fay · 9 月 1 日启用 · 今日 {{ todayLabel }}</p>
      </div>
      <div class="tt__today-badge" :class="{ 'tt__today-badge--off': todayCol < 0 }">
        <span class="tt__today-badge__dot" />
        <template v-if="todayCol >= 0">
          今日 {{ todayLessons.length }} 节
        </template>
        <template v-else>周末无课</template>
      </div>
    </header>

    <div v-if="todayLessons.length > 0 && !compact" class="tt__today-strip">
      <div
        v-for="(item, index) in todayLessons"
        :key="`${item.slot}-${index}`"
        class="tt__chip"
        :class="`tt__chip--${scheduleKindOf(item.cell.subject)}`"
      >
        <span class="tt__chip__period">{{ item.slot }}</span>
        <span v-if="item.cell.klass" class="tt__chip__klass">{{ item.cell.klass }}</span>
        <span v-if="showSubjectText(item.cell)" class="tt__chip__sub">
          {{ item.cell.subject }}
          <template v-if="item.cell.note">（{{ item.cell.note }}）</template>
        </span>
        <span v-else-if="item.cell.note" class="tt__chip__sub">（{{ item.cell.note }}）</span>
      </div>
    </div>

    <div class="tt__board">
      <div class="tt__grid" role="table" aria-label="教师周课表">
        <div class="tt__corner" role="columnheader" />
        <div
          v-for="(day, di) in SCHEDULE_WEEKDAYS"
          :key="day"
          class="tt__day"
          :class="{ 'tt__day--today': di === todayCol }"
          role="columnheader"
        >
          <span class="tt__day__label">周{{ day }}</span>
          <span v-if="di === todayCol" class="tt__day__tag">今天</span>
        </div>

        <template v-for="(row, ri) in SCHEDULE_ROWS" :key="row.id">
          <div
            class="tt__period"
            :class="{
              'tt__period--break': rowBreakBefore(row),
              'tt__period--special': row.kind !== 'period',
            }"
            role="rowheader"
          >
            <span class="tt__period__n">{{ row.label }}</span>
            <span v-if="row.subLabel" class="tt__period__slot">{{ row.subLabel }}</span>
          </div>

          <div
            v-if="row.fullSpanText"
            class="tt-cell tt-cell--lunch"
            role="cell"
          >
            <span class="tt-cell__subject">{{ row.fullSpanText }}</span>
          </div>

          <template v-else>
            <div
              v-for="(cell, di) in WEEKLY_SCHEDULE[ri]"
              :key="`${row.id}-${di}`"
              :class="[
                ...cellClass(cell, di),
                { 'tt-cell--col-today': di === todayCol },
              ]"
              role="cell"
            >
              <template v-if="cell">
                <span v-if="cell.klass" class="tt-cell__klass">{{ cell.klass }}</span>
                <span v-if="showSubjectText(cell)" class="tt-cell__subject">
                  {{ cell.subject }}
                  <template v-if="cell.note">（{{ cell.note }}）</template>
                </span>
                <span v-else-if="cell.note" class="tt-cell__subject">（{{ cell.note }}）</span>
              </template>
            </div>
          </template>
        </template>
      </div>
    </div>

    <footer class="tt__legend">
      <span class="tt__legend__item tt__legend__item--morningRead">早读</span>
      <span class="tt__legend__item tt__legend__item--english">英语</span>
      <span class="tt__legend__item tt__legend__item--research">教研</span>
      <span class="tt__legend__item tt__legend__item--meeting">会议</span>
      <span class="tt__legend__item tt__legend__item--classMeeting">班会</span>
      <span class="tt__legend__item tt__legend__item--extension">延时</span>
      <span v-if="!compact" class="tt__legend__hint">高亮列为当天</span>
    </footer>
  </section>
</template>

<style scoped>
.tt {
  min-width: 0;
  padding: var(--cp-gap-5);
  color: var(--cp-text-1);
  background: var(--cp-bg-card);
  border: 1px solid var(--cp-border);
  border-radius: var(--cp-radius-card);
  box-shadow: var(--cp-shadow-1);
}
.tt__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--cp-gap-3);
  margin-bottom: var(--cp-gap-4);
}
.tt__eyebrow {
  margin: 0 0 var(--cp-gap-1);
  font-size: var(--cp-font-xs);
  color: var(--cp-text-3);
}
.tt__title { margin: 0; font-size: var(--cp-font-lg); line-height: 1.4; font-weight: 700; }
.tt__sub { margin: var(--cp-gap-1) 0 0; font-size: var(--cp-font-xs); color: var(--cp-text-2); }
.tt__today-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--cp-gap-2);
  padding: var(--cp-gap-compact) var(--cp-gap-3);
  border-radius: var(--cp-radius-tag);
  font-size: var(--cp-font-xs);
  font-weight: 600;
  white-space: nowrap;
  color: var(--cp-domain-score-text);
  background: var(--cp-domain-score-bg);
}
.tt__today-badge--off { color: var(--cp-text-3); background: var(--cp-surface-subtle); }
.tt__today-badge__dot { width: 6px; height: 6px; border-radius: var(--cp-radius-round); background: currentColor; }
.tt__today-strip { display: flex; flex-wrap: wrap; gap: var(--cp-gap-2); margin-bottom: var(--cp-gap-4); }
.tt__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--cp-gap-2);
  padding: var(--cp-gap-compact) var(--cp-gap-3);
  border-radius: var(--cp-radius-tag);
  font-size: var(--cp-font-xs);
  color: var(--cp-text-2);
  background: var(--cp-surface-subtle);
}
.tt__chip__period { color: var(--cp-text-3); }
.tt__chip__klass { font-weight: 700; }
.tt__board { overflow-x: auto; }
.tt__grid {
  display: grid;
  grid-template-columns: 48px repeat(5, minmax(60px, 1fr));
  gap: var(--cp-gap-compact);
  min-width: 390px;
  font-variant-numeric: tabular-nums;
}
.tt__corner, .tt__day { min-height: 36px; }
.tt__day {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--cp-gap-1);
  color: var(--cp-text-2);
  background: var(--cp-surface-subtle);
  border-radius: var(--cp-radius-ctl);
  font-size: var(--cp-font-sm);
  font-weight: 600;
}
.tt__day--today { color: var(--cp-text-on-brand); background: var(--cp-primary); }
.tt__day__tag { font-size: var(--cp-font-xs); font-weight: 400; }
.tt__period {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cp-gap-half);
  min-height: 48px;
  color: var(--cp-text-2);
  font-size: var(--cp-font-sm);
}
.tt__period__slot { font-size: var(--cp-font-xs); color: var(--cp-text-3); }
.tt__period--break { border-top: 1px solid var(--cp-divider); }
.tt-cell {
  --cp-schedule-text: var(--cp-text-2);
  --cp-schedule-bg: var(--cp-surface-subtle);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cp-gap-half);
  min-width: 0;
  min-height: 48px;
  padding: var(--cp-gap-1);
  border-radius: var(--cp-radius-ctl);
  color: var(--cp-schedule-text);
  background: var(--cp-schedule-bg);
  text-align: center;
  overflow-wrap: anywhere;
  border: 1px solid transparent;
}
.tt-cell--english, .tt-cell--morningRead { --cp-schedule-text: var(--cp-domain-score-text); --cp-schedule-bg: var(--cp-domain-score-bg); }
.tt-cell--research, .tt-cell--extension { --cp-schedule-text: var(--cp-domain-comment-text); --cp-schedule-bg: var(--cp-domain-comment-bg); }
.tt-cell--activity { --cp-schedule-text: var(--cp-domain-contact-text); --cp-schedule-bg: var(--cp-domain-contact-bg); }
.tt-cell--meeting { --cp-schedule-text: var(--cp-domain-praise-text); --cp-schedule-bg: var(--cp-domain-praise-bg); }
.tt-cell--classMeeting { --cp-schedule-text: var(--cp-domain-incident-text); --cp-schedule-bg: var(--cp-domain-incident-bg); }
.tt-cell--col-today:not(.tt-cell--empty) { color: var(--cp-text-on-brand); background: var(--cp-schedule-text); }
.tt-cell--empty { background: var(--cp-surface-subtle); border-color: var(--cp-divider); border-style: dashed; }
.tt-cell--col-today.tt-cell--empty { background: var(--cp-surface-selected); border-color: var(--cp-primary-border); }
.tt-cell--lunch { grid-column: 2 / -1; min-height: 32px; background: var(--cp-surface-subtle); color: var(--cp-text-3); }
.tt-cell__klass { font-size: var(--cp-font-base); font-weight: 700; line-height: 1.4; }
.tt-cell__subject { font-size: var(--cp-font-xs); line-height: 1.4; }
.tt__legend { display: flex; flex-wrap: wrap; gap: var(--cp-gap-2) var(--cp-gap-3); margin-top: var(--cp-gap-4); color: var(--cp-text-3); font-size: var(--cp-font-xs); }
.tt__legend__item { display: inline-flex; align-items: center; gap: var(--cp-gap-compact); }
.tt__legend__item::before { content: ''; width: 7px; height: 7px; border-radius: var(--cp-radius-round); background: var(--cp-domain-score); }
.tt__legend__item--research::before, .tt__legend__item--extension::before { background: var(--cp-domain-comment); }
.tt__legend__item--meeting::before { background: var(--cp-domain-praise); }
.tt__legend__item--classMeeting::before { background: var(--cp-domain-incident); }
.tt__legend__hint { margin-left: auto; }
.tt--compact { padding: var(--cp-gap-4); }
.tt--compact .tt__eyebrow { display: none; }
.tt--compact .tt__title { font-size: var(--cp-font-md); }
.tt--compact .tt__day { flex-direction: column; gap: 0; }
.tt--compact .tt__header { flex-wrap: wrap; }
</style>
