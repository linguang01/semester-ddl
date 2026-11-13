import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** 是否已完成环境变量配置；未配置时应用仍可纯本地使用，登录/同步会给出友好提示 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * 全应用共用的 Supabase 客户端。
 * 未配置环境变量时用占位值构造（不会发起任何请求），登录/同步入口会先检查 isSupabaseConfigured。
 * 泛型传入 Database 后，.from('tasks') 的读写都受 TasksInsert/TasksRow 类型约束。
 */
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.invalid',
  supabaseAnonKey || 'placeholder-anon-key',
);

/** 统一的「未配置」错误，UI 直接展示 message */
export class SupabaseConfigError extends Error {
  constructor() {
    super('尚未配置 Supabase：请在 .env.local 填入 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 后重启应用');
    this.name = 'SupabaseConfigError';
  }
}

/** 调用任何 Supabase 接口前先确认已配置 */
export function assertSupabaseConfigured(): void {
  if (!isSupabaseConfigured()) {
    throw new SupabaseConfigError();
  }
}
