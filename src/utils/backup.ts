import dayjs from 'dayjs';
import { db } from '../db/database';
import { isDateKey } from './date';
import { isTaskId, taskIdFromLegacy } from './taskId';
import { MAX_SUBTASKS, normalizeSubTasks } from './subTasks';
import { queueTaskPush } from '../lib/sync';
import type { DailySelection, Task, TaskPriority, TaskStatus, TaskType } from '../types';

export const BACKUP_APP = 'ddl-3things';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
/** 单个任务的子任务上限：防御异常文件写入超大数组把 IndexedDB 撑爆 */
export const MAX_BACKUP_SUBTASKS = MAX_SUBTASKS;
const MAX_DAILY_SELECTIONS = 3;

const TASK_TYPES: TaskType[] = ['homework', 'exam', 'club', 'other'];
const TASK_PRIORITIES: TaskPriority[] = ['high', 'medium', 'low'];
const TASK_STATUSES: TaskStatus[] = ['todo', 'done'];

export interface BackupPayload {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  data: {
    tasks: Task[];
    dailySelections: DailySelection[];
  };
}

export interface ParsedBackup {
  tasks: Task[];
  dailySelections: DailySelection[];
  skippedTasks: number;
  skippedSelections: number;
}

export interface ImportReport {
  importedTasks: number;
  importedSelections: number;
  skippedTasks: number;
  skippedSelections: number;
}

/** 可预期的备份错误，UI 直接展示 message */
export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value: string): boolean {
  return dayjs(value).isValid();
}

function createPayload(tasks: Task[], dailySelections: DailySelection[]): BackupPayload {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { tasks, dailySelections },
  };
}

function timeStamp(): string {
  return dayjs().format('YYYY-MM-DD-HHmm');
}

/** 通过 Blob + Object URL 触发浏览器下载，全部在客户端完成 */
function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
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

async function readAllData(): Promise<{
  tasks: Task[];
  dailySelections: DailySelection[];
}> {
  return db.transaction('r', db.tasks, db.dailySelections, async () => {
    const [allTasks, dailySelections] = await Promise.all([
      db.tasks.toArray(),
      db.dailySelections.toArray(),
    ]);
    // 备份只包含用户可见数据；墓碑属于同步元数据，不应被当成正常任务导出。
    const tasks = allTasks.filter((task) => !task.deleted);
    const activeIds = new Set(tasks.map((task) => task.id));
    return {
      tasks,
      dailySelections: dailySelections
        .map((selection) => ({
          date: selection.date,
          taskIds: selection.taskIds.filter((id) => activeIds.has(id)),
        }))
        .filter((selection) => selection.taskIds.length > 0),
    };
  });
}

/** 导出当前可见任务，返回任务条数用于提示 */
export async function exportBackup(): Promise<number> {
  const { tasks, dailySelections } = await readAllData();
  downloadJson(`ddl-backup-${timeStamp()}.json`, createPayload(tasks, dailySelections));
  return tasks.length;
}

/** 构造备份对象（不触发下载），供 Gist 云备份复用 */
export async function buildBackupPayload(): Promise<BackupPayload> {
  const { tasks, dailySelections } = await readAllData();
  return createPayload(tasks, dailySelections);
}

/** 导入前自动备份当前数据，给用户留回退路径 */
export async function downloadPreImportBackup(): Promise<void> {
  const { tasks, dailySelections } = await readAllData();
  downloadJson(`导入前自动备份-${timeStamp()}.json`, createPayload(tasks, dailySelections));
}

/** 归一化可选的小时数：非数字/负数一律视为未填写 */
function normalizeHours(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : undefined;
}

