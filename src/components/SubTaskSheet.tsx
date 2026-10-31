import { useEffect, useState } from 'react';
import type { SubTask, Task } from '../types';
import type { Notify } from './Toast';
import { CheckIcon, XIcon } from './icons';

interface SubTaskSheetProps {
  /** 当前要勾选子任务的任务（父层传入的是实时对象，随更新刷新） */
  task: Task;
  onClose: () => void;
  /** 持久化子任务变更，并联动任务完成状态 */
  onUpdateSubTasks: (id: string, subTasks: SubTask[]) => Promise<void>;
  /** 跳转到完整编辑（编辑标题/DDL 等） */
  onEdit: (task: Task) => void;
  notify: Notify;
}

export function SubTaskSheet({ task, onClose, onUpdateSubTasks, onEdit, notify }: SubTaskSheetProps) {
  // 本地乐观状态：勾选立即反映到 UI，再异步落库
  const [items, setItems] = useState<SubTask[]>(() => task.subTasks ?? []);
  const [newTitle, setNewTitle] = useState('');

  const completed = items.filter((item) => item.isCompleted).length;
  const total = items.length;

  // 打开时锁定背景滚动
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Esc 关闭
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /** 统一落库：新数组先写本地，再异步持久化，失败时回滚 */
  const persist = async (next: SubTask[]) => {
    setItems(next);
    try {
      await onUpdateSubTasks(task.id, next);
    } catch (error) {
      setItems(task.subTasks ?? []); // 回滚到最近一次成功状态
      notify(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const toggleItem = (index: number) => {
    const next = items.map((item, i) =>
      i === index ? { ...item, isCompleted: !item.isCompleted } : item,
    );
    void persist(next);
  };

  const addItem = () => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle('');
    void persist([...items, { title, isCompleted: false }]);
  };

  const removeItem = (index: number) => {
    void persist(items.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/60"
        onClick={onClose}
        role="presentation"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="subtask-sheet-title"
        className="sheet-enter relative max-h-[80dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-white px-4 pt-3 shadow-2xl dark:bg-slate-900"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 20px))' }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 id="subtask-sheet-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              子任务
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{task.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* 进度概览 */}
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {total === 0 ? '还没有子任务' : completed === total ? '全部完成 🎉' : '已完成'}
          </span>
          <span
            className={`text-sm font-semibold tabular-nums ${
              completed === total && total > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            {completed}/{total}
          </span>
        </div>

        {/* 子任务列表 */}
        <ul aria-label="子任务列表" className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li
              key={index}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800"
            >
              {/* 勾选框 */}
              <button
                type="button"
                role="checkbox"
                aria-checked={item.isCompleted}
                aria-label={`${item.isCompleted ? '取消完成' : '标记完成'}：${item.title}`}
                onClick={() => toggleItem(index)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition hover:bg-slate-50 active:scale-95 dark:hover:bg-slate-800/60"
              >
                <span
                  className={`flex h-[22px] w-[22px] items-center justify-center rounded-md border-2 transition ${
                    item.isCompleted
                      ? 'border-emerald-500 bg-emerald-500'
                      : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
                  }`}
                >
                  {item.isCompleted && <CheckIcon className="h-3.5 w-3.5 text-white" />}
                </span>
              </button>

              <p
                className={`min-w-0 flex-1 break-words text-sm ${
                  item.isCompleted
                    ? 'text-slate-400 line-through dark:text-slate-500'
                    : 'text-slate-800 dark:text-slate-200'
                }`}
              >
                {item.title}
              </p>

              <button
                type="button"
                onClick={() => removeItem(index)}
                aria-label={`删除子任务：${item.title}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-100 hover:text-rose-500 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-rose-400"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </li>
          ))}

          {items.length === 0 && (
            <li className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
              点击下方输入框，把一个任务拆成可勾选的小步骤
            </li>
          )}
        </ul>

        {/* 新增子任务 */}
        <div className="mt-3 flex items-center gap-2">
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addItem();
              }
            }}
            maxLength={60}
            placeholder="添加子任务，回车确认"
            aria-label="新子任务标题"
            className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:bg-slate-800 dark:focus:ring-indigo-500/20"
          />
          <button
            type="button"
            onClick={addItem}
            disabled={!newTitle.trim()}
            className="h-12 shrink-0 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            添加
          </button>
        </div>

        {/* 底部操作 */}
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-slate-200 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/60"
        >
          编辑事项（标题 / DDL 等）
        </button>
      </div>
    </div>
  );
}
