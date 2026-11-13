const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Supabase tasks.id 使用 uuid；旧备份中的任意字符串 ID 必须先迁移。 */
export function isTaskId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function hash32(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * 把旧版任意字符串 ID 稳定映射为 UUID 形状。
 * 稳定而非随机：同一份旧备份重复导入仍会命中同一条任务，不会不断产生副本。
 */
export function taskIdFromLegacy(value: string): string {
  const hex = [
    hash32(value, 0x811c9dc5),
    hash32(value, 0x9e3779b9),
    hash32(value, 0x85ebca6b),
    hash32(value, 0xc2b2ae35),
  ].join('');

  const versioned = `${hex.slice(0, 12)}4${hex.slice(13, 16)}`;
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    versioned.slice(0, 8),
    versioned.slice(8, 12),
    versioned.slice(12, 16),
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
