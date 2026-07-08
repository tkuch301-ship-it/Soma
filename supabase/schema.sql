-- Soma v3 schema (PostgreSQL / Supabase)
--
-- Paste this whole file into the Supabase SQL Editor (Project > SQL Editor > New query)
-- and run it once for a brand-new install. It is safe to re-run: every
-- statement is idempotent (`if not exists` / `create or replace` style
-- guards).
--
-- If you already have a v2 database with data in it, do NOT run this file —
-- run supabase/migrations/002_v3.sql instead (it upgrades tasks/assignees in
-- place without dropping any data). This file describes the same end state
-- that migration produces, for fresh installs only.
--
-- Row Level Security is enabled on every table but no policies are created.
-- The app talks to Supabase exclusively through the service_role key from
-- server-side API routes, which bypasses RLS by design, so no anon/public
-- access is granted here.

-- ---------------------------------------------------------------------------
-- members
-- ---------------------------------------------------------------------------
create table if not exists members (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists projects (
  id bigint generated always as identity primary key,
  name text not null,
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  due_date date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table if not exists tasks (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'todo' check (status in ('todo', 'doing', 'review', 'done')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- task_assignees (many-to-many: a task can have multiple assignees)
-- ---------------------------------------------------------------------------
create table if not exists task_assignees (
  task_id bigint not null references tasks(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  primary key (task_id, member_id)
);

-- ---------------------------------------------------------------------------
-- steps (工程 / sub-steps of a task)
-- ---------------------------------------------------------------------------
create table if not exists steps (
  id bigint generated always as identity primary key,
  task_id bigint not null references tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- activities (progress history: who changed what, and when)
-- project_id / task_id are nullable so member-level events (member_added,
-- member_deleted) that have no project/task context can still be recorded.
-- ---------------------------------------------------------------------------
create table if not exists activities (
  id bigint generated always as identity primary key,
  project_id bigint references projects(id) on delete cascade,
  task_id bigint references tasks(id) on delete cascade,
  actor_id bigint references members(id) on delete set null,
  actor_name text,
  type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table members enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table task_assignees enable row level security;
alter table steps enable row level security;
alter table activities enable row level security;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_tasks_project_id on tasks(project_id);
create index if not exists idx_task_assignees_task_id on task_assignees(task_id);
create index if not exists idx_task_assignees_member_id on task_assignees(member_id);
create index if not exists idx_steps_task_id on steps(task_id);
create index if not exists idx_activities_project_id_created_at
  on activities(project_id, created_at desc);
create index if not exists idx_activities_task_id on activities(task_id);
