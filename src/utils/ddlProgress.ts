import dayjs from 'dayjs';
import type { Task } from '../types';

/** 旧数据缺 createdAt 时，兜底为「DDL 前 7 天」 */
const FALLBACK_LEAD_DAYS = 7;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** 紧急阈值：剩余百分比 <= 18% 触发变红 */
const URGENT_PERCENT = 18;
/** 紧急阈值：剩余毫秒差 <= 24 小时触发变红（同时是「切小时」精准模式的切换点） */
const URGENT_REMAIN_MS = 24 * HOUR_MS;

export interface DdlProgress {
  /** 兜底后的发布时间（ISO 字符串） */
  createdAt: string;
  /** 剩余自然日：DDL 当天 = 0，逾期为负数（日期相减口径） */
  remainDays: number;
  /** 总自然日：发布到 DDL 的自然日数（日期相减口径） */
  totalDays: number;
  /** 剩余毫秒差，可为负（逾期） */
  remainMs: number;
  /** 总毫秒差 */
  totalMs: number;
  /** 剩余百分比 [0, 100]，用于紧急判断 */
  remainPercent: number;
  /** 已消耗百分比（进度条宽度）[0, 100] */
  percent: number;
  /** 是否已过 DDL 时刻（与任务是否完成无关） */
  overdue: boolean;
  /** 是否紧急（红）：未逾期且（剩余 ≤18% 或 ≤24h） */
  urgent: boolean;
}

/** 把数值夹在 [min, max] 区间，防止越界 */
function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
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

/**
 * 剩余文案（智能切换，按优先级）：
 * 1. 逾期（remainMs < 0）：
 *    - 逾期 < 24h  →「已逾期 Z 小时」（毫秒差 ceil）
 *    - 逾期 >= 24h →「已逾期 X 天」（自然日口径）
 * 2. 精准模式（未逾期且毫秒差 <= 24h）→「还剩 Z 小时」（毫秒差 ceil）
 * 3. 默认 →「还剩 X 天 / 共 Y 天」（自然日口径）
 *
 * 注意：天/小时切换一律以「毫秒差」判断，但天数数值用「自然日」口径，
 * 避免 Math.ceil(毫秒差/天) 把「剩 1 天零 1 小时」向上取整成 2 天。
 */
export function getRemainText(p: DdlProgress): string {
  if (p.overdue) {
    const over = -p.remainMs;
    if (over < DAY_MS) {
      return `已逾期 ${Math.ceil(over / HOUR_MS)} 小时`;
    }
    return `已逾期 ${Math.abs(p.remainDays)} 天`;
  }

  if (p.remainMs <= URGENT_REMAIN_MS) {
    return `还剩 ${Math.ceil(p.remainMs / HOUR_MS)} 小时`;
  }

  const totalDays = Math.max(1, p.totalDays); // 兜底避免「共 0 天」
  return `还剩 ${p.remainDays} 天 / 共 ${totalDays} 天`;
}

/**
 * 计算发布时间 + 剩余天数 + 进度百分比。
 *
 * 口径统一（关键）：
 * - 「天」用自然日口径：两个时刻各自对齐到本地当天 00:00 后求整日差，
 *   消除时分秒、夏令时、浮点误差造成的 ±1 天偏差。
 * - 「切小时 / 紧急」用毫秒差口径：remainMs <= 24h 时强制切到小时精度。
 * - 进度条宽度 = 已消耗占比 = (now - createdAt) / (deadline - createdAt)，
 *   连续量直接相除，clamp 到 [0, 100]；totalMs <= 0 时按 0 处理（除零防护）。
 */
export function calcDdlProgress(task: Task, now: Date = new Date()): DdlProgress {
  const createdAt = resolveCreatedAt(task);
  const createdAtMs = dayjs(createdAt).valueOf();
  const deadlineMs = dayjs(task.deadline).valueOf();
  const nowMs = now.getTime();

  // 自然日：各自对齐到本地 00:00 后求整日差
  const remainDays = dayjs(deadlineMs).startOf('day').diff(dayjs(nowMs).startOf('day'), 'day');
  const totalDays = dayjs(deadlineMs).startOf('day').diff(dayjs(createdAtMs).startOf('day'), 'day');

  // 毫秒差：剩余可为负（逾期）
  const totalMs = deadlineMs - createdAtMs;
  const remainMs = deadlineMs - nowMs;

  // 剩余百分比（连续量），clamp 到 [0, 100]
  let remainPercent = 100;
  if (totalMs > 0) {
    remainPercent = clamp((remainMs / totalMs) * 100, 0, 100);
  }

  // 进度条宽度 = 已消耗占比；totalMs <= 0（异常数据）按 0 处理，避免除零与「一上来拉满」
  let percent = 0;
  if (totalMs > 0) {
    percent = clamp(((totalMs - remainMs) / totalMs) * 100, 0, 100);
  }

  const overdue = remainMs < 0;
  // 紧急 = 未逾期 且（剩余百分比 ≤18% 或 剩余 ≤24h）
  const urgent = !overdue && (remainPercent <= URGENT_PERCENT || remainMs <= URGENT_REMAIN_MS);

  return {
    createdAt,
    remainDays,
    totalDays,
    remainMs,
    totalMs,
    remainPercent,
    percent,
    overdue,
    urgent,
  };
}
