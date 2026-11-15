import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
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
import { useDailySelection } from './hooks/useDailySelection';
import { useAccountSwitch } from './hooks/useAccountSwitch';
import { useFocusTimer } from './hooks/useFocusTimer';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useSyncManager } from './hooks/useSyncManager';
import { useTaskActions } from './hooks/useTaskActions';
import { useTasks } from './hooks/useTasks';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
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
import type { Task } from './types';

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
const TAB_META: Record<
  TabKey,
  { title: string; subtitle: (taskCount: number, today: string) => string }
> = {
  today: { title: '今天', subtitle: (_count, today) => dayjs(today).format('M月D日 ddd') },
  all: { title: '全部事项', subtitle: (count) => `共 ${count} 件 · 按 DDL 先后排序` },
  stats: { title: '统计', subtitle: () => '图表数据来自本地存储' },
  calendar: { title: '日历', subtitle: () => '点日期查看当天 DDL' },
};

/**
 * 应用外壳：只负责「布局 + 当前 tab + 弹层编排」。
 * 业务副作用按领域拆进 hooks，App 不再同时承担布局与业务两种职责：
 * - useTaskActions：任务增删改、今日三件事的挑选与自动选择
 * - useAccountSwitch：账号绑定、换账号冲突、手动同步
 * - useFocusTimer / useSyncManager / useAuth：各自独立的生命周期
 */
export default function App() {
  // today 用 state 存，而不是渲染时直接算：应用挂着跨过午夜时，定时器会更新它，
  // 让「今日三件事」「日历」自动切到新的今天（否则会一直停留在打开时的日期）
  const [today, setToday] = useState(todayKey);

  const { tasks, loading, error, addTask, updateTask, deleteTask, toggleTaskDone, updateSubTasks } =
    useTasks();

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

  const notify: Notify = useCallback((message, tone = 'info') => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  // 通用确认框入口：注入给业务 hook，避免它们反过来依赖 UI 状态
  const requestConfirm = useCallback((message: string, onConfirm: () => void) => {
    setConfirmState({ message, onConfirm });
  }, []);

  const account = useAccountSwitch({
    userId: auth.userId,
    signOut: auth.signOut,
    notify,
  });

  const actions = useTaskActions({
    tasks,
    today,
    taskIds,
    dailyLoading,
    addToSelection,
    removeFromSelection,
    replaceSelection,
    addTask,
    updateTask,
    deleteTask,
    toggleTaskDone,
    updateSubTasks,
    notify,
    requestConfirm,
  });

  // 专注倒计时：状态放在 App 层，切到「全部事项」tab 也不会中断专注。
  // 这里解构出字段与方法，而不是整体持有 focus 对象：hook 每次渲染都返回新对象，
  // 整体进依赖数组会让「任务失效就停止专注」的 effect 在每 500ms 计时里重跑一遍。
  const {
    focusTaskId,
    status: focusStatus,
    remainingSeconds: focusRemainingSeconds,
    start: startFocus,
    pause: pauseFocus,
    resume: resumeFocus,
    stop: stopFocus,
  } = useFocusTimer();
  const focusTask = focusTaskId ? tasks.find((task) => task.id === focusTaskId) : undefined;

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

  // 开始专注：预先请求通知权限，再启动计时
  const handleStartFocus = useCallback(
    (task: Task) => {
      requestNotificationPermission();
      prepareFocusAudio();
      startFocus(task.id);
    },
    [startFocus],
  );

  // 专注结束时的副作用：提示音 + 系统通知（FocusOverlay 内同时展示结束画面）
  useEffect(() => {
    if (focusStatus === 'finished') {
      playFocusCompleteSound();
      void sendFocusCompleteNotification();
    }
  }, [focusStatus]);

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
    if (focusTaskId === null || loading) return;
    if (!focusTask || isTaskDone(focusTask)) stopFocus();
  }, [focusTaskId, stopFocus, focusTask, loading]);

  return (
    <>
      <div className="pb-tabbar mx-auto min-h-screen w-full max-w-md">
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
            <p className="py-20 text-center text-xs text-slate-400 dark:text-slate-500">
              正在读取本地数据…
            </p>
          ) : tasks.length === 0 ? (
            <EmptyState onCreate={openCreate} />
          ) : tab === 'all' ? (
            <AllTasksView
              tasks={tasks}
              todayIds={taskIds}
              onEdit={openEdit}
              onToggle={actions.handleToggle}
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
              onToggle={actions.handleToggle}
              onOpenSubtasks={openSubtasks}
            />
          ) : (
            <TodayView
              date={today}
              tasks={tasks}
              taskIds={taskIds}
              onAdd={actions.handleAddToToday}
              onRemove={actions.handleRemoveFromToday}
              onAutoSelect={actions.handleAutoSelect}
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
          onCreate={actions.handleCreate}
          onUpdate={actions.handleUpdate}
          onDelete={actions.handleDelete}
          notify={notify}
        />
      )}

      {subTaskTarget && (
        <SubTaskSheet
          task={subTaskTarget}
          onClose={closeSubtasks}
          onUpdateSubTasks={actions.handleUpdateSubTasks}
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
            onManualSync={() => void account.handleManualSync()}
            onSignOut={() => void account.handleSignOut()}
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

      {focusTaskId && focusTask && (
        <FocusOverlay
          taskTitle={focusTask.title}
          status={focusStatus}
          remainingSeconds={focusRemainingSeconds}
          onPause={pauseFocus}
          onResume={resumeFocus}
          onStop={stopFocus}
        />
      )}

      {confirmState && (
        <ConfirmDialog
          title="覆盖今日选择"
          message={confirmState.message}
          confirmText="覆盖"
          cancelText="取消"
          tone="danger"
          // 关闭弹窗由 App 负责：注入的 onConfirm 只描述「确认后做什么」，
          // 不能指望它顺手清掉弹窗状态，否则确认后弹窗会一直挂着。
          onConfirm={() => {
            const action = confirmState.onConfirm;
            setConfirmState(null);
            action();
          }}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {account.conflictUserId && (
        <ConfirmDialog
          title="本机数据属于其他账号"
          message="为避免把上一账号的任务偷偷上传，本机已停止同步。继续会为现有任务生成新 ID 并复制到当前账号，原账号云端数据不受影响；取消则退出当前账号。"
          confirmText="复制并切换"
          cancelText="退出当前账号"
          tone="danger"
          dismissible={false}
          onConfirm={() => void account.handleMergeIntoAccount()}
          onCancel={() => void account.handleRejectSwitch()}
        />
      )}

      {toast && <Toast toast={toast} onDismiss={dismissToast} />}
    </>
  );
}
