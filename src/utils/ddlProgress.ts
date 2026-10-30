import dayjs from 'dayjs';
import type { Task } from '../types';

/** 旧数据缺 createdAt 时，兜底为「DDL 前 7 天」 */
const FALLBACK_LEAD_DAYS = 7;

export interface DdlProgress {
  /** 兜底后的发布时间（ISO 字符串） */
  createdAt: string;
  /** 剩余自然日：DDL 当天 = 0，逾期为负数 */
  remainDays: number;
  /** 总自然日：发布到 DDL 的自然日数 */
  totalDays: number;
  /** 时间进度百分比，已 clamp 到 [0, 100] */
  percent: number;
  /** 是否已过 DDL 时刻（与任务是否完成无关） */
  overdue: boolean;
}

/** 解析发布时间：缺失/非法时用 DDL - 7 天兜底，兼容旧数据 */
export function resolveCreatedAt(task: Task): string {
  if (task.createdAt && dayjs(task.createdAt).isValid()) {
    return task.createdAt;
  }
  return dayjs(task.deadline).subtract(FALLBACK_LEAD_DAYS, 'day').toISOString();
}

/** 发布：MM月DD日 */
export function formatPublishDate(iso: string): string {
  return dayjs(iso).format('M月D日');
}

/** 剩余天数文字：>=0 显示「还剩 X 天 / 共 Y 天」，<0 显示「已逾期 X 天」 */
export function getRemainText(remainDays: number, totalDays: number): string {
  if (remainDays < 0) {
    return `已逾期 ${Math.abs(remainDays)} 天`;
  }
  return `还剩 ${remainDays} 天 / 共 ${totalDays} 天`;
}

/**
 * 计算发布时间 + 剩余天数 + 进度百分比。
 *
 * 「天」的精度处理（核心，避免算错一天）：
 * - 天数用「自然日」口径：先把两个时刻各自对齐到本地当天 00:00，再用
 *   dayjs.diff('day') 取整日差。这样消除时分秒、夏令时、浮点误差造成的 ±1 天偏差。
 *   反例：现在 10:00、DDL 明天 09:00，用 (deadline - now)/86400000 整除会得到 0（错）；
 *   自然日算法得到 1（对，确实是「明天到期」）。
 * - 进度百分比用「毫秒差」的连续值：(now - createdAt) / (deadline - createdAt)，
 *   它是连续量，不需要「天」的整数精度，直接相除即可。
 */
export function calcDdlProgress(task: Task, now: Date = new Date()): DdlProgress {
  const createdAt = resolveCreatedAt(task);
  const createdAtMs = dayjs(createdAt).valueOf();
  const deadlineMs = dayjs(task.deadline).valueOf();
  const nowMs = now.getTime();

  // 自然日：各自对齐到本地 00:00 后求整日差
  const remainDays = dayjs(deadlineMs).startOf('day').diff(dayjs(nowMs).startOf('day'), 'day');
  const totalDays = dayjs(deadlineMs).startOf('day').diff(dayjs(createdAtMs).startOf('day'), 'day');

  // 时间进度百分比，clamp 到 [0, 100]；总时长为 0 时直接取 100%
  const totalMs = deadlineMs - createdAtMs;
  let percent = 100;
  if (totalMs > 0) {
    percent = ((nowMs - createdAtMs) / totalMs) * 100;
  }
  percent = Math.min(100, Math.max(0, percent));

  const overdue = nowMs > deadlineMs;

  return { createdAt, remainDays, totalDays, percent, overdue };
}
