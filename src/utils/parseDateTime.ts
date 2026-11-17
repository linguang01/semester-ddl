import dayjs from 'dayjs';
import { atDefaultDeadline } from './date';

/**
 * 日期时间自然语言解析（第一层，纯正则 + dayjs，无 eval / new Function）。
 *
 * 目标：模仿滴答清单，让用户直接在标题框写一句话，同时填好「截止时间」和「任务名称」。
 * 完整的智能录入（含耗时/优先级/课程）见 parseTaskText.ts，在本文件基础上扩展。
 *
 * 支持的高频写法：
 * - 日期：今天 / 明天 / 后天 / 大后天 / 周末 / 周X / 星期X / 礼拜X
 *         下周三 / 下周（无星期 → 下周一）/ 3天后 / 5月20日 / 20号
 * - 时间：HH:MM、X点、X时、X点半、X点Y分（阿拉伯数字 + 中文数字均可），可带时段前缀
 * - 只说了时段（「周四中午前」「明天下午交」）：按时段代表时刻兜底，而不是直接落到默认值
 * - 「前 / 之前 / 以前 / 截止 / 截至」这类后缀跟着被删掉的片段一起吞掉，不残留进标题
 *
 * 兜底：没识别到日期 → 今天；没识别到时间 → 16:30（绝大多数 DDL 的截止时刻）。
 * 例如：「明天下午3点交高数作业」→ 明天 15:00，标题「高数作业」；
 *       「10月31号交大作业」 → 今年 10月31日（已过则明年）；
 *       「周四中午前交报告」 → 周四 12:00，标题「报告」。
 */

export interface DateTimeParseResult {
  /** 去掉日期/时间片段后的任务名称 */
  title: string;
  /** 解析出的截止时间（标准 Date 对象） */
  deadline: Date;
  /** 是否识别到了日期关键词 */
  hasDate: boolean;
  /** 是否识别到了具体时间（HH:MM / X点 / X时 / 或按时段推定） */
  hasTime: boolean;
}

// —— 时段 → 小时换算 ——
// 中午/下午：12 点以内的钟点 +12（下午3点 = 15:00）
const PM_PERIODS = ['中午', '下午'];
// 晚上/傍晚：12 点表示午夜 0 点（晚上12点 = 00:00）
const EVENING_PERIODS = ['晚上', '傍晚', '晚'];
// 凌晨/深夜/夜里/午夜：保持 24 小时制，12 点归零（深夜3点 = 03:00）
const EARLY_MORNING_PERIODS = ['凌晨', '深夜', '夜里', '午夜'];

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

/**
 * 只说了时段、没说钟点时的代表时刻。
 * 用户「周四中午前交报告」的真实意思是 12:00，不是默认的 16:30；
 * 「下午」仍取 16:30 —— 这本身就是绝大多数 DDL 的截止时刻，也是产品的默认值。
 */
const PERIOD_DEFAULT_TIME: Record<string, [number, number]> = {
  中午: [12, 0],
  下午: [16, 30],
  晚上: [23, 59],
  傍晚: [23, 59],
  晚: [23, 59],
  深夜: [23, 59],
  夜里: [23, 59],
  午夜: [23, 59],
  上午: [12, 0],
  早上: [12, 0],
  早晨: [12, 0],
  早: [12, 0],
  凌晨: [6, 0],
};

const CN_NUM_CHARS = '一二三四五六七八九十';
/** 数字片段：阿拉伯 1~2 位，或中文数字 1~3 个字（三 / 十二 / 二十三） */
const NUM_TOKEN = `(?:\\d{1,2}|[${CN_NUM_CHARS}]{1,3})`;

/**
 * 日期关键词，按「长词在前」排序：
 * - 「5月20日」必须在「20日」之前，否则月份会被丢掉（1月5日 → 12月5日 这类错月 bug）
 * - 「下周X」必须在「周X」之前，否则「下周一」会被截成「周一」而残留「下」
 * - 「大后天」必须在「后天」之前
 * - 「3天后」在「3日」之前，避免「3日后」被当成 3 号
 */
