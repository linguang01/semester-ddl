import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { AllTasksView } from './components/AllTasksView';
import { BottomNav, type TabKey } from './components/BottomNav';
import { EmptyState } from './components/EmptyState';
import { TaskFormSheet } from './components/TaskFormSheet';
import { SubTaskSheet } from './components/SubTaskSheet';
import { ConfirmDialog } from './components/ConfirmDialog';
import { FocusOverlay } from './components/FocusOverlay';
import { TodayView } from './components/TodayView';
import { CalendarView } from './components/CalendarView';
import { Toast, type Notify, type ToastMessage } from './components/Toast';
import { SettingsIcon } from './components/icons';
import {
  DailySelectionLimitError,
  MAX_DAILY_TASKS,
  useDailySelection,
} from './hooks/useDailySelection';
import { useFocusTimer } from './hooks/useFocusTimer';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useSyncManager } from './hooks/useSyncManager';
import { useTasks } from './hooks/useTasks';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
import {
  fullSync,
  getBoundSyncUserId,
  mergeLocalWorkspaceIntoAccount,
} from './lib/sync';
import { autoSelectTasks } from './utils/autoSelect';
import { todayKey } from './utils/date';
import { describeError } from './utils/error';
import {
  playFocusCompleteSound,
  prepareFocusAudio,
  requestNotificationPermission,
  sendFocusCompleteNotification,
} from './utils/focusAlert';
import { checkDdlNotifications, initDdlNotifications } from './utils/ddlNotify';
import { isTaskDone } from './utils/taskDisplay';
import type { NewTaskInput, SubTask, Task, TaskUpdate } from './types';

type SheetState = { mode: 'create' } | { mode: 'edit'; task: Task } | null;

// 统计页含 ECharts（体积最大），懒加载：首次切到「统计」tab 时才下载图表库，
// 主包不包含 ECharts，首屏更快、离线预缓存更小
const StatsView = lazy(() =>
  import('./components/StatsView').then((module) => ({ default: module.StatsView })),
);
const SettingsSheet = lazy(() =>
  import('./components/SettingsSheet').then((module) => ({ default: module.SettingsSheet })),
);
const AuthSheet = lazy(() =>
  import('./components/AuthSheet').then((module) => ({ default: module.AuthSheet })),
);

/** 各 tab 的头部标题与副标题（副标题依赖任务数/当天日期，用函数延迟计算） */
const TAB_META: Record<TabKey, { title: string; subtitle: (taskCount: number, today: string) => string }> = {
  today: { title: '今天', subtitle: (_count, today) => dayjs(today).format('M月D日 ddd') },
  all: { title: '全部事项', subtitle: (count) => `共 ${count} 件 · 按 DDL 先后排序` },
  stats: { title: '统计', subtitle: () => '图表数据来自本地存储' },
  calendar: { title: '日历', subtitle: () => '点日期查看当天 DDL' },
};

