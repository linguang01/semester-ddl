import { useState } from 'react';
import type { InstallPromptApi } from '../hooks/useInstallPrompt';

interface InstallPromptProps {
  install: InstallPromptApi;
}

export function InstallPrompt({ install }: InstallPromptProps) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  if (install.isInstalled) {
    return (
      <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        已安装到主屏幕，下次从桌面图标直接打开即可。
      </p>
    );
  }

  // iOS Safari 不支持 beforeinstallprompt，只给一步到位的操作说明
  if (install.isIOS) {
    return (
      <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
        iPhone 请点浏览器分享按钮 → 添加到主屏幕
      </p>
    );
  }

  if (!install.canInstall) {
    return (
      <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
        当前浏览器暂未提供安装入口。用 Chrome / Edge 打开本页后，可在这里安装到手机。
      </p>
    );
  }

  const handleInstall = async () => {
    setBusy(true);
    setHint(null);

    try {
      const outcome = await install.promptInstall();
      if (outcome === 'dismissed') {
        setHint('已取消安装，需要时再回来点一次即可。');
      }
    } catch {
      setHint('安装未能启动，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleInstall()}
        disabled={busy}
        className="flex h-12 w-full items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50 px-3.5 text-sm font-medium text-indigo-700 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300"
      >
        <span>{busy ? '正在唤起安装…' : '安装到手机'}</span>
        <span aria-hidden="true" className="text-indigo-400 dark:text-indigo-300/70">
          →
        </span>
      </button>

      {hint && (
        <p aria-live="polite" className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}