const DATE_RE = new RegExp(
  [
    `${NUM_TOKEN}\\s*月\\s*${NUM_TOKEN}\\s*[号日]?`, // 5月20日 / 12月5号 / 5月20
    '大后天',
    '后天',
    '明天',
    '今天',
    '周末',
    '下(?:星期|礼拜|周)[一二三四五六日天]', // 下周三
    '周[一二三四五六日天]',
    '星期[一二三四五六日天]',
    '礼拜[一二三四五六日天]',
    `${NUM_TOKEN}\\s*(?:天|日)\\s*(?:以后|之后|后)`, // 3天后 / 三天以后
    '下(?:星期|礼拜|周)', // 只说「下周」→ 下周一
    '\\d{1,2}\\s*[号日]', // 20号
  ].join('|'),
);

// 时段前缀（多字词在前，避免「晚上」被「晚」抢先截断）
const PERIOD = '上午|早上|早晨|凌晨|中午|下午|晚上|傍晚|深夜|夜里|午夜|早|晚';

// 时间形式1：HH:MM（冒号，阿拉伯数字），如「下午 3:30」「23:59」
const TIME_COLON_RE = new RegExp(`(${PERIOD})?\\s*(\\d{1,2})\\s*[:：]\\s*(\\d{1,2})`);

// 时间形式2：X点 / X时 / X点半 / X点Y分（阿拉伯或中文数字），如「下午3点」「三点半」「16时」
// 「时」后面不能紧跟「间」；「2小时」因为中间隔着「小」天然不会命中
const TIME_CLOCK_RE = new RegExp(
  `(${PERIOD})?\\s*(\\d{1,2}|[零〇一二两三四五六七八九十]{1,3})\\s*(?:点|时(?![间候]))(?:(半)|(\\d{1,2}|[零〇一二两三四五六七八九十]{1,3})\\s*分)?`,
);

/**
 * 只出现时段词（没有具体钟点）的情况。
 * 限定后面必须跟「前/之前/截止/交」或直接结束，避免把「下午茶」「晚餐」当成时间。
 */
const PERIOD_ONLY_RE = new RegExp(`(${PERIOD})\\s*(?:之前|以前|前|截止|截至|交|$)`);

/**
 * 时段出现在句首时（「下午答辩」「晚上组会」）后面往往直接跟任务名，
 * 没有「前/交」之类锚点，这里单独兜一层。只收双字时段词：
 * 单字「早/晚」在句首太容易是词的一部分（早读、晚报）。
 */
const PERIOD_LEADING_RE = /^\s*(上午|早上|早晨|凌晨|中午|下午|晚上|傍晚|深夜|夜里|午夜)/;

/** 时间片段后面的这些后缀没有语义价值，应随片段一起从标题里删掉 */
const SUFFIX_RE = /^\s*(?:之前|以前|前(?![端沿进期天年台提面往后])|截止|截至)/;

/** 中文数字 → 阿拉伯数字；非法/超范围输入返回 null。仅支持 0~99 内的常见写法。 */
function chineseToNumber(s: string | undefined): number | null {
  if (s === undefined) return null;
  const text = s.trim();

  // 阿拉伯数字：直接转
  if (/^\d{1,2}$/.test(text)) {
    return Number(text);
  }

  const CN: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };

  // 单个字：零~十
  if (/^[零〇一二两三四五六七八九十]$/.test(text)) return CN[text];

  // 十X：十一 ~ 十九
  if (/^十[一二三四五六七八九]$/.test(text)) return 10 + CN[text[1]];

  // X十：二十 / 三十 / ... / 九十
  if (/^[二三四五六七八九]十$/.test(text)) return CN[text[0]] * 10;

  // X十Y：二十一 ~ 九十九（如 二十三 = 23）
  if (/^[二三四五六七八九]十[一二三四五六七八九]$/.test(text)) {
    return CN[text[0]] * 10 + CN[text[2]];
  }

  return null;
}

