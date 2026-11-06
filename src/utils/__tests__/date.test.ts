import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { DATETIME_INPUT_FORMAT, deadlineAfterDays, defaultNewTaskDeadline } from '../date';

const fmt = (d: dayjs.Dayjs) => d.format(DATETIME_INPUT_FORMAT);

describe('defaultNewTaskDeadline：新增任务默认 DDL', () => {
  it('今天 16:30 未过 → 今天 16:30', () => {
    const now = dayjs('2026-11-06T09:00:00');
    expect(fmt(defaultNewTaskDeadline(now))).toBe('2026-11-06T16:30');
  });

  it('今天 16:30 已过 → 顺延到明天 16:30（避免默认值即过去时间）', () => {
    const now = dayjs('2026-11-06T17:00:00');
    expect(fmt(defaultNewTaskDeadline(now))).toBe('2026-11-07T16:30');
  });

  it('恰好 16:30 整 → 视为已过，顺延到明天', () => {
    const now = dayjs('2026-11-06T16:30:00');
    expect(fmt(defaultNewTaskDeadline(now))).toBe('2026-11-07T16:30');
  });

  it('跨月 / 跨年正确顺延', () => {
    expect(fmt(defaultNewTaskDeadline(dayjs('2026-12-31T20:00:00')))).toBe('2027-01-01T16:30');
    expect(fmt(defaultNewTaskDeadline(dayjs('2026-11-30T23:59:00')))).toBe('2026-12-01T16:30');
  });
});

describe('deadlineAfterDays：快捷天数', () => {
  it('+1/+3/+7 天都落在 16:30', () => {
    const now = dayjs('2026-11-06T20:15:00');
    expect(fmt(deadlineAfterDays(1, now))).toBe('2026-11-07T16:30');
    expect(fmt(deadlineAfterDays(3, now))).toBe('2026-11-09T16:30');
    expect(fmt(deadlineAfterDays(7, now))).toBe('2026-11-13T16:30');
  });

  it('以「今天」为基准而非当前时间，避免带出时分秒', () => {
    const now = dayjs('2026-11-06T23:59:59');
    expect(fmt(deadlineAfterDays(1, now))).toBe('2026-11-07T16:30');
  });

  it('自定义天数 6 天', () => {
    expect(fmt(deadlineAfterDays(6, dayjs('2026-11-06T10:00:00')))).toBe('2026-11-12T16:30');
  });
});
