import dayjs from 'dayjs';
import { db } from '../db/database';
import type { Task } from '../types';
import { PRIORITY_LABEL, TYPE_LABEL } from './taskDisplay';

/**
 * iCalendar (RFC 5545) 导出。
 *
 * 设计要点：
 * 1. buildCalendar 是纯函数：入参 Task[]，出参 .ics 文本，不读写数据库、不碰 DOM。
 * 2. 读写 IndexedDB 与触发下载统一放在 exportTasksToCalendar 里，便于 UI 层调用与提示。
 * 3. 所有时间统一转成 UTC（Z 结尾），导入手机日历后会自动换算成本地时区显示。
 */

/** 单行最大字节数（续行首字符为一个空格，占 1 字节，故按 74 折行） */
const LINE_LIMIT = 74;

/** 默认提醒：DDL 前 2 小时（iCalendar 的 DURATION 格式，负值表示提前） */
const REMINDER_BEFORE = '-PT2H';

/** 事件默认时长：DDL 当刻前后各留一段，避免日历显示为零时长事件 */
const EVENT_DURATION_MS = 30 * 60 * 1000;

const encoder = new TextEncoder();

/** 字符串的 UTF-8 字节长度（中文占 3 字节，折行必须按字节算而非字符数） */
function byteLength(value: string): number {
  return encoder.encode(value).length;
}

/**
 * iCalendar 折行：超过 75 字节的行必须折成多行，续行以一个空格开头。
 * 逐字符累加字节数，保证不会在某个多字节 UTF-8 字符中间切断。
 */
function foldLine(line: string): string {
  if (byteLength(line) <= LINE_LIMIT) return line;

  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const ch of line) {
    const chBytes = byteLength(ch);
    if (currentBytes + chBytes > LINE_LIMIT) {
      parts.push(current);
      current = '';
      currentBytes = 0;
    }
    current += ch;
    currentBytes += chBytes;
  }
  if (current) parts.push(current);

  return parts.join('\r\n ');
}

/** 转义文本字段中的特殊字符（反斜杠、分号、逗号、换行） */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Date → iCalendar 的 UTC 时间格式：YYYYMMDDTHHMMSSZ */
function formatUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

/** 单条任务 → 一个 VEVENT 块（含 DTSTART + 提前 2 小时的 VALARM） */
function buildEvent(task: Task): string[] {
  const start = new Date(task.deadline);
  const end = new Date(start.getTime() + EVENT_DURATION_MS);
  const summary = task.title;

  // 描述信息：类型 / 优先级 / 课程，方便在日历里一眼看出归属
  const descriptionParts: string[] = [
    `类型：${TYPE_LABEL[task.type]}`,
    `优先级：${PRIORITY_LABEL[task.priority]}`,
  ];
  if (task.course) descriptionParts.push(`课程：${task.course}`);
  const description = descriptionParts.join(' · ');

  return [
    'BEGIN:VEVENT',
    // UID 用任务主键 + 域名后缀，保证全局唯一；重复导出不会产生重复事件
    `UID:${task.id}@ddl-3things`,
    `DTSTAMP:${formatUtc(new Date())}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`DDL 提醒：${summary}`)}`,
    `TRIGGER:${REMINDER_BEFORE}`,
    'END:VALARM',
    'END:VEVENT',
  ];
}

/** 纯函数：把任务数组拼成完整的 iCalendar 文本（CRLF 结尾） */
export function buildCalendar(tasks: Task[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DDL 3Things//学期 DDL 提醒//CN',
    'CALSCALE:GREGORIAN',
  ];

  for (const task of tasks) {
    lines.push(...buildEvent(task));
  }

  lines.push('END:VCALENDAR');

  // 逐行转义/折行，行尾统一 CRLF
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** 通过 Blob + Object URL 触发浏览器下载，全部在客户端完成 */
function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();

  // 延迟释放，避免部分浏览器还没来得及开始下载
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 读取 IndexedDB 全部任务，生成 .ics 并触发下载。
 * 返回任务条数，供 UI 提示。
 */
export async function exportTasksToCalendar(): Promise<number> {
  const tasks = await db.tasks.orderBy('deadline').toArray();
  if (tasks.length === 0) {
    throw new Error('没有可导出的任务');
  }

  downloadIcs(
    `ddl-日历提醒-${dayjs().format('YYYY-MM-DD-HHmm')}.ics`,
    buildCalendar(tasks),
  );
  return tasks.length;
}
