import { useCallback } from 'react';
import dayjs from 'dayjs';
import { db } from '../db/database';
import { useDbQuery } from './useDbQuery';
import type { NewTaskInput, SubTask, Task, TaskUpdate } from '../types';

export interface UseTasksResult {
  /** 全部任务，按 deadline 升序 */
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  addTask: (input: NewTaskInput) => Promise<Task>;
  updateTask: (id: string, patch: TaskUpdate) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTaskDone: (id: string) => Promise<void>;
  /** 更新子任务并联动任务完成状态（全勾完 → done，取消勾选 → todo） */
  updateSubTasks: (id: string, subTasks: SubTask[]) => Promise<void>;
}

function normalizeDeadline(value: string): string {
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    throw new Error(`无效的截止时间：${value}`);
  }
  return parsed.toISOString();
}

function normalizeTitle(value: string): string {
  const title = value.trim();
  if (!title) {
    throw new Error('任务标题不能为空');
  }
  return title;
}

/** 归一化子任务：去首尾空格、过滤空标题、强制 isCompleted 为布尔值 */
function normalizeSubTasks(value: SubTask[] | undefined): SubTask[] {
  return (value ?? [])
    .map((item) => ({ title: item.title.trim(), isCompleted: Boolean(item.isCompleted) }))
    .filter((item) => item.title.length > 0);
}

/**
 * 任务读写层。
 * tasks 通过 Dexie liveQuery 订阅，任何增删改都会自动推送给组件。
 */
export function useTasks(): UseTasksResult {
  const {
    value: tasks,
    loading,
    error,
  } = useDbQuery<Task[]>(() => db.tasks.orderBy('deadline').toArray(), [], []);

  const addTask = useCallback(async (input: NewTaskInput): Promise<Task> => {
    const task: Task = {
      id: crypto.randomUUID(),
      title: normalizeTitle(input.title),
      type: input.type,
      course: input.course.trim(),
      deadline: normalizeDeadline(input.deadline),
      estimatedHours: input.estimatedHours ?? 0,
      actualHours: input.actualHours,
      priority: input.priority ?? 'medium',
      status: 'todo',
      createdAt: new Date().toISOString(),
      subTasks: normalizeSubTasks(input.subTasks),
    };

    await db.tasks.add(task);
    return task;
  }, []);

  const updateTask = useCallback(async (id: string, patch: TaskUpdate): Promise<void> => {
    const changes: Partial<Task> = {};

    if (patch.title !== undefined) changes.title = normalizeTitle(patch.title);
    if (patch.course !== undefined) changes.course = patch.course.trim();
    if (patch.type !== undefined) changes.type = patch.type;
    if (patch.priority !== undefined) changes.priority = patch.priority;

    if (patch.estimatedHours !== undefined) {
      if (!Number.isFinite(patch.estimatedHours) || patch.estimatedHours < 0) {
        throw new Error('预计耗时必须是非负数字');
      }
      changes.estimatedHours = patch.estimatedHours;
    }

    if (patch.actualHours !== undefined) {
      if (!Number.isFinite(patch.actualHours) || patch.actualHours < 0) {
        throw new Error('实际耗时必须是非负数字');
      }
      changes.actualHours = patch.actualHours;
    }

    if (patch.deadline !== undefined) {
      changes.deadline = normalizeDeadline(patch.deadline);
    }

    if (patch.status !== undefined) {
      changes.status = patch.status;
      // status 变化时同步维护 completedAt；置空时 Dexie 会删除该字段
      changes.completedAt = patch.status === 'done' ? new Date().toISOString() : undefined;
    }

    if (patch.subTasks !== undefined) {
      changes.subTasks = normalizeSubTasks(patch.subTasks);
    }

    if (Object.keys(changes).length === 0) return;

    const updatedCount = await db.tasks.update(id, changes);
    if (updatedCount === 0) {
      throw new Error(`任务不存在：${id}`);
    }
  }, []);

  const deleteTask = useCallback(async (id: string): Promise<void> => {
    // 事务内同时删除任务 + 清理所有每日选择里的该 taskId
    await db.transaction('rw', db.tasks, db.dailySelections, async () => {
      await db.tasks.delete(id);

      const affectedSelections = await db.dailySelections.where('taskIds').equals(id).toArray();
      for (const selection of affectedSelections) {
        await db.dailySelections.put({
          date: selection.date,
          taskIds: selection.taskIds.filter((taskId) => taskId !== id),
        });
      }
    });
  }, []);

  const toggleTaskDone = useCallback(async (id: string): Promise<void> => {
    await db.transaction('rw', db.tasks, async () => {
      const task = await db.tasks.get(id);
      if (!task) {
        throw new Error(`任务不存在：${id}`);
      }

      const nextDone = task.status !== 'done';
      await db.tasks.update(id, {
        status: nextDone ? 'done' : 'todo',
        completedAt: nextDone ? new Date().toISOString() : undefined,
      });
    });
  }, []);

  const updateSubTasks = useCallback(async (id: string, subTasks: SubTask[]): Promise<void> => {
    const normalized = normalizeSubTasks(subTasks);

    await db.transaction('rw', db.tasks, async () => {
      const task = await db.tasks.get(id);
      if (!task) {
        throw new Error(`任务不存在：${id}`);
      }

      const changes: Partial<Task> = { subTasks: normalized };

      // 仅当仍存在子任务时才联动任务状态；删光子任务不改变任务本身的完成状态
      if (normalized.length > 0) {
        const allDone = normalized.every((item) => item.isCompleted);
        if (allDone && task.status !== 'done') {
          // 全部勾完 → 自动完成任务
          changes.status = 'done';
          changes.completedAt = new Date().toISOString();
        } else if (!allDone && task.status === 'done') {
          // 取消勾选导致不再全完成 → 回滚为待办
          changes.status = 'todo';
          changes.completedAt = undefined;
        }
      }

      await db.tasks.update(id, changes);
    });
  }, []);

  return { tasks, loading, error, addTask, updateTask, deleteTask, toggleTaskDone, updateSubTasks };
}
