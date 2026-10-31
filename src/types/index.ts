/** 任务类型：作业 / 考试 / 社团 / 其他 */
export type TaskType = 'homework' | 'exam' | 'club' | 'other';

/** 优先级：高 / 中 / 低 */
export type TaskPriority = 'high' | 'medium' | 'low';

/** 任务状态：待办 / 已完成 */
export type TaskStatus = 'todo' | 'done';

/** 子任务：隶属于某个任务，可独立勾选完成 */
export interface SubTask {
  title: string;
  isCompleted: boolean;
}

export interface Task {
  /** 主键，由 crypto.randomUUID() 生成 */
  id: string;
  title: string;
  type: TaskType;
  course: string;
  /** ISO 8601 字符串，如 2026-10-27T23:59:00.000Z；字符串字典序即时间先后 */
  deadline: string;
  /** 预计耗时（小时） */
  estimatedHours: number;
  /** 实际耗时（小时），完成后由用户手动填写；未填则为空 */
  actualHours?: number;
  priority: TaskPriority;
  status: TaskStatus;
  /** ISO 8601 字符串 */
  createdAt: string;
  /** 完成时间，ISO 8601 字符串；仅 status === 'done' 时存在 */
  completedAt?: string;
  /** 子任务列表；旧数据无此字段，读取时按空数组处理 */
  subTasks?: SubTask[];
}

/** 新建任务时的入参：id / 状态 / 创建时间由数据层生成 */
export interface NewTaskInput {
  title: string;
  type: TaskType;
  course: string;
  deadline: string;
  /** 默认 0 */
  estimatedHours?: number;
  /** 默认空（完成后填写） */
  actualHours?: number;
  /** 默认 medium */
  priority?: TaskPriority;
  /** 默认空数组 */
  subTasks?: SubTask[];
}

/** 更新任务时允许修改的字段；completedAt 由 status 变化自动维护 */
export type TaskUpdate = Partial<
  Pick<
    Task,
    'title' | 'type' | 'course' | 'deadline' | 'estimatedHours' | 'actualHours' | 'priority' | 'status' | 'subTasks'
  >
>;

/** 每日选择记录：一天最多 3 个任务 id */
export interface DailySelection {
  /** 主键，格式 YYYY-MM-DD */
  date: string;
  /** 任务 id 列表，长度 <= 3 */
  taskIds: string[];
}
