import dayjs, { type Dayjs } from 'dayjs';
import type { Task, TaskType } from '../types';

/** 保留 1 位小数，避免 0.1 + 0.2 之类的浮点噪声 */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface DayCount {
  /** 形如 10/28 */
  label: string;
  count: number;
}

/**
 * 近 7 天（含今天）每天完成的任务数量。
 * 按 completedAt 落到本地自然日统计；未完成或缺 completedAt 的任务不计入。
 */
export function completedLast7Days(tasks: Task[], now: Dayjs = dayjs()): DayCount[] {
  const start = now.startOf('day').subtract(6, 'day');

  const days: DayCount[] = [];
  for (let i = 0; i < 7; i++) {
    days.push({ label: start.add(i, 'day').format('M/D'), count: 0 });
  }

  for (const task of tasks) {
    if (task.status !== 'done' || !task.completedAt) continue;
    const completed = dayjs(task.completedAt);
    if (!completed.isValid()) continue;
    const index = completed.startOf('day').diff(start, 'day');
    if (index >= 0 && index < 7) {
      days[index].count += 1;
    }
  }

  return days;
}

export interface TypeCount {
  type: TaskType;
  count: number;
}

/** 各类任务占比：统计全部任务（含待办与已完成） */
export function typeDistribution(tasks: Task[]): TypeCount[] {
  const counts: Record<TaskType, number> = { homework: 0, exam: 0, club: 0, other: 0 };
  for (const task of tasks) {
    counts[task.type] += 1;
  }
  return (Object.keys(counts) as TaskType[]).map((type) => ({ type, count: counts[type] }));
}

export interface WeekHours {
  /** 周一到周日 */
  labels: string[];
  estimated: number[];
  actual: number[];
  totalEstimated: number;
  totalActual: number;
  /** 本周已完成任务数（耗时统计的对象） */
  doneCount: number;
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/**
 * 本周（周一到周日）已完成任务的「预计耗时 vs 实际耗时」。
 * 按 completedAt 分日汇总；actualHours 未填按 0 计。
 */
export function hoursThisWeek(tasks: Task[], now: Dayjs = dayjs()): WeekHours {
  // dayjs 的 day()：周日 = 0，周一 = 1；换算出本周一
  const weekStart = now.startOf('day').subtract((now.day() + 6) % 7, 'day');

  const estimated = Array.from({ length: 7 }, () => 0);
  const actual = Array.from({ length: 7 }, () => 0);
  let doneCount = 0;

  for (const task of tasks) {
    if (task.status !== 'done' || !task.completedAt) continue;
    const completed = dayjs(task.completedAt);
    if (!completed.isValid()) continue;
    const index = completed.startOf('day').diff(weekStart, 'day');
    if (index < 0 || index > 6) continue;
    estimated[index] += task.estimatedHours;
    actual[index] += task.actualHours ?? 0;
    doneCount += 1;
  }

  return {
    labels: WEEKDAY_LABELS,
    estimated: estimated.map(round1),
    actual: actual.map(round1),
    totalEstimated: round1(estimated.reduce((sum, v) => sum + v, 0)),
    totalActual: round1(actual.reduce((sum, v) => sum + v, 0)),
    doneCount,
  };
}
