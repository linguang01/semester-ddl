import { describe, expect, it } from 'vitest';
import { calcDdlProgress, getRemainText } from '../ddlProgress';
import type { Task } from '../../types';

const NOW = new Date('2026-11-04T12:00:00+08:00');

function makeTask(overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    type: 'homework',
    course: '',
    deadline: '2026-11-10T23:59:00+08:00',
    estimatedHours: 2,
    priority: 'medium',
    status: 'todo',
    createdAt: '2026-11-01T00:00:00+08:00',
    ...overrides,
  };
}

describe('calcDdlProgress', () => {
  it('已完成任务不再判逾期/紧急，进度恒为 100%', () => {
    const task = makeTask({
      id: 'done',
      title: '已交的作业',
      status: 'done',
      deadline: '2026-11-01T00:00:00+08:00',
      completedAt: '2026-10-31T20:00:00+08:00',
    });

    const p = calcDdlProgress(task, NOW);
    expect(p.done).toBe(true);
    expect(p.overdue).toBe(false);
    expect(p.urgent).toBe(false);
    expect(p.percent).toBe(100);
    expect(getRemainText(p)).toBe('已完成');
  });

  it('逾期不足 24 小时按小时展示', () => {
    const task = makeTask({ id: 'late', title: '晚交', deadline: '2026-11-04T09:00:00+08:00' });
    const p = calcDdlProgress(task, NOW);

    expect(p.overdue).toBe(true);
    expect(getRemainText(p)).toBe('已逾期 3 小时');
  });

  it('剩余不足 24 小时切到小时精度', () => {
    const task = makeTask({ id: 'soon', title: '快到了', deadline: '2026-11-04T17:00:00+08:00' });
    const p = calcDdlProgress(task, NOW);

    expect(p.urgent).toBe(true);
    expect(getRemainText(p)).toBe('还剩 5 小时');
  });

  it('剩余超过一天时用自然日口径，避免向上取整多算一天', () => {
    // 距 11-06 23:59 还有 2 天 11 小时 59 分，自然日应为 2 天
    const task = makeTask({ id: 'days', title: '还有几天', deadline: '2026-11-06T23:59:00+08:00' });
    const p = calcDdlProgress(task, NOW);

    expect(p.remainDays).toBe(2);
    // 11-01 到 11-06 共 5 个自然日
    expect(getRemainText(p)).toBe('还剩 2 天 / 共 5 天');
  });

  it('DDL 早于创建时间（异常数据）不会出现负数进度或除零', () => {
    const task = makeTask({
      id: 'weird',
      title: '时间反了',
      createdAt: '2026-11-10T00:00:00+08:00',
      deadline: '2026-11-05T00:00:00+08:00',
    });

    const p = calcDdlProgress(task, NOW);
    expect(p.percent).toBe(0);
    expect(Number.isFinite(p.remainPercent)).toBe(true);
  });
});
