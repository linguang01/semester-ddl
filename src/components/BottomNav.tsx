import { ListIcon, PlusIcon, SunIcon } from './icons';

export type TabKey = 'all' | 'today';

interface BottomNavProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  onCreate: () => void;
}

export function BottomNav({ active, onChange, onCreate }: BottomNavProps) {
  return (
    <nav
      aria-label="底部导航"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-4px_16px_rgba(15,23,42,0.04)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-[0_-4px_16px_rgba(0,0,0,0.4)]"
    >
      <div
        className="mx-auto grid max-w-md grid-cols-3"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 20px)' }}
      >
        <button
          type="button"
          onClick={() => onChange('all')}
          aria-current={active === 'all' ? 'page' : undefined}
          className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
            active === 'all' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <ListIcon className="h-[22px] w-[22px]" />
          全部
        </button>

        <span aria-hidden="true" className="flex h-16 items-center justify-center" />

        <button
          type="button"
          onClick={() => onChange('today')}
          aria-current={active === 'today' ? 'page' : undefined}
          className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
            active === 'today' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <SunIcon className="h-[22px] w-[22px]" />
          今日
        </button>
      </div>

      <button
        type="button"
        onClick={onCreate}
        aria-label="新增事项"
        className="absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg shadow-slate-900/25 ring-4 ring-slate-100 transition active:scale-95 dark:bg-slate-100 dark:text-slate-900 dark:shadow-slate-950/50 dark:ring-slate-950"
      >
        <PlusIcon className="h-6 w-6" />
      </button>
    </nav>
  );
}