/** 校验钟点/分钟是否合法，避免「25点」「3点70分」这类输入 */
function isValidHourMinute(hour: number, minute: number): boolean {
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

/**
 * 根据时段前缀把 12 小时制的钟点换算成 24 小时制。
 * 没有时段前缀时做一次常识修正：1~7 点几乎不可能是凌晨（DDL 极少在半夜交），
 * 按下午理解 —— 「3点半交」→ 15:30，而不是凌晨 03:30。
 */
function adjustHour(hour: number, period?: string): number {
  if (!period) return hour >= 1 && hour <= 7 ? hour + 12 : hour;
  if (PM_PERIODS.includes(period)) return hour < 12 ? hour + 12 : hour;
  if (EVENING_PERIODS.includes(period)) {
    return hour === 12 ? 0 : hour < 12 ? hour + 12 : hour;
  }
  if (EARLY_MORNING_PERIODS.includes(period)) return hour === 12 ? 0 : hour;
  return hour; // 上午/早上：保持原样
}

interface ResolvedTime {
  hour: number;
  minute: number;
  /** 原始匹配文本，用于从输入里剔除 */
  raw: string;
}

/** 从文本里抽出时间，优先识别 HH:MM，其次识别 X点 / X时（含中文数字） */
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
    const hour = chineseToNumber(clock[2]);
    if (hour === null) return null;
    // 「点半」= 30 分；「点Y分」= Y 分；只有「点」= 0 分
    const minute = clock[3] === '半' ? 30 : clock[4] !== undefined ? chineseToNumber(clock[4]) : 0;
    if (minute === null || !isValidHourMinute(hour, minute)) return null;
    return { hour: adjustHour(hour, clock[1]), minute, raw: clock[0] };
  }

  return null;
}

/** 只说了时段时，取该时段的代表时刻；没有时段词返回 null */
function resolvePeriodOnlyTime(text: string): ResolvedTime | null {
  const matched = text.match(PERIOD_ONLY_RE) ?? text.match(PERIOD_LEADING_RE);
  if (!matched) return null;

  const fallback = PERIOD_DEFAULT_TIME[matched[1]];
  if (!fallback) return null;

  return { hour: fallback[0], minute: fallback[1], raw: matched[0] };
}

/** 计算下一个指定星期几（含今天，若本周已过则顺延到下周） */
function nextWeekday(today: dayjs.Dayjs, weekday: number): dayjs.Dayjs {
  let d = today.day(weekday);
  if (d.isBefore(today)) d = d.add(7, 'day');
  return d;
}

/** 下一个自然周的周一（「下周三」「下周」共用同一套算法） */
function nextWeekStart(today: dayjs.Dayjs): dayjs.Dayjs {
  const daysSinceMonday = (today.day() + 6) % 7;
  return today.startOf('day').subtract(daysSinceMonday, 'day').add(7, 'day');
}

