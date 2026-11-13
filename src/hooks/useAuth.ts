import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { assertSupabaseConfigured, supabase } from '../lib/supabase';

export interface AuthActionResult {
  /**
   * 注册后是否需要邮箱验证：
   * Supabase 开启「Confirm email」时 signUp 不建立会话，需要用户先点邮件里的确认链接。
   */
  needsEmailConfirm: boolean;
}

export interface UseAuthResult {
  /** 当前会话；null 表示未登录。应用启动时会自动恢复已保存的登录态 */
  session: Session | null;
  /** 便捷字段：session?.user.id ?? null，作为同步开关使用 */
  userId: string | null;
  /** 便捷字段：登录邮箱 */
  email: string | null;
  /** 启动时恢复会话期间为 true */
  loading: boolean;
  /** 恢复会话失败时的可读错误；不会阻止离线使用 */
  error: Error | null;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

/** 常见认证错误的中文翻译；未收录的原样透出 */
const AUTH_ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': '邮箱或密码错误',
  'User already registered': '该邮箱已注册，请直接登录',
  'Email not confirmed': '邮箱尚未验证，请先查收确认邮件',
  'Password should be at least 6 characters': '密码至少需要 6 位',
  'Signups not allowed for this instance': '当前项目未开放注册',
  'Failed to fetch': '网络请求失败，请检查网络连接或 Supabase 配置',
};

function translateAuthError(cause: unknown): Error {
  if (cause instanceof Error) {
    return new Error(AUTH_ERROR_MAP[cause.message] ?? `操作失败：${cause.message}`);
  }
  return new Error(String(cause));
}

/**
 * 邮箱/密码认证层。
 * session 通过 onAuthStateChange 自动跟随登录/登出/会话恢复。
 * 注意：不要在 onAuthStateChange 回调里直接触发同步（可能死锁），
 * 同步由 useSyncManager 监听 userId 变化来启动。
 */
export function useAuth(): UseAuthResult {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;

    // 启动时恢复已持久化的登录态（localStorage 里的 refresh token）
    void supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) setError(translateAuthError(sessionError));
        else setSession(data.session);
      })
      .catch((cause: unknown) => {
        if (active) setError(translateAuthError(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setError(null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthActionResult> => {
    assertSupabaseConfigured();
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      return { needsEmailConfirm: data.session === null };
    } catch (cause) {
      throw translateAuthError(cause);
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<void> => {
    assertSupabaseConfigured();
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (cause) {
      throw translateAuthError(cause);
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
    } catch (cause) {
      throw translateAuthError(cause);
    }
  }, []);

  return {
    session,
    userId: session?.user.id ?? null,
    email: session?.user.email ?? null,
    loading,
    error,
    signUp,
    signIn,
    signOut,
  };
}
