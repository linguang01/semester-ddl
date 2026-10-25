import { useCallback, useState } from 'react';
import dayjs from 'dayjs';
import { AllTasksView } from './components/AllTasksView';
import { BottomNav, type TabKey } from './components/BottomNav';
import { EmptyState } from './components/EmptyState';
import { SettingsSheet } from './components/SettingsSheet';
import { TaskFormSheet } from './components/TaskFormSheet';
import { TodayView } from './components/TodayView';
import { Toast, type Notify, type ToastMessage } from './components/Toast';
import { SettingsIcon } from './components/icons';
import {
  DailySelectionLimitError,
  MAX_DAILY_TASKS,
  useDailySelection,
} from './hooks/useDailySelection';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useTasks } from './hooks/useTasks';
import { useTheme } from './hooks/useTheme';
import { todayKey } from './utils/date';
import type { NewTaskInput, Task, TaskUpdate } from './types';

type SheetState = { mode: 'create' } | { mode: 'edit'; task: Task } | null;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const today = todayKey();

  const {
    tasks,
    loading,
    error,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskDone,
  } = useTasks();

  const { taskIds, addToSelection, removeFromSelection } = useDailySelection(today);

  // 常驻监听 beforeinstallprompt，避免设置面板打开太晚而错过事件
  const install = useInstallPrompt();

  // 深浅色主题：默认跟随早晚时间
  const theme = useTheme();

  const [tab, setTab] = useState<TabKey>('today');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const notify: Notify = useCallback((message, tone = 'info') => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const openCreate = useCallback(() => setSheet({ mode: 'create' }), []);
  const openEdit = useCallback((task: Task) => setSheet({ mode: 'edit', task }), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  const handleCreate = useCallback(
    async (input: NewTaskInput) => {
      await addTask(input);
      notify('已添加事项', 'success');
    },
    [addTask, notify],
  );

  const handleUpdate = useCallback(
    async (id: string, patch: TaskUpdate) => {
      await updateTask(id, patch);
      notify('已保存修改', 'success');
    },
    [updateTask, notify],
  );

  const handleDelete = useCallback(
    async (task: Task) => {
      await deleteTask(task.id);
      notify('已删除事项', 'success');
    },
    [deleteTask, notify],
  );

  const handleToggle = useCallback(
    async (task: Task) => {
      try {
        await toggleTaskDone(task.id);
      } catch (cause) {
        notify(describeError(cause), 'error');
      }
    },
    [toggleTaskDone, notify],
  );

  const handleAddToToday = useCallback(
    async (task: Task) => {
      if (task.status === 'done') {
        notify('已完成的事项不能加入今日', 'error');
        return;
      }

      if (taskIds.length >= MAX_DAILY_TASKS) {
        notify('今日三件事最多选 3 个，做完再加', 'info');
        return;
      }

      try {
        await addToSelection(today, task.id);
      } catch (cause) {
        if (cause instanceof DailySelectionLimitError) {
          notify('今日三件事最多选 3 个，做完再加', 'info');
        } else {
          notify(describeError(cause), 'error');
        }
      }
    },
    [taskIds.length, today, addToSelection, notify],
  );

  const handleRemoveFromToday = useCallback(
    async (task: Task) => {
      try {
        await removeFromSelection(today, task.id);
      } catch (cause) {
        notify(describeError(cause), 'error');
      }
    },
    [today, removeFromSelection, notify],
  );

  return (
    <>
      <div className="mx-auto min-h-screen w-full max-w-md pb-tabbar">
        <div className="pt-page px-4">
          <header className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-indigo-500 dark:text-indigo-400">
                SEMESTER DDL
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {tab === 'all' ? '全部事项' : '今天'}
              </h1>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {tab === 'all'
                  ? `共 ${tasks.length} 件 · 按 DDL 先后排序`
                  : dayjs(today).format('M月D日 ddd')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="打开设置"
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white active:scale-95 dark:text-slate-500 dark:hover:bg-slate-800"
            >
              <SettingsIcon className="h-5 w-5" />
            </button>
          </header>

          {error && (
            <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
              数据读取失败：{describeError(error)}
            </p>
          )}

          {loading ? (
            <p className="py-20 text-center text-xs text-slate-400 dark:text-slate-500">正在读取本地数据…</p>
          ) : tasks.length === 0 ? (
            <EmptyState onCreate={openCreate} />
          ) : tab === 'all' ? (
            <AllTasksView
              tasks={tasks}
              todayIds={taskIds}
              onEdit={openEdit}
              onToggle={handleToggle}
            />
          ) : (
            <TodayView
              date={today}
              tasks={tasks}
              taskIds={taskIds}
              onAdd={handleAddToToday}
              onRemove={handleRemoveFromToday}
            />
          )}
        </div>
      </div>

      <BottomNav active={tab} onChange={setTab} onCreate={openCreate} />

      {sheet && (
        <TaskFormSheet
          task={sheet.mode === 'edit' ? sheet.task : null}
          onClose={closeSheet}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          notify={notify}
        />
      )}

      {settingsOpen && (
        <SettingsSheet
          install={install}
          theme={theme}
          notify={notify}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {toast && <Toast toast={toast} onDismiss={dismissToast} />}
    </>
  );
}
