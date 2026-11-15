import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { completedLast7Days, hoursThisWeek, typeDistribution } from '../stats';
import type { Task } from '../../types';

function makeTask(overrides: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    title: '任务',
    type: 'homework',
    course: '',
    deadline: '2026-11-10T16:30:00+08:00',
    estimatedHours: 2,
    priority: 'medium',
    status: 'done',
    createdAt: '2026-11-01T00:00:00+08:00',
    updatedAt: '2026-11-01T00:00:00+08:00',
    ...overrides,
  };
}

/** 基准日：2026-11-04 是周三 */
const NOW = dayjs('2026-11-04T12:00:00');

describe('completedLast7Days', () => {
  it('只统计最近 7 天，且按本地自然日落位', () => {
    const tasks = [
      makeTask({ id: 'a', completedAt: '2026-11-04T09:00:00+08:00' }),
      makeTask({ id: 'b', completedAt: '2026-11-04T23:00:00+08:00' }),
      makeTask({ id: 'c', completedAt: '2026-10-29T01:00:00+08:00' }), // 第 1 天
      makeTask({ id: 'd', completedAt: '2026-10-28T23:00:00+08:00' }), // 超出窗口
    ];

    const days = completedLast7Days(tasks, NOW);

    expect(days).toHaveLength(7);
    expect(days[6].count).toBe(2); // 今天
    expect(days[0].count).toBe(1); // 10-29
    expect(days.reduce((sum, day) => sum + day.count, 0)).toBe(3);
  });

  it('未完成、缺 completedAt、时间非法的任务都不计入', () => {
    const tasks = [
      makeTask({ id: 'todo', status: 'todo', completedAt: '2026-11-04T09:00:00+08:00' }),
      makeTask({ id: 'no-time' }),
      makeTask({ id: 'broken', completedAt: '不是时间' }),
    ];

    expect(completedLast7Days(tasks, NOW).every((day) => day.count === 0)).toBe(true);
  });

  it('兼容旧备份的 isCompleted 字段（统一口径，不能只看 status）', () => {
    const legacy = {
      ...makeTask({ id: 'legacy', status: 'todo', completedAt: '2026-11-03T10:00:00+08:00' }),
      isCompleted: true,
    } as Task;

    const days = completedLast7Days([legacy], NOW);
    expect(days[5].count).toBe(1);
  });
});

describe('typeDistribution', () => {
  it('未知类型归入「其他」，不产生 undefined 计数', () => {
    const tasks = [
      makeTask({ id: '1', type: 'exam' }),
      { ...makeTask({ id: '2' }), type: 'legacy-type' } as unknown as Task,
    ];

    const dist = typeDistribution(tasks);
    const byType = Object.fromEntries(dist.map((item) => [item.type, item.count]));

    expect(byType.exam).toBe(1);
    expect(byType.other).toBe(1);
    expect(dist.every((item) => Number.isFinite(item.count))).toBe(true);
  });
});

describe('hoursThisWeek', () => {
  it('周一为一周起点，只汇总本周已完成的预计/实际耗时', () => {
    const tasks = [
      makeTask({
        id: 'mon',
        completedAt: '2026-11-02T10:00:00+08:00',
        estimatedHours: 2,
        actualHours: 3,
      }),
      makeTask({
        id: 'wed',
        completedAt: '2026-11-04T10:00:00+08:00',
        estimatedHours: 1.5,
        actualHours: 1,
      }),
      // 上周日，不算本周
      makeTask({ id: 'sun', completedAt: '2026-11-01T10:00:00+08:00', estimatedHours: 9 }),
      // 未完成，不算
      makeTask({
        id: 'todo',
        status: 'todo',
        completedAt: '2026-11-04T10:00:00+08:00',
        estimatedHours: 4,
      }),
    ];

    const week = hoursThisWeek(tasks, NOW);

    expect(week.labels).toHaveLength(7);
    expect(week.estimated[0]).toBe(2); // 周一
    expect(week.estimated[2]).toBe(1.5); // 周三
    expect(week.totalEstimated).toBe(3.5);
    expect(week.totalActual).toBe(4);
    expect(week.doneCount).toBe(2);
  });

  it('实际耗时未填写按 0 计，避免累计成 NaN', () => {
    const tasks = [
      makeTask({ id: 'x', completedAt: '2026-11-03T10:00:00+08:00', actualHours: undefined }),
    ];
    const week = hoursThisWeek(tasks, NOW);

    expect(week.totalActual).toBe(0);
    expect(Number.isFinite(week.totalEstimated)).toBe(true);
  });
});
