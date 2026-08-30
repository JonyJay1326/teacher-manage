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
        <p class="tt__sub">周霏 · 9 月 1 日启用 · 今日 {{ todayLabel }}</p>
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
.tt {
  position: relative;
  overflow: hidden;
  margin-bottom: var(--cp-gap-6);
  padding: 28px 28px 22px;
  border-radius: 24px;
  color: #e8eefc;
  background:
    linear-gradient(145deg, rgba(15, 23, 42, 0.96) 0%, rgba(30, 27, 75, 0.94) 48%, rgba(15, 23, 42, 0.98) 100%);
  border: 1px solid rgba(125, 211, 252, 0.22);
  box-shadow:
    0 24px 48px rgba(15, 23, 42, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.tt__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(48px);
  pointer-events: none;
  z-index: 0;
}

.tt__glow--a {
  width: 280px;
  height: 280px;
  top: -80px;
  right: -40px;
  background: rgba(56, 189, 248, 0.35);
  animation: tt-float 8s ease-in-out infinite;
}

.tt__glow--b {
  width: 220px;
  height: 220px;
  bottom: -60px;
  left: 10%;
  background: rgba(167, 139, 250, 0.28);
  animation: tt-float 10s ease-in-out infinite reverse;
}

@keyframes tt-float {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-12px, 10px);
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
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(125, 211, 252, 0.85);
  font-weight: 600;
}

.tt__title {
  margin: 0;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0.02em;
  background: linear-gradient(90deg, #f8fafc 0%, #7dd3fc 55%, #c4b5fd 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.tt__sub {
  margin: 8px 0 0;
  font-size: 13px;
  color: rgba(203, 213, 225, 0.85);
}

.tt__today-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  background: linear-gradient(135deg, #fde68a 0%, #fb923c 100%);
  box-shadow: 0 8px 24px rgba(251, 146, 60, 0.35);
  flex-shrink: 0;
}

.tt__today-badge--off {
  color: #e2e8f0;
  background: rgba(148, 163, 184, 0.25);
  box-shadow: none;
}

.tt__today-badge__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.35);
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
  border-radius: 12px;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
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
  color: rgba(248, 250, 252, 0.7);
}

.tt__chip__sub {
  font-weight: 600;
  opacity: 0.9;
  font-size: 12px;
}

.tt__chip__klass {
  font-weight: 800;
  font-size: 13px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  letter-spacing: 0.02em;
}

.tt__chip--english {
  border-color: rgba(96, 165, 250, 0.45);
  color: #93c5fd;
}
.tt__chip--research {
  border-color: rgba(167, 139, 250, 0.45);
  color: #c4b5fd;
}
.tt__chip--activity {
  border-color: rgba(52, 211, 153, 0.45);
  color: #6ee7b7;
}
.tt__chip--meeting {
  border-color: rgba(251, 146, 60, 0.45);
  color: #fdba74;
}
.tt__chip--classMeeting {
  border-color: rgba(244, 114, 182, 0.45);
  color: #f9a8d4;
}

.tt__board {
  overflow-x: auto;
  border-radius: 18px;
  background: rgba(2, 6, 23, 0.35);
  border: 1px solid rgba(148, 163, 184, 0.18);
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
  border-radius: 12px;
  color: rgba(226, 232, 240, 0.75);
  font-weight: 700;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.03);
}

