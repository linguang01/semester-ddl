import dayjs from 'dayjs';
import type { Task } from '../types';

/** 优先级权重：数值越小越靠前（high=0 < medium=1 < low=2） */
const PRIORITY_RANK: Record<Task['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * 剩余时间（毫秒）。已过期时为负值。
 * 单独拆出，方便统一传入「现在」这一基准，保证过滤与排序用同一时间点、可测试。
 */
function remainingMs(deadline: string, now: dayjs.Dayjs): number {
  return dayjs(deadline).valueOf() - now.valueOf();
}

/**
 * 把剩余时间「分桶」，用于实现「剩余时间差不多时再按优先级」。
 * 落在同一桶内的任务视为“差不多”，交由后续排序键（优先级、耗时）决定顺序。
 *
 * 为什么必须分桶而不是「差值 < 阈值就比优先级」：
 * 后者（Math.abs(msDiff) < threshold ? 比priority : 比ms）不是合法比较器，
 * 不满足传递性，会导致 sort 结果错乱。分桶才能保证排序稳定、可预期。
 *
 * 阈值是经验值，可按需调整。
 */
function deadlineBucket(ms: number): number {
  if (ms <= 0) return 0; // 已过期 / 今天时刻已过（仍保留，见 isCandidate）
  if (ms <= DAY_MS) return 1; // 24 小时内
  if (ms <= 3 * DAY_MS) return 2; // 3 天内
  if (ms <= 7 * DAY_MS) return 3; // 7 天内
  return 4; // 更远
}

/**
 * 是否可作为「今日三件事」候选：
 * 1) 状态必须是 todo；
 * 2) 未过期（deadline 还没到），或 deadline 日期就是今天。
 *    ——「包含今天」：哪怕今天的某个时刻已过，也仍保留（如补录的今日任务）。
 */
function isCandidate(task: Task, now: dayjs.Dayjs): boolean {
  if (task.status !== 'todo') return false;
  const dl = dayjs(task.deadline);
  const notExpired = !dl.isBefore(now); // deadline 未到
  const isToday = dl.isSame(now, 'day'); // deadline 落在今天
  return notExpired || isToday;
}

/**
 * 智能筛选出最多 limit 个任务的 id。
 *
 * 排序优先级（从高到低）：
 * 1. deadline 分桶 —— 离截止越近越优先；
 * 2. priority —— 同桶内 high > medium > low；
 * 3. estimatedHours —— 同桶同优先级时，越小（越快做完）越优先，用于补齐名额；
 *    盲点修复：estimatedHours 为 0 表示“未填写”，不能当成“0 小时最快”，
 *    因此把 0 视为“未知”，排在所有已知耗时之后。
 * 4. 精确剩余时间 —— 兜底，保证同分下结果确定、稳定。
 */
export function autoSelectTasks(
  tasks: Task[],
  limit: number,
  now: Date = new Date(),
): string[] {
  const nowDayjs = dayjs(now);

  // 把未知耗时（0）映射成极大值，让它们排在“已知耗时”后面
  const effectiveHours = (task: Task): number =>
    task.estimatedHours > 0 ? task.estimatedHours : Number.MAX_SAFE_INTEGER;

  return tasks
    .filter((task) => isCandidate(task, nowDayjs))
    .sort((a, b) => {
      const aMs = remainingMs(a.deadline, nowDayjs);
      const bMs = remainingMs(b.deadline, nowDayjs);

      // 1) deadline 分桶：越近越靠前
      const bucketDiff = deadlineBucket(aMs) - deadlineBucket(bMs);
      if (bucketDiff !== 0) return bucketDiff;

      // 2) 优先级：high < medium < low
      const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // 3) 预计耗时：越快越靠前（未知耗时排最后）
      const hoursDiff = effectiveHours(a) - effectiveHours(b);
      if (hoursDiff !== 0) return hoursDiff;

      // 4) 精确剩余时间兜底，保证稳定排序
      return aMs - bMs;
    })
    .slice(0, limit)
    .map((task) => task.id);
}
