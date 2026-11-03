create table if not exists public.todo_templates (
  id uuid primary key default gen_random_uuid(),
  template_code text not null unique,
  name text not null check (char_length(name) between 1 and 180),
  title text not null check (char_length(title) between 1 and 500),
  description text,
  priority text not null default 'Normal' check (priority in ('Low','Normal','High','Urgent')),
  reference_type text not null default 'None' check (reference_type in ('None','Project','Proposal')),
  project_code text,
  proposal_code text,
  workflow_id uuid references public.project_service_workflows(id) on delete set null,
  assigned_employee_id uuid references public.employees(id) on delete set null,
  assigned_to text,
  due_time time,
  reminder_enabled boolean not null default false,
  reminder_minutes_before integer check (reminder_minutes_before is null or (reminder_minutes_before >= 0 and reminder_minutes_before <= 10080)),
  recurrence_enabled boolean not null default false,
  recurrence_type text not null default 'None' check (recurrence_type in ('None','Daily','Weekly','Monthly')),
  recurrence_interval integer not null default 1 check (recurrence_interval between 1 and 365),
  recurrence_weekday smallint check (recurrence_weekday is null or recurrence_weekday between 0 and 6),
  recurrence_day_of_month smallint check (recurrence_day_of_month is null or recurrence_day_of_month between 1 and 28),
  start_date date,
  end_date date,
  next_run_date date,
  is_active boolean not null default true,
  last_run_at timestamptz,
  last_error text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (not recurrence_enabled or (recurrence_type <> 'None' and start_date is not null)),
  check (not reminder_enabled or (due_time is not null and assigned_employee_id is not null)),
  check (
    (reference_type = 'None' and project_code is null and proposal_code is null and workflow_id is null)
    or (reference_type = 'Project' and project_code is not null and proposal_code is null)
    or (reference_type = 'Proposal' and proposal_code is not null and project_code is null and workflow_id is null)
  )
);

create index if not exists todo_templates_recurrence_idx
  on public.todo_templates(is_active, recurrence_enabled, next_run_date)
  where recurrence_enabled = true;

create table if not exists public.todo_template_subtasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.todo_templates(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists todo_template_subtasks_order_idx
  on public.todo_template_subtasks(template_id, sort_order, created_at);

create table if not exists public.todo_template_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.todo_templates(id) on delete cascade,
  scheduled_date date not null,
  status text not null default 'processing' check (status in ('processing','generated','failed')),
  todo_id uuid references public.todo_items(id) on delete set null,
  todo_code text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id, scheduled_date)
);

create index if not exists todo_template_runs_recent_idx
  on public.todo_template_runs(template_id, scheduled_date desc);

alter table public.todo_templates enable row level security;
alter table public.todo_template_subtasks enable row level security;
alter table public.todo_template_runs enable row level security;

revoke all on table public.todo_templates from anon, authenticated;
revoke all on table public.todo_template_subtasks from anon, authenticated;
revoke all on table public.todo_template_runs from anon, authenticated;

grant select, insert, update, delete on table public.todo_templates to service_role;
grant select, insert, update, delete on table public.todo_template_subtasks to service_role;
grant select, insert, update, delete on table public.todo_template_runs to service_role;
