create table if not exists public.project_contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_code text not null,
  proposal_code text,
  status text not null default 'Active',
  original_gross numeric(14,2) not null default 0,
  contract_discount numeric(14,2) not null default 0,
  contract_net numeric(14,2) not null default 0,
  source text not null default 'Billing 2.0',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id),
  unique(project_code)
);

create table if not exists public.project_contract_services (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.project_contracts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_code text not null,
  proposal_item_code text,
  service_name text not null,
  service_key text not null,
  billing_category text not null,
  workflow_type text not null,
  contract_gross numeric(14,2) not null default 0,
  contract_discount numeric(14,2) not null default 0,
  contract_net numeric(14,2) not null default 0,
  start_gate text not null default 'Any Payment',
  release_gate text not null default 'No Overdue Invoice',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(contract_id, service_key)
);

create table if not exists public.billing_milestones (
  id uuid primary key default gen_random_uuid(),
  contract_service_id uuid not null references public.project_contract_services(id) on delete cascade,
  contract_id uuid not null references public.project_contracts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_code text not null,
  service_name text not null,
  service_key text not null,
  billing_category text not null,
  sequence_no integer not null,
  milestone_name text not null,
  trigger_status text not null,
  percentage numeric(7,4) not null default 0,
  gross_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  status text not null default 'scheduled',
  ready_at timestamptz,
  ready_by text,
  bill_id uuid references public.bills(id) on delete set null,
  bill_code text,
  issued_at timestamptz,
  issued_by text,
  source text not null default 'Billing 2.0',
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(contract_service_id, sequence_no),
  unique(idempotency_key)
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_code text not null,
  contract_id uuid references public.project_contracts(id) on delete cascade,
  contract_service_id uuid references public.project_contract_services(id) on delete cascade,
  milestone_id uuid references public.billing_milestones(id) on delete set null,
  event_type text not null,
  event_key text,
  service_name text,
  workflow_status text,
  amount numeric(14,2),
  actor text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(event_key)
);

create index if not exists project_contract_services_project_idx on public.project_contract_services(project_id, service_key);
create index if not exists billing_milestones_project_idx on public.billing_milestones(project_id, status, sequence_no);
create index if not exists billing_milestones_service_idx on public.billing_milestones(contract_service_id, status, sequence_no);
create index if not exists billing_events_project_idx on public.billing_events(project_id, created_at desc);

alter table public.project_contracts enable row level security;
alter table public.project_contract_services enable row level security;
alter table public.billing_milestones enable row level security;
alter table public.billing_events enable row level security;

revoke all on table public.project_contracts from anon, authenticated;
revoke all on table public.project_contract_services from anon, authenticated;
revoke all on table public.billing_milestones from anon, authenticated;
revoke all on table public.billing_events from anon, authenticated;

grant select, insert, update, delete on table public.project_contracts to service_role;
grant select, insert, update, delete on table public.project_contract_services to service_role;
grant select, insert, update, delete on table public.billing_milestones to service_role;
grant select, insert, update, delete on table public.billing_events to service_role;
