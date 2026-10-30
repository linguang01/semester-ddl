import type { Task } from '../types';
import { calcDdlProgress, formatPublishDate, getRemainText } from '../utils/ddlProgress';

interface DdlProgressBarProps {
  task: Task;
  /** 驱动倒计时刷新的「当前时间」 */
  now: Date;
  /** 是否在文案左侧显示「发布 X」（全部任务视图需要，今日视图不需要） */
  showPublish?: boolean;
}

/**
 * DDL 进度条 + 剩余文案（共享组件）。
 * 「今日三件事」「待办候选」「全部任务」三处统一使用，保证显示完全一致。
 * 颜色三态：逾期深红 / 紧急红 / 正常蓝。
 */
export function DdlProgressBar({ task, now, showPublish = false }: DdlProgressBarProps) {
  const p = calcDdlProgress(task, now);

  // 文案颜色：逾期深红、紧急红、正常灰
  const textClass = p.overdue
    ? 'font-semibold text-rose-700 dark:text-rose-400'
    : p.urgent
      ? 'font-semibold text-rose-600 dark:text-rose-400'
      : 'text-slate-400 dark:text-slate-500';

  // 进度条颜色：逾期深红、紧急红、正常蓝
  const fillClass = p.overdue
    ? 'bg-rose-700'
    : p.urgent
      ? 'bg-rose-500'
      : 'bg-indigo-500';

  return (
    <span className="mt-1.5 block">
      <span className="flex items-center justify-between gap-2 text-[10px] leading-4">
        {showPublish && (
          <span className="shrink-0 text-slate-400 dark:text-slate-500">
            发布 {formatPublishDate(p.createdAt)}
          </span>
        )}
        <span className={`tabular-nums ${textClass}`}>{getRemainText(p)}</span>
      </span>
      <span
        role="progressbar"
        aria-valuenow={Math.round(p.percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-0.5 block h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
      >
        <span
          className={`block h-full rounded-full transition-[width] duration-500 ease-out ${fillClass}`}
          style={{ width: `${p.percent}%` }}
        />
      </span>
    </span>
  );
}
