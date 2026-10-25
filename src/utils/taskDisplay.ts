import dayjs from 'dayjs';
import type { Task, TaskPriority, TaskType } from '../types';

export const TASK_TYPES: TaskType[] = ['homework', 'exam', 'club', 'other'];

export const TASK_PRIORITIES: TaskPriority[] = ['high', 'medium', 'low'];

export const TYPE_LABEL: Record<TaskType, string> = {
  homework: '作业',
  exam: '考试',
  club: '社团',
  other: '其他',
};

export const TYPE_STYLE: Record<TaskType, string> = {
  homework: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
  exam: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  club: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  other: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export const PRIORITY_DOT: Record<TaskPriority, string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
};

/** 例如：10月27日 周二 23:59 */
export function formatDeadline(iso: string): string {
  return dayjs(iso).format('M月D日 ddd HH:mm');
}

/** 已过期：未完成且 DDL 早于当前时间 */
export function isOverdue(task: Task): boolean {
  return task.status === 'todo' && dayjs(task.deadline).isBefore(dayjs());
}
