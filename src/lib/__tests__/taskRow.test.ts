import { describe, expect, it } from 'vitest';
import { isCompleteTaskRow } from '../taskRow';
import type { TasksRow } from '../database.types';

const fullRow: TasksRow = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  title: '写实验报告',
  type: 'homework',
  course: '物联网导论',
  deadline: '2026-11-10T08:30:00.000Z',
  estimated_hours: 3,
  actual_hours: null,
  priority: 'high',
  status: 'todo',
  created_at: '2026-11-01T00:00:00.000Z',
  completed_at: null,
  sub_tasks: [],
  updated_at: '2026-11-02T00:00:00.000Z',
  deleted: false,
};

describe('isCompleteTaskRow', () => {
  it('整行完整时通过', () => {
    expect(isCompleteTaskRow(fullRow)).toBe(true);
  });

  it('Realtime 只带主键 + 变更列时判定为不完整（必须走精确补拉）', () => {
    // REPLICA IDENTITY DEFAULT 下的典型 payload：只有 id/user_id/status/updated_at
    const partial = {
      id: fullRow.id,
      user_id: fullRow.user_id,
      status: 'done',
      updated_at: '2026-11-03T00:00:00.000Z',
    } as Partial<TasksRow>;

    expect(isCompleteTaskRow(partial)).toBe(false);
  });

  it('缺 sub_tasks 视为不完整：直接落库会把子任务清空', () => {
    const { sub_tasks: _subTasks, ...withoutSubTasks } = fullRow;
    expect(isCompleteTaskRow(withoutSubTasks as Partial<TasksRow>)).toBe(false);
  });

  it('关键字段类型错误视为不完整', () => {
    const wrong = { ...fullRow, estimated_hours: '3' } as unknown as Partial<TasksRow>;
    expect(isCompleteTaskRow(wrong)).toBe(false);
  });

  it('空值不当作完整行', () => {
    expect(isCompleteTaskRow(null)).toBe(false);
    expect(isCompleteTaskRow(undefined)).toBe(false);
  });
});
