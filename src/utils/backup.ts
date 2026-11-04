import dayjs from 'dayjs';
import { db } from '../db/database';
import { isDateKey } from './date';
import type { DailySelection, SubTask, Task, TaskPriority, TaskStatus, TaskType } from '../types';

export const BACKUP_APP = 'ddl-3things';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
/** 单个任务的子任务上限：防御异常文件写入超大数组把 IndexedDB 撑爆 */
export const MAX_BACKUP_SUBTASKS = 100;

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
    const [tasks, dailySelections] = await Promise.all([
      db.tasks.toArray(),
      db.dailySelections.toArray(),
    ]);
    return { tasks, dailySelections };
  });
}

/** 导出全量数据，返回任务条数用于提示 */
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

/**
 * 归一化子任务数组。
 * 关键：备份必须完整保留子任务，否则「导出 → 导入」一轮下来进度环会全部消失。
 * 脏数据（非对象、空标题）静默跳过，并截断到上限防止撑爆本地库。
 */
function normalizeSubTasks(raw: unknown): SubTask[] {
  if (!Array.isArray(raw)) return [];

  const list: SubTask[] = [];
  for (const item of raw.slice(0, MAX_BACKUP_SUBTASKS)) {
    if (!isRecord(item) || typeof item.title !== 'string') continue;
    const title = item.title.trim();
    if (!title) continue;
    list.push({ title, isCompleted: item.isCompleted === true });
  }
  return list;
}

/** 归一化可选的小时数：非数字/负数一律视为未填写 */
function normalizeHours(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : undefined;
}

function normalizeTask(raw: unknown): Task | null {
  if (!isRecord(raw)) return null;

  const { id, title, deadline, status } = raw;

  // 必填字段缺失或类型不对，整条跳过
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
      ? raw.createdAt
      : new Date().toISOString();
  const completedAt =
    done && typeof raw.completedAt === 'string' && isValidDate(raw.completedAt)
      ? raw.completedAt
      : undefined;

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
    taskIds: Array.from(new Set(taskIds.map((id) => (id as string).trim()))).slice(0, 3),
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
  let skippedTasks = 0;

  for (const raw of data.tasks) {
    const task = normalizeTask(raw);
    if (!task) {
      skippedTasks += 1;
      continue;
    }
    taskMap.set(task.id, task);
  }

  const selectionMap = new Map<string, DailySelection>();
  let skippedSelections = 0;

  for (const raw of data.dailySelections) {
    const selection = normalizeDailySelection(raw);
    if (!selection) {
      skippedSelections += 1;
      continue;
    }
    selectionMap.set(selection.date, selection);
  }

  return {
    tasks: Array.from(taskMap.values()),
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

/** 合并导入：同一事务内 bulkPut，任一步失败都会整体回滚 */
export async function mergeBackup(backup: ParsedBackup): Promise<ImportReport> {
  await db.transaction('rw', db.tasks, db.dailySelections, async () => {
    if (backup.tasks.length > 0) {
      await db.tasks.bulkPut(backup.tasks);
    }
    if (backup.dailySelections.length > 0) {
      await db.dailySelections.bulkPut(backup.dailySelections);
    }
  });

  return {
    importedTasks: backup.tasks.length,
    importedSelections: backup.dailySelections.length,
    skippedTasks: backup.skippedTasks,
    skippedSelections: backup.skippedSelections,
  };
}

/** 覆盖导入：清空现有数据后写入备份（用于云备份「覆盖本地」），同一事务内整体回滚 */
export async function overwriteBackup(backup: ParsedBackup): Promise<ImportReport> {
  await db.transaction('rw', db.tasks, db.dailySelections, async () => {
    await Promise.all([db.tasks.clear(), db.dailySelections.clear()]);
    if (backup.tasks.length > 0) {
      await db.tasks.bulkPut(backup.tasks);
    }
    if (backup.dailySelections.length > 0) {
      await db.dailySelections.bulkPut(backup.dailySelections);
    }
  });

  return {
    importedTasks: backup.tasks.length,
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
