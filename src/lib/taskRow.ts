import type { TasksRow } from './database.types';

/**
 * 云端行是否「整行完整」。
 *
 * 背景：Postgres 默认 `REPLICA IDENTITY DEFAULT` 时，Realtime 的 UPDATE 事件
 * 只携带主键与本次变更的列。客户端若直接 `rowToTask(payload.new)` 落库，
 * 会写出一条 title 为空、estimated_hours 为 undefined 的残缺任务，
 * 随后 `hasSameTaskContent` 判定不等，还会引发无意义的互相覆盖。
 *
 * 这里只做「字段是否存在且类型正确」的粗校验 —— 目的不是数据校验器，
 * 而是识别「这是半行，别信它」，交给调用方按 id 精确补拉。
 */
export function isCompleteTaskRow(row: Partial<TasksRow> | null | undefined): row is TasksRow {
  if (!row) return false;

  return (
    typeof row.id === 'string' &&
    typeof row.user_id === 'string' &&
    typeof row.title === 'string' &&
    typeof row.type === 'string' &&
    typeof row.course === 'string' &&
    typeof row.deadline === 'string' &&
    typeof row.estimated_hours === 'number' &&
    typeof row.priority === 'string' &&
    typeof row.status === 'string' &&
    typeof row.created_at === 'string' &&
    typeof row.updated_at === 'string' &&
    typeof row.deleted === 'boolean' &&
    Array.isArray(row.sub_tasks)
  );
}
