<script setup lang="ts">
import { computed } from 'vue';
import {
  SCHEDULE_PERIODS,
  SCHEDULE_WEEKDAYS,
  WEEKLY_SCHEDULE,
  scheduleDayIndex,
  scheduleKindOf,
  type ScheduleCell,
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
  if (todayCol < 0) return [] as Array<{ period: number; cell: ScheduleCell }>;
  const list: Array<{ period: number; cell: ScheduleCell }> = [];
  WEEKLY_SCHEDULE.forEach((row, i) => {
    const cell = row[todayCol];
    if (cell) list.push({ period: SCHEDULE_PERIODS[i].period, cell });
  });
  return list;
});

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
</script>

<template>
  <section class="tt cp-animate-in" :class="{ 'tt--compact': compact }">
    <div class="tt__glow tt__glow--a" aria-hidden="true" />
    <div class="tt__glow tt__glow--b" aria-hidden="true" />

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
        v-for="item in todayLessons"
        :key="item.period"
        class="tt__chip"
        :class="`tt__chip--${scheduleKindOf(item.cell.subject)}`"
      >
        <span class="tt__chip__period">第{{ item.period }}节</span>
        <span v-if="item.cell.klass" class="tt__chip__klass">{{ item.cell.klass }}</span>
        <span class="tt__chip__sub">{{ item.cell.subject }}</span>
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

        <template v-for="(meta, pi) in SCHEDULE_PERIODS" :key="meta.period">
          <div
            class="tt__period"
            :class="{ 'tt__period--break': meta.period === 5 }"
            role="rowheader"
          >
            <span class="tt__period__n">{{ meta.period }}</span>
            <span class="tt__period__slot">{{ meta.slot }}</span>
          </div>
          <div
            v-for="(cell, di) in WEEKLY_SCHEDULE[pi]"
            :key="`${meta.period}-${di}`"
            :class="[
              ...cellClass(cell, di),
              { 'tt-cell--col-today': di === todayCol },
            ]"
            role="cell"
          >
            <template v-if="cell">
              <span v-if="cell.klass" class="tt-cell__klass">{{ cell.klass }}</span>
              <span class="tt-cell__subject">{{ cell.subject }}</span>
            </template>
          </div>
        </template>
      </div>
    </div>

    <footer class="tt__legend">
      <span class="tt__legend__item tt__legend__item--english">英语</span>
      <span class="tt__legend__item tt__legend__item--research">教研</span>
      <span class="tt__legend__item tt__legend__item--activity">综1</span>
      <span class="tt__legend__item tt__legend__item--meeting">会议</span>
      <span class="tt__legend__item tt__legend__item--classMeeting">班会</span>
      <span v-if="!compact" class="tt__legend__hint">高亮列为当天</span>
    </footer>
  </section>
</template>

<style scoped>
/* 软几何浅色：与图表风格一致（附录 D.5） */
.tt {
  --tt-blue: #5b9cff;
  --tt-green: #3dcf9a;
  --tt-amber: #f5b942;
  --tt-violet: #9b8cff;
  --tt-rose: #ff7a9a;
  --tt-text: #1e293b;
  --tt-muted: #64748b;
  --tt-axis: #e2e8f0;

  position: relative;
  overflow: hidden;
  margin-bottom: var(--cp-gap-6);
  padding: 28px 28px 22px;
  border-radius: 22px;
  color: var(--tt-text);
  background: linear-gradient(155deg, #eff6ff 0%, #f0fdf4 48%, #fffbeb 100%);
  border: 1px solid #bfdbfe;
  box-shadow: 0 16px 36px rgba(91, 156, 255, 0.12);
}

.tt__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(56px);
  pointer-events: none;
  z-index: 0;
  opacity: 0.55;
}

.tt__glow--a {
  width: 240px;
  height: 240px;
  top: -90px;
  right: -30px;
  background: rgba(91, 156, 255, 0.28);
  animation: tt-float 8s ease-in-out infinite;
}

.tt__glow--b {
  width: 200px;
  height: 200px;
  bottom: -70px;
  left: 8%;
  background: rgba(61, 207, 154, 0.22);
  animation: tt-float 10s ease-in-out infinite reverse;
}

@keyframes tt-float {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-10px, 8px);
  }
}

.tt__header,
.tt__today-strip,
.tt__board,
.tt__legend {
  position: relative;
  z-index: 1;
}

