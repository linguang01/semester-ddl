import dayjs from 'dayjs';
import { MAX_DAILY_TASKS } from '../hooks/useDailySelection';
import type { Task } from '../types';
import {
  PRIORITY_DOT,
  PRIORITY_LABEL,
  TYPE_LABEL,
  TYPE_STYLE,
  formatDeadline,
} from '../utils/taskDisplay';
import { XIcon } from './icons';

interface TodayViewProps {
  date: string;
  /** 已按 deadline 升序 */
  tasks: Task[];
  taskIds: string[];
  onAdd: (task: Task) => void;
  onRemove: (task: Task) => void;
}

export function TodayView({ date, tasks, taskIds, onAdd, onRemove }: TodayViewProps) {
  const selectedTasks: Task[] = taskIds
    .map((id) => tasks.find((task) => task.id === id))
    .filter((task): task is Task => task !== undefined);

  const candidates = tasks.filter(
    (task) => task.status === 'todo' && !taskIds.includes(task.id),
  );

  const full = taskIds.length >= MAX_DAILY_TASKS;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              今日三件事
            </h2>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              {dayjs(date).format('M月D日 ddd')} · 只挑最重要的 {MAX_DAILY_TASKS} 件
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              full
                ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {taskIds.length}/{MAX_DAILY_TASKS}
          </span>
        </div>

        <ol aria-label="今日三件事" className="mt-3 space-y-2">
          {Array.from({ length: MAX_DAILY_TASKS }).map((_, index) => {
            const task = selectedTasks[index];

            return (
              <li
                key={index}
                className={`flex min-h-[56px] items-center gap-3 rounded-xl border px-3 py-2 ${
                  task
                    ? 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/60'
                    : 'border-dashed border-slate-200 bg-white dark:border-slate-800 dark:bg-transparent'
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-400 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700">
                  {index + 1}
                </span>

                {task ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-medium ${
                          task.status === 'done'
                            ? 'text-slate-400 line-through dark:text-slate-500'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {task.title}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`}
                        />
                        <span>{formatDeadline(task.deadline)}</span>
                        {task.status === 'done' && (
                          <span className="text-emerald-600 dark:text-emerald-400">已完成</span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(task)}
                      aria-label={`从今日移出：${task.title}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                    >
                      <XIcon className="h-5 w-5" />
                    </button>
                  </>
                ) : (
                  <p className="min-w-0 flex-1 text-xs text-slate-400 dark:text-slate-500">
                    还没选，从下面挑一件
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        {taskIds.length === 0 && (
          <div className="mt-3 rounded-xl bg-indigo-50/70 px-3 py-3 text-center text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
            从待办里挑三件最重要的事
          </div>
        )}

        {full && (
          <p className="mt-3 text-center text-[11px] text-amber-600 dark:text-amber-400">
            今日三件事最多选 3 个，做完再加
          </p>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-end justify-between px-1">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">待办候选</h3>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {candidates.length} 件
          </span>
        </div>

        {full && candidates.length > 0 && (
          <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            名额已满：做完一件再选下一件。
          </p>
        )}

        {candidates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
            {tasks.length === 0
              ? '还没有事项，点下方 + 添加第一条 DDL'
              : '没有可添加的待办，先休息一下或新增事项'}
          </div>
        ) : (
          <ul aria-label="待办候选" className="space-y-2">
            {candidates.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    {task.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_STYLE[task.type]}`}
                    >
                      {TYPE_LABEL[task.type]}
                    </span>
                    <span className="flex items-center gap-1">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`}
                      />
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                    <span className="tabular-nums">{formatDeadline(task.deadline)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onAdd(task)}
                  className={`h-11 shrink-0 rounded-lg px-3 text-xs font-medium transition active:scale-[0.98] ${
                    full
                      ? 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                      : 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
                  }`}
                >
                  加入今日
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}