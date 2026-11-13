/**
 * 把 ISO 8601 时间戳转成可比较的毫秒值。
 * 云端可能返回 `+00:00`，本地通常生成 `Z`；直接比较字符串并不能可靠表示时间先后。
 * 缺失或非法值按最早时间处理，让有效的远端/备份数据可以修复旧数据。
 */
export function timestampMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
