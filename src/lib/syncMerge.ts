import type { Task } from '../types';
import { timestampMs } from '../utils/timestamp';
import { normalizeSubTasks } from '../utils/subTasks';
import type { TasksRow } from './database.types';

export interface SyncMergePlan {
  /** 远端更新、需要写入本地 IndexedDB 的行 */
  remoteWrites: TasksRow[];
  /** 本地更新、需要推送至 Supabase 的任务 */
  localPushes: Task[];
}

interface ComparableTaskContent {
  title: string;
  type: Task['type'];
  course: string;
  deadline: number;
  estimatedHours: number;
  actualHours: number | null;
  priority: Task['priority'];
  status: Task['status'];
  createdAt: number;
  completedAt: number | null;
  subTasks: ReturnType<typeof normalizeSubTasks>;
  deleted: boolean;
}

function contentKey(content: ComparableTaskContent): string {
  return JSON.stringify(content);
}

function localContentKey(task: Task): string {
  return contentKey({
    title: task.title,
    type: task.type,
    course: task.course,
    deadline: timestampMs(task.deadline),
    estimatedHours: task.estimatedHours,
    actualHours: task.actualHours ?? null,
    priority: task.priority,
    status: task.status,
    createdAt: timestampMs(task.createdAt),
    completedAt: task.completedAt ? timestampMs(task.completedAt) : null,
    subTasks: normalizeSubTasks(task.subTasks),
    deleted: task.deleted ?? false,
  });
}

function remoteContentKey(row: TasksRow): string {
  return contentKey({
    title: row.title,
    type: row.type,
    course: row.course,
    deadline: timestampMs(row.deadline),
    estimatedHours: row.estimated_hours,
    actualHours: row.actual_hours,
    priority: row.priority,
    status: row.status,
    createdAt: timestampMs(row.created_at),
    completedAt: row.completed_at ? timestampMs(row.completed_at) : null,
    subTasks: normalizeSubTasks(row.sub_tasks),
    deleted: row.deleted,
  });
}

/** 相同时间戳时用于判断是否真的存在冲突；无差异就不必触网。 */
export function hasSameTaskContent(task: Task, row: TasksRow): boolean {
  return localContentKey(task) === remoteContentKey(row);
}

/**
 * 根据本地与远端快照计算最小同步集合，时间复杂度 O(n)。
 * 只有明确更新的版本才写入；时间相同则保留本地，避免每次同步都全量互相覆盖。
 */
export function planSyncMerge(localTasks: Task[], remoteRows: TasksRow[]): SyncMergePlan {
  const localById = new Map(localTasks.map((task) => [task.id, task]));
  const remoteById = new Map(remoteRows.map((row) => [row.id, row]));

  const remoteWrites = remoteRows.filter((row) => {
    const local = localById.get(row.id);
    if (!local) return true;

    const localStamp = timestampMs(local.updatedAt);
    const remoteStamp = timestampMs(row.updated_at);
    if (localStamp !== remoteStamp) return localStamp < remoteStamp;

    // 相同时间戳但内容不同：固定让远端胜出，避免各设备永久保留不同副本。
    return !hasSameTaskContent(local, row);
  });

  const localPushes = localTasks.filter((task) => {
    const remote = remoteById.get(task.id);
    return !remote || timestampMs(task.updatedAt) > timestampMs(remote.updated_at);
  });

  return { remoteWrites, localPushes };
}