function normalizeTask(raw: unknown): Task | null {
  if (!isRecord(raw)) return null;

  const { id, title, deadline, status } = raw;

  // 必填字段缺失或类型不对，整条跳过；非法 ID 会在 parseBackupText 中重映射。
  if (typeof id !== 'string' || !id.trim()) return null;
  if (typeof title !== 'string' || !title.trim()) return null;
  if (typeof deadline !== 'string' || !isValidDate(deadline)) return null;
  // status 可以缺失（极早期备份没有该字段），但存在时必须是合法值
  if (status !== undefined && !TASK_STATUSES.includes(status as TaskStatus)) return null;

  // 完成态统一口径：status === 'done'，或旧备份里的 isCompleted === true
  const done = status === 'done' || raw.isCompleted === true;

  const type = TASK_TYPES.includes(raw.type as TaskType) ? (raw.type as TaskType) : 'other';
  const priority = TASK_PRIORITIES.includes(raw.priority as TaskPriority)
    ? (raw.priority as TaskPriority)
    : 'medium';

  const course = typeof raw.course === 'string' ? raw.course : '';
  const estimatedHours = normalizeHours(raw.estimatedHours) ?? 0;
  const actualHours = normalizeHours(raw.actualHours);
  const createdAt =
    typeof raw.createdAt === 'string' && isValidDate(raw.createdAt)
      ? dayjs(raw.createdAt).toISOString()
      : new Date().toISOString();
  const completedAt =
    done && typeof raw.completedAt === 'string' && isValidDate(raw.completedAt)
      ? dayjs(raw.completedAt).toISOString()
      : undefined;
  // 同步元数据：统一为 UTC ISO，避免同值不同时区写法影响比较。
  const updatedAt =
    typeof raw.updatedAt === 'string' && isValidDate(raw.updatedAt)
      ? dayjs(raw.updatedAt).toISOString()
      : createdAt;

  return {
    id: id.trim(),
    title: title.trim(),
    type,
    course,
    deadline: dayjs(deadline).toISOString(),
    estimatedHours,
    ...(actualHours !== undefined ? { actualHours } : {}),
    priority,
    status: done ? 'done' : 'todo',
    createdAt,
    ...(completedAt ? { completedAt } : {}),
    subTasks: normalizeSubTasks(raw.subTasks),
    updatedAt,
    ...(raw.deleted === true ? { deleted: true } : {}),
  };
}

function normalizeDailySelection(raw: unknown): DailySelection | null {
  if (!isRecord(raw)) return null;

  const { date, taskIds } = raw;
  if (typeof date !== 'string' || !isDateKey(date)) return null;
  if (!Array.isArray(taskIds) || !taskIds.every((id) => typeof id === 'string' && id.trim())) {
    return null;
  }

  return {
    date,
    taskIds: Array.from(new Set(taskIds.map((id) => (id as string).trim()))).slice(
      0,
      MAX_DAILY_SELECTIONS,
    ),
  };
}

/** 只解析 JSON 和校验结构，不写入数据库 */
export function parseBackupText(text: string): ParsedBackup {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('文件不是合法的 JSON');
  }

  if (!isRecord(parsed) || parsed.app !== BACKUP_APP) {
    throw new BackupError('这不是本应用的备份文件');
  }

  if (parsed.version !== BACKUP_VERSION) {
    throw new BackupError('备份版本不受支持，仅支持 version 1');
  }

  const data = parsed.data;
  if (
    !isRecord(data) ||
    !Array.isArray(data.tasks) ||
    !Array.isArray(data.dailySelections)
  ) {
    throw new BackupError('备份数据格式不正确');
  }

  const taskMap = new Map<string, Task>();
  const idMap = new Map<string, string>();
  let skippedTasks = 0;

  for (const raw of data.tasks) {
    const task = normalizeTask(raw);
    if (!task) {
      skippedTasks += 1;
      continue;
    }

    const originalId = task.id;
    if (!isTaskId(originalId)) {
      // 稳定重映射，重复导入同一份旧备份不会产生副本。
      task.id = taskIdFromLegacy(originalId);
    }
    idMap.set(originalId, task.id);
    taskMap.set(task.id, task);
  }

  const tasks = Array.from(taskMap.values()).filter((task) => {
    if (!task.deleted) return true;
    skippedTasks += 1;
    return false;
  });
  const activeIds = new Set(tasks.map((task) => task.id));

  const selectionMap = new Map<string, DailySelection>();
  let skippedSelections = 0;

  for (const raw of data.dailySelections) {
    const selection = normalizeDailySelection(raw);
    if (!selection) {
      skippedSelections += 1;
      continue;
    }

    // File may use legacy IDs; rewrite references and drop dangling/deleted tasks.
    const taskIds = Array.from(
      new Set(selection.taskIds.map((id) => idMap.get(id) ?? id).filter((id) => activeIds.has(id))),
    ).slice(0, MAX_DAILY_SELECTIONS);

    if (taskIds.length === 0) {
      skippedSelections += 1;
      continue;
    }
    selectionMap.set(selection.date, { date: selection.date, taskIds });
  }

  return {
    tasks,
    dailySelections: Array.from(selectionMap.values()),
    skippedTasks,
    skippedSelections,
  };
}

