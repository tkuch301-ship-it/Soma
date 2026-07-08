-- Soma v3 migration (PostgreSQL / Supabase)
--
-- Paste this whole file into the Supabase SQL Editor and run it once against
-- the existing (v2) database. It is safe to re-run (every statement is
-- idempotent): drop-if-exists / create-if-not-exists / on-conflict guards
-- are used throughout, so running it twice does not error and does not
-- duplicate or lose data.
--
-- What this does:
--   1. Widens tasks.status to accept the new "review" (確認待ち) value.
--   2. Creates task_assignees, the many-to-many join table that replaces
--      tasks.assignee_id, and enables RLS on it (service_role bypasses RLS,
--      matching every other table in this schema).
--   3. Backfills task_assignees from any existing tasks.assignee_id values.
--   4. Drops tasks.assignee_id now that task_assignees is the source of
--      truth.
--
-- Run this BEFORE deploying the v3 backend code (the v3 API/repo layer no
-- longer reads/writes tasks.assignee_id and requires task_assignees to
-- exist).

-- ---------------------------------------------------------------------------
-- 1. tasks.status: allow 'todo' | 'doing' | 'review' | 'done'
-- ---------------------------------------------------------------------------
-- The original check constraint in supabase/schema.sql was declared inline
-- (`status text not null default 'todo' check (status in ('todo', 'doing',
-- 'done'))`) without an explicit name, so Postgres auto-named it using its
-- standard "<table>_<column>_check" convention: tasks_status_check. Drop it
-- by that name (idempotent via IF EXISTS) and re-add it with the 4th value.
alter table tasks drop constraint if exists tasks_status_check;
alter table tasks
  add constraint tasks_status_check
  check (status in ('todo', 'doing', 'review', 'done'));

-- ---------------------------------------------------------------------------
-- 2. task_assignees (many-to-many: a task can have multiple assignees)
-- ---------------------------------------------------------------------------
create table if not exists task_assignees (
  task_id bigint not null references tasks(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  primary key (task_id, member_id)
);

alter table task_assignees enable row level security;

create index if not exists idx_task_assignees_task_id on task_assignees(task_id);
create index if not exists idx_task_assignees_member_id on task_assignees(member_id);

-- ---------------------------------------------------------------------------
-- 3. Backfill: copy existing tasks.assignee_id into task_assignees
-- ---------------------------------------------------------------------------
-- Only runs meaningfully once: if tasks.assignee_id has already been dropped
-- (i.e. this migration already ran) this whole block is skipped, and the
-- `on conflict do nothing` guard makes a second run before the column drop
-- a no-op as well.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'assignee_id'
  ) then
    insert into task_assignees (task_id, member_id)
    select id, assignee_id from tasks where assignee_id is not null
    on conflict do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Drop the now-superseded single-assignee column
-- ---------------------------------------------------------------------------
alter table tasks drop column if exists assignee_id;
