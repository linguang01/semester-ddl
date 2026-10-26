import { useEffect, useRef, useState, type FormEvent } from 'react';
import dayjs from 'dayjs';
import type { NewTaskInput, Task, TaskPriority, TaskType, TaskUpdate } from '../types';
import { PRIORITY_LABEL, TASK_PRIORITIES, TASK_TYPES, TYPE_LABEL } from '../utils/taskDisplay';
import { ConfirmDialog } from './ConfirmDialog';
import type { Notify } from './Toast';
import { XIcon } from './icons';

interface TaskFormSheetProps {
  /** null 表示新增 */
  task: Task | null;
  onClose: () => void;
  onCreate: (input: NewTaskInput) => Promise<void>;
  onUpdate: (id: string, patch: TaskUpdate) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
  notify: Notify;
}

interface FormErrors {
  title?: string;
  deadline?: string;
  hours?: string;
}

const INPUT_CLASS =
  'mt-1.5 h-12 w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:bg-slate-800 dark:focus:ring-indigo-500/20';

export function TaskFormSheet({
  task,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  notify,
}: TaskFormSheetProps) {
  const isEditing = task !== null;
  const isEditingDone = task?.status === 'done';

  const [title, setTitle] = useState(task?.title ?? '');
  const [type, setType] = useState<TaskType>(task?.type ?? 'homework');
  const [course, setCourse] = useState(task?.course ?? '');
  const [deadline, setDeadline] = useState(
    task
      ? dayjs(task.deadline).format('YYYY-MM-DDTHH:mm')
      : dayjs().add(1, 'day').hour(23).minute(59).second(0).format('YYYY-MM-DDTHH:mm'),
  );
  const [hours, setHours] = useState(task ? String(task.estimatedHours) : '1');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submitLock = useRef(false);

  // 打开时锁定背景滚动
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Esc 关闭（提交中不响应）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitLock.current) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const parsedDeadline = dayjs(deadline);
  const deadlineIsPast = parsedDeadline.isValid() && !parsedDeadline.isAfter(dayjs());
  const showHistoricalHint = isEditingDone && deadlineIsPast && !errors.deadline;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;

    const nextErrors: FormErrors = {};

    if (!title.trim()) {
      nextErrors.title = '标题不能为空';
    }

    if (!deadline || !parsedDeadline.isValid()) {
      nextErrors.deadline = '请选择 DDL 时间';
    } else if (!isEditingDone && !parsedDeadline.isAfter(dayjs())) {
      nextErrors.deadline = 'DDL 必须是未来时间';
    }

    const parsedHours = Number(hours);
    if (!hours.trim() || !Number.isFinite(parsedHours) || parsedHours <= 0 || parsedHours > 100) {
      nextErrors.hours = '预计耗时需大于 0 且不超过 100 小时';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    submitLock.current = true;
    setSubmitting(true);

    try {
      const payload: NewTaskInput = {
        title: title.trim(),
        type,
        course: course.trim(),
        deadline: parsedDeadline.toISOString(),
        estimatedHours: parsedHours,
        priority,
      };

      if (task) {
        await onUpdate(task.id, payload);
      } else {
        await onCreate(payload);
      }

      submitLock.current = false;
      setSubmitting(false);
      onClose();
    } catch (error) {
      submitLock.current = false;
      setSubmitting(false);
      notify(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleDelete = () => {
    if (!task || submitLock.current) return;
    setConfirmDelete(true);
  };

  const handleConfirmDelete = async () => {
    if (!task) return;
    setConfirmDelete(false);

    submitLock.current = true;
    setSubmitting(true);

    try {
      await onDelete(task);
      submitLock.current = false;
      setSubmitting(false);
      onClose();
    } catch (error) {
      submitLock.current = false;
      setSubmitting(false);
      notify(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const handleOverlayClick = () => {
    if (!submitting) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/60"
        onClick={handleOverlayClick}
        role="presentation"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-form-title"
        className="sheet-enter relative max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-white px-4 pt-3 shadow-2xl dark:bg-slate-900"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center justify-between">
          <h2 id="task-form-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {isEditing ? '编辑事项' : '新增事项'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="关闭"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 disabled:opacity-40 dark:text-slate-500 dark:hover:bg-slate-800"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <label className="mt-3 block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              标题 <span className="text-rose-500">*</span>
            </span>
            <input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              autoFocus={!isEditing}
              placeholder="例如：高数作业第 5 章"
              className={INPUT_CLASS}
            />
          </label>
          {errors.title && <p className="mt-1 text-[11px] text-rose-600">{errors.title}</p>}

          <div className="mt-4">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">类型</span>
            <div className="mt-1.5 grid grid-cols-4 gap-2">
              {TASK_TYPES.map((item) => {
                const active = type === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setType(item)}
                    aria-pressed={active}
                    className={`h-11 rounded-xl text-xs font-medium transition ${
                      active
                        ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
                        : 'border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                    }`}
                  >
                    {TYPE_LABEL[item]}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              课程 / 归属（选填）
            </span>
            <input
              id="task-course"
              value={course}
              onChange={(event) => setCourse(event.target.value)}
              maxLength={30}
              placeholder="例如：高等数学"
              className={INPUT_CLASS}
            />
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              DDL <span className="text-rose-500">*</span>
            </span>
            <input
              id="task-deadline"
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              min={isEditingDone ? undefined : dayjs().format('YYYY-MM-DDTHH:mm')}
              className={`${INPUT_CLASS} appearance-none`}
            />
          </label>
          {errors.deadline && (
            <p className="mt-1 text-[11px] text-rose-600">{errors.deadline}</p>
          )}
          {showHistoricalHint && (
            <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              这是已完成的历史事项，DDL 已过去，保留原时间即可。
            </p>
          )}

          <label className="mt-4 block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              预计耗时 <span className="text-rose-500">*</span>
            </span>
            <span className="relative mt-1.5 block">
              <input
                id="task-hours"
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0.5"
                max="100"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                className={`${INPUT_CLASS} mt-0 pr-14`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
                小时
              </span>
            </span>
          </label>
          {errors.hours && <p className="mt-1 text-[11px] text-rose-600">{errors.hours}</p>}

          <div className="mt-4">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">优先级</span>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {TASK_PRIORITIES.map((item) => {
                const active = priority === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPriority(item)}
                    aria-pressed={active}
                    className={`h-11 rounded-xl text-xs font-medium transition ${
                      active
                        ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
                        : 'border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                    }`}
                  >
                    {PRIORITY_LABEL[item]}优先级
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-slate-900 text-sm font-medium text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
          >
            {submitting ? '保存中…' : isEditing ? '保存修改' : '保存事项'}
          </button>

          {isEditing && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={submitting}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-xl border border-rose-200 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              删除事项
            </button>
          )}
        </form>
      </div>

      {confirmDelete && task && (
        <ConfirmDialog
          title="删除事项"
          message={`确定删除「${task.title}」吗？删除后无法恢复。`}
          confirmText="删除"
          cancelText="取消"
          tone="danger"
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
