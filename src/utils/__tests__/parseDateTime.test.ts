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

describe('parseDateTime：X月X日', () => {
  const now = new Date(2026, 10, 17, 13, 0); // 2026-11-17

  it.each([
    ['12月5日交论文', '2026-12-05'],
    ['10月31号交大作业', '2027-10-31'], // 已过去 → 顺延到明年，但月份必须仍是对的
    ['十二月二十五号交实验报告', '2026-12-25'],
  ])('%s 的月份不被丢掉', (input, expected) => {
    const parsed = result(input, now);
    expect(parsed.key).toBe(`${expected} 16:30`);
    expect(parsed.title).not.toContain('月');
  });

  it('已过去的月份顺延到明年，而不是错到别的月份', () => {
    // 11 月说「1月5日」，指的是明年 1 月 5 日
    expect(result('1月5日交论文', now).key).toBe('2027-01-05 16:30');
  });

  it('不存在的日期（2月30日）不做解析，保留原文', () => {
    const parsed = result('2月30日交论文', now);
    expect(parsed.hasDate).toBe(false);
    expect(parsed.title).toContain('2月30日');
  });
});

describe('parseDateTime：时段单独出现', () => {
  const now = new Date(2026, 10, 17, 13, 0); // 2026-11-17 周二

  it('「周四中午前」取 12:00，不是默认的 16:30', () => {
    const parsed = result('周四中午前交报告', now);
    expect(parsed.key).toBe('2026-11-19 12:00');
    expect(parsed.title).toBe('报告');
  });

  it('「明天下午交」仍取 16:30（这是绝大多数 DDL 的截止时刻）', () => {
    expect(result('明天下午交作业', now).key).toBe('2026-11-18 16:30');
  });

  it('「晚上」单独出现取当天 23:59', () => {
    expect(result('明天晚上交作业', now).key).toBe('2026-11-18 23:59');
  });
});

describe('parseDateTime：后缀与残留', () => {
  const now = new Date(2026, 10, 17, 13, 0);

  it('「之前 / 前 / 截止」不残留进标题', () => {
    expect(result('下周三之前交报告', now).title).toBe('报告');
    expect(result('晚上八点前交作业', now).title).toBe('作业');
    expect(result('周五18:00截止交实验报告', now).title).toBe('实验报告');
  });

  it('「前」是词的一部分时不误删（前端作业）', () => {
    expect(result('下周三之前交前端作业', now).title).toBe('前端作业');
  });
});

describe('parseDateTime：其他高频写法', () => {
  const now = new Date(2026, 10, 17, 13, 0); // 周二

  it('「16时」按 16:00 识别', () => {
    expect(result('明天16时开会', now).key).toBe('2026-11-18 16:00');
  });

  it('只说「下周」时取下周一', () => {
    expect(result('下周交报告', now).key).toBe('2026-11-23 16:30');
  });

  it('「3天后」按自然日顺延', () => {
    expect(result('三天后交报告', now).key).toBe('2026-11-20 16:30');
  });

  it('没有时段前缀的「3点半」按下午理解', () => {
    expect(result('3点半前交', now).key).toBe('2026-11-17 15:30');
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
