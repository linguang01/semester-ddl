import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  rescueMessage: string | null;
  rescuing: boolean;
}

/** 部署后旧 chunk 失效是最常见的「白屏」原因，文案要能指向刷新而不是让用户以为数据没了 */
function isChunkLoadError(error: Error): boolean {
  return /dynamically imported module|Loading chunk|Importing a module script failed|Failed to fetch/i.test(
    error.message,
  );
}

/**
 * 顶层渲染兜底。
 *
 * 之前任何一个组件抛错（脏数据、图表库加载失败、第三方库内部异常）都会让整棵树卸载，
 * 用户看到纯白页面，只能怀疑「数据丢了」并去清站点数据 —— 那才是真的丢数据。
 * 这里把崩溃收敛成一张可恢复的卡片：说明数据仍在 IndexedDB、支持先导出备份再刷新。
 *
 * 注意：只能捕获渲染/lifecycle 阶段的同步错误，事件回调和 Promise 里的异常仍需各自 try/catch。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, rescueMessage: null, rescuing: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, rescueMessage: null, rescuing: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 保留现场：控制台里仍能看到完整堆栈，便于本地排查
    console.error('[ErrorBoundary] 渲染异常', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  /**
   * 崩溃后仍然可以导出数据：Dexie 读写不依赖 React 渲染。
   * 动态 import 让备份/同步链路不进主包，避免「备份模块本身加载失败」连带拖垮兜底页。
   */
  private handleRescue = async (): Promise<void> => {
    if (this.state.rescuing) return;
    this.setState({ rescuing: true, rescueMessage: '正在导出，请稍候…' });

    try {
      const { exportBackup } = await import('../utils/backup');
      const count = await exportBackup();
      this.setState({
        rescuing: false,
        rescueMessage: `已导出 ${count} 条任务，确认文件已保存后再刷新页面。`,
      });
    } catch (cause) {
      this.setState({
        rescuing: false,
        rescueMessage: `导出失败：${cause instanceof Error ? cause.message : String(cause)}。可直接刷新重试。`,
      });
    }
  };

  render(): ReactNode {
    const { error, rescueMessage, rescuing } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10"
      >
        <p className="text-[11px] font-semibold tracking-[0.2em] text-indigo-500 dark:text-indigo-400">
          SEMESTER DDL
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          页面渲染出错了
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          数据仍保存在本机浏览器里，没有丢失。建议先导出备份，再刷新页面重试；
          若反复出现，多半是版本更新后旧缓存未替换，刷新即可恢复。
        </p>

        <pre className="mt-3 max-h-32 overflow-auto rounded-xl bg-slate-100 px-3 py-2 text-[11px] leading-relaxed break-words whitespace-pre-wrap text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {error.message}
        </pre>

        {isChunkLoadError(error) && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            看起来是资源加载失败（可能刚发布了新版本）。直接点「刷新页面」即可。
          </p>
        )}

        <button
          type="button"
          onClick={this.handleReload}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-slate-900 text-sm font-medium text-white transition active:scale-[0.99] dark:bg-slate-100 dark:text-slate-900"
        >
          刷新页面
        </button>

        <button
          type="button"
          onClick={() => void this.handleRescue()}
          disabled={rescuing}
          className="mt-2 flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/60"
        >
          {rescuing ? '导出中…' : '先导出本地数据'}
        </button>

        {rescueMessage && (
          <p
            role="status"
            className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"
          >
            {rescueMessage}
          </p>
        )}
      </div>
    );
  }
}
