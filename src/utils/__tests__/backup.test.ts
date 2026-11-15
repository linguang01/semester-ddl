import { describe, expect, it } from 'vitest';
import { BACKUP_APP, BACKUP_VERSION, parseBackupText } from '../backup';
import { isTaskId } from '../taskId';

/** 造一个最小可用的备份文件字符串 */
function buildFile(tasks: unknown[], dailySelections: unknown[] = []): string {
  return JSON.stringify({
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { tasks, dailySelections },
  });
}

const baseTask = {
  id: 'task-1',
  title: '  写实验报告  ',
  type: 'homework',
  course: '物联网导论',
  deadline: '2026-11-10T23:59:00.000Z',
  estimatedHours: 3,
  priority: 'high',
  status: 'todo',
  createdAt: '2026-11-01T00:00:00.000Z',
};

describe('parseBackupText', () => {
  it('导入时必须保留子任务，否则导出再导入会丢进度', () => {
    const parsed = parseBackupText(
      buildFile([
        {
          ...baseTask,
          subTasks: [
            { title: '查资料', isCompleted: true },
            { title: '写初稿', isCompleted: false },
          ],
        },
      ]),
    );

    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].subTasks).toEqual([
      { title: '查资料', isCompleted: true },
      { title: '写初稿', isCompleted: false },
    ]);
  });

  it('导入时必须保留实际耗时', () => {
    const parsed = parseBackupText(buildFile([{ ...baseTask, status: 'done', actualHours: 4.5 }]));
    expect(parsed.tasks[0].actualHours).toBe(4.5);
  });

  it('缺少 subTasks 的旧备份不会报错，按空数组处理', () => {
    const parsed = parseBackupText(buildFile([baseTask]));
    expect(parsed.tasks[0].subTasks).toEqual([]);
  });

  it('兼容只有 isCompleted 的旧数据，并统一成 status = done', () => {
    const { status: _status, ...withoutStatus } = baseTask;
    const parsed = parseBackupText(
      buildFile([{ ...withoutStatus, isCompleted: true, completedAt: '2026-11-02T10:00:00.000Z' }]),
    );

    expect(parsed.tasks[0].status).toBe('done');
    expect(parsed.tasks[0].completedAt).toBe('2026-11-02T10:00:00.000Z');
  });

  it('子任务里的脏数据被跳过：空标题、非对象、超长数组截断', () => {
    const dirty = [
      ...Array.from({ length: 120 }, (_, i) => ({ title: `子任务 ${i}`, isCompleted: false })),
      { title: '   ', isCompleted: true },
      'not-an-object',
    ];
    const parsed = parseBackupText(buildFile([{ ...baseTask, subTasks: dirty }]));

    // 上限 100 条，空标题与非对象均被过滤
    expect(parsed.tasks[0].subTasks).toHaveLength(100);
    expect(parsed.tasks[0].subTasks?.every((item) => item.title.trim().length > 0)).toBe(true);
  });

  it('必填字段缺失的任务计入 skippedTasks，不污染导入结果', () => {
    const parsed = parseBackupText(buildFile([{ ...baseTask, deadline: '不是日期' }, baseTask]));

    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.skippedTasks).toBe(1);
  });

  it('标题前后空格被清理', () => {
    const parsed = parseBackupText(buildFile([baseTask]));
    expect(parsed.tasks[0].title).toBe('写实验报告');
  });

  it('旧备份的非 UUID ID 会重映射，并同步改写每日选择引用', () => {
    const parsed = parseBackupText(
      buildFile([baseTask], [{ date: '2026-11-10', taskIds: ['task-1', 'missing-task'] }]),
    );

    expect(parsed.tasks).toHaveLength(1);
    expect(isTaskId(parsed.tasks[0].id)).toBe(true);
    expect(parsed.tasks[0].id).not.toBe('task-1');
    expect(parsed.dailySelections).toEqual([{ date: '2026-11-10', taskIds: [parsed.tasks[0].id] }]);

    // 同一旧备份重复导入必须得到相同 ID，避免产生重复任务。
    const again = parseBackupText(buildFile([baseTask]));
    expect(again.tasks[0].id).toBe(parsed.tasks[0].id);
  });

  it('墓碑不进入普通备份，也不会在新设备上复活删除任务', () => {
    const parsed = parseBackupText(
      buildFile([
        { ...baseTask, deleted: true },
        { ...baseTask, id: 'task-2' },
      ]),
    );

    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.skippedTasks).toBe(1);
  });

  it('同步时间戳统一规范化为 UTC ISO，便于跨时区比较', () => {
    const parsed = parseBackupText(
      buildFile([
        {
          ...baseTask,
          createdAt: '2026-11-01T08:00:00+08:00',
          updatedAt: '2026-11-02T08:00:00+08:00',
        },
      ]),
    );

    expect(parsed.tasks[0].createdAt).toBe('2026-11-01T00:00:00.000Z');
    expect(parsed.tasks[0].updatedAt).toBe('2026-11-02T00:00:00.000Z');
  });
});
