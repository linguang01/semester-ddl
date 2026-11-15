-- ============================================================
-- DDL 三件事 · tasks 表结构 + RLS + Realtime + 原子条件写
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴全文 → Run
-- 幂等设计：重复执行不会报错，也会把旧版单列主键迁移为 (user_id, id)
-- ============================================================

create table if not exists public.tasks (
  -- 前端 crypto.randomUUID() 生成的 id；不同账号允许出现相同 id
  id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  type text not null check (type in ('homework', 'exam', 'club', 'other')),
  course text not null default '',
  deadline timestamptz not null,
  estimated_hours real not null default 0,
  actual_hours real,
  priority text not null check (priority in ('high', 'medium', 'low')),
  status text not null check (status in ('todo', 'done')),
  created_at timestamptz not null,
  completed_at timestamptz,
  sub_tasks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  primary key (user_id, id)
);

-- 兼容早期已部署版本：把全局 id 主键改为账号内唯一，避免跨账号主键冲突。
do $$
declare
  pk_name text;
  pk_definition text;
begin
  select conname, pg_get_constraintdef(oid)
    into pk_name, pk_definition
    from pg_constraint
   where conrelid = 'public.tasks'::regclass
     and contype = 'p';

  if pk_definition is distinct from 'PRIMARY KEY (user_id, id)' then
    if pk_name is not null then
      execute format('alter table public.tasks drop constraint %I', pk_name);
    end if;
    alter table public.tasks add primary key (user_id, id);
  end if;
end $$;

comment on table public.tasks is '任务表：IndexedDB 的云端副本，按 updated_at 做多端 LWW 合并';

-- 行级安全：每个用户只能访问自己的任务
alter table public.tasks enable row level security;

drop policy if exists "users_manage_own_tasks" on public.tasks;
create policy "users_manage_own_tasks"
  on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 查询与增量同步索引
create index if not exists tasks_user_id_deadline_idx on public.tasks (user_id, deadline);
create index if not exists tasks_user_id_updated_at_idx on public.tasks (user_id, updated_at);

-- 原子条件写：只有 incoming 的 updated_at 严格更新时才覆盖。
-- 客户端并发、慢请求重放都不会把云端较新的数据回滚成旧值。
create or replace function public.sync_tasks(p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  item jsonb;
  incoming public.tasks%rowtype;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    incoming := jsonb_populate_record(null::public.tasks, item);

    if incoming.user_id is distinct from auth.uid() then
      raise exception 'user_id does not match authenticated user';
    end if;

    insert into public.tasks (
      id, user_id, title, type, course, deadline, estimated_hours,
      actual_hours, priority, status, created_at, completed_at,
      sub_tasks, updated_at, deleted
    ) values (
      incoming.id, incoming.user_id, incoming.title, incoming.type, incoming.course,
      incoming.deadline, incoming.estimated_hours, incoming.actual_hours,
      incoming.priority, incoming.status, incoming.created_at, incoming.completed_at,
      incoming.sub_tasks, incoming.updated_at, incoming.deleted
    )
    on conflict (user_id, id) do update set
      title = excluded.title,
      type = excluded.type,
      course = excluded.course,
      deadline = excluded.deadline,
      estimated_hours = excluded.estimated_hours,
      actual_hours = excluded.actual_hours,
      priority = excluded.priority,
      status = excluded.status,
      created_at = excluded.created_at,
      completed_at = excluded.completed_at,
      sub_tasks = excluded.sub_tasks,
      updated_at = excluded.updated_at,
      deleted = excluded.deleted
    where public.tasks.updated_at < excluded.updated_at;
  end loop;
end;
$$;

revoke all on function public.sync_tasks(jsonb) from public;
grant execute on function public.sync_tasks(jsonb) to authenticated;

-- 开启 Realtime 变更广播（多端实时同步依赖）
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

-- ============================================================
-- Realtime 事件完整性（必须执行）
-- ============================================================
-- 默认 REPLICA IDENTITY（default）下，UPDATE 事件只带主键 + 实际变更的列。
-- 客户端把这种「半行」直接写进本地 IndexedDB，就会得到 title 为空、进度算不出来的
-- 残缺任务，并进一步触发无意义的互相覆盖。
-- 设为 full 后事件携带整行，客户端（src/lib/sync.ts 的 isCompleteTaskRow）再按整行覆盖才安全。
-- 幂等：重复执行无副作用；代价只是 WAL 略大，tasks 是小表可以忽略。
alter table public.tasks replica identity full;

-- ============================================================
-- 维护任务：墓碑清理（只删云端，客户端一行都不改）
-- ============================================================
-- 软删除的墓碑必须靠云端清理，不能清本地：
--   · 本地删了但云端还在 → 下次全量同步原样拉回来（复活）；
--   · 未登录时物理删除 → 之后登录同一账号，云端旧任务同样会复活。
-- 因此唯一正确的清理点是服务端，且保留 90 天：
-- 超过 90 天没联网的设备本就该做一次全量校准；真在 90 天后才打开，
-- 那条被清掉墓碑的任务会重新出现 —— 这是可接受且可解释的代价。
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron 未启用，已跳过墓碑清理任务。请在 Dashboard → Database → Extensions 启用 pg_cron 后重跑本段 SQL。';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'purge-task-tombstones') then
    perform cron.unschedule('purge-task-tombstones');
  end if;

  perform cron.schedule(
    'purge-task-tombstones',
    '0 4 * * *',
    $cron$ delete from public.tasks where deleted and updated_at < now() - interval '90 days' $cron$
  );
end $$;

-- 不想装 pg_cron 也可以手动跑（建议每季度一次）：
-- delete from public.tasks where deleted and updated_at < now() - interval '90 days';

