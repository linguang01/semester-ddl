import { describe, expect, it } from 'vitest';
import { autoSelectTasks } from '../autoSelect';
import type { Task } from '../../types';

/** 固定基准时间，避免测试随真实时间漂移 */
const NOW = new Date('2026-11-04T09:00:00+08:00');

function makeTask(overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    type: 'homework',
    course: '',
    deadline: '2026-11-05T23:59:00+08:00',
    estimatedHours: 2,
    priority: 'medium',
    status: 'todo',
    createdAt: '2026-11-01T00:00:00+08:00',
    ...overrides,
  };
}

describe('autoSelectTasks', () => {
  it('距 DDL 更近的任务优先于优先级更高的远期任务', () => {
    const ids = autoSelectTasks(
      [
        makeTask({ id: 'far', title: '下个月的考试', deadline: '2026-12-20T09:00:00+08:00', priority: 'high' }),
        makeTask({ id: 'near', title: '明天的作业', deadline: '2026-11-05T09:00:00+08:00', priority: 'low' }),
      ],
      3,
      NOW,
    );

    expect(ids).toEqual(['near', 'far']);
  });

  it('同一时间桶内按优先级排序', () => {
    const ids = autoSelectTasks(
      [
        makeTask({ id: 'low', title: '低', deadline: '2026-11-05T12:00:00+08:00', priority: 'low' }),
        makeTask({ id: 'high', title: '高', deadline: '2026-11-05T18:00:00+08:00', priority: 'high' }),
      ],
      3,
      NOW,
    );

    expect(ids).toEqual(['high', 'low']);
  });

  it('同桶同优先级时，预计耗时短的先做，未填耗时（0）排最后', () => {
    const ids = autoSelectTasks(
      [
        makeTask({ id: 'unknown', title: '没填耗时', deadline: '2026-11-05T22:00:00+08:00', estimatedHours: 0 }),
        makeTask({ id: 'slow', title: '慢', deadline: '2026-11-05T20:00:00+08:00', estimatedHours: 6 }),
        makeTask({ id: 'fast', title: '快', deadline: '2026-11-05T21:00:00+08:00', estimatedHours: 1 }),
      ],
      3,
      NOW,
    );

    expect(ids).toEqual(['fast', 'slow', 'unknown']);
  });

  it('已完成、已过期（非今日）的任务不进入候选', () => {
    const ids = autoSelectTasks(
      [
        makeTask({ id: 'done', title: '已完成', status: 'done' }),
        makeTask({ id: 'expired', title: '上周就过期了', deadline: '2026-10-28T09:00:00+08:00' }),
        makeTask({ id: 'today', title: '今天时刻已过但仍算今天', deadline: '2026-11-04T08:00:00+08:00' }),
      ],
      3,
      NOW,
    );

    expect(ids).toEqual(['today']);
  });

  it('候选不足时只返回实际数量，不补空位', () => {
    const ids = autoSelectTasks([makeTask({ id: 'only', title: '唯一一件' })], 3, NOW);
    expect(ids).toHaveLength(1);
  });
});
