create table if not exists public.todo_automation_rules (
  rule_key text primary key check (rule_key in ('project_created','service_activated','proposal_sent','site_issue','ready_to_print','invoice_overdue','document_followup')),
  label text not null,
  description text not null,
  enabled boolean not null default true,
  assigned_employee_id uuid references public.employees(id) on delete set null,
  due_days integer not null default 2 check (due_days between 0 and 90),
  active_since timestamptz not null default now(),
  last_run_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
create table if not exists public.todo_automation_events (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null references public.todo_automation_rules(rule_key) on delete restrict,
  event_key text not null check(char_length(event_key) between 1 and 250),
  source_table text not null,
  source_id text not null,
  event_at timestamptz not null,
  status text not null default 'processing' check (status in ('processing','generated','failed')),
  todo_code text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rule_key,event_key)
);
create index if not exists todo_automation_events_recent_idx on public.todo_automation_events(created_at desc);
alter table public.todo_automation_rules enable row level security;
alter table public.todo_automation_events enable row level security;
revoke all on table public.todo_automation_rules from anon, authenticated;
revoke all on table public.todo_automation_events from anon, authenticated;
grant select,insert,update,delete on table public.todo_automation_rules to service_role;
grant select,insert,update,delete on table public.todo_automation_events to service_role;
insert into public.todo_automation_rules(rule_key,label,description,due_days) values
 ('project_created','New project kickoff','Create initial design/kickoff checklist for newly registered projects.',2),
 ('service_activated','Service payment activation','When a service first becomes active after payment, open a linked design/service To Do.',2),
 ('proposal_sent','Proposal follow-up','When a proposal is sent, schedule a client follow-up To Do.',3),
 ('site_issue','Site visit corrective action','When a new site visit reports an explicit issue or action required, create a corrective To Do.',1),
 ('ready_to_print','Ready to Print','When a workflow service or drawing becomes Ready to Print, create a printing To Do.',1),
 ('invoice_overdue','Overdue payment follow-up','Create a payment follow-up when a newly issued invoice becomes overdue with an unpaid balance.',0),
 ('document_followup','Outstanding document follow-up','Follow up newly registered pending client documents or required drawing documents.',3)
on conflict (rule_key) do nothing;
