import dayjs, { type Dayjs } from 'dayjs';

/**
 * 快速添加（Quick Add）自然语言解析。
 *
 * 目标：模仿滴答清单，让用户直接在标题框里写一句话，就能同时把「截止时间」和
 * 「任务名称」填好，省去手动去 DatePicker 里翻日期的步骤。
 *
 * 支持的高频写法：
 * - 日期：今天 / 明天 / 后天 / 大后天 / 周末 / 周X / 星期X / 礼拜X / X号 / X日
 * - 时间：HH:MM（如 23:59）、X点、X点半、X点Y分，可带时段前缀（上午/下午/晚上等）
 *
 * 未识别到日期 → 默认今天；未识别到时间 → 默认 23:59。
 * 例如：「明天下午3点交高数作业」→ 明天 15:00，标题「高数作业」。
 */

export interface QuickAddResult {
  /** 去掉日期/时间片段后的任务名称 */
  title: string;
  /** 解析出的截止时间（dayjs 对象） */
  deadline: Dayjs;
  /** 是否识别到了日期关键词 */
  hasDate: boolean;
  /** 是否识别到了具体时间（HH:MM 或 X点） */
  hasTime: boolean;
}

// —— 时段 → 小时换算的几类桶 ——
// 下午/晚上等：12 点以内的钟点要 +12（下午3点 = 15:00）
const PM_PERIODS = ['中午', '下午', '晚上', '傍晚', '深夜', '夜里', '晚'];
// 凌晨/午夜：12点 = 0点，其余钟点不变（凌晨3点 = 03:00）
const AM_PERIODS = ['凌晨', '午夜'];

// 星期映射：dayjs 的 day() 中 0=周日 ~ 6=周六
const WEEKDAY_MAP: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

// 日期关键词：按「长词在前」排序，避免「大后天」被「后天」抢先匹配。
// \d{1,2}\s*[号日] 用于识别「15号 / 3日」这类几号写法。
const DATE_RE =
  /(大后天|后天|明天|今天|周末|周[一二三四五六日天]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|\d{1,2}\s*[号日])/;

// 时间形式1：HH:MM（冒号，可带时段前缀），如「下午 3:30」「23:59」
// 注意时段前缀必须用 ? 设为可选，否则「23:59」这种不带前缀的写法匹配不到。
const TIME_COLON_RE =
  /(上午|早上|早晨|凌晨|中午|下午|晚上|傍晚|深夜|夜里|午夜|早|晚)?\s*(\d{1,2})\s*[:：]\s*(\d{1,2})/;

// 时间形式2：X点 / X点半 / X点Y分（可带时段前缀），如「下午3点」「3点半」「3点30分」
const TIME_CLOCK_RE =
  /(上午|早上|早晨|凌晨|中午|下午|晚上|傍晚|深夜|夜里|午夜|早|晚)?\s*(\d{1,2})\s*点(?:(半)|(\d{1,2})\s*分)?/;

