import { useEffect, useState } from 'react';
import type { Task, TaskStatus, TaskType } from '../types';
import {
  PRIORITY_DOT,
  PRIORITY_LABEL,
  TASK_TYPES,
  TYPE_LABEL,
  TYPE_STYLE,
  formatDeadline,
  isOverdue,
} from '../utils/taskDisplay';
import { calcDdlProgress, formatPublishDate, getRemainText } from '../utils/ddlProgress';
import { CheckIcon } from './icons';

type StatusFilter = 'all' | TaskStatus;
type TypeFilter = 'all' | TaskType;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'todo', label: '未完成' },
  { value: 'done', label: '已完成' },
];

interface AllTasksViewProps {
  /** 已按 deadline 升序 */
  tasks: Task[];
  /** 今日三件事中的 taskId，用于显示「今日」标记 */
  todayIds: string[];
  onEdit: (task: Task) => void;
  onToggle: (task: Task) => void;
}

export function AllTasksView({ tasks, todayIds, onEdit, onToggle }: AllTasksViewProps) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');

  // 每 60s 刷新一次「当前时间」，驱动进度条与「还剩 X 天」随时间/跨天更新
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = tasks.filter((task) => {
    if (status !== 'all' && task.status !== status) return false;
    if (type !== 'all' && task.type !== type) return false;
    return true;
  });

  const resetFilters = () => {
    setStatus('all');
    setType('all');
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2" aria-label="筛选">
        <div className="flex gap-2">
          {STATUS_OPTIONS.map((option) => {
            const active = status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatus(option.value)}
                aria-pressed={active}
                className={`h-11 flex-1 rounded-xl text-xs font-medium transition ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
                    : 'border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setType('all')}
            aria-pressed={type === 'all'}
            className={`h-11 rounded-xl px-3 text-xs font-medium transition ${
              type === 'all'
                ? 'border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300'
                : 'border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
            }`}
          >
            全部类型
          </button>
          {TASK_TYPES.map((item) => {
            const active = type === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setType(item)}
                aria-pressed={active}
                className={`h-11 rounded-xl px-3 text-xs font-medium transition ${
                  active
                    ? 'border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                }`}
              >
                {TYPE_LABEL[item]}
              </button>
            );
          })}
        </div>

        <p className="px-1 pt-1 text-[11px] text-slate-400 dark:text-slate-500">
          点事项可编辑或删除
        </p>
      </section>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">没有符合筛选条件的事项</p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-3 h-11 rounded-xl border border-slate-200 px-4 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60"
          >
            清除筛选
          </button>
        </div>
      ) : (
        <ul aria-label="事项列表" className="space-y-2">
          {filtered.map((task) => {
            const done = task.status === 'done';
            const overdue = isOverdue(task);
            const isToday = todayIds.includes(task.id);
            const progress = calcDdlProgress(task, now);
            const urgent = progress.remainDays <= 3; // 含逾期（负数）

            return (
              <li
                key={task.id}
                className={`rounded-xl border p-3 shadow-sm transition ${
                  overdue
                    ? 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    aria-label={`${done ? '恢复待办' : '标记完成'}：${task.title}`}
                    onClick={() => onToggle(task)}
                    className="-ml-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  >
                    <span
                      className={`flex h-[22px] w-[22px] items-center justify-center rounded-md border-2 transition ${
                        done
                          ? 'border-emerald-500 bg-emerald-500'
                          : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
                      }`}
                    >
                      {done && <CheckIcon className="h-3.5 w-3.5 text-white" />}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onEdit(task)}
                    className="min-w-0 flex-1 rounded-lg text-left"
                  >
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span
                        className={`break-words text-sm font-medium leading-5 ${
                          done
                            ? 'text-slate-400 line-through dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {task.title}
                      </span>
                      {isToday && (
                        <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                          今日
                        </span>
                      )}
                      {overdue && (
                        <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
                          已过期
                        </span>
                      )}
                    </span>

                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_STYLE[task.type]}`}
                      >
                        {TYPE_LABEL[task.type]}
                      </span>
                      <span className="tabular-nums">{formatDeadline(task.deadline)}</span>
                    </span>

                    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500">
                      <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`} />
                      <span>{PRIORITY_LABEL[task.priority]}优先级</span>
                      <span aria-hidden="true">·</span>
                      <span>{task.estimatedHours}h</span>
                      {task.course && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="max-w-[8rem] truncate">{task.course}</span>
                        </>
                      )}
                    </span>

                    <span className="mt-2 block">
                      <span className="flex items-center justify-between gap-2 text-[10px] leading-4">
                        <span className="shrink-0 text-slate-400 dark:text-slate-500">
                          发布 {formatPublishDate(progress.createdAt)}
                        </span>
                        <span
                          className={`tabular-nums ${
                            urgent
                              ? 'font-semibold text-rose-600 dark:text-rose-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {getRemainText(progress.remainDays, progress.totalDays)}
                        </span>
                      </span>
                      <span
                        role="progressbar"
                        aria-valuenow={Math.round(progress.percent)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                      >
                        <span
                          className={`block h-full rounded-full ${
                            progress.overdue ? 'bg-rose-500' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${progress.percent}%` }}
                        />
                      </span>
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}