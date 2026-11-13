import type { SubTask } from '../types';

export const MAX_SUBTASKS = 100;

/** 统一清洗本地、备份和云端子任务，限制数量并过滤不可信结构。 */
export function normalizeSubTasks(value: unknown): SubTask[] {
  if (!Array.isArray(value)) return [];

  const result: SubTask[] = [];
  for (const item of value.slice(0, MAX_SUBTASKS)) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.title !== 'string') continue;

    const title = raw.title.trim();
    if (!title) continue;
    result.push({ title, isCompleted: raw.isCompleted === true });
  }
  return result;
}