/** 校验钟点/分钟是否合法，避免「25点」「3点70分」这类输入 */
function isValidHourMinute(hour: number, minute: number): boolean {
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

/** 根据时段前缀把 12 小时制的钟点换算成 24 小时制 */
function adjustHour(hour: number, period?: string): number {
  if (!period) return hour; // 无时段前缀：按 24 小时制原样（如「23:59」）
  if (PM_PERIODS.includes(period)) return hour < 12 ? hour + 12 : hour;
  if (AM_PERIODS.includes(period)) return hour === 12 ? 0 : hour;
  return hour; // 上午/早上：保持原样
}

interface ResolvedTime {
  hour: number;
  minute: number;
  /** 原始匹配文本，用于从输入里剔除 */
  raw: string;
}

/** 从文本里抽出时间，优先识别 HH:MM，其次识别 X点 */
function resolveTime(text: string): ResolvedTime | null {
  const colon = text.match(TIME_COLON_RE);
  if (colon) {
    const hour = Number(colon[2]);
    const minute = Number(colon[3]);
    if (isValidHourMinute(hour, minute)) {
      return { hour: adjustHour(hour, colon[1]), minute, raw: colon[0] };
    }
  }

  const clock = text.match(TIME_CLOCK_RE);
  if (clock) {
    const hour = Number(clock[2]);
    // 「点半」= 30 分；「点Y分」= Y 分；只有「点」= 0 分
    const minute = clock[3] === '半' ? 30 : clock[4] ? Number(clock[4]) : 0;
    if (isValidHourMinute(hour, minute)) {
      return { hour: adjustHour(hour, clock[1]), minute, raw: clock[0] };
    }
  }

  return null;
}

/** 计算下一个指定星期几（含今天，若本周已过则顺延到下周） */
function nextWeekday(today: Dayjs, weekday: number): Dayjs {
  let d = today.day(weekday);
  if (d.isBefore(today)) d = d.add(7, 'day');
  return d;
}

/** 根据日期关键词算出具体日期（today 为当天 00:00） */
function resolveDate(token: string, today: Dayjs): Dayjs | null {
  switch (token) {
    case '今天':
      return today;
    case '明天':
      return today.add(1, 'day');
    case '后天':
      return today.add(2, 'day');
    case '大后天':
      return today.add(3, 'day');
    case '周末':
      return nextWeekday(today, 6); // 默认周末 = 周六
  }

  const weekday = token.match(/^(?:周|星期|礼拜)([一二三四五六日天])$/);
  if (weekday) return nextWeekday(today, WEEKDAY_MAP[weekday[1]]);

  const dayOfMonth = token.match(/^(\d{1,2})\s*[号日]$/);
  if (dayOfMonth) {
    const dayNum = Number(dayOfMonth[1]);
    let d = today.date(dayNum);
    // dayjs 的 date() 会溢出（如 2 月 31 日会滚到 3 月），校验一次排除非法日期
    if (d.date() !== dayNum) return null;
    // 「几号」已过（含今天）就顺延到下个月
    if (d.isBefore(today)) d = d.add(1, 'month');
    return d;
  }

  return null;
}

/** 清理剩余文本：去标点、去开头动作词，得到任务名称 */
function cleanTitle(rest: string): string {
  let title = rest
    .replace(/^[\s，,、。；;：:]+/, '') // 去开头标点/空白
    .replace(/[\s，,、。；;：:]+$/, '') // 去结尾标点/空白
    .replace(/\s+/g, ' ') // 连续空白合并成一个空格
    .trim();

  // 去掉开头纯动作词「交/提交/上交」；(?=.{2,}) 要求后面至少还有 2 个字，
  // 避免把「交通」「交流」这类以「交」开头的词误伤（剥掉后只剩 1 个字就不剥）。
  title = title.replace(/^(?:提交|上交|交)(?=.{2,})/, '').trim();

  return title;
}

/**
 * 解析一句话，返回 { title, deadline, hasDate, hasTime }。
 * @param input 用户输入的一句话，如「明天下午3点交高数作业」
 * @param now 解析基准时间（默认当前时间），便于测试
 */
export function parseQuickAdd(input: string, now: Date = new Date()): QuickAddResult {
  const startOfToday = dayjs(now).startOf('day');

  // 归一化复合词：明晚→明天晚上，让日期和时段能分别被识别
  const normalized = input
    .replace(/大后早/g, '大后天早上')
    .replace(/后早/g, '后天早上')
    .replace(/明早/g, '明天早上')
    .replace(/今早/g, '今天早上')
    .replace(/大后晚/g, '大后天晚上')
    .replace(/后晚/g, '后天晚上')
    .replace(/明晚/g, '明天晚上')
    .replace(/今晚/g, '今天晚上');

  let hasDate = false;
  let hasTime = false;
  // 默认今天 23:59，之后逐项覆盖
  let deadline = startOfToday.hour(23).minute(59).second(0).millisecond(0);
  let rest = normalized;

  // 1) 解析日期：取第一个命中的关键词
  const dateMatch = normalized.match(DATE_RE);
  if (dateMatch) {
    const date = resolveDate(dateMatch[0], startOfToday);
    if (date) {
      hasDate = true;
      deadline = date.hour(23).minute(59).second(0).millisecond(0);
    }
    rest = rest.replace(dateMatch[0], ' ');
  }

  // 2) 解析时间：在剔除日期后的剩余文本里找
  const time = resolveTime(rest);
  if (time) {
    hasTime = true;
    deadline = deadline.hour(time.hour).minute(time.minute).second(0).millisecond(0);
    rest = rest.replace(time.raw, ' ');
  }

  // 3) 剩余文本 → 任务名称
  const title = cleanTitle(rest);

  return { title, deadline, hasDate, hasTime };
}
