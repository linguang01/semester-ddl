import Dexie, { type Table } from 'dexie';
import { isTaskId, taskIdFromLegacy } from '../utils/taskId';
import type { DailySelection, Task } from '../types';

export const DB_NAME = 'semester-ddl';

export class SemesterDdlDatabase extends Dexie {
  tasks!: Table<Task, string>;
  dailySelections!: Table<DailySelection, string>;

  constructor() {
    super(DB_NAME);

    this.version(1).stores({
      // id 是主键；deadline 为 ISO 字符串，可直接按字典序升序排列
      tasks: 'id, deadline, status, type, priority, createdAt',
      // *taskIds 是 multiEntry 索引，用于「删除任务时反查包含它的每日选择」
      dailySelections: 'date, *taskIds',
    });

    // v2：为云端同步补 updatedAt 字段（老数据用 createdAt 兜底，保证时间戳单调可比）
    this.version(2)
      .stores({
        // 索引不变，仅触发一次迁移写入 updatedAt
        tasks: 'id, deadline, status, type, priority, createdAt',
        dailySelections: 'date, *taskIds',
      })
      .upgrade(async (tx) => {
        await tx
          .table('tasks')
          .toCollection()
          .modify((task: Task) => {
            if (!task.updatedAt) {
              task.updatedAt = task.createdAt;
            }
          });
      });

    // v3：旧备份可能带非 UUID 主键，Supabase uuid 列会导致整批同步失败。
    // 一次性重映射 ID，并同步改写每日选择引用；同时清理已删除/悬空引用。
    this.version(3)
      .stores({
        tasks: 'id, deadline, status, type, priority, createdAt',
        dailySelections: 'date, *taskIds',
      })
      .upgrade(async (tx) => {
        const tasksTable = tx.table<Task, string>('tasks');
        const selectionsTable = tx.table<DailySelection, string>('dailySelections');
        const tasks = await tasksTable.toArray();
        const idMap = new Map<string, string>();
        const replacements: Task[] = [];

        for (const task of tasks) {
          if (isTaskId(task.id)) {
            idMap.set(task.id, task.id);
            continue;
          }
          const nextId = taskIdFromLegacy(task.id);
          idMap.set(task.id, nextId);
          replacements.push({ ...task, id: nextId, updatedAt: new Date().toISOString() });
        }

        if (replacements.length > 0) {
          await tasksTable.bulkDelete(
            tasks.filter((task) => !isTaskId(task.id)).map((task) => task.id),
          );
          await tasksTable.bulkPut(replacements);
        }

        const activeIds = new Set(
          (await tasksTable.toArray()).filter((task) => !task.deleted).map((task) => task.id),
        );
        const selections = await selectionsTable.toArray();
        for (const selection of selections) {
          const taskIds = Array.from(
            new Set(
              selection.taskIds.map((id) => idMap.get(id) ?? id).filter((id) => activeIds.has(id)),
            ),
          ).slice(0, 3);

          if (taskIds.length === 0) await selectionsTable.delete(selection.date);
          else if (taskIds.join('|') !== selection.taskIds.join('|')) {
            await selectionsTable.put({ date: selection.date, taskIds });
          }
        }
      });
  }
}

/** 全应用共用的 Dexie 实例 */
export const db = new SemesterDdlDatabase();

/** 删除任务时同步清理每日选择；调用方需把两张表都放进写事务。 */
export async function removeTaskIdsFromDailySelections(taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) return;

  const affected = await db.dailySelections.where('taskIds').anyOf(taskIds).toArray();
  for (const selection of affected) {
    const nextIds = selection.taskIds.filter((id) => !taskIds.includes(id));
    if (nextIds.length === 0) await db.dailySelections.delete(selection.date);
    else await db.dailySelections.put({ date: selection.date, taskIds: nextIds });
  }
}
