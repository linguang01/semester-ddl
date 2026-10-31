import { subTaskProgress } from '../utils/taskDisplay';
import type { Task } from '../types';

interface SubTaskRingProps {
  task: Task;
}

/**
 * 子任务进度环：环形进度 + 「2/5 子任务」文案。
 * 全部完成时圆环变绿并显示对勾。
 */
export function SubTaskRing({ task }: SubTaskRingProps) {
  const { completed, total } = subTaskProgress(task);
  // 无子任务时不渲染（避免出现 0/0）
  if (total === 0) return null;

  const allDone = completed === total;

  // SVG 环形进度几何参数
  const size = 18; // 画布边长
  const strokeWidth = 2.5; // 圆环线宽
  const radius = (size - strokeWidth) / 2; // 圆心到线中心距离
  const circumference = 2 * Math.PI * radius; // 圆周长
  const ratio = total === 0 ? 0 : completed / total;
  // dashoffset：让已完成的弧长按比例显示；圆环从顶部 12 点方向起笔
  const dashoffset = circumference * (1 - ratio);

  return (
    <span className="inline-flex items-center gap-1">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
        role="img"
        aria-label={`子任务 ${completed}/${total} 已完成`}
      >
        {/* 底环（背景轨道） */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-200 dark:text-slate-700"
        />
        {/* 进度弧：从顶部顺时针，strokeLinecap round 让端点圆润 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={
            allDone
              ? 'text-emerald-500 dark:text-emerald-400'
              : 'text-indigo-500 dark:text-indigo-400'
          }
        />
      </svg>
      {/* 全部完成时在圆环右侧补一个对勾标记 */}
      <span
        className={`text-[11px] font-medium tabular-nums ${
          allDone
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-slate-400 dark:text-slate-500'
        }`}
      >
        {allDone && <span aria-hidden="true">✓ </span>}
        {completed}/{total} 子任务
      </span>
    </span>
  );
}