.tt__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.tt__eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--tt-blue);
  font-weight: 700;
}

.tt__title {
  margin: 0;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #1e3a8a;
}

.tt__sub {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--tt-muted);
}

.tt__today-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  color: #92400e;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 1px solid rgba(245, 185, 66, 0.45);
  box-shadow: 0 8px 20px rgba(245, 185, 66, 0.22);
  flex-shrink: 0;
}

.tt__today-badge--off {
  color: var(--tt-muted);
  background: #f1f5f9;
  border-color: var(--tt-axis);
  box-shadow: none;
}

.tt__today-badge__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tt-amber);
  box-shadow: 0 0 0 4px rgba(245, 185, 66, 0.28);
  animation: tt-pulse 1.6s ease-in-out infinite;
}

@keyframes tt-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.85);
    opacity: 0.7;
  }
}

.tt__today-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}

.tt__chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--tt-axis);
  box-shadow: 0 6px 16px rgba(91, 156, 255, 0.08);
  animation: tt-chip-in 0.45s ease both;
}

.tt__chip:nth-child(1) {
  animation-delay: 0.05s;
}
.tt__chip:nth-child(2) {
  animation-delay: 0.1s;
}
.tt__chip:nth-child(3) {
  animation-delay: 0.15s;
}
.tt__chip:nth-child(4) {
  animation-delay: 0.2s;
}
.tt__chip:nth-child(5) {
  animation-delay: 0.25s;
}

@keyframes tt-chip-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tt__chip__period {
  font-weight: 700;
  color: var(--tt-muted);
}

.tt__chip__sub {
  font-weight: 600;
  font-size: 12px;
}

.tt__chip__klass {
  font-weight: 800;
  font-size: 13px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.75);
  letter-spacing: 0.02em;
}

.tt__chip--english {
  border-color: rgba(91, 156, 255, 0.45);
  color: #2563eb;
  background: rgba(91, 156, 255, 0.1);
}
.tt__chip--research {
  border-color: rgba(155, 140, 255, 0.45);
  color: #6d28d9;
  background: rgba(155, 140, 255, 0.12);
}
.tt__chip--activity {
  border-color: rgba(61, 207, 154, 0.45);
  color: #047857;
  background: rgba(61, 207, 154, 0.12);
}
.tt__chip--meeting {
  border-color: rgba(245, 185, 66, 0.5);
  color: #b45309;
  background: rgba(245, 185, 66, 0.14);
}
.tt__chip--classMeeting {
  border-color: rgba(255, 122, 154, 0.45);
  color: #be123c;
  background: rgba(255, 122, 154, 0.12);
}

.tt__board {
  overflow-x: auto;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid #dbeafe;
  box-shadow: 0 10px 24px rgba(91, 156, 255, 0.06);
  padding: 12px;
}

.tt__grid {
  display: grid;
  grid-template-columns: 56px repeat(5, minmax(108px, 1fr));
  gap: 8px;
  min-width: 680px;
}

.tt__corner {
  min-height: 44px;
}

.tt__day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 44px;
  border-radius: 999px;
  color: var(--tt-muted);
  font-weight: 700;
  font-size: 13px;
  background: #f8fafc;
  border: 1px solid var(--tt-axis);
}

.tt__day--today {
  color: #1e3a8a;
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  border-color: rgba(91, 156, 255, 0.55);
  box-shadow: 0 8px 20px rgba(91, 156, 255, 0.2);
}

.tt__day__tag {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--tt-blue);
}

.tt__period {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 64px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid var(--tt-axis);
}

.tt__period--break {
  margin-top: 4px;
}

.tt__period__n {
  font-size: 16px;
  font-weight: 800;
  color: var(--tt-text);
}

.tt__period__slot {
  font-size: 10px;
  color: var(--tt-muted);
}

.tt-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 64px;
  padding: 8px 6px;
  border-radius: 16px;
  text-align: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  border: 1px solid transparent;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.04);
}

.tt-cell:not(.tt-cell--empty):hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 22px rgba(91, 156, 255, 0.14);
}

.tt-cell--empty {
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  box-shadow: none;
}

.tt-cell--col-today:not(.tt-cell--empty) {
  box-shadow:
    0 0 0 2px rgba(91, 156, 255, 0.35),
    0 10px 22px rgba(91, 156, 255, 0.16);
}

