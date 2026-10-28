import type { TaskPriority, TaskType } from '../types';
import { parseQuickAdd } from './parseQuickAdd';

/**
 * 智能录入解析：一句话 → 填满整个表单。
 *
 * 在已有 parseQuickAdd（日期/时间/标题）的基础上，继续抽取：
 *   - 预计耗时：预计2小时 / 复习3个小时 / 1.5小时 / 半小时 / 一个半小时
 *   - 优先级：高优先级 / 优先级高 / 紧急 / 加急 / 中优先级 / 低优先级 …
 *   - 课程：标题里的「XXX作业/考试/实验…」前缀，或显式「课程：高等数学」
 *   - 类型：考试/测验 → exam；社团/活动 → club；其余默认 homework
 *
 * 纯正则 + dayjs，无网络、无 API、零延迟，与项目「本地优先」一致。
 */

export interface SmartParseResult {
  /** 去掉日期/时间/耗时/优先级片段后的任务名 */
  title: string;
  /** 课程 / 归属（未识别则为空串） */
  course: string;
  /** 解析出的截止时间 */
  deadline: Date;
  /** 预计耗时（小时），未识别时默认 1 */
  estimatedHours: number;
  /** 优先级，未识别时默认 medium */
  priority: TaskPriority;
  /** 类型，未识别时默认 homework */
  type: TaskType;
  hasDate: boolean;
  hasTime: boolean;
  hasHours: boolean;
  hasPriority: boolean;
  hasCourse: boolean;
}

/** 中文数字 / 阿拉伯数字 → 数字（0~99），非法返回 null */
function cn2num(text: string): number | null {
  const s = text.trim();
  if (/^\d{1,2}$/.test(s)) return Number(s);

  const CN: Record<string, number> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
    五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  if (/^[零〇一二两三四五六七八九十]$/.test(s)) return CN[s];
  if (/^十[一二三四五六七八九]$/.test(s)) return 10 + CN[s[1]];
  if (/^[二三四五六七八九]十$/.test(s)) return CN[s[0]] * 10;
  if (/^[二三四五六七八九]十[一二三四五六七八九]$/.test(s)) return CN[s[0]] * 10 + CN[s[2]];
  return null;
}

interface Found<T> {
  value: T;
  /** 命中的原始片段，用于从标题里剔除 */
  raw: string;
}

// 耗时前缀：可选，兼容「预计2小时」「复习三个小时」「约两个小时」等口语
const HOUR_PREFIX = '(?:预计|计划|估计|大约|大概|约|需要|要花|耗时|用时|花|共|复习|准备)?';

/** 从剩余文本里抽「预计耗时」，返回小时数 + 命中的原文 */
function extractHours(text: string): Found<number> | null {
  // 1) 阿拉伯数字（可含小数）：2小时 / 1.5 小时 / 2h / 2个钟
  let m = text.match(
    new RegExp(`${HOUR_PREFIX}\\s*(\\d+(?:\\.\\d+)?)\\s*个?\\s*(?:小时|钟头|个钟|h)`, 'i'),
  );
  if (m) {
    const v = Number(m[1]);
    if (v > 0 && v <= 100) return { value: v, raw: m[0] };
  }

  // 2) 「X 个半小时」：一个半小时 = 1.5（先于「半小时」匹配，避免被截断）
  m = text.match(new RegExp(`${HOUR_PREFIX}\\s*([零〇一二两三四五六七八九十]+)\\s*个?半\\s*小时`));
  if (m) {
    const n = cn2num(m[1]);
    if (n !== null && n + 0.5 <= 100) return { value: n + 0.5, raw: m[0] };
  }

  // 3) 「半小时」= 0.5
  m = text.match(/(?:大约|大概|约)?\s*半\s*个?\s*小时/);
  if (m) return { value: 0.5, raw: m[0] };

  // 4) 中文数字：两个小时 / 三个钟
  m = text.match(new RegExp(`${HOUR_PREFIX}\\s*([零〇一二两三四五六七八九十]+)\\s*个?\\s*(?:小时|钟头|个钟)`));
  if (m) {
    const n = cn2num(m[1]);
    if (n !== null && n > 0 && n <= 100) return { value: n, raw: m[0] };
  }

  return null;
}

