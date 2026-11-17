import type { Task } from '../types';
import { timestampMs } from './timestamp';

/** 最多展示几个历史课程名：太多会变成噪音，撑爆一行 */
const MAX_COURSE_OPTIONS = 6;

/**
 * 从现有任务里挑出「最近用过的课程名」，供课程输入框下方的一键 chips。
 *
 * 学生的真实输入习惯是同一门课反复加作业（高数作业、高数实验、高数习题），
 * 每次手敲课名是最没必要的那几次按键。按最近创建时间排序，最近的排最前。
 */
export function recentCourseOptions(tasks: Task[]): string[] {
  const latest = new Map<string, number>();

  for (const task of tasks) {
    if (task.deleted) continue;
    const course = task.course?.trim();
    if (!course) continue;

    const stamp = timestampMs(task.createdAt);
    const prev = latest.get(course);
    if (prev === undefined || stamp > prev) latest.set(course, stamp);
  }

  return [...latest.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_COURSE_OPTIONS)
    .map(([course]) => course);
}