/** 读取并校验用户选择的文件 */
export async function readBackupFile(file: File): Promise<ParsedBackup> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new BackupError('备份文件过大');
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new BackupError('无法读取备份文件');
  }

  return parseBackupText(text);
}

/**
 * 合并导入：同一事务内写入，任一步失败整体回滚。
 * 导入项视为“刚刚发生的本地修改”，避免下一次云同步又用更旧云端版本覆盖备份。
 */
export async function mergeBackup(backup: ParsedBackup): Promise<ImportReport> {
  const now = new Date().toISOString();
  const imported = backup.tasks.map((task) => ({
    ...task,
    deleted: false,
    updatedAt: now,
  }));

  await db.transaction('rw', db.tasks, db.dailySelections, async () => {
    if (imported.length > 0) await db.tasks.bulkPut(imported);
    if (backup.dailySelections.length > 0) {
      await db.dailySelections.bulkPut(backup.dailySelections);
    }
  });

  for (const task of imported) queueTaskPush(task);

  return {
    importedTasks: imported.length,
    importedSelections: backup.dailySelections.length,
    skippedTasks: backup.skippedTasks,
    skippedSelections: backup.skippedSelections,
  };
}

/**
 * 覆盖导入：备份中不存在的现有任务写入删除墓碑，而不是物理清库。
 * 这样云端旧数据不会在下次同步时复活，删除也会可靠传播到其他设备。
 */
export async function overwriteBackup(backup: ParsedBackup): Promise<ImportReport> {
  const now = new Date().toISOString();
  const imported = backup.tasks.map((task) => ({
    ...task,
    deleted: false,
    updatedAt: now,
  }));
  const importedIds = new Set(imported.map((task) => task.id));
  const tombstones: Task[] = [];

  await db.transaction('rw', db.tasks, db.dailySelections, async () => {
    const existing = await db.tasks.toArray();
    for (const task of existing) {
      if (!task.deleted && !importedIds.has(task.id)) {
        tombstones.push({ ...task, deleted: true, updatedAt: now });
      }
    }

    if (imported.length > 0) await db.tasks.bulkPut(imported);
    if (tombstones.length > 0) await db.tasks.bulkPut(tombstones);
    await db.dailySelections.clear();
    if (backup.dailySelections.length > 0) {
      await db.dailySelections.bulkPut(backup.dailySelections);
    }
  });

  for (const task of imported) queueTaskPush(task);
  for (const task of tombstones) queueTaskPush(task);

  return {
    importedTasks: imported.length,
    importedSelections: backup.dailySelections.length,
    skippedTasks: backup.skippedTasks,
    skippedSelections: backup.skippedSelections,
  };
}

/** 统一的导入结果文案，toast 与设置区共用 */
export function describeImportReport(report: ImportReport): string {
  const skipped: string[] = [];
  if (report.skippedTasks > 0) skipped.push(`${report.skippedTasks} 条任务`);
  if (report.skippedSelections > 0) skipped.push(`${report.skippedSelections} 条今日选择`);

  const summary = `成功导入 ${report.importedTasks} 条任务、${report.importedSelections} 条今日选择`;
  return skipped.length > 0 ? `${summary}，跳过 ${skipped.join('、')}` : summary;
}
