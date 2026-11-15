import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { parseDateTime } from '../parseDateTime';

function result(input: string, now: Date) {
  const parsed = parseDateTime(input, now);
  return {
    ...parsed,
    key: dayjs(parsed.deadline).format('YYYY-MM-DD HH:mm'),
  };
}

describe('parseDateTime：下周日期', () => {
  const tuesday = new Date(2026, 10, 3, 10, 0);

  it.each([
    ['下周一', '2026-11-09'],
    ['下周三', '2026-11-11'],
    ['下周日', '2026-11-15'],
  ])('%s 落在下一个自然周，而不是多加一周', (input, expectedDate) => {
    expect(result(`${input}交报告`, tuesday).key).toBe(`${expectedDate} 16:30`);
  });
});

describe('parseDateTime：非法与边界日期', () => {
  it('非法“32号”保留在标题里，不误删原文', () => {
    const parsed = result('32号报告', new Date(2026, 10, 3, 10, 0));
    expect(parsed.hasDate).toBe(false);
    expect(parsed.title).toBe('32号报告');
  });

  it('2 月没有 31 号时顺延到下一个合法月份', () => {
    const parsed = result('31号交实验', new Date(2026, 1, 1, 10, 0));
    expect(parsed.hasDate).toBe(true);
    expect(parsed.key).toBe('2026-03-31 16:30');
  });
});

describe('parseDateTime：时段换算', () => {
  it('深夜 3 点是 03:00，不是 15:00', () => {
    expect(result('明天深夜3点写代码', new Date(2026, 10, 3, 10, 0)).key).toBe('2026-11-04 03:00');
  });

  it('下午 12 点保持 12:00，晚上 12 点归零', () => {
    expect(result('下午12点开会', new Date(2026, 10, 3, 10, 0)).key).toBe('2026-11-03 12:00');
    expect(result('明天晚上12点截止', new Date(2026, 10, 3, 10, 0)).key).toBe('2026-11-04 00:00');
  });

  it('中文数字与“点半”仍然生效', () => {
    expect(result('后天下午三点半答辩', new Date(2026, 10, 3, 10, 0)).key).toBe('2026-11-05 15:30');
  });
});