.tt__day--today {
  color: #0f172a;
  background: linear-gradient(135deg, #fde68a, #fb923c);
  box-shadow: 0 0 0 1px rgba(253, 224, 71, 0.5), 0 10px 28px rgba(251, 146, 60, 0.4);
  animation: tt-day-glow 2.4s ease-in-out infinite;
}

@keyframes tt-day-glow {
  0%,
  100% {
    box-shadow: 0 0 0 1px rgba(253, 224, 71, 0.5), 0 10px 28px rgba(251, 146, 60, 0.35);
  }
  50% {
    box-shadow: 0 0 0 2px rgba(253, 224, 71, 0.85), 0 12px 32px rgba(251, 146, 60, 0.55);
  }
}

.tt__day__tag {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.tt__period {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 64px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.tt__period--break {
  margin-top: 4px;
}

.tt__period__n {
  font-size: 16px;
  font-weight: 800;
  color: #f8fafc;
}

.tt__period__slot {
  font-size: 10px;
  color: rgba(148, 163, 184, 0.9);
}

.tt-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 64px;
  padding: 8px 6px;
  border-radius: 14px;
  text-align: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  border: 1px solid transparent;
}

.tt-cell:not(.tt-cell--empty):hover {
  transform: translateY(-2px) scale(1.02);
}

.tt-cell--empty {
  background: rgba(255, 255, 255, 0.02);
  border: 1px dashed rgba(148, 163, 184, 0.18);
}

.tt-cell--col-today:not(.tt-cell--empty) {
  box-shadow: 0 0 0 1px rgba(253, 224, 71, 0.55), 0 8px 20px rgba(251, 146, 60, 0.25);
}

.tt-cell--col-today.tt-cell--empty {
  background: rgba(251, 146, 60, 0.08);
  border-color: rgba(251, 146, 60, 0.25);
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
  background: rgba(255, 255, 255, 0.22);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
}

.tt-cell__subject {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  opacity: 0.88;
}

.tt-cell--english {
  color: #dbeafe;
  background: linear-gradient(160deg, rgba(37, 99, 235, 0.55), rgba(14, 165, 233, 0.35));
  border-color: rgba(96, 165, 250, 0.45);
}

.tt-cell--research {
  color: #ede9fe;
  background: linear-gradient(160deg, rgba(109, 40, 217, 0.5), rgba(167, 139, 250, 0.28));
  border-color: rgba(167, 139, 250, 0.4);
}

.tt-cell--activity {
  color: #d1fae5;
  background: linear-gradient(160deg, rgba(5, 150, 105, 0.5), rgba(52, 211, 153, 0.28));
  border-color: rgba(52, 211, 153, 0.4);
}

.tt-cell--meeting {
  color: #ffedd5;
  background: linear-gradient(160deg, rgba(234, 88, 12, 0.5), rgba(251, 146, 60, 0.28));
  border-color: rgba(251, 146, 60, 0.4);
}

.tt-cell--classMeeting {
  color: #fce7f3;
  background: linear-gradient(160deg, rgba(219, 39, 119, 0.48), rgba(244, 114, 182, 0.28));
  border-color: rgba(244, 114, 182, 0.4);
}

.tt__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-top: 16px;
  font-size: 12px;
  color: rgba(203, 213, 225, 0.8);
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
  border-radius: 3px;
}

.tt__legend__item--english::before {
  background: #3b82f6;
}
.tt__legend__item--research::before {
  background: #8b5cf6;
}
.tt__legend__item--activity::before {
  background: #10b981;
}
.tt__legend__item--meeting::before {
  background: #f97316;
}
.tt__legend__item--classMeeting::before {
  background: #ec4899;
}

.tt__legend__hint {
  margin-left: auto;
  opacity: 0.7;
}

/* 首页半宽：缩小字号与单元格，去掉过大留白 */
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
  border-radius: 8px;
  gap: 1px;
}

.tt--compact .tt__day__tag {
  font-size: 9px;
}

.tt--compact .tt__period,
.tt--compact .tt-cell {
  min-height: 44px;
  border-radius: 10px;
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
  font-weight: 600;
  opacity: 0.85;
}

.tt--compact .tt__legend {
  margin-top: 10px;
  gap: 6px 10px;
  font-size: 10px;
}

.tt--compact .tt__glow--a,
.tt--compact .tt__glow--b {
  width: 140px;
  height: 140px;
  filter: blur(36px);
}
</style>
