import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { parseTaskText } from '../parseTaskText';

const NOW = new Date(2026, 10, 17, 13, 0); // 2026-11-17 周二

function parsed(input: string) {
  const result = parseTaskText(input, NOW);
  return { ...result, key: dayjs(result.deadline).format('YYYY-MM-DD HH:mm') };
}

describe('parseTaskText：一句话填全表', () => {
  it('日期、课程、耗时、优先级一次抽全', () => {
    const result = parsed('下周三之前交高数作业，预计3小时，高优先级');
    expect(result.key).toBe('2026-11-25 16:30');
    expect(result.title).toBe('高数作业');
    expect(result.course).toBe('高数');
    expect(result.estimatedHours).toBe(3);
    expect(result.priority).toBe('high');
  });

  it('「实验报告」不会被拆出一个叫「实验」的假课程', () => {
    const result = parsed('三天后交实验报告');
    expect(result.title).toBe('实验报告');
    expect(result.course).toBe('');
    expect(result.hasCourse).toBe(false);
  });

  it('句首只说时段也能识别，任务名保持干净', () => {
    const result = parsed('下午答辩');
    expect(result.key).toBe('2026-11-17 16:30');
    expect(result.title).toBe('答辩');
    expect(result.hasTime).toBe(true);
    expect(result.type).toBe('exam');
  });
});
