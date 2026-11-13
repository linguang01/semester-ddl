import { useState, type FormEvent } from 'react';
import { useDialog } from '../hooks/useDialog';
import { isSupabaseConfigured } from '../lib/supabase';
import type { UseAuthResult } from '../hooks/useAuth';
import { describeError } from '../utils/error';
import type { Notify } from './Toast';
import { XIcon } from './icons';

interface AuthSheetProps {
  auth: UseAuthResult;
  notify: Notify;
  onClose: () => void;
}

type AuthMode = 'signin' | 'signup';

const INPUT_CLASS =
  'mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200';

/** 邮箱格式做最基础校验，详细规则交给 Supabase */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * 登录 / 注册弹窗：邮箱 + 密码，两种模式切换。
 * 注册成功但项目开启了邮箱验证时，提示用户先去邮箱点确认链接。
 */
export function AuthSheet({ auth, notify, onClose }: AuthSheetProps) {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /** 注册后等待邮箱确认的提示（此时不关闭弹窗，让用户可以回到登录） */
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);
  const dialogRef = useDialog(onClose);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const trimmedEmail = email.trim();
    if (!isValidEmail(trimmedEmail)) {
      notify('请输入有效的邮箱地址', 'error');
      return;
    }
    if (password.length < 6) {
      notify('密码至少需要 6 位', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signup') {
        const { needsEmailConfirm } = await auth.signUp(trimmedEmail, password);
        if (needsEmailConfirm) {
          // Supabase 开启了邮箱验证：不建立会话，等用户确认后再登录
          setPendingConfirmEmail(trimmedEmail);
          setMode('signin');
        } else {
          // 未开启邮箱验证：signUp 直接建立会话，onAuthStateChange 会接管后续同步
          notify('注册成功，正在同步本机数据…', 'success');
          onClose();
        }
      } else {
        await auth.signIn(trimmedEmail, password);
        notify('登录成功，正在同步本机数据…', 'success');
        onClose();
      }
    } catch (cause) {
      notify(describeError(cause, '操作失败，请稍后重试'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/60"
        onClick={onClose}
        role="presentation"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        tabIndex={-1}
        className="sheet-enter relative w-full max-w-md rounded-t-2xl bg-white px-4 pt-3 shadow-2xl outline-none dark:bg-slate-900"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 20px))' }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center justify-between">
          <h2 id="auth-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {mode === 'signup' ? '注册账号' : '登录账号'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {!isSupabaseConfigured() && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            尚未配置 Supabase：请先在项目根目录 .env.local 里填入 VITE_SUPABASE_URL 和
            VITE_SUPABASE_ANON_KEY，然后重启应用。
          </p>
        )}

        {pendingConfirmEmail && (
          <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-[11px] leading-relaxed text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
            注册成功！确认邮件已发送到 {pendingConfirmEmail}，请点击邮件中的确认链接后再登录。
          </p>
        )}

        <form className="mt-3" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">邮箱</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              required
              className={INPUT_CLASS}
            />
          </label>

          <label className="mt-3 block">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">密码（至少 6 位）</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={6}
              required
              className={INPUT_CLASS}
            />
          </label>

          <button
            type="submit"
            disabled={submitting || !isSupabaseConfigured()}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-slate-900 text-sm font-medium text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
          >
            {submitting ? '请稍候…' : mode === 'signup' ? '注册' : '登录'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signup' ? 'signin' : 'signup');
            setPendingConfirmEmail(null);
          }}
          className="mt-3 w-full py-2 text-center text-xs text-indigo-500 underline"
        >
          {mode === 'signup' ? '已有账号？去登录' : '没有账号？注册一个'}
        </button>

        <p className="mt-1 text-center text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          登录后本机任务会与云端自动同步；退出登录不会删除本机数据。
        </p>
      </div>
    </div>
  );
}
