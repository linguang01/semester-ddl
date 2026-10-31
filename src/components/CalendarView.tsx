import { useMemo, useState } from 'react';
import type { Task, TaskType } from '../types';
import { buildMonthGrid, toDateKey } from '../utils/monthGrid';
import {
  PRIORITY_DOT,
  PRIORITY_LABEL,
  TYPE_LABEL,
  TYPE_STYLE,
  isOverdue,
  subTaskProgress,
} from '../utils/taskDisplay';
import { CalendarIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';

/** 周标题：周一为一周第一天 */
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/** 各类型的圆点底色（月历格子里用，纯色圆点更易一眼分辨） */
const TYPE_DOT: Record<TaskType, string> = {
  homework: 'bg-indigo-500',
  exam: 'bg-rose-500',
  club: 'bg-emerald-500',
  other: 'bg-slate-400',
};

/** 日期格子里最多显示的圆点个数，超出则折叠为 +N */
const MAX_DOTS = 3;

interface CalendarViewProps {
  tasks: Task[];
  /** 今天，格式 YYYY-MM-DD */
  today: string;
  onEdit: (task: Task) => void;
  onToggle: (task: Task) => void;
  onOpenSubtasks: (task: Task) => void;
}

/** 原生 JS 把 ISO 字符串格式化成 HH:mm（仅展示时刻，日历场景足够） */
function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 把 YYYY-MM-DD 解析成「M月D日 周X」标题 */
function formatDateLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = (date.getDay() + 6) % 7; // 周一=0
  return `${m}月${d}日 周${WEEKDAY_LABELS[weekday]}`;
}

export function CalendarView({ tasks, today, onEdit, onToggle, onOpenSubtasks }: CalendarViewProps) {
  // 当前展示的月份（cursor 用 {year, month} 表示，month 为 0-based）
  const todayDate = useMemo(() => {
    const [y, m] = today.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }, [today]);
  const [cursor, setCursor] = useState(() => ({
    year: todayDate.getFullYear(),
    month: todayDate.getMonth(),
  }));

  // 选中的日期键，默认今天
  const [selectedKey, setSelectedKey] = useState(today);

  // 把全部任务按「本地时区的 DDL 日期」分组，方便月历格子直接查
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = toDateKey(new Date(task.deadline));
      const list = map.get(key);
      if (list) list.push(task);
      else map.set(key, [task]);
    }
    return map;
  }, [tasks]);

  const grid = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );

  const prevMonth = () => {
    setCursor(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
    );
  };

  const nextMonth = () => {
    setCursor(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
    );
  };

  const goToday = () => {
    setCursor({ year: todayDate.getFullYear(), month: todayDate.getMonth() });
    setSelectedKey(today);
  };

  // 选中日期的任务列表（tasks 已按 deadline 升序，map 里顺序即升序）
  const selectedTasks = tasksByDate.get(selectedKey) ?? [];

  return (
    <div className="space-y-4">
      {/* 月历卡片 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* 月份导航 */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="上个月"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 active:scale-95 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>

          <div className="text-center">
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {cursor.year}年{cursor.month + 1}月
            </p>
            <button
              type="button"
              onClick={goToday}
              className="mt-0.5 text-[11px] text-indigo-500 transition hover:text-indigo-600 dark:text-indigo-400"
            >
              回到今天
            </button>
          </div>

          <button
            type="button"
            onClick={nextMonth}
            aria-label="下个月"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 active:scale-95 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>

        {/* 周标题 */}
        <div className="mt-4 grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label) => (
            <span
              key={label}
              className="text-center text-[11px] font-medium text-slate-400 dark:text-slate-500"
            >
              {label}
            </span>
          ))}
        </div>

        {/* 日期格子 */}
        <div className="mt-1 grid grid-cols-7 gap-1">
          {grid.map((cell, index) => {
            if (!cell.inMonth) {
              return <span key={`blank-${index}`} aria-hidden="true" className="aspect-square" />;
            }

            const key = toDateKey(cell.date as Date);
            const dayTasks = tasksByDate.get(key) ?? [];
            const isSelected = key === selectedKey;
            const isToday = key === today;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                aria-pressed={isSelected}
                aria-label={`${cursor.month + 1}月${cell.day}日，${dayTasks.length} 件事`}
                className={`flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : isToday
                      ? 'bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/40'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <span className="leading-none">{cell.day}</span>
                {dayTasks.length > 0 && (
                  <span className="mt-1 flex h-1.5 items-center justify-center gap-0.5">
                    {dayTasks.slice(0, MAX_DOTS).map((task) => (
                      <span
                        key={task.id}
                        className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[task.type]}`}
                      />
                    ))}
                    {dayTasks.length > MAX_DOTS && (
                      <span
                        className={`text-[8px] leading-none ${
                          isSelected ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        +{dayTasks.length - MAX_DOTS}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 图例 */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-[10px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
          {(Object.keys(TYPE_LABEL) as TaskType[]).map((type) => (
            <span key={type} className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[type]}`} />
              {TYPE_LABEL[type]}
            </span>
          ))}
        </div>
      </section>

      {/* 选中日期的任务列表 */}
      <section>
        <div className="mb-2 flex items-end justify-between px-1">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {formatDateLabel(selectedKey)}
          </h3>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {selectedTasks.length} 件事
          </span>
        </div>

        {selectedTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <CalendarIcon className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              当天没有 DDL，点下方 + 新增
            </p>
          </div>
        ) : (
          <ul aria-label="当天任务" className="space-y-2">
            {selectedTasks.map((task) => {
              const done = task.status === 'done';
              const overdue = isOverdue(task);
              const hasSubTasks = subTaskProgress(task).total > 0;

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
                      onClick={() => (hasSubTasks ? onOpenSubtasks(task) : onEdit(task))}
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
                        <span className="tabular-nums">{formatTime(task.deadline)}</span>
                        <span className="flex items-center gap-1">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`}
                          />
                          {PRIORITY_LABEL[task.priority]}优先级
                        </span>
                        {task.course && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="max-w-[8rem] truncate">{task.course}</span>
                          </>
                        )}
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
