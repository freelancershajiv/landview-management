create table if not exists public.todo_saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null check(length(owner_key) between 3 and 200),
  name text not null check(length(trim(name)) between 1 and 80),
  filters jsonb not null default '{}'::jsonb check(jsonb_typeof(filters)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_key,name)
);
create index if not exists todo_saved_views_owner_recent on public.todo_saved_views(owner_key,updated_at desc);
alter table public.todo_saved_views enable row level security;
revoke all on table public.todo_saved_views from anon,authenticated;
grant select,insert,update,delete on public.todo_saved_views to service_role;
