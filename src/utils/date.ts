import dayjs from 'dayjs';

export const DATE_KEY_FORMAT = 'YYYY-MM-DD';

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