.tt-cell--col-today.tt-cell--empty {
  background: rgba(91, 156, 255, 0.06);
  border-color: rgba(91, 156, 255, 0.35);
}

.tt-cell--today {
  animation: tt-cell-pop 0.55s ease both;
}

@keyframes tt-cell-pop {
  from {
    transform: scale(0.92);
    opacity: 0.6;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.tt-cell__klass {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.03em;
  line-height: 1.2;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
}

.tt-cell__subject {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  opacity: 0.92;
}

/* 浅底深字 · 软几何色板 */
.tt-cell--english {
  color: #1d4ed8;
  background: linear-gradient(160deg, rgba(91, 156, 255, 0.28), rgba(91, 156, 255, 0.12));
  border-color: rgba(91, 156, 255, 0.4);
}

.tt-cell--research {
  color: #5b21b6;
  background: linear-gradient(160deg, rgba(155, 140, 255, 0.3), rgba(155, 140, 255, 0.12));
  border-color: rgba(155, 140, 255, 0.4);
}

.tt-cell--activity {
  color: #047857;
  background: linear-gradient(160deg, rgba(61, 207, 154, 0.3), rgba(61, 207, 154, 0.12));
  border-color: rgba(61, 207, 154, 0.4);
}

.tt-cell--meeting {
  color: #b45309;
  background: linear-gradient(160deg, rgba(245, 185, 66, 0.34), rgba(245, 185, 66, 0.14));
  border-color: rgba(245, 185, 66, 0.45);
}

.tt-cell--classMeeting {
  color: #be123c;
  background: linear-gradient(160deg, rgba(255, 122, 154, 0.3), rgba(255, 122, 154, 0.12));
  border-color: rgba(255, 122, 154, 0.4);
}

.tt__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-top: 16px;
  font-size: 12px;
  color: var(--tt-muted);
}

.tt__legend__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.tt__legend__item::before {
  content: '';
  width: 10px;
  height: 10px;
  border-radius: 999px;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
}

.tt__legend__item--english::before {
  background: var(--tt-blue);
}
.tt__legend__item--research::before {
  background: var(--tt-violet);
}
.tt__legend__item--activity::before {
  background: var(--tt-green);
}
.tt__legend__item--meeting::before {
  background: var(--tt-amber);
}
.tt__legend__item--classMeeting::before {
  background: var(--tt-rose);
}

.tt__legend__hint {
  margin-left: auto;
  opacity: 0.85;
}

/* 首页半宽：缩小字号与单元格 */
.tt--compact {
  height: 100%;
  margin-bottom: 0;
  padding: 18px 16px 14px;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
}

.tt--compact .tt__header {
  margin-bottom: 10px;
  gap: 10px;
}

.tt--compact .tt__title {
  font-size: 20px;
}

.tt--compact .tt__eyebrow {
  font-size: 10px;
  margin-bottom: 2px;
}

.tt--compact .tt__sub {
  margin-top: 4px;
  font-size: 11px;
}

.tt--compact .tt__today-badge {
  padding: 6px 10px;
  font-size: 11px;
}

.tt--compact .tt__board {
  flex: 1;
  padding: 8px;
  border-radius: 14px;
}

.tt--compact .tt__grid {
  grid-template-columns: 40px repeat(5, minmax(0, 1fr));
  gap: 5px;
  min-width: 0;
}

.tt--compact .tt__corner,
.tt--compact .tt__day {
  min-height: 32px;
}

.tt--compact .tt__day {
  font-size: 11px;
  border-radius: 999px;
  gap: 1px;
}

.tt--compact .tt__day__tag {
  font-size: 9px;
}

.tt--compact .tt__period,
.tt--compact .tt-cell {
  min-height: 44px;
  border-radius: 12px;
  padding: 4px 2px;
  gap: 2px;
}

.tt--compact .tt__period__n {
  font-size: 13px;
}

.tt--compact .tt__period__slot {
  font-size: 9px;
}

.tt--compact .tt-cell__klass {
  font-size: 12px;
  padding: 1px 6px;
}

.tt--compact .tt-cell__subject {
  font-size: 10px;
  font-weight: 700;
  opacity: 0.9;
}

.tt--compact .tt__legend {
  margin-top: 10px;
  gap: 6px 10px;
  font-size: 10px;
}

.tt--compact .tt__glow--a,
.tt--compact .tt__glow--b {
  width: 120px;
  height: 120px;
  filter: blur(40px);
}
</style>
