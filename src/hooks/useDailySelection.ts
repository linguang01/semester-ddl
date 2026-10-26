import { useCallback } from 'react';
import { db } from '../db/database';
import { useDbQuery } from './useDbQuery';
import { isDateKey } from '../utils/date';
import type { DailySelection } from '../types';

/** 每日最多选中的任务数，硬性上限 */
export const MAX_DAILY_TASKS = 3;

/** 超过每日上限时抛出的可捕获错误，UI 可用 instanceof 判断 */
export class DailySelectionLimitError extends Error {
  readonly code = 'DAILY_SELECTION_LIMIT';
  readonly date: string;
  readonly taskId: string;
  readonly limit: number;

  constructor(date: string, taskId: string, limit: number) {
    super(`每天最多选择 ${limit} 件事，请先移除一件再添加。`);
    this.name = 'DailySelectionLimitError';
    this.date = date;
    this.taskId = taskId;
    this.limit = limit;
  }
}

export interface UseDailySelectionResult {
  /** 当前订阅的日期，YYYY-MM-DD */
  date: string;
  /** 该日期的选择记录；不存在时为 null */
  selection: DailySelection | null;
  /** 便捷字段：selection?.taskIds ?? [] */
  taskIds: string[];
  loading: boolean;
  error: Error | null;
  maxTasks: number;
  getSelection: (date: string) => Promise<DailySelection | null>;
  addToSelection: (date: string, taskId: string) => Promise<DailySelection>;
  removeFromSelection: (date: string, taskId: string) => Promise<void>;
  clearSelection: (date: string) => Promise<void>;
  /** 一键生成：用给定 id 列表整体覆盖某天的选择（去重、截断、过滤已删除/已完成） */
  replaceSelection: (date: string, taskIds: string[]) => Promise<void>;
}

function assertDateKey(date: string): void {
  if (!isDateKey(date)) {
    throw new Error(`日期必须是 YYYY-MM-DD 格式的真实日期：${date}`);
  }
}

/**
 * 每日三件事读写层。
 * 传入 activeDate 后，selection / taskIds 会通过 liveQuery 自动跟随数据库变化
 * （包括删除任务时的自动清理）。
 */
export function useDailySelection(activeDate: string): UseDailySelectionResult {
  const {
    value: selection,
    loading,
    error,
  } = useDbQuery<DailySelection | null>(
    () => db.dailySelections.get(activeDate).then((record) => record ?? null),
    [activeDate],
    null,
  );

  const getSelection = useCallback(async (date: string): Promise<DailySelection | null> => {
    assertDateKey(date);
    const record = await db.dailySelections.get(date);
    return record ?? null;
  }, []);

  const addToSelection = useCallback(
    async (date: string, taskId: string): Promise<DailySelection> => {
      assertDateKey(date);

      return db.transaction('rw', db.tasks, db.dailySelections, async () => {
        const task = await db.tasks.get(taskId);
        if (!task) {
          throw new Error(`任务不存在：${taskId}`);
        }

        // 已完成的事项不能进入今日三件事
        if (task.status === 'done') {
          throw new Error('已完成的事项不能加入今日三件事。');
        }

        const existing = await db.dailySelections.get(date);

        // 已在今日选择中：幂等返回，不占新名额
        if (existing && existing.taskIds.includes(taskId)) {
          return existing;
        }

        const currentIds = existing?.taskIds ?? [];
        if (currentIds.length >= MAX_DAILY_TASKS) {
          throw new DailySelectionLimitError(date, taskId, MAX_DAILY_TASKS);
        }

        const next: DailySelection = { date, taskIds: [...currentIds, taskId] };
        await db.dailySelections.put(next);
        return next;
      });
    },
    [],
  );

  const removeFromSelection = useCallback(async (date: string, taskId: string): Promise<void> => {
    assertDateKey(date);

    await db.transaction('rw', db.dailySelections, async () => {
      const existing = await db.dailySelections.get(date);
      if (!existing) return;

      const taskIds = existing.taskIds.filter((id) => id !== taskId);
      if (taskIds.length === existing.taskIds.length) return;

      await db.dailySelections.put({ date, taskIds });
    });
  }, []);

  const clearSelection = useCallback(async (date: string): Promise<void> => {
    assertDateKey(date);
    await db.dailySelections.delete(date);
  }, []);

  const replaceSelection = useCallback(async (date: string, taskIds: string[]): Promise<void> => {
    assertDateKey(date);

    // 去重并截断到每日上限，防止调用方传入重复或超量 id
    const ids = [...new Set(taskIds)].slice(0, MAX_DAILY_TASKS);

    await db.transaction('rw', db.tasks, db.dailySelections, async () => {
      // 防御：候选任务可能已被删除或标记完成，写库前再校验一遍，静默剔除无效项
      const fetched = await db.tasks.bulkGet(ids);
      const validIds = ids.filter((_id, index) => {
        const task = fetched[index];
        return task !== undefined && task.status === 'todo';
      });

      // 全部无效则清空当天选择
      if (validIds.length === 0) {
        await db.dailySelections.delete(date);
        return;
      }

      await db.dailySelections.put({ date, taskIds: validIds });
    });
  }, []);

  return {
    date: activeDate,
    selection,
    taskIds: selection?.taskIds ?? [],
    loading,
    error,
    maxTasks: MAX_DAILY_TASKS,
    getSelection,
    addToSelection,
    removeFromSelection,
    clearSelection,
    replaceSelection,
  };
}
