/**
 * 浏览器端下载的公共实现（唯一真源）。
 *
 * 备份 JSON、系统日历 ICS 原本各写了一份「a[download] + ObjectURL + 延迟回收」，
 * 两处逻辑必须同步维护（比如回收延迟），漏改一处就会出现「下载到空文件」。
 * 现在统一走这里，新增 CSV 导出之类的功能直接复用。
 */

/** ObjectURL 回收延迟：部分浏览器在下载真正开始前就回收会导致文件为空 */
const REVOKE_DELAY_MS = 1000;

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/** 文本内容下载；按需指定 MIME，默认按 UTF-8 纯文本处理 */
export function downloadText(
  filename: string,
  text: string,
  mime = 'text/plain;charset=utf-8',
): void {
  downloadBlob(filename, new Blob([text], { type: mime }));
}
