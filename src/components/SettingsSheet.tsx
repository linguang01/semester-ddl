import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { InstallPromptApi } from '../hooks/useInstallPrompt';
import { THEME_OPTIONS, type UseThemeResult } from '../hooks/useTheme';
import {
  BackupError,
  describeImportReport,
  downloadPreImportBackup,
  exportBackup,
  mergeBackup,
  readBackupFile,
  type ImportReport,
  type ParsedBackup,
} from '../utils/backup';
import { exportTasksToCalendar } from '../utils/calendar';
import { ConfirmDialog } from './ConfirmDialog';
import { InstallPrompt } from './InstallPrompt';
import type { Notify } from './Toast';
import { XIcon } from './icons';

interface SettingsSheetProps {
  install: InstallPromptApi;
  theme: UseThemeResult;
  notify: Notify;
  onClose: () => void;
}

const ACTION_BUTTON_CLASS =
  'flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';

const THEME_OPTION_CLASS = 'h-11 rounded-xl text-xs font-medium transition';

export function SettingsSheet({ install, theme, notify, onClose }: SettingsSheetProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [calendarExporting, setCalendarExporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pendingBackup, setPendingBackup] = useState<ParsedBackup | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleExport = async () => {
    if (exporting || importing) return;

    setExporting(true);
    try {
      const count = await exportBackup();
      notify(`已导出 ${count} 条任务`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : '导出失败，请稍后重试', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // 清空 value，允许连续选择同一个文件
    input.value = '';

    if (!file || importing) return;

    setImporting(true);
    setReport(null);

    try {
      const parsed = await readBackupFile(file);
      // 解析成功后先弹确认框，确认后再真正写入
      setPendingBackup(parsed);
    } catch (error) {
      notify(
        error instanceof BackupError ? error.message : '导入失败，现有数据未受影响',
        'error',
      );
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingBackup) return;
    const parsed = pendingBackup;
    setPendingBackup(null);
    setImporting(true);

    try {
      // 真正写入前，先下载一份当前数据，便于回退
      await downloadPreImportBackup();

      const result = await mergeBackup(parsed);
      setReport(result);

      const hasSkipped = result.skippedTasks + result.skippedSelections > 0;
      notify(describeImportReport(result), hasSkipped ? 'info' : 'success');
    } catch (error) {
      notify(
        error instanceof BackupError ? error.message : '导入失败，现有数据未受影响',
        'error',
      );
    } finally {
      setImporting(false);
    }
  };

  const handleExportCalendar = async () => {
    if (exporting || importing || calendarExporting) return;

    setCalendarExporting(true);
    try {
      const count = await exportTasksToCalendar();
      notify(`已生成 ${count} 条日历提醒，请在弹出面板中确认添加`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : '导出失败，请稍后重试', 'error');
    } finally {
      setCalendarExporting(false);
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="sheet-enter relative max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-white px-4 pt-3 shadow-2xl dark:bg-slate-900"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 20px))' }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center justify-between">
          <h2 id="settings-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            设置
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <section className="mt-4">
          <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400">外观</h3>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map((option) => {
              const active = theme.preference === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => theme.setPreference(option.value)}
                  aria-pressed={active}
                  className={`${THEME_OPTION_CLASS} ${
                    active
                      ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
                      : 'border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            「自动」按本地时间切换：早上 6 点起浅色，晚上 6 点起深色。
          </p>
        </section>

        <section className="mt-5">
          <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400">安装到主屏幕</h3>
          <div className="mt-1.5">
            <InstallPrompt install={install} />
          </div>
        </section>

        <section className="mt-5">
          <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400">数据备份</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            导出全部任务和今日选择。导入采用合并方式，不会清空现有数据；写入前会自动下载一份当前数据备份。
          </p>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting || importing || calendarExporting}
              className={ACTION_BUTTON_CLASS}
            >
              {exporting ? '导出中…' : '导出备份'}
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={exporting || importing || calendarExporting}
              className={ACTION_BUTTON_CLASS}
            >
              {importing ? '导入中…' : '导入备份'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleExportCalendar()}
            disabled={exporting || importing || calendarExporting}
            className={`${ACTION_BUTTON_CLASS} mt-2 w-full`}
          >
            {calendarExporting ? '生成中…' : '导出到系统日历'}
          </button>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            导入系统日历后，手机日历会自动提醒你
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleImportFile(event)}
          />

          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            单个文件不超过 10 MB · 全部在本机处理，不会上传文件
          </p>

          {report && (
            <p
              role="status"
              className={`mt-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                report.skippedTasks + report.skippedSelections > 0
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
              }`}
            >
              {describeImportReport(report)}
            </p>
          )}
        </section>

        <section className="mt-5 rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-800/60">
          <h3 className="text-xs font-medium text-slate-700 dark:text-slate-300">关于离线使用</h3>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            在 HTTPS 或 localhost 下，首次打开后应用会自动缓存，之后可以离线打开；发布新版本时，下次打开会自动更新。
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            PWA 安装和 Service Worker 需要 HTTPS 或 localhost。通过局域网 IP（192.168.x.x）的 HTTP
            地址访问时，安装提示不会出现，离线缓存也不会生效。正式使用时请部署到 HTTPS 地址。
          </p>
        </section>
      </div>

      {pendingBackup && (
        <ConfirmDialog
          title="确认导入"
          message={`将合并导入 ${pendingBackup.tasks.length} 条任务和 ${pendingBackup.dailySelections.length} 条今日选择，现有数据不会被删除。继续？`}
          confirmText="继续导入"
          cancelText="取消"
          onConfirm={() => void handleConfirmImport()}
          onCancel={() => {
            setPendingBackup(null);
            notify('已取消导入', 'info');
          }}
        />
      )}
    </div>
  );
}
