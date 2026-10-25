import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'auto' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'ddl-theme';

/** 夜间时段：18:00（含）到次日 6:00（不含） */
export const DARK_START_HOUR = 18;
export const DARK_END_HOUR = 6;

export const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

/** 按本地时间判断当前是否处于夜间 */
export function isNightNow(hour: number = new Date().getHours()): boolean {
  return hour >= DARK_START_HOUR || hour < DARK_END_HOUR;
}

export function resolveDark(preference: ThemePreference, hour: number): boolean {
  if (preference === 'dark') return true;
  if (preference === 'light') return false;
  return isNightNow(hour);
}

function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

function applyDark(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', isDark ? '#0f172a' : '#f1f5f9');
  }
}

export interface UseThemeResult {
  preference: ThemePreference;
  isDark: boolean;
  setPreference: (preference: ThemePreference) => void;
}

/**
 * 深浅色外观：默认跟随本地时间（18:00 起深色，6:00 起浅色），
 * 也可在设置中固定浅色/深色，选择保存在 localStorage。
 * 页面打开期间每 30 秒复查一次时间，跨过切换点会自动换主题。
 */
export function useTheme(): UseThemeResult {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);
  const [hour, setHour] = useState(() => new Date().getHours());

  const isDark = resolveDark(preference, hour);

  useEffect(() => {
    applyDark(isDark);
  }, [isDark]);

  useEffect(() => {
    const timer = window.setInterval(() => setHour(new Date().getHours()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const changePreference = useCallback((next: ThemePreference) => {
    setPreference(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 隐私模式下写入失败不影响使用，仅本次会话生效
    }
  }, []);

  return { preference, isDark, setPreference: changePreference };
}