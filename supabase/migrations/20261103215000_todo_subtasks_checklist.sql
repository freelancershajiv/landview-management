create table if not exists public.todo_subtasks (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.todo_items(id) on delete cascade,
  todo_code text not null,
  title text not null check (char_length(title) between 1 and 500),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_completed boolean not null default false,
  completed_at timestamptz,
  completed_by_user_key text,
  completed_by_employee_id uuid references public.employees(id) on delete set null,
  completed_by_name text,
  completed_by_role text,
  created_by_user_key text,
  created_by_name text,
  created_by_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists todo_subtasks_todo_code_sort_idx
  on public.todo_subtasks(todo_code, sort_order, created_at);

alter table public.todo_subtasks enable row level security;
revoke all on table public.todo_subtasks from anon, authenticated;
grant select, insert, update, delete on table public.todo_subtasks to service_role;
