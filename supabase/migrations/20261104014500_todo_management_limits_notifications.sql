create table if not exists public.todo_management_settings (
  settings_key text primary key default 'management' check (settings_key='management'),
  max_open_tasks integer not null default 8 check(max_open_tasks between 1 and 100),
  max_workload_points numeric(8,1) not null default 15 check(max_workload_points between 1 and 500),
  whatsapp_critical_enabled boolean not null default false,
  whatsapp_recipient_employee_id uuid references public.employees(id) on delete set null,
  whatsapp_enabled_at timestamptz,
  updated_at timestamptz not null default now(),
  check (not whatsapp_critical_enabled or (whatsapp_recipient_employee_id is not null and whatsapp_enabled_at is not null))
);
insert into public.todo_management_settings (settings_key) values ('management')
on conflict (settings_key) do nothing;
create table if not exists public.todo_management_alerts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  status text not null default 'unread' check (status in ('unread','acknowledged','resolved')),
  open_count integer not null,
  workload_points numeric(8,1) not null,
  max_open_tasks integer not null,
  max_workload_points numeric(8,1) not null,
  acknowledged_at timestamptz,
  acknowledged_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists todo_management_alerts_active_one_per_employee
  on public.todo_management_alerts(employee_id) where status in ('unread','acknowledged');
create index if not exists todo_management_alerts_recent
  on public.todo_management_alerts(created_at desc);
alter table public.todo_management_settings enable row level security;
alter table public.todo_management_alerts enable row level security;
revoke all on public.todo_management_settings from anon, authenticated;
revoke all on public.todo_management_alerts from anon, authenticated;
grant select,insert,update,delete on public.todo_management_settings to service_role;
grant select,insert,update,delete on public.todo_management_alerts to service_role;
