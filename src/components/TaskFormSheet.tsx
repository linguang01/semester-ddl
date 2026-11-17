import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import dayjs from 'dayjs';
import { TaskConflictError } from '../hooks/useTasks';
import { useDialog } from '../hooks/useDialog';
import type { NewTaskInput, SubTask, Task, TaskPriority, TaskType, TaskUpdate } from '../types';
import { PRIORITY_LABEL, TASK_PRIORITIES, TASK_TYPES, TYPE_LABEL } from '../utils/taskDisplay';
import { parseDateTime } from '../utils/parseDateTime';
import { parseTaskText } from '../utils/parseTaskText';
import { describeError } from '../utils/error';
import { MAX_TASK_HOURS, MIN_TASK_HOURS } from '../utils/taskLimits';
import { DATETIME_INPUT_FORMAT, deadlineAfterDays, defaultNewTaskDeadline } from '../utils/date';
import { ConfirmDialog } from './ConfirmDialog';
import type { Notify } from './Toast';
import { WandIcon, XIcon } from './icons';

interface TaskFormSheetProps {
  /** null 表示新增 */
  task: Task | null;
  onClose: () => void;
  onCreate: (input: NewTaskInput) => Promise<void>;
  /** expectedUpdatedAt 为打开表单时看到的版本，用于保存前的乐观并发校验 */
  onUpdate: (id: string, patch: TaskUpdate, expectedUpdatedAt?: string) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
  /** 历史课程名，点一下就能填，省掉每次手敲「高等数学」 */
  courseOptions?: string[];
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

// 子任务输入框：不带顶部间距（供列表行内联使用），字号略小
const SUB_INPUT_CLASS =
  'h-12 w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:bg-slate-800 dark:focus:ring-indigo-500/20';

const CHIP_CLASS =
  'inline-flex items-center rounded-md bg-white px-2 py-1 text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';

/** 快捷天数按钮：今天 +N 天的 16:30 */
const QUICK_DAY_OPTIONS = [1, 3, 7] as const;

/** 自定义天数允许范围（下限 1 天，避免落到「今天 16:30 已过」的过去时间） */
const CUSTOM_DAYS_MIN = 1;
const CUSTOM_DAYS_MAX = 365;

/** 快捷按钮 / 天数输入框的统一样式 */
const QUICK_BTN_CLASS =
  'h-10 rounded-xl text-xs font-medium transition active:scale-[0.98] disabled:opacity-40';

const DAYS_INPUT_CLASS =
  'h-10 w-full min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:bg-slate-800 dark:focus:ring-indigo-500/20';

/** 上次用过的快捷天数：只在按钮上做标记，绝不改动默认的「今天 16:30」 */
const LAST_QUICK_DAYS_KEY = 'ddl-last-quick-days';

function readLastQuickDays(): number | null {
  try {
    const value = Number(localStorage.getItem(LAST_QUICK_DAYS_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeLastQuickDays(days: number): void {
  try {
    localStorage.setItem(LAST_QUICK_DAYS_KEY, String(days));
  } catch {
    // 隐私模式写不进去，只是少了一个标记，不影响功能
  }
}

/** 默认空数组的稳定引用，避免每次渲染重建导致 props 恒变 */
const NO_COURSES: string[] = [];

export function TaskFormSheet({
  task,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  courseOptions = NO_COURSES,
  notify,
}: TaskFormSheetProps) {
  const isEditing = task !== null;
  const isEditingDone = task?.status === 'done';
  // 打开表单那一刻的版本号：保存时交给数据层做乐观并发校验，
  // 若期间已被其他设备改过，就不会静默覆盖，而是弹冲突确认。
  const baseUpdatedAt = task?.updatedAt;

  const [title, setTitle] = useState(task?.title ?? '');
  const [type, setType] = useState<TaskType>(task?.type ?? 'homework');
  const [course, setCourse] = useState(task?.course ?? '');
  const [deadline, setDeadline] = useState(
    task
      ? dayjs(task.deadline).format(DATETIME_INPUT_FORMAT)
      : // 新增任务默认「今天 16:30」；今天 16:30 已过则顺延到明天 16:30
        defaultNewTaskDeadline().format(DATETIME_INPUT_FORMAT),
  );
  // 自定义天数输入框（回车 / 点确认生效）
  const [customDays, setCustomDays] = useState('');
  const [daysError, setDaysError] = useState<string | undefined>(undefined);
  // 最近一次快捷选择（用于标题解析覆盖时给提示）
  const [quickPickLabel, setQuickPickLabel] = useState<string | null>(null);
  const [overrideNotice, setOverrideNotice] = useState<string | null>(null);
  const [lastQuickDays, setLastQuickDays] = useState<number | null>(readLastQuickDays);
  const [hours, setHours] = useState(task ? String(task.estimatedHours) : '1');
  const [actualHours, setActualHours] = useState(
    task?.actualHours != null ? String(task.actualHours) : '',
  );
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  // 子任务：编辑时回填（含完成状态），新增时为空
  const [subTasks, setSubTasks] = useState<SubTask[]>(() => task?.subTasks ?? []);
  const [newSubTask, setNewSubTask] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 版本冲突：库里已有更新的版本，先让用户选「覆盖」还是「放弃」
  const [conflict, setConflict] = useState<{ latest: Task; payload: NewTaskInput } | null>(null);

  /**
   * 渐进式披露：新增是每天 1~6 次的高频动作，字段全铺开要滚 2~3 屏才能点到保存，
   * 所以默认只留「一句话 + 截止时间 + 保存」；类型/课程/耗时/优先级/子任务收进「更多选项」。
   * 编辑是低频精细修改，默认展开。
   */
  const [advancedOpen, setAdvancedOpen] = useState(isEditing);

  const submitLock = useRef(false);
  // Esc 关闭（提交中不响应），滚动锁与焦点圈定由统一弹窗 Hook 处理。
  const dialogRef = useDialog(() => {
    if (!submitLock.current) onClose();
  });

  // 新增时的实时解析结果：既用于回填字段，也用于把「识别到什么」摆在用户眼前
  const parsed = isEditing ? null : parseTaskText(title);
  const recognizedSomething = Boolean(parsed && (parsed.hasDate || parsed.hasTime));
  const deadlineText = dayjs(deadline);

  const parsedDeadline = deadlineText;
  const deadlineIsPast = parsedDeadline.isValid() && !parsedDeadline.isAfter(dayjs());
  const showHistoricalHint = isEditingDone && deadlineIsPast && !errors.deadline;

  // 当前选中的日期是否正好等于「今天 + N 天 16:30」，用于高亮快捷按钮
  const activeQuickDay = QUICK_DAY_OPTIONS.find(
    (days) => deadlineAfterDays(days).format(DATETIME_INPUT_FORMAT) === deadline,
  );

  /** 统一写回 DDL；顺手清掉「必须是未来时间」的旧报错，避免改完还挂着红字 */
  const applyDeadline = (value: string) => {
    setDeadline(value);
    setErrors((prev) => {
      if (!prev.deadline) return prev;
      const next = { ...prev };
      delete next.deadline;
      return next;
    });
  };

  /** 快捷天数：今天 + days 天，时刻强制 16:30；label 用于标题解析覆盖时提示用户 */
  const applyDeadlineAfterDays = (days: number, label = `+${days}天`) => {
    applyDeadline(deadlineAfterDays(days).format(DATETIME_INPUT_FORMAT));
    setDaysError(undefined);
    setQuickPickLabel(label);
    setOverrideNotice(null);
    if ((QUICK_DAY_OPTIONS as readonly number[]).includes(days)) {
      setLastQuickDays(days);
      writeLastQuickDays(days);
    }
  };

  /** 自定义天数确认：只接受 1~365 的正整数 */
  const handleCustomDaysConfirm = () => {
    const text = customDays.trim();
    if (!text) {
      setDaysError('请输入天数');
      return;
    }
    if (!/^\d+$/.test(text)) {
      setDaysError('天数必须是正整数');
      return;
    }
    const days = Number(text);
    if (days < CUSTOM_DAYS_MIN || days > CUSTOM_DAYS_MAX) {
      setDaysError(`天数需在 ${CUSTOM_DAYS_MIN}~${CUSTOM_DAYS_MAX} 之间`);
      return;
    }
    applyDeadlineAfterDays(days, `+${days}天`);
  };

  /**
   * 一句话输入：既是标题，也是智能录入。
   * 之前表单里「智能录入」和「标题」是两个框、placeholder 还是同一句话，纯属让人犹豫；
   * 合并成一个框后，打完一句就已经把 DDL / 课程 / 耗时 / 优先级填好了。
   */
  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setTitle(value);

    // 编辑时保持标题与时间独立，避免误改已有 DDL
    if (isEditing) return;

    const result = parseTaskText(value);

    // 只有识别到日期/时间才覆盖 DDL，否则保留默认值（今天/明天 16:30）或用户手动选择
    if (result.hasDate || result.hasTime) {
      setDeadline(dayjs(result.deadline).format(DATETIME_INPUT_FORMAT));

      // 标题解析优先级最高：刚用过快捷按钮就被覆盖时，明确告知，避免用户以为按钮失灵
      if (quickPickLabel) {
        setOverrideNotice(`检测到标题包含时间，已覆盖快捷选择「${quickPickLabel}」`);
        setQuickPickLabel(null);
      }
    }

    // 各字段只在真的识别到时才覆盖，避免把用户手动填的内容清掉
    if (result.hasHours) setHours(String(result.estimatedHours));
    if (result.hasPriority) setPriority(result.priority);
    if (result.hasCourse) setCourse(result.course);
    if (result.type !== 'homework') setType(result.type);
  };

  // 标题失焦：剥离日期/时间片段，把干净的任务名回填到标题框
  const handleTitleBlur = () => {
    if (isEditing) return;
    setTitle(parseDateTime(title).title);
  };

  // 子任务增删改：仅维护本地状态，提交时随 payload 一并持久化
  const addSubTask = () => {
    const title = newSubTask.trim();
    if (!title) return;
    setSubTasks((prev) => [...prev, { title, isCompleted: false }]);
    setNewSubTask('');
  };

  const updateSubTaskTitle = (index: number, title: string) => {
    setSubTasks((prev) => prev.map((item, i) => (i === index ? { ...item, title } : item)));
  };

  const removeSubTask = (index: number) => {
    setSubTasks((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * 统一提交入口。
   * force=true 表示用户已经在冲突提示里明确选择「覆盖」，
   * 此时不再携带版本号，等价于「我的版本就是最新」。
   */
  const commit = async (payload: NewTaskInput, force: boolean) => {
    if (submitLock.current) return;

    submitLock.current = true;
    setSubmitting(true);

    try {
      if (task) {
        await onUpdate(task.id, payload, force ? undefined : baseUpdatedAt);
      } else {
        await onCreate(payload);
      }

      submitLock.current = false;
      setSubmitting(false);
      onClose();
    } catch (error) {
      submitLock.current = false;
      setSubmitting(false);

      // 版本冲突不能只弹一个 toast 了事 —— 那等于告诉用户「没存上」却把选择权收走了。
      // 保持表单打开，把最新版本摆出来，让用户在「覆盖 / 放弃」之间显式选一次。
      if (error instanceof TaskConflictError) {
        setConflict({ latest: error.latest, payload });
        return;
      }

      notify(describeError(error), 'error');
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;

    // 新增任务：提交前再解析一次，兜底剥离标题里残留的日期/时间/耗时片段
    const finalTitle = isEditing ? title.trim() : parseTaskText(title).title;

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
    // 下限放到 0：历史导入的任务可能存在「未估算」，若这里强制 >0，
    // 这类任务只改标题也会被耗时校验拦住，等于永远存不了。
    if (
      !hours.trim() ||
      !Number.isFinite(parsedHours) ||
      parsedHours < MIN_TASK_HOURS ||
      parsedHours > MAX_TASK_HOURS
    ) {
      nextErrors.hours = `预计耗时需在 ${MIN_TASK_HOURS}~${MAX_TASK_HOURS} 小时之间`;
    }

    // 实际耗时选填：留空表示未统计；填写则与预计耗时同一量级约束
    let parsedActualHours: number | undefined;
    const trimmedActual = actualHours.trim();
    if (trimmedActual) {
      const value = Number(trimmedActual);
      if (!Number.isFinite(value) || value < MIN_TASK_HOURS || value > MAX_TASK_HOURS) {
        nextErrors.actualHours = `实际耗时需在 ${MIN_TASK_HOURS}~${MAX_TASK_HOURS} 小时之间`;
      } else {
        parsedActualHours = value;
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      // 报错在折叠区里就必须自动展开，否则用户只看到「点保存没反应」
      if (nextErrors.deadline || nextErrors.hours || nextErrors.actualHours) {
        setAdvancedOpen(true);
      }
      return;
    }

    void commit(
      {
        title: finalTitle,
        type,
        course: course.trim(),
        deadline: parsedDeadline.toISOString(),
        estimatedHours: parsedHours,
        actualHours: parsedActualHours,
        priority,
        subTasks,
      },
      false,
    );
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
      notify(describeError(error), 'error');
    }
  };

  const handleOverlayClick = () => {
    if (!submitting) onClose();
  };

  /** 高级字段（类型 / 课程 / 精确时间 / 耗时 / 优先级 / 子任务） */
  const advancedFields = (
    <>
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

      {courseOptions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {courseOptions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCourse(item)}
              aria-pressed={course === item}
              className={`h-8 rounded-lg px-2.5 text-xs transition ${
                course === item
                  ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/40'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      <label className="mt-4 block">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          DDL <span className="text-rose-500">*</span>
        </span>
        <input
          id="task-deadline"
          type="datetime-local"
          value={deadline}
          onChange={(event) => {
            // 手动改时间：清掉快捷选择的记忆，避免后面误报「已覆盖」
            setDeadline(event.target.value);
            setQuickPickLabel(null);
            setOverrideNotice(null);
          }}
          className={`${INPUT_CLASS} appearance-none`}
        />
      </label>

      {/* 快捷截止时间：今天 +N 天的 16:30 */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {QUICK_DAY_OPTIONS.map((days) => {
          const active = activeQuickDay === days;
          return (
            <button
              key={days}
              type="button"
              onClick={() => applyDeadlineAfterDays(days)}
              aria-pressed={active}
              aria-label={`截止时间设为今天加 ${days} 天的 16:30`}
              className={`${QUICK_BTN_CLASS} border ${
                active
                  ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600'
              }`}
            >
              +{days}天
              {lastQuickDays === days && !active && (
                <span className="ml-1 text-[10px] text-indigo-500 dark:text-indigo-400">·</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 自定义天数：回车或点确认，统一算成「今天 +N 天 16:30」 */}
      <div className="mt-2 flex items-center gap-2">
        <input
          id="task-custom-days"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          value={customDays}
          onChange={(event) => {
            // 只保留数字，手机上直接弹数字键盘，也省掉一半校验
            setCustomDays(event.target.value.replace(/\D/g, ''));
            setDaysError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              // 关键：阻止回车触发外层 form 提交
              event.preventDefault();
              handleCustomDaysConfirm();
            }
          }}
          placeholder="输入天数(如6)"
          aria-label="自定义截止天数"
          aria-invalid={Boolean(daysError)}
          className={DAYS_INPUT_CLASS}
        />
        <button
          type="button"
          onClick={handleCustomDaysConfirm}
          disabled={!customDays.trim()}
          className={`${QUICK_BTN_CLASS} shrink-0 border border-slate-200 px-3 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600`}
        >
          确认
        </button>
      </div>
      {daysError && <p className="mt-1 text-xs text-rose-600">{daysError}</p>}
      {overrideNotice && (
        <p
          role="status"
          className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        >
          {overrideNotice}
        </p>
      )}
      <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
        快捷设置一律取「今天 + N 天」的 16:30，会覆盖上方手动选择的时间。
      </p>
      {errors.deadline && <p className="mt-1 text-xs text-rose-600">{errors.deadline}</p>}
      {showHistoricalHint && (
        <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
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
            min={MIN_TASK_HOURS}
            max={MAX_TASK_HOURS}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            className={`${INPUT_CLASS} mt-0 pr-14`}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
            小时
          </span>
        </span>
      </label>
      {errors.hours && <p className="mt-1 text-xs text-rose-600">{errors.hours}</p>}

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
            min={MIN_TASK_HOURS}
            max={MAX_TASK_HOURS}
            value={actualHours}
            onChange={(event) => setActualHours(event.target.value)}
            placeholder="完成后填写"
            className={`${INPUT_CLASS} mt-0 pr-14`}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
            小时
          </span>
        </span>
      </label>
      {errors.actualHours && <p className="mt-1 text-xs text-rose-600">{errors.actualHours}</p>}

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

      <div className="mt-4">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          子任务（选填，把大任务拆成可勾选步骤）
        </span>

        {subTasks.length > 0 && (
          <ul className="mt-1.5 space-y-2">
            {subTasks.map((item, index) => (
              <li key={index} className="flex items-center gap-2">
                <input
                  value={item.title}
                  onChange={(event) => updateSubTaskTitle(index, event.target.value)}
                  maxLength={60}
                  placeholder="子任务标题"
                  aria-label={`子任务 ${index + 1}`}
                  className={SUB_INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => removeSubTask(index)}
                  aria-label={`删除子任务：${item.title}`}
                  className="flex h-12 w-10 shrink-0 items-center justify-center rounded-xl text-slate-300 transition hover:bg-slate-100 hover:text-rose-500 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-rose-400"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-1.5 flex items-center gap-2">
          <input
            value={newSubTask}
            onChange={(event) => setNewSubTask(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addSubTask();
              }
            }}
            maxLength={60}
            placeholder="输入后回车添加子任务"
            aria-label="新子任务标题"
            className={SUB_INPUT_CLASS}
          />
          <button
            type="button"
            onClick={addSubTask}
            disabled={!newSubTask.trim()}
            className="h-12 shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-600 transition disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            添加
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/60"
        onClick={handleOverlayClick}
        role="presentation"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-form-title"
        tabIndex={-1}
        className="sheet-enter relative max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-white px-4 pt-3 shadow-2xl outline-none dark:bg-slate-900"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center justify-between">
          <h2
            id="task-form-title"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
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
          {!isEditing ? (
            <>
              <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                <label
                  htmlFor="task-title"
                  className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400"
                >
                  <WandIcon className="h-4 w-4" />
                  一句话录入：时间、课程、耗时一起写
                </label>
                <input
                  id="task-title"
                  value={title}
                  onChange={handleTitleChange}
                  onBlur={handleTitleBlur}
                  autoFocus
                  maxLength={120}
                  placeholder="例如：明天下午3点交高数作业，预计2小时"
                  className="mt-2 h-12 w-full max-w-full min-w-0 rounded-xl border border-indigo-200 bg-white px-3 text-base text-slate-900 transition outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-indigo-500/40 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                />

                {/* 识别到什么，就直接摆在输入框下面 —— 不让默认值静默生效 */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  {recognizedSomething && parsed ? (
                    <>
                      <span className="text-slate-400 dark:text-slate-500">已识别</span>
                      <span className={CHIP_CLASS}>
                        时间 {dayjs(parsed.deadline).format('M月D日 ddd HH:mm')}
                      </span>
                      {parsed.hasCourse && <span className={CHIP_CLASS}>课程 {parsed.course}</span>}
                      {parsed.hasHours && (
                        <span className={CHIP_CLASS}>耗时 {parsed.estimatedHours} 小时</span>
                      )}
                      {parsed.hasPriority && (
                        <span className={CHIP_CLASS}>{PRIORITY_LABEL[parsed.priority]}优先级</span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">
                      {title.trim()
                        ? '没识别到时间，按下面显示的截止时间记；也可以点「更多选项」手动改。'
                        : '例如「明天下午3点交高数作业」——时间、课程、耗时会一起填好。'}
                    </span>
                  )}
                </div>
              </div>

              {/* 当前生效的截止时间：始终可见，不用滚到表单底部核对 */}
              <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
                <span className="text-xs text-slate-500 dark:text-slate-400">截止</span>
                <span className="text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                  {deadlineText.isValid() ? deadlineText.format('M月D日 ddd HH:mm') : '—'}
                </span>
              </div>

              {/* 快捷天数常驻：学生绝大多数 DDL 就是 +3 或 +7 天 */}
              <div className="mt-2 grid grid-cols-3 gap-2">
                {QUICK_DAY_OPTIONS.map((days) => {
                  const active = activeQuickDay === days;
                  return (
                    <button
                      key={days}
                      type="button"
                      onClick={() => applyDeadlineAfterDays(days)}
                      aria-pressed={active}
                      className={`${QUICK_BTN_CLASS} border ${
                        active
                          ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                          : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      +{days}天
                      {lastQuickDays === days && !active && (
                        <span className="ml-1 text-[10px] text-indigo-500 dark:text-indigo-400">
                          ·
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {errors.title && <p className="mt-1 text-xs text-rose-600">{errors.title}</p>}
            </>
          ) : (
            <label className="mt-3 block">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                标题 <span className="text-rose-500">*</span>
              </span>
              <input
                id="task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={80}
                placeholder="例如：高数作业"
                className={INPUT_CLASS}
              />
              {errors.title && <p className="mt-1 text-xs text-rose-600">{errors.title}</p>}
            </label>
          )}

          {/* 编辑模式恒展开；新增模式点「更多选项」展开 */}
          {isEditing ? (
            advancedFields
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAdvancedOpen((prev) => !prev)}
                aria-expanded={advancedOpen}
                className="mt-2 flex h-10 w-full items-center justify-center gap-1 rounded-xl text-xs font-medium text-slate-500 transition active:scale-[0.99] dark:text-slate-400"
              >
                {advancedOpen ? '收起更多选项' : '更多选项（类型 / 课程 / 耗时 / 子任务）'}
                <span aria-hidden="true" className={advancedOpen ? 'rotate-180' : ''}>
                  ⌄
                </span>
              </button>
              {advancedOpen && advancedFields}
            </>
          )}

          {/* 保存按钮常驻底部：不再需要滚过整张表才能提交 */}
          <div
            className="sticky bottom-0 -mx-4 mt-3 border-t border-slate-100 bg-white/95 px-4 pt-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 20px))' }}
          >
            <button
              type="submit"
              disabled={submitting}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-slate-900 text-sm font-medium text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
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
          </div>
        </form>
      </div>

      {confirmDelete && task && (
        <ConfirmDialog
          title="删除事项"
          message={`确定删除「${task.title}」吗？删除后可在提示条上点「撤销」恢复。`}
          confirmText="删除"
          cancelText="取消"
          tone="danger"
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {conflict && (
        <ConfirmDialog
          title="这条事项已被修改"
          message={
            conflict.latest.deleted
              ? '这条事项已在其他设备被删除。继续保存会让它重新出现；放弃则关闭表单并保持删除状态。'
              : `你在编辑期间，这条事项已在其他设备或标签页被改过（最新标题「${conflict.latest.title}」）。继续保存会用当前表单内容覆盖它。`
          }
          confirmText="覆盖保存"
          cancelText="放弃修改"
          tone="danger"
          onConfirm={() => {
            const pendingPayload = conflict.payload;
            setConflict(null);
            void commit(pendingPayload, true);
          }}
          onCancel={() => {
            setConflict(null);
            onClose();
            notify('已放弃本次修改，界面已同步为最新版本', 'info');
          }}
        />
      )}
    </div>
  );
}
