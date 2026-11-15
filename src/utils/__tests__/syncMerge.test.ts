import { describe, expect, it } from 'vitest';
import { planSyncMerge } from '../../lib/syncMerge';
import type { TasksRow } from '../../lib/database.types';
import type { Task } from '../../types';
import { timestampMs } from '../timestamp';

function makeTask(id: string, updatedAt: string, deleted = false): Task {
  return {
    id,
    title: `任务 ${id}`,
    type: 'homework',
    course: '',
    deadline: '2026-11-20T08:30:00.000Z',
    estimatedHours: 1,
    priority: 'medium',
    status: 'todo',
    createdAt: '2026-11-01T00:00:00.000Z',
    subTasks: [],
    updatedAt,
    ...(deleted ? { deleted: true } : {}),
  };
}

function makeRow(id: string, updatedAt: string, deleted = false): TasksRow {
  const task = makeTask(id, updatedAt, deleted);
  return {
    id,
    user_id: 'user-1',
    title: task.title,
    type: task.type,
    course: task.course,
    deadline: task.deadline,
    estimated_hours: task.estimatedHours,
    actual_hours: null,
    priority: task.priority,
    status: task.status,
    created_at: task.createdAt,
    completed_at: null,
    sub_tasks: [],
    updated_at: updatedAt,
    deleted,
  };
}

describe('timestampMs', () => {
  it('按实际时间比较不同时区与精度，而不是比较 ISO 字符串', () => {
    expect(timestampMs('2026-11-01T00:00:00.000Z')).toBe(timestampMs('2026-10-31T16:00:00-08:00'));
    expect(timestampMs('2026-11-01T00:00:00.123456+00:00')).toBeGreaterThan(
      timestampMs('2026-11-01T00:00:00.122Z'),
    );
    expect(timestampMs('非法时间')).toBe(0);
  });
});

describe('planSyncMerge', () => {
  it('同一时刻的不同 ISO 写法不触发重复拉取或推送', () => {
    const plan = planSyncMerge(
      [makeTask('same', '2026-11-01T00:00:00.000Z')],
      [makeRow('same', '2026-10-31T16:00:00-08:00')],
    );

    expect(plan).toEqual({ remoteWrites: [], localPushes: [] });
  });

  it('远端较新时只拉取，包括需要跨设备传播的删除墓碑', () => {
    const remote = makeRow('deleted', '2026-11-03T00:00:00+00:00', true);
    const plan = planSyncMerge([makeTask('deleted', '2026-11-02T00:00:00.000Z')], [remote]);

    expect(plan.remoteWrites).toEqual([remote]);
    expect(plan.localPushes).toEqual([]);
  });

  it('时间戳相同但内容冲突时固定由远端收敛，避免设备永久分叉', () => {
    const local = makeTask('tie', '2026-11-03T00:00:00.000Z');
    const remote = { ...makeRow('tie', '2026-11-03T00:00:00.000Z'), title: '远端版本' };

    const plan = planSyncMerge([local], [remote]);
    expect(plan.remoteWrites).toEqual([remote]);
    expect(plan.localPushes).toEqual([]);
  });

  it('本地较新或远端缺失时才推送，远端较新时只拉取', () => {
    const localNewer = makeTask('local-newer', '2026-11-03T00:00:00.000Z');
    const localOnly = makeTask('local-only', '2026-11-02T00:00:00.000Z');
    const remoteOnly = makeRow('remote-only', '2026-11-02T00:00:00.000Z');

    const plan = planSyncMerge(
      [localNewer, localOnly, makeTask('remote-newer', '2026-11-01T00:00:00.000Z')],
      [
        makeRow('local-newer', '2026-11-02T00:00:00.000Z'),
        makeRow('remote-newer', '2026-11-04T00:00:00.000Z'),
        remoteOnly,
      ],
    );

    expect(plan.localPushes).toEqual([localNewer, localOnly]);
    expect(plan.remoteWrites.map((row) => row.id)).toEqual(['remote-newer', 'remote-only']);
  });
});
