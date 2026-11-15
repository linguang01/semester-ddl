import { useCallback, useMemo } from 'react';
import type { Notify } from '../components/Toast';
import type { DailySelection, NewTaskInput, SubTask, Task, TaskUpdate } from '../types';
import { autoSelectTasks } from '../utils/autoSelect';
import { describeError } from '../utils/error';
import { DailySelectionLimitError, MAX_DAILY_TASKS } from './useDailySelection';

export interface UseTaskActionsOptions {
  /** 全部任务（已过滤墓碑，按 deadline 升序） */
  tasks: Task[];
  /** 今天的日期键 YYYY-MM-DD */
  today: string;
  /** 今日选择的原始 id 列表（可能含已删除任务的悬空引用） */
  taskIds: string[];
  /** 今日选择是否仍在加载：加载中不允许写入，避免把空数组当成「已清空」 */
  dailyLoading: boolean;
  addToSelection: (date: string, taskId: string) => Promise<DailySelection>;
  removeFromSelection: (date: string, taskId: string) => Promise<void>;
  replaceSelection: (date: string, taskIds: string[]) => Promise<void>;
  addTask: (input: NewTaskInput) => Promise<Task>;
  updateTask: (id: string, patch: TaskUpdate, expectedUpdatedAt?: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTaskDone: (id: string) => Promise<void>;
  updateSubTasks: (id: string, subTasks: SubTask[]) => Promise<void>;
  notify: Notify;
  /**
   * 需要用户二次确认时调用。
   * 由 App 注入自己的 ConfirmDialog —— 这样本 hook 不必依赖任何 UI 状态，
   * 也就不需要把 setConfirmState 传进来。
   */
  requestConfirm: (message: string, onConfirm: () => void) => void;
}

export interface TaskActions {
  handleCreate: (input: NewTaskInput) => Promise<void>;
  handleUpdate: (id: string, patch: TaskUpdate, expectedUpdatedAt?: string) => Promise<void>;
  handleDelete: (task: Task) => Promise<void>;
  handleToggle: (task: Task) => Promise<void>;
  handleUpdateSubTasks: (id: string, subTasks: SubTask[]) => Promise<void>;
  handleAddToToday: (task: Task) => Promise<void>;
  handleRemoveFromToday: (task: Task) => Promise<void>;
  handleAutoSelect: () => void;
}

/**
 * 任务与「今日三件事」的写操作集合。
 *
 * 从 App 里抽出来，是因为这些动作只关心「数据 + 提示」，与弹窗、Tab、主题无关；
 * 留在 App 里会让组件同时承担布局编排和业务副作用两种职责。
 */
export function useTaskActions(options: UseTaskActionsOptions): TaskActions {
  const {
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
  } = options;

  // 已删除/不存在的选择不占今日名额（读库入口也会自愈清理，这里只是给 UI 一个准确口径）
  const activeSelectionIds = useMemo(() => {
    const existing = new Set(tasks.map((task) => task.id));
    return taskIds.filter((id) => existing.has(id));
  }, [taskIds, tasks]);

  const handleCreate = useCallback(
    async (input: NewTaskInput) => {
      await addTask(input);
      notify('已添加事项', 'success');
    },
    [addTask, notify],
  );

  const handleUpdate = useCallback(
    async (id: string, patch: TaskUpdate, expectedUpdatedAt?: string) => {
      // 版本由表单带上来：库中已被其他设备改动时 updateTask 会抛 TaskConflictError，
      // 由表单弹出「覆盖 / 放弃」，这里不吞掉异常、也不提前报「已保存」
      await updateTask(id, patch, expectedUpdatedAt);
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
    [activeSelectionIds.length, addToSelection, dailyLoading, notify, today],
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
    [dailyLoading, notify, removeFromSelection, today],
  );

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
      requestConfirm('是否覆盖当前今日选择？', () => void apply());
      return;
    }

    void apply();
  }, [
    activeSelectionIds.length,
    dailyLoading,
    notify,
    replaceSelection,
    requestConfirm,
    tasks,
    today,
  ]);

  return {
    handleCreate,
    handleUpdate,
    handleDelete,
    handleToggle,
    handleUpdateSubTasks,
    handleAddToToday,
    handleRemoveFromToday,
    handleAutoSelect,
  };
}
