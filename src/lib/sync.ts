import { db, removeTaskIdsFromDailySelections } from '../db/database';
import type { Task } from '../types';
import { isTaskId } from '../utils/taskId';
import { timestampMs } from '../utils/timestamp';
import { normalizeSubTasks } from '../utils/subTasks';
import type { TasksRow } from './database.types';
import { assertSupabaseConfigured, supabase } from './supabase';
import { hasSameTaskContent, planSyncMerge } from './syncMerge';

/**
 * 云端同步引擎：本地优先 + 按 updatedAt 最后写入胜（LWW）。
 * Dexie 始终是 UI 数据源；Supabase 是云端副本。删除通过墓碑跨设备传播。
 */

// ---------------------------------------------------------------------------
// Task（camelCase，本地）<-> TasksRow（snake_case，云端）映射
// ---------------------------------------------------------------------------

export function taskToRow(task: Task, userId: string): TasksRow {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    type: task.type,
    course: task.course,
    deadline: task.deadline,
    estimated_hours: task.estimatedHours,
    actual_hours: task.actualHours ?? null,
    priority: task.priority,
    status: task.status,
    created_at: task.createdAt,
    completed_at: task.completedAt ?? null,
    sub_tasks: task.subTasks ?? [],
    updated_at: task.updatedAt,
    deleted: task.deleted ?? false,
  };
}

