import dayjs from 'dayjs';

export const DATE_KEY_FORMAT = 'YYYY-MM-DD';

/** datetime-local 输入框使用的格式 */
export const DATETIME_INPUT_FORMAT = 'YYYY-MM-DDTHH:mm';

/** 默认截止时刻：16:30（新增任务、快速解析的统一兜底时间） */
export const DEFAULT_DEADLINE_HOUR = 16;
export const DEFAULT_DEADLINE_MINUTE = 30;

/** 把某一天统一对齐到默认截止时刻 16:30:00.000 */
export function atDefaultDeadline(base: dayjs.Dayjs = dayjs()): dayjs.Dayjs {
  return base
    .hour(DEFAULT_DEADLINE_HOUR)
    .minute(DEFAULT_DEADLINE_MINUTE)
    .second(0)
    .millisecond(0);
}

/** 今天 + days 天的 16:30（快捷按钮与自定义天数共用同一套计算） */
export function deadlineAfterDays(days: number, from: dayjs.Dayjs = dayjs()): dayjs.Dayjs {
  return atDefaultDeadline(from.startOf('day').add(days, 'day'));
}

/**
 * 新增任务的默认截止时间：今天 16:30。
 * 打开表单时若今天 16:30 已过（比如 17:00 才建任务），顺延到明天 16:30，
 * 否则默认值本身就是过去时间，用户一保存就被「DDL 必须是未来时间」拦住。
 */
export function defaultNewTaskDeadline(now: dayjs.Dayjs = dayjs()): dayjs.Dayjs {
  const today = atDefaultDeadline(now);
  return today.isAfter(now) ? today : atDefaultDeadline(now.add(1, 'day'));
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 本地时区的今天，格式 YYYY-MM-DD */
export function todayKey(): string {
  return dayjs().format(DATE_KEY_FORMAT);
}

/**
 * 校验是否为真实存在的 YYYY-MM-DD 日期。
 * 既检查格式，也检查 dayjs 解析后是否被「归一化」（排除 2026-02-30 之类的非法日期）。
 */
export function isDateKey(value: string): boolean {
  return DATE_KEY_PATTERN.test(value) && dayjs(value).format(DATE_KEY_FORMAT) === value;
}
