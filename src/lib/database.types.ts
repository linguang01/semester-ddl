import type { SubTask } from '../types';

/**
 * Supabase `tasks` 表的行类型（与 supabase/schema.sql 一一对应）。
 * 注意：这里必须用 type alias 而非 interface——supabase-js 的泛型约束要求
 * Row/Insert/Update 可赋值给 Record<string, unknown>，interface 没有隐式索引签名，
 * 会导致 .from('tasks') 的类型解析为 never。
 * 字段改名或增删时请同步更新本文件与 schema.sql。
 */
export type TasksRow = {
  id: string;
  user_id: string;
  title: string;
  type: 'homework' | 'exam' | 'club' | 'other';
  course: string;
  /** timestamptz，supabase-js 反序列化为 ISO 8601 字符串 */
  deadline: string;
  estimated_hours: number;
  actual_hours: number | null;
  priority: 'high' | 'medium' | 'low';
  status: 'todo' | 'done';
  created_at: string;
  completed_at: string | null;
  sub_tasks: SubTask[];
  updated_at: string;
  deleted: boolean;
};

export type TasksInsert = {
  id: string;
  user_id: string;
  title: string;
  type: TasksRow['type'];
  course: string;
  deadline: string;
  estimated_hours: number;
  actual_hours: number | null;
  priority: TasksRow['priority'];
  status: TasksRow['status'];
  created_at: string;
  completed_at: string | null;
  sub_tasks: SubTask[];
  updated_at: string;
  deleted: boolean;
};

export type TasksUpdate = Partial<TasksInsert>;

/**
 * supabase-js v2 的 Database 泛型约定：createClient<Database>() 后
 * .from('tasks') 的入参/返回值都会按 TasksInsert/TasksRow 严格校验。
 */
export type Database = {
  public: {
    Tables: {
      tasks: {
        Row: TasksRow;
        Insert: TasksInsert;
        Update: TasksUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      sync_tasks: {
        Args: { p_rows: TasksRow[] };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