export function rowToTask(row: TasksRow): Task {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    course: row.course,
    deadline: row.deadline,
    estimatedHours: row.estimated_hours,
    ...(row.actual_hours !== null ? { actualHours: row.actual_hours } : {}),
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    ...(row.completed_at !== null ? { completedAt: row.completed_at } : {}),
    subTasks: normalizeSubTasks(row.sub_tasks),
    updatedAt: row.updated_at,
    ...(row.deleted ? { deleted: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// 本机数据归属：一个浏览器工作区只绑定一个云账号，换账号必须显式确认
// ---------------------------------------------------------------------------

const SYNC_OWNER_KEY = 'ddl-sync-owner';
let memoryOwner: string | null = null;

/** 读取当前工作区已绑定的账号；兼容 localStorage 不可用的隐私模式。 */
export function getBoundSyncUserId(): string | null {
  try {
    return localStorage.getItem(SYNC_OWNER_KEY) ?? memoryOwner;
  } catch {
    return memoryOwner;
  }
}

function bindSyncOwner(userId: string): void {
  memoryOwner = userId;
  try {
    localStorage.setItem(SYNC_OWNER_KEY, userId);
  } catch {
    // 隐私模式下仅本次会话有效；跨账号保护仍依赖内存值。
  }
}

/** 本机数据已属于其他账号时抛出，UI 据此要求用户明确选择是否复制并切换。 */
export class SyncAccountConflictError extends Error {
  readonly boundUserId: string | null;

  constructor(boundUserId: string | null) {
    super('本机数据已绑定其他账号，为避免串号已停止同步');
    this.name = 'SyncAccountConflictError';
    this.boundUserId = boundUserId;
  }
}

function assertSyncOwnership(userId: string): void {
  const boundUserId = getBoundSyncUserId();
  if (boundUserId !== null && boundUserId !== userId) {
    throw new SyncAccountConflictError(boundUserId);
  }
  if (boundUserId === null) bindSyncOwner(userId);
}

/**
 * 用户确认后把当前工作区复制到新账号：重新生成任务 ID，避免与旧账号云端主键冲突。
 * 只复制可见任务；旧账号云端数据不变，本机旧墓碑被清理。
 */
export async function mergeLocalWorkspaceIntoAccount(userId: string): Promise<number> {
  const now = new Date().toISOString();
  const changed: Task[] = [];

  await db.transaction('rw', db.tasks, db.dailySelections, async () => {
    const tasks = (await db.tasks.toArray()).filter((task) => !task.deleted);
    const idMap = new Map<string, string>();

    for (const task of tasks) {
      const nextId = crypto.randomUUID();
      idMap.set(task.id, nextId);
      changed.push({ ...task, id: nextId, updatedAt: now });
    }

    const selections = await db.dailySelections.toArray();
    const nextSelections = selections
      .map((selection) => {
        const taskIds = Array.from(
          new Set(
            selection.taskIds
              .map((id) => idMap.get(id))
              .filter((id): id is string => id !== undefined),
          ),
        ).slice(0, 3);
        return { date: selection.date, taskIds };
      })
      .filter((selection) => selection.taskIds.length > 0);

    await db.tasks.clear();
    if (changed.length > 0) await db.tasks.bulkPut(changed);
    await db.dailySelections.clear();
    if (nextSelections.length > 0) await db.dailySelections.bulkPut(nextSelections);
  });

  bindSyncOwner(userId);
  for (const task of changed) queueTaskPush(task);
  return changed.length;
}

// ---------------------------------------------------------------------------
// 同步状态：模块级 store + useSyncExternalStore 订阅
// ---------------------------------------------------------------------------

export interface SyncStatus {
  syncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

let syncStatus: SyncStatus = { syncing: false, lastSyncAt: null, lastError: null };
const statusListeners = new Set<() => void>();

function setSyncStatus(patch: Partial<SyncStatus>): void {
  syncStatus = { ...syncStatus, ...patch };
  for (const listener of statusListeners) listener();
}

export function subscribeSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function getSyncStatus(): SyncStatus {
  return syncStatus;
}

// ---------------------------------------------------------------------------
// 当前用户、增量推送队列与全量同步生命周期
// ---------------------------------------------------------------------------

const AUTO_SYNC_MIN_INTERVAL = 30_000;
const PUSH_DEBOUNCE_MS = 2_000;

let currentUserId: string | null = null;
let syncEpoch = 0;
let lastAutoSyncAt = 0;
let activeSync: { userId: string; epoch: number; promise: Promise<void> } | null = null;
let realtimeUserId: string | null = null;
let stopRealtime: (() => void) | null = null;

const pendingPush = new Map<string, Task>();
let pushTimer: number | null = null;
let activeFlush: Promise<void> | null = null;
let flushAgain = false;

class SyncCancelledError extends Error {
  constructor() {
    super('登录状态已变化，本次同步已取消');
    this.name = 'SyncCancelledError';
  }
}

function assertCurrentSync(userId: string, epoch: number): void {
  if (currentUserId !== userId || syncEpoch !== epoch) throw new SyncCancelledError();
}

function stopRealtimeSubscription(): void {
  stopRealtime?.();
  stopRealtime = null;
  realtimeUserId = null;
}

/** 只有成功完成一次同步后才订阅；账号冲突时绝不接收新账号的实时行。 */
function ensureRealtimeSubscription(userId: string): void {
  if (currentUserId !== userId || realtimeUserId === userId) return;
  stopRealtimeSubscription();
  realtimeUserId = userId;
  stopRealtime = subscribeTaskRealtime(userId);
}

/** 切换账号或登出时隔离队列，禁止把上一账号的待推送任务写入新账号。 */
export function setCurrentSyncUser(userId: string | null): void {
  if (currentUserId === userId) return;

  currentUserId = userId;
  syncEpoch += 1;
  lastAutoSyncAt = 0;
  pendingPush.clear();
  flushAgain = false;
  stopRealtimeSubscription();

  if (pushTimer !== null) {
    window.clearTimeout(pushTimer);
    pushTimer = null;
  }

  syncStatus = { syncing: false, lastSyncAt: null, lastError: null };
  for (const listener of statusListeners) listener();
}

function schedulePushFlush(): void {
  if (pushTimer !== null || currentUserId === null) return;

  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    void flushPushes();
  }, PUSH_DEBOUNCE_MS);
}

/** 本地任务变化后调用；未登录时静默跳过，登录后的全量同步会补齐。 */
export function queueTaskPush(task: Task): void {
  if (currentUserId === null) return;
  pendingPush.set(task.id, task);
  schedulePushFlush();
}

/** 已被远端相同或更新版本覆盖的待推送项可以安全丢弃。 */
function discardObsoletePending(row: TasksRow): void {
  const pending = pendingPush.get(row.id);
  if (pending && timestampMs(pending.updatedAt) <= timestampMs(row.updated_at)) {
    pendingPush.delete(row.id);
  }
}

const REMOTE_PAGE_SIZE = 500;
const PUSH_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

/** 拉取当前用户全部行；显式分页，避免 PostgREST 默认行数上限导致漏同步。 */
async function fetchRemoteRows(userId: string, taskIds?: string[]): Promise<TasksRow[]> {
  if (taskIds) {
    const rows: TasksRow[] = [];
    for (const ids of chunk(taskIds, PUSH_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .in('id', ids);
      if (error) throw new Error(`拉取失败：${error.message}`);
      rows.push(...((data ?? []) as TasksRow[]));
    }
    return rows;
  }

  const rows: TasksRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(from, from + REMOTE_PAGE_SIZE - 1);
    if (error) throw new Error(`拉取失败：${error.message}`);

    const page = (data ?? []) as TasksRow[];
    if (page.length === 0) break;
    rows.push(...page);
    // 服务端可能配置了比请求更小的 max-rows；按实际返回量前进，避免漏页。
    from += page.length;
  }
  return rows;
}

/**
 * 通过数据库函数执行条件写：只有 incoming.updated_at 更新时才覆盖。
 * 客户端先读后写会输给竞态，原子条件写才能保证旧请求不会回滚新数据。
 */
async function pushRemoteRows(userId: string, tasks: Task[]): Promise<void> {
  const invalid = tasks.find((task) => !isTaskId(task.id));
  if (invalid) {
    throw new Error(`任务 ID 格式异常（${invalid.id}），请先导出备份再重新导入以修复数据`);
  }

  for (const batch of chunk(tasks, PUSH_BATCH_SIZE)) {
    const { error } = await supabase.rpc('sync_tasks', {
      p_rows: batch.map((task) => taskToRow(task, userId)),
    });
    if (error) throw new Error(`推送失败：${error.message}`);
  }
}

/**
 * 合并一批远端行，并仅推送本地明确更新的任务。
 * 本地读取与远端落盘在同一 Dexie 事务中完成，删除墓碑会同时清理每日选择引用。
 */
async function mergeRemoteAndPush(userId: string, remoteRows: TasksRow[], taskIds?: string[]): Promise<void> {
  const localPushes = await db.transaction('rw', db.tasks, db.dailySelections, async () => {
    const records = taskIds ? await db.tasks.bulkGet(taskIds) : await db.tasks.toArray();
    const localTasks = records.filter((task): task is Task => task !== undefined);

    if (taskIds) {
      const existingIds = new Set(localTasks.map((task) => task.id));
      for (const id of taskIds) {
        if (!existingIds.has(id)) pendingPush.delete(id);
      }
    }

    const plan = planSyncMerge(localTasks, remoteRows);
    if (plan.remoteWrites.length > 0) {
      await db.tasks.bulkPut(plan.remoteWrites.map(rowToTask));
      await removeTaskIdsFromDailySelections(
        plan.remoteWrites.filter((row) => row.deleted).map((row) => row.id),
      );
    }
    for (const row of remoteRows) discardObsoletePending(row);

    return plan.localPushes;
  });

  // 网络请求期间可能切换账号；旧账号任务不得继续写入新会话。
  if (currentUserId !== userId || localPushes.length === 0) return;
  await pushRemoteRows(userId, localPushes);

  if (currentUserId !== userId) return;
  for (const task of localPushes) {
    const pending = pendingPush.get(task.id);
    if (pending && timestampMs(pending.updatedAt) === timestampMs(task.updatedAt)) {
      pendingPush.delete(task.id);
    }
  }
}

async function performFlush(userId: string, taskIds: string[]): Promise<void> {
  assertSyncOwnership(userId);
  if (currentUserId !== userId) return;

  const remoteRows = await fetchRemoteRows(userId, taskIds);
  await mergeRemoteAndPush(userId, remoteRows, taskIds);

  if (currentUserId === userId) {
    setSyncStatus({ lastError: null, lastSyncAt: new Date().toISOString() });
  }
}

/** 防抖推送前先读取涉及行的远端版本，避免旧队列覆盖其他设备的新修改。 */
async function flushPushes(): Promise<void> {
  if (activeFlush) {
    flushAgain = true;
    return activeFlush;
  }
  if (currentUserId === null || pendingPush.size === 0) return;

  const userId = currentUserId;
  const taskIds = [...pendingPush.keys()];
  const promise = performFlush(userId, taskIds);
  activeFlush = promise;

  try {
    await promise;
  } catch (cause) {
    if (currentUserId === userId) {
      setSyncStatus({ lastError: cause instanceof Error ? cause.message : String(cause) });
    }
    // 不清 pendingPush；下次全量同步或本地变更会重试。
  } finally {
    if (activeFlush === promise) activeFlush = null;
    if (flushAgain && currentUserId !== null && pendingPush.size > 0) {
      flushAgain = false;
      schedulePushFlush();
    }
  }
}

// ---------------------------------------------------------------------------
// 全量双向同步
// ---------------------------------------------------------------------------

async function performFullSync(userId: string, epoch: number): Promise<void> {
  try {
    assertSupabaseConfigured();
    const remoteRows = await fetchRemoteRows(userId);

    assertCurrentSync(userId, epoch);
    await mergeRemoteAndPush(userId, remoteRows);
    assertCurrentSync(userId, epoch);
    ensureRealtimeSubscription(userId);

    setSyncStatus({ syncing: false, lastSyncAt: new Date().toISOString(), lastError: null });
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    if (currentUserId === userId && syncEpoch === epoch) {
      setSyncStatus({ syncing: false, lastError: error.message });
    }
    throw error;
  }
}

/**
 * 全量同步：拉取当前用户远端行，计算最小合并集合，再按需推送。
 * 同一用户的并发调用共享同一个 Promise，手动同步不会把“仍在同步”误报为成功。
 */
export async function fullSync(userId: string, force = false): Promise<void> {
  if (activeSync) {
    if (activeSync.userId === userId && activeSync.epoch === syncEpoch) {
      return activeSync.promise;
    }

    // 旧账号请求无法物理中断，等它结束并做世代校验后再启动新同步。
    await activeSync.promise.catch(() => undefined);
    return fullSync(userId, force);
  }

  if (currentUserId !== userId) throw new SyncCancelledError();
  try {
    assertSyncOwnership(userId);
  } catch (cause) {
    if (currentUserId === userId) {
      setSyncStatus({ syncing: false, lastError: (cause as Error).message });
    }
    throw cause;
  }

  const now = Date.now();
  if (!force && now - lastAutoSyncAt < AUTO_SYNC_MIN_INTERVAL) return;

  const epoch = syncEpoch;
  lastAutoSyncAt = now;
  setSyncStatus({ syncing: true, lastError: null });

  const promise = performFullSync(userId, epoch);
  activeSync = { userId, epoch, promise };

  try {
    await promise;
  } finally {
    if (activeSync?.promise === promise) activeSync = null;
  }
}

// ---------------------------------------------------------------------------
// Realtime：其他设备的变更实时推到本机
// ---------------------------------------------------------------------------

async function applyRemoteRow(row: TasksRow): Promise<void> {
  await db.transaction('rw', db.tasks, db.dailySelections, async () => {
    const local = await db.tasks.get(row.id);
    if (local) {
      const localStamp = timestampMs(local.updatedAt);
      const remoteStamp = timestampMs(row.updated_at);
      if (localStamp > remoteStamp) return;
      if (localStamp === remoteStamp && hasSameTaskContent(local, row)) return;
    }

    await db.tasks.put(rowToTask(row));
    if (row.deleted) await removeTaskIdsFromDailySelections([row.id]);
    discardObsoletePending(row);
  });
}

/** 订阅当前用户 tasks 行变更；返回取消订阅函数。 */
export function subscribeTaskRealtime(userId: string): () => void {
  const channel = supabase
    .channel(`tasks-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as TasksRow | null;
        if (currentUserId !== userId || !row?.id || row.user_id !== userId) return;

        void applyRemoteRow(row).catch((cause: unknown) => {
          if (currentUserId !== userId) return;
          setSyncStatus({
            lastError: `实时同步失败：${cause instanceof Error ? cause.message : String(cause)}`,
          });
        });
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
