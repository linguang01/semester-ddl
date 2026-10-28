import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import dayjs from 'dayjs';
import type { NewTaskInput, Task, TaskPriority, TaskType, TaskUpdate } from '../types';
import { PRIORITY_LABEL, TASK_PRIORITIES, TASK_TYPES, TYPE_LABEL } from '../utils/taskDisplay';
import { parseQuickAdd } from '../utils/parseQuickAdd';
import { parseSmartInput, type SmartParseResult } from '../utils/parseSmartInput';
import { ConfirmDialog } from './ConfirmDialog';
import type { Notify } from './Toast';
import { WandIcon, XIcon } from './icons';

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
  actualHours?: string;
}

const INPUT_CLASS =
  'mt-1.5 h-12 w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:bg-slate-800 dark:focus:ring-indigo-500/20';

const CHIP_CLASS =
  'inline-flex items-center rounded-md bg-white px-2 py-1 text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';

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
      // 新增任务默认「今天 23:59」，与快速解析「未识别到时间就默认今天」保持一致
      : dayjs().hour(23).minute(59).second(0).format('YYYY-MM-DDTHH:mm'),
  );
  const [hours, setHours] = useState(task ? String(task.estimatedHours) : '1');
  const [actualHours, setActualHours] = useState(
    task?.actualHours != null ? String(task.actualHours) : '',
  );
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 智能录入：原始输入 + 解析结果预览
  const [smartText, setSmartText] = useState('');
  const [smartPreview, setSmartPreview] = useState<SmartParseResult | null>(null);

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

  // 标题输入：新增任务时做自然语言解析
  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setTitle(value);
    // 仅新增任务启用快速解析；编辑时保持标题与时间独立，避免误改已有 DDL
    if (isEditing) return;
    const result = parseQuickAdd(value);
    // 只有真正识别到日期/时间才回填截止时间，否则保留用户手动选择或默认值
    if (result.hasDate || result.hasTime) {
      setDeadline(dayjs(result.deadline).format('YYYY-MM-DDTHH:mm'));
    }
  };

  // 标题失焦：剥离日期/时间片段，把干净的任务名回填到标题框
  const handleTitleBlur = () => {
    if (isEditing) return;
    setTitle(parseQuickAdd(title).title);
  };

  // 智能录入：一句话解析并回填整个表单（仅新增任务启用）
  const handleSmartChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSmartText(value);

    if (!value.trim()) {
      setSmartPreview(null);
      return;
    }

    const result = parseSmartInput(value);
    setSmartPreview(result);

    // 回填各字段；标题为空时不动标题，避免误清空
    if (result.title) setTitle(result.title);
    setDeadline(dayjs(result.deadline).format('YYYY-MM-DDTHH:mm'));
    setCourse(result.course);
    setHours(String(result.estimatedHours));
    setPriority(result.priority);
    setType(result.type);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;

    // 新增任务：提交前再解析一次，兜底剥离标题里残留的日期/时间片段
    const finalTitle = isEditing ? title.trim() : parseQuickAdd(title).title;

    const nextErrors: FormErrors = {};

    if (!finalTitle) {
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

    // 实际耗时选填：留空表示未统计；填写则与预计耗时同一量级约束
    let parsedActualHours: number | undefined;
    const trimmedActual = actualHours.trim();
    if (trimmedActual) {
      const value = Number(trimmedActual);
      if (!Number.isFinite(value) || value <= 0 || value > 100) {
        nextErrors.actualHours = '实际耗时需大于 0 且不超过 100 小时';
      } else {
        parsedActualHours = value;
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    submitLock.current = true;
    setSubmitting(true);

    try {
      const payload: NewTaskInput = {
        title: finalTitle,
        type,
        course: course.trim(),
        deadline: parsedDeadline.toISOString(),
        estimatedHours: parsedHours,
        actualHours: parsedActualHours,
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
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 20px))' }}
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

        {!isEditing && (
          <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
            <label className="flex items-center gap-1.5">
              <WandIcon className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                智能录入：一句话自动填表
              </span>
            </label>
            <input
              id="task-smart"
              value={smartText}
              onChange={handleSmartChange}
              autoFocus
              maxLength={120}
              placeholder="例如：明天下午3点交高数作业，预计2小时，高优先级"
              className="mt-2 h-12 w-full min-w-0 max-w-full rounded-xl border border-indigo-200 bg-white px-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-indigo-500/40 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
            />
            {smartPreview && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-slate-400 dark:text-slate-500">已识别</span>
                {smartPreview.hasDate || smartPreview.hasTime ? (
                  <span className={CHIP_CLASS}>
                    时间 {dayjs(smartPreview.deadline).format('M月D日 HH:mm')}
                  </span>
                ) : null}
                {smartPreview.hasCourse ? (
                  <span className={CHIP_CLASS}>课程 {smartPreview.course}</span>
                ) : null}
                {smartPreview.hasHours ? (
                  <span className={CHIP_CLASS}>耗时 {smartPreview.estimatedHours} 小时</span>
                ) : null}
                {smartPreview.hasPriority ? (
                  <span className={CHIP_CLASS}>{PRIORITY_LABEL[smartPreview.priority]}优先级</span>
                ) : null}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <label className="mt-3 block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              标题 <span className="text-rose-500">*</span>
            </span>
            <input
              id="task-title"
              value={title}
              onChange={handleTitleChange}
              onBlur={handleTitleBlur}
              maxLength={80}
              placeholder="例如：明天下午3点交高数作业"
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

          <label className="mt-4 block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              实际耗时（选填，完成后统计用）
            </span>
            <span className="relative mt-1.5 block">
              <input
                id="task-actual-hours"
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0.5"
                max="100"
                value={actualHours}
                onChange={(event) => setActualHours(event.target.value)}
                placeholder="完成后填写"
                className={`${INPUT_CLASS} mt-0 pr-14`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
                小时
              </span>
            </span>
          </label>
          {errors.actualHours && (
            <p className="mt-1 text-[11px] text-rose-600">{errors.actualHours}</p>
          )}

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