/** 从剩余文本里抽「优先级」（多字词优先，避免「高数」里的「高」误判） */
function extractPriority(text: string): Found<TaskPriority> | null {
  let m = text.match(/(高优先级|优先级高|优先高|高优先|紧急|加急|很急|特急)/);
  if (m) return { value: 'high', raw: m[0] };

  m = text.match(/(中优先级|优先级中|中优先|普通优先级|一般优先级)/);
  if (m) return { value: 'medium', raw: m[0] };

  m = text.match(/(低优先级|优先级低|低优先|不着急|不急)/);
  if (m) return { value: 'low', raw: m[0] };

  return null;
}

/** 根据标题推断类型 */
function detectType(title: string): TaskType {
  if (/^考/.test(title) || /(考试|测验|期末|期中|答辩|考核)/.test(title)) return 'exam';
  if (/(社团|活动|例会|招新|比赛|竞赛)/.test(title)) return 'club';
  return 'homework';
}

/** 清理剩余文本：去首尾标点、折叠空格、去开头动作词/残留时段词 */
function cleanTitle(rest: string): string {
  let title = rest
    .replace(/^[\s，,、。；;：:]+/, '')
    .replace(/[\s，,、。；;：:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 去掉「周日晚交/早交」这类残留时段词（时段词后紧跟动作词）
  title = title
    .replace(/^(?:晚上|早上|早晨|上午|下午|中午|晚|早)(?=(?:提交|上交|交|考))/, '')
    .trim();

  // 去掉开头纯动作词「交/提交/上交」；(?=.{2,}) 要求后面至少还有 2 个字
  title = title.replace(/^(?:提交|上交|交)(?=.{2,})/, '').trim();

  // 去掉「截止/截至」：句首（下周三截止交X）或句尾（X下周三截止）都可能出现
  title = title.replace(/^(?:截止|截至)/, '').replace(/(?:截止|截至)$/, '').trim();

  return title;
}

/**
 * 解析一句话，返回可回填表单的完整结果。
 * @param input 例如「明天下午3点交高数作业，预计2小时，高优先级」
 * @param now 解析基准时间（默认当前时间），便于测试
 */
export function parseSmartInput(input: string, now: Date = new Date()): SmartParseResult {
  // 1) 日期/时间/基础标题：复用已有解析
  const quick = parseQuickAdd(input, now);

  // 2) 在剩余标题文本里依次抽「耗时」「优先级」，并从标题剔除
  let title = quick.title;
  let estimatedHours = 1;
  let priority: TaskPriority = 'medium';
  let hasHours = false;
  let hasPriority = false;

  const hours = extractHours(title);
  if (hours) {
    estimatedHours = hours.value;
    hasHours = true;
    title = title.replace(hours.raw, ' ');
  }

  const pri = extractPriority(title);
  if (pri) {
    priority = pri.value;
    hasPriority = true;
    title = title.replace(pri.raw, ' ');
  }

  // 3) 显式「课程：X」从标题剔除并记录（需冒号，避免把「课程设计」误判）
  let courseValue = '';
  const explicit = title.match(/(?:课程|科目)\s*[:：]\s*([^\s，,、。；;：:]{1,12})/);
  if (explicit) {
    courseValue = explicit[1].trim();
    title = title.replace(explicit[0], ' ');
  }

  // 4) 清理标题后，从标题抽「XXX作业/考试/…」前缀课程（课程保留在标题里）
  title = cleanTitle(title);

  if (!courseValue) {
    const suffix = title.match(/^(.{2,8}?)(作业|考试|实验|报告|论文|习题|测验|练习|复习|设计)$/);
    if (suffix && !/[交做写复习准备完成提交考]/.test(suffix[1])) {
      courseValue = suffix[1];
    }
  }

  const type = detectType(title);

  return {
    title,
    course: courseValue,
    deadline: quick.deadline,
    estimatedHours,
    priority,
    type,
    hasDate: quick.hasDate,
    hasTime: quick.hasTime,
    hasHours,
    hasPriority,
    hasCourse: courseValue !== '',
  };
}
