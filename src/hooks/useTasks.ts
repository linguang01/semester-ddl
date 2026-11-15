import { useCallback } from 'react';
import dayjs from 'dayjs';
import { db, removeTaskIdsFromDailySelections } from '../db/database';
import { useDbQuery } from './useDbQuery';
import { queueTaskPush } from '../lib/sync';
import { normalizeSubTasks } from '../utils/subTasks';
import { MAX_TASK_HOURS, MIN_TASK_HOURS } from '../utils/taskLimits';
import { timestampMs } from '../utils/timestamp';
import type { NewTaskInput, SubTask, Task, TaskUpdate } from '../types';

/**
 * 保存时发现「打开表单之后，这条任务已被其他设备/标签页改过」。
 * 不自动覆盖：覆盖与否必须由用户决定，否则就是一次静默的数据丢失。
 */
export class TaskConflictError extends Error {
  readonly code = 'TASK_CONFLICT';
  /** 库里的最新版本，供 UI 说明冲突内容 */
  readonly latest: Task;

  constructor(latest: Task) {
    super('该事项已在其他设备被修改');
    this.name = 'TaskConflictError';
    this.latest = latest;
  }
}

export interface UseTasksResult {
  /** 全部任务（已过滤软删除墓碑），按 deadline 升序 */
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  addTask: (input: NewTaskInput) => Promise<Task>;
  /**
   * 更新任务。
   * @param expectedUpdatedAt 打开表单时看到的版本；传入后若库中已被改动，
   *        会抛 TaskConflictError 而不是静默覆盖（乐观并发校验）。
   */
  updateTask: (id: string, patch: TaskUpdate, expectedUpdatedAt?: string) => Promise<void>;
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

/**
 * 任务读写层。
 * tasks 通过 Dexie liveQuery 订阅，任何增删改都会自动推送给组件。
 * 每次写入都会：更新 updatedAt（多端同步的合并依据）→ 写本地 → 入队推送云端（未登录时静默跳过）。
 */
export function useTasks(): UseTasksResult {
  const {
    value: tasks,
    loading,
    error,
  } = useDbQuery<Task[]>(
    // 软删除的任务不进入 UI；orderBy 仍按 deadline，过滤在内存完成（数据量小）
    () =>
      db.tasks
        .orderBy('deadline')
        .toArray()
        .then((list) => list.filter((task) => !task.deleted)),
    [],
    [],
  );

  const addTask = useCallback(async (input: NewTaskInput): Promise<Task> => {
    const estimatedHours = input.estimatedHours ?? 0;
    if (
      !Number.isFinite(estimatedHours) ||
      estimatedHours < MIN_TASK_HOURS ||
      estimatedHours > MAX_TASK_HOURS
    ) {
      throw new Error(`预计耗时需在 ${MIN_TASK_HOURS}~${MAX_TASK_HOURS} 小时之间`);
    }

    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      title: normalizeTitle(input.title),
      type: input.type,
      course: input.course.trim(),
      deadline: normalizeDeadline(input.deadline),
      estimatedHours,
      actualHours: input.actualHours,
      priority: input.priority ?? 'medium',
      status: 'todo',
      createdAt: now,
      subTasks: normalizeSubTasks(input.subTasks),
      updatedAt: now,
    };

    await db.tasks.add(task);
    queueTaskPush(task);
    return task;
  }, []);

  const updateTask = useCallback(
    async (id: string, patch: TaskUpdate, expectedUpdatedAt?: string): Promise<void> => {
      const changes: Partial<Task> = {};

      if (patch.title !== undefined) changes.title = normalizeTitle(patch.title);
      if (patch.course !== undefined) changes.course = patch.course.trim();
      if (patch.type !== undefined) changes.type = patch.type;
      if (patch.priority !== undefined) changes.priority = patch.priority;

      if (patch.estimatedHours !== undefined) {
        // 更新路径原本只挡负数、没挡上限，和新增路径不一致：这里统一用同一组边界
        if (
          !Number.isFinite(patch.estimatedHours) ||
          patch.estimatedHours < MIN_TASK_HOURS ||
          patch.estimatedHours > MAX_TASK_HOURS
        ) {
          throw new Error(`预计耗时需在 ${MIN_TASK_HOURS}~${MAX_TASK_HOURS} 小时之间`);
        }
        changes.estimatedHours = patch.estimatedHours;
      }

      // 必须用 in 判断：undefined 表示用户明确清空，而不是“未提交该字段”。
      if ('actualHours' in patch) {
        if (
          patch.actualHours !== undefined &&
          (!Number.isFinite(patch.actualHours) ||
            patch.actualHours < MIN_TASK_HOURS ||
            patch.actualHours > MAX_TASK_HOURS)
        ) {
          throw new Error(`实际耗时需在 ${MIN_TASK_HOURS}~${MAX_TASK_HOURS} 小时之间`);
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

      changes.updatedAt = new Date().toISOString();

      // 乐观并发校验：读、比、写必须在同一事务里，否则中间还能被插队。
      // 不传 expectedUpdatedAt 表示调用方明确要覆盖（例如用户已确认）。
      const expectedMs = expectedUpdatedAt ? timestampMs(expectedUpdatedAt) : null;

      const fresh = await db.transaction('rw', db.tasks, async () => {
        const current = await db.tasks.get(id);
        if (!current) throw new Error(`任务不存在：${id}`);

        // 用毫秒比较而不是字符串：本地是 `...Z`，云端回传可能是 `+00:00`，
        // 直接比字符串会把「同一次修改」误判成冲突。
        if (expectedMs !== null && expectedMs !== timestampMs(current.updatedAt)) {
          throw new TaskConflictError(current);
        }

        await db.tasks.update(id, changes);
        return db.tasks.get(id);
      });
      if (fresh) queueTaskPush(fresh);
    },
    [],
  );

  const deleteTask = useCallback(async (id: string): Promise<void> => {
    // 软删除：打墓碑 + 更新 updatedAt，让删除操作能同步到其他设备；
    // 同一事务内同时清理所有每日选择里的该 taskId
    const tombstone: Partial<Task> = { deleted: true, updatedAt: new Date().toISOString() };

    await db.transaction('rw', db.tasks, db.dailySelections, async () => {
      const updatedCount = await db.tasks.update(id, tombstone);
      if (updatedCount === 0) {
        throw new Error(`任务不存在：${id}`);
      }

      await removeTaskIdsFromDailySelections([id]);
    });

    const fresh = await db.tasks.get(id);
    if (fresh) queueTaskPush(fresh);
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
        updatedAt: new Date().toISOString(),
      });
    });

    const fresh = await db.tasks.get(id);
    if (fresh) queueTaskPush(fresh);
  }, []);

  const updateSubTasks = useCallback(async (id: string, subTasks: SubTask[]): Promise<void> => {
    const normalized = normalizeSubTasks(subTasks);

    await db.transaction('rw', db.tasks, async () => {
      const task = await db.tasks.get(id);
      if (!task) {
        throw new Error(`任务不存在：${id}`);
      }

      const changes: Partial<Task> = { subTasks: normalized, updatedAt: new Date().toISOString() };

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

    const fresh = await db.tasks.get(id);
    if (fresh) queueTaskPush(fresh);
  }, []);

  return { tasks, loading, error, addTask, updateTask, deleteTask, toggleTaskDone, updateSubTasks };
}
