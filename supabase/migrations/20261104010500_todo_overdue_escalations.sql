create table if not exists public.todo_escalations (
 id uuid primary key default gen_random_uuid(),
 todo_id uuid not null references public.todo_items(id) on delete cascade,
 todo_code text not null,
 deadline_key text not null check (char_length(deadline_key) between 10 and 32),
 level smallint not null check (level in (1,2)),
 status text not null default 'open' check (status in ('open','acknowledged','resolved')),
 acknowledged_at timestamptz,
 acknowledged_by text,
 resolved_at timestamptz,
 resolution_reason text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(todo_id,deadline_key,level)
);
create index if not exists todo_escalations_active_idx on public.todo_escalations(status,level,created_at desc);
create index if not exists todo_escalations_todo_idx on public.todo_escalations(todo_id,created_at desc);
alter table public.todo_escalations enable row level security;
revoke all on table public.todo_escalations from anon,authenticated;
grant select,insert,update,delete on table public.todo_escalations to service_role;
