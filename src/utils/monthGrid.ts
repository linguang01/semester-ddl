/**
 * 原生 JS 月历日期表计算（不依赖任何日历库）。
 * 全部用本地时区的 Date 构造，避免 UTC 偏移导致日期错位。
 */

export interface MonthCell {
  /** 当月内的日期；前后补位的空白格为 null */
  date: Date | null;
  /** 当月内的日号（1-31）；空白格为 0 */
  day: number;
  /** 是否属于当前显示的月份 */
  inMonth: boolean;
}

/** 一周 7 天 */
const WEEK_LENGTH = 7;

/**
 * 计算某年某月的日历网格（周一为一周第一天）。
 * @param year  年份，如 2026
 * @param month 月份，0-based（0 = 1 月）
 * @returns 长度固定为 7 的倍数的格子数组，含前置/后置空白格
 */
export function buildMonthGrid(year: number, month: number): MonthCell[] {
  // 当月 1 号是星期几；getDay() 返回 0=周日，换算成「周一=0」的偏移
  const firstDay = new Date(year, month, 1);
  const leadingBlanks = (firstDay.getDay() + WEEK_LENGTH - 1) % WEEK_LENGTH;

  // 当月天数：构造「下月 1 号」再回退一天，自动处理大小月与闰年
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: MonthCell[] = [];

  // 前置空白格
  for (let i = 0; i < leadingBlanks; i += 1) {
    cells.push({ date: null, day: 0, inMonth: false });
  }

  // 当月格子：用本地时区构造当天 0 点，读取年月日时才不会错位
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: new Date(year, month, day), day, inMonth: true });
  }

  // 尾部补空白，保证整行（7 的倍数）
  while (cells.length % WEEK_LENGTH !== 0) {
    cells.push({ date: null, day: 0, inMonth: false });
  }

  return cells;
}

/** Date → 本地时区的 YYYY-MM-DD 键（与 date.ts 的 todayKey 格式一致） */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