/** 根据日期关键词算出具体日期（today 为当天 00:00） */
function resolveDate(token: string, today: dayjs.Dayjs): dayjs.Dayjs | null {
  const text = token.trim();

  switch (text) {
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

  // 「5月20日」：年份不写，取今年；已过去则顺延到明年
  const monthDay = text.match(
    new RegExp(`^([\\d${CN_NUM_CHARS}]{1,3})\\s*月\\s*([\\d${CN_NUM_CHARS}]{1,3})\\s*[号日]?$`),
  );
  if (monthDay) {
    const month = chineseToNumber(monthDay[1]);
    const day = chineseToNumber(monthDay[2]);
    if (month === null || day === null) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    // dayjs 会把 2 月 31 日溢出成 3 月 3 日，必须校验回来，否则会给出一个不存在的日期
    const candidate = today
      .startOf('year')
      .month(month - 1)
      .date(day)
      .startOf('day');
    if (candidate.month() !== month - 1 || candidate.date() !== day) return null;

    return candidate.isBefore(today) ? candidate.add(1, 'year') : candidate;
  }

  // 「3天后」「三天以后」
  const daysLater = text.match(
    new RegExp(`^([\\d${CN_NUM_CHARS}]{1,3})\\s*(?:天|日)\\s*(?:以后|之后|后)$`),
  );
  if (daysLater) {
    const days = chineseToNumber(daysLater[1]);
    if (days === null || days < 0) return null;
    return today.add(days, 'day');
  }

  // 只说「下周」→ 下周一，比「识别不到、当成今天」合理得多
  if (/^下(?:周|星期|礼拜)$/.test(text)) return nextWeekStart(today);

  const weekday = text.match(/^(?:周|星期|礼拜)([一二三四五六日天])$/);
  if (weekday) return nextWeekday(today, WEEKDAY_MAP[weekday[1]]);

  // 「下周X」= 下一个自然周的周一作为起点，再加 0~6 天。
  const nextWeek = text.match(/^下(?:周|星期|礼拜)([一二三四五六日天])$/);
  if (nextWeek) return nextWeekStart(today).add((WEEKDAY_MAP[nextWeek[1]] + 6) % 7, 'day');

  const dayOfMonth = text.match(/^(\d{1,2})\s*[号日]$/);
  if (dayOfMonth) {
    const dayNum = Number(dayOfMonth[1]);

    // 当前月不存在该日（如 2 月 31 日）时继续找下一个合法月份。
    for (let offset = 0; offset <= 12; offset += 1) {
      const monthStart = today.add(offset, 'month').startOf('month');
      const candidate = monthStart.date(dayNum);
      if (candidate.month() !== monthStart.month() || candidate.date() !== dayNum) continue;
      if (candidate.isBefore(today)) continue;
      return candidate;
    }
    return null;
  }

  return null;
}

/**
 * 删除命中的片段，并顺手吞掉紧跟其后的「前 / 之前 / 截止」等后缀。
 * 不这么做的话，「下周三之前交报告」的标题会变成「之前交报告」。
 */
function removeWithSuffix(text: string, raw: string): string {
  const index = text.indexOf(raw);
  if (index === -1) return text;

  const after = text.slice(index + raw.length);
  const suffix = after.match(SUFFIX_RE);
  const consumed = suffix ? suffix[0].length : 0;

  return `${text.slice(0, index)} ${after.slice(consumed)}`;
}

/** 清理剩余文本：去标点、去开头动作词，得到任务名称 */
function cleanTitle(rest: string): string {
  let title = rest
    .replace(/^[\s，,、。；;：:]+/, '')
    .replace(/[\s，,、。；;：:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 去掉开头纯动作词「交/提交/上交」；(?=.{2,}) 要求后面至少还有 2 个字
  title = title.replace(/^(?:提交|上交|交)(?=.{2,})/, '').trim();

  return title;
}

/**
 * 解析一句话，返回 { title, deadline, hasDate, hasTime }。
 * @param input 用户输入的一句话，如「后天下午三点开会」
 * @param now 解析基准时间（默认当前时间），便于测试
 */
export function parseDateTime(input: string, now: Date = new Date()): DateTimeParseResult {
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
  // 默认今天 16:30，之后逐项覆盖
  let deadline = atDefaultDeadline(startOfToday);
  let rest = normalized;

  // 1) 解析日期：取第一个命中的关键词
  const dateMatch = normalized.match(DATE_RE);
  if (dateMatch) {
    const date = resolveDate(dateMatch[0], startOfToday);
    if (date) {
      hasDate = true;
      deadline = atDefaultDeadline(date);
      // 只有成功解析才从标题移除，避免「32号报告」丢掉关键信息。
      rest = removeWithSuffix(rest, dateMatch[0]);
    }
  }

  // 2) 解析时间：先找具体钟点，再退到「只说了时段」
  const time = resolveTime(rest) ?? resolvePeriodOnlyTime(rest);
  if (time) {
    hasTime = true;
    deadline = deadline.hour(time.hour).minute(time.minute).second(0).millisecond(0);
    rest = removeWithSuffix(rest, time.raw);
  }

  // 3) 剩余文本 → 任务名称
  const title = cleanTitle(rest);

  return { title, deadline: deadline.toDate(), hasDate, hasTime };
}
