-- Standalone LAND VIEW To Do storage.
-- Intentionally separate from public.tasks and project Workflow automation.

create table if not exists public.todo_items (
  id uuid primary key default gen_random_uuid(),
  todo_code text not null unique,
  title text not null,
  description text,
  status text not null default 'To Do' check (status in ('To Do','In Progress','Done')),
  priority text not null default 'Normal' check (priority in ('Low','Normal','High','Urgent')),
  due_date date,
  project_code text,
  assigned_to text,
  created_by text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists todo_items_status_idx on public.todo_items(status);
create index if not exists todo_items_due_date_idx on public.todo_items(due_date);
create index if not exists todo_items_updated_at_idx on public.todo_items(updated_at desc);

alter table public.todo_items enable row level security;
revoke all on table public.todo_items from anon, authenticated;
grant select, insert, update, delete on table public.todo_items to service_role;

comment on table public.todo_items is
  'Standalone LAND VIEW To Do items. Intentionally independent of Workflow/tasks.';
