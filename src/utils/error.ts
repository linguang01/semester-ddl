/**
 * 从 unknown 类型的错误中提取可读信息。
 * 非 Error 抛出（如直接 throw 字符串）时返回 fallback，未提供则用 String 转换。
 */
export function describeError(error: unknown, fallback?: string): string {
  if (error instanceof Error) return error.message;
  return fallback ?? String(error);
}
