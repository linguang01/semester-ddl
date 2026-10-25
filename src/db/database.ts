import Dexie, { type Table } from 'dexie';
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
  }
}

/** 全应用共用的 Dexie 实例 */
export const db = new SemesterDdlDatabase();