export default function App() {
  // today 用 state 存，而不是渲染时直接算：应用挂着跨过午夜时，定时器会更新它，
  // 让「今日三件事」「日历」自动切到新的今天（否则会一直停留在打开时的日期）
  const [today, setToday] = useState(todayKey);

  const {
    tasks,
    loading,
    error,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskDone,
    updateSubTasks,
  } = useTasks();

  const {
    taskIds,
    addToSelection,
    removeFromSelection,
    replaceSelection,
    loading: dailyLoading,
    error: dailyError,
  } = useDailySelection(today);

  // 常驻监听 beforeinstallprompt，避免设置面板打开太晚而错过事件
  const install = useInstallPrompt();

  // 深浅色主题：默认跟随早晚时间
  const theme = useTheme();

  // 账号与云同步：登录后自动双向同步 + Realtime 多端实时推送
  const auth = useAuth();
  const sync = useSyncManager(auth.userId);
  const [authOpen, setAuthOpen] = useState(false);
  const [accountConflictUserId, setAccountConflictUserId] = useState<string | null>(null);
  // 复制本机数据会清空并重建任务，必须防止重复点击造成二次复制。
  const mergingIntoAccountRef = useRef(false);

  // 本机工作区已绑定其他账号时，不自动上传或拉取，先让用户明确确认。
  useEffect(() => {
    const boundUserId = getBoundSyncUserId();
    setAccountConflictUserId(
      auth.userId !== null && boundUserId !== null && boundUserId !== auth.userId
        ? auth.userId
        : null,
    );
  }, [auth.userId]);

  // 每分钟检查一次日期是否跨天；跨天则更新 today（今日三件事/日历会随之重订阅）
  useEffect(() => {
    const timer = window.setInterval(() => {
      setToday((prev) => {
        const current = todayKey();
        return prev === current ? prev : current;
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const [tab, setTab] = useState<TabKey>('today');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 当前打开子任务弹窗的任务 id；存 id 而非对象，保证随 tasks 实时刷新
  const [subTaskId, setSubTaskId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirmState, setConfirmState] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // 专注倒计时：状态放在 App 层，切到「全部事项」tab 也不会中断专注
  const focus = useFocusTimer();
  const focusTask = focus.focusTaskId
    ? tasks.find((task) => task.id === focus.focusTaskId)
    : undefined;

  const notify: Notify = useCallback((message, tone = 'info') => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const handleManualSync = useCallback(async () => {
    if (auth.userId === null) return;
    try {
      await fullSync(auth.userId, true);
      notify('同步完成', 'success');
    } catch (cause) {
      notify(describeError(cause), 'error');
    }
  }, [auth.userId, notify]);

  const handleSignOut = useCallback(async () => {
    try {
      await auth.signOut();
      notify('已退出登录，本机数据保留', 'info');
    } catch (cause) {
      notify(describeError(cause), 'error');
    }
  }, [auth.signOut, notify]);

  const handleRejectAccountSwitch = useCallback(async () => {
    try {
      await auth.signOut();
      setAccountConflictUserId(null);
      notify('已退出当前账号，本机数据未上传', 'info');
    } catch (cause) {
      notify(describeError(cause, '退出失败，请稍后重试'), 'error');
    }
  }, [auth.signOut, notify]);

  const handleMergeIntoAccount = useCallback(async () => {
    if (accountConflictUserId === null || mergingIntoAccountRef.current) return;

    mergingIntoAccountRef.current = true;
    try {
      const count = await mergeLocalWorkspaceIntoAccount(accountConflictUserId);
      await fullSync(accountConflictUserId, true);
      setAccountConflictUserId(null);
      notify(`已将 ${count} 条本机任务复制到当前账号`, 'success');
    } catch (cause) {
      notify(describeError(cause, '复制失败，本机数据未受影响'), 'error');
    } finally {
      mergingIntoAccountRef.current = false;
    }
  }, [accountConflictUserId, notify]);

  const openCreate = useCallback(() => setSheet({ mode: 'create' }), []);
  // 进入编辑时同时关闭子任务弹窗，避免两层弹窗叠加
  const openEdit = useCallback((task: Task) => {
    setSubTaskId(null);
    setSheet({ mode: 'edit', task });
  }, []);
  const closeSheet = useCallback(() => setSheet(null), []);

  const openSubtasks = useCallback((task: Task) => setSubTaskId(task.id), []);
  const closeSubtasks = useCallback(() => setSubTaskId(null), []);

  // 子任务弹窗的目标任务：从实时 tasks 里按 id 取，避免持有过期引用
  const subTaskTarget = subTaskId ? tasks.find((task) => task.id === subTaskId) : undefined;

  // 已删除/不存在的选择不占今日名额；读库入口也会自愈清理。
  const activeSelectionIds = useMemo(() => {
    const taskIdsSet = new Set(tasks.map((task) => task.id));
    return taskIds.filter((id) => taskIdsSet.has(id));
  }, [taskIds, tasks]);

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

  // 子任务勾选持久化：错误交给弹窗展示并回滚，避免上层吞掉异常后状态失真。
  const handleUpdateSubTasks = useCallback(
    async (id: string, subTasks: SubTask[]) => {
      await updateSubTasks(id, subTasks);
    },
    [updateSubTasks],
  );

  const handleAddToToday = useCallback(
    async (task: Task) => {
      if (dailyLoading) {
        notify('今日选择正在加载，请稍后再试', 'info');
        return;
      }

      if (task.status === 'done') {
        notify('已完成的事项不能加入今日', 'error');
        return;
      }

      if (activeSelectionIds.length >= MAX_DAILY_TASKS) {
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
    [activeSelectionIds.length, dailyLoading, today, addToSelection, notify],
  );

  const handleRemoveFromToday = useCallback(
    async (task: Task) => {
      if (dailyLoading) return;
      try {
        await removeFromSelection(today, task.id);
      } catch (cause) {
        notify(describeError(cause), 'error');
      }
    },
    [dailyLoading, today, removeFromSelection, notify],
  );

  // 开始专注：预先请求通知权限，再启动计时
  const handleStartFocus = useCallback(
    (task: Task) => {
      requestNotificationPermission();
      prepareFocusAudio();
      focus.start(task.id);
    },
    [focus.start],
  );

  // 专注结束时的副作用：提示音 + 系统通知（FocusOverlay 内同时展示结束画面）
  useEffect(() => {
    if (focus.status === 'finished') {
      playFocusCompleteSound();
      void sendFocusCompleteNotification();
    }
  }, [focus.status]);

  // DDL 通知：用 ref 持有最新任务，定时器里通过 getter 读取，避免闭包拿到旧数据
  const tasksRef = useRef<Task[]>(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    // 启动时立即查一次 + 页面可见时每 15 分钟查一次
    return initDdlNotifications(() => tasksRef.current);
  }, []);

  // 首轮任务从 IndexedDB 加载完成时立即检查，避免启动时对着空数组白跑一次。
  useEffect(() => {
    if (!loading) void checkDdlNotifications(tasks);
  }, [loading, tasks]);

  // 任务被其他设备删除或完成后，专注计时不能继续挂在失效任务上。
  useEffect(() => {
    if (focus.focusTaskId === null || loading) return;
    if (!focusTask || isTaskDone(focusTask)) focus.stop();
  }, [focus.focusTaskId, focus.stop, focusTask, loading]);

  const handleAutoSelect = useCallback(() => {
    if (dailyLoading) {
      notify('今日选择正在加载，请稍后再试', 'info');
      return;
    }

    // 纯函数筛选：最多返回 MAX_DAILY_TASKS 个 id（不足则全选）
    const candidates = autoSelectTasks(tasks, MAX_DAILY_TASKS);

    if (candidates.length === 0) {
      notify('没有可自动选择的待办', 'info');
      return;
    }

    // 真正写入：覆盖当天选择
    const apply = async () => {
      try {
        await replaceSelection(today, candidates);
        notify(
          candidates.length < MAX_DAILY_TASKS
            ? `已自动选择 ${candidates.length} 件（待办不足 3 件，已全选）`
            : '已自动选择今日三件事',
          'success',
        );
      } catch (cause) {
        notify(describeError(cause), 'error');
      }
    };

    // 今天已选过 → 弹 App 内确认框（替换原生 window.confirm）
    if (activeSelectionIds.length > 0) {
      setConfirmState({
        message: '是否覆盖当前今日选择？',
        onConfirm: () => {
          setConfirmState(null);
          void apply();
        },
      });
      return;
    }

    void apply();
  }, [activeSelectionIds.length, dailyLoading, tasks, today, replaceSelection, notify]);

  return (
    <>
      <div className="mx-auto min-h-screen w-full max-w-md pb-tabbar">
        <div className="pt-page px-4">
          <header className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.2em] text-indigo-500 dark:text-indigo-400">
                SEMESTER DDL
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {TAB_META[tab].title}
              </h1>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {TAB_META[tab].subtitle(tasks.length, today)}
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
          {dailyError && (
            <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
              今日选择读取失败：{describeError(dailyError)}
            </p>
          )}

          {loading || (tab === 'today' && dailyLoading) ? (
            <p className="py-20 text-center text-xs text-slate-400 dark:text-slate-500">正在读取本地数据…</p>
          ) : tasks.length === 0 ? (
            <EmptyState onCreate={openCreate} />
          ) : tab === 'all' ? (
            <AllTasksView
              tasks={tasks}
              todayIds={taskIds}
              onEdit={openEdit}
              onToggle={handleToggle}
              onOpenSubtasks={openSubtasks}
            />
          ) : tab === 'stats' ? (
            <Suspense
              fallback={
                <p className="py-20 text-center text-xs text-slate-400 dark:text-slate-500">
                  正在加载图表…
                </p>
              }
            >
              <StatsView tasks={tasks} isDark={theme.isDark} today={today} />
            </Suspense>
          ) : tab === 'calendar' ? (
            <CalendarView
              tasks={tasks}
              today={today}
              onEdit={openEdit}
              onToggle={handleToggle}
              onOpenSubtasks={openSubtasks}
            />
          ) : (
            <TodayView
              date={today}
              tasks={tasks}
              taskIds={taskIds}
              onAdd={handleAddToToday}
              onRemove={handleRemoveFromToday}
              onAutoSelect={handleAutoSelect}
              onStartFocus={handleStartFocus}
              onOpenSubtasks={openSubtasks}
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

      {subTaskTarget && (
        <SubTaskSheet
          task={subTaskTarget}
          onClose={closeSubtasks}
          onUpdateSubTasks={handleUpdateSubTasks}
          onEdit={openEdit}
          notify={notify}
        />
      )}

      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsSheet
            install={install}
            theme={theme}
            auth={auth}
            sync={sync}
            onOpenAuth={() => {
              setSettingsOpen(false);
              setAuthOpen(true);
            }}
            onManualSync={() => void handleManualSync()}
            onSignOut={() => void handleSignOut()}
            notify={notify}
            onClose={() => setSettingsOpen(false)}
          />
        </Suspense>
      )}

      {authOpen && (
        <Suspense fallback={null}>
          <AuthSheet auth={auth} notify={notify} onClose={() => setAuthOpen(false)} />
        </Suspense>
      )}

      {focus.focusTaskId && focusTask && (
        <FocusOverlay
          taskTitle={focusTask.title}
          status={focus.status}
          remainingSeconds={focus.remainingSeconds}
          onPause={focus.pause}
          onResume={focus.resume}
          onStop={focus.stop}
        />
      )}

      {confirmState && (
        <ConfirmDialog
          title="覆盖今日选择"
          message={confirmState.message}
          confirmText="覆盖"
          cancelText="取消"
          tone="danger"
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {accountConflictUserId && (
        <ConfirmDialog
          title="本机数据属于其他账号"
          message="为避免把上一账号的任务偷偷上传，本机已停止同步。继续会为现有任务生成新 ID 并复制到当前账号，原账号云端数据不受影响；取消则退出当前账号。"
          confirmText="复制并切换"
          cancelText="退出当前账号"
          tone="danger"
          dismissible={false}
          onConfirm={() => void handleMergeIntoAccount()}
          onCancel={() => void handleRejectAccountSwitch()}
        />
      )}

      {toast && <Toast toast={toast} onDismiss={dismissToast} />}
    </>
  );
}
