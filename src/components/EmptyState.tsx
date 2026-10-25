import { PlusIcon, CalendarIcon } from './icons';

interface EmptyStateProps {
  onCreate: () => void;
}

export function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <div className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-400">
        <CalendarIcon className="h-6 w-6" />
      </div>
      <h2 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
        还没有任何 DDL
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
        把作业、考试、社团的事记下来，再从里面挑出今天最重要的三件。
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-5 text-sm font-medium text-white transition active:scale-[0.98] dark:bg-slate-100 dark:text-slate-900"
      >
        <PlusIcon className="h-4 w-4" />
        添加第一条 DDL
      </button>
    </div>
  );
}