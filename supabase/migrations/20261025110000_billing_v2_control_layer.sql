-- Billing 2.0 control layer: monthly supervision + adjustment documents.
-- Applied to production on 2026-10-25. This migration assumes the Billing 2.0
-- contract, service, milestone and event tables already exist.

alter table public.project_contract_services
  add column if not exists billing_model text not null default 'fixed',
  add column if not exists start_gate_value numeric(14,2) not null default 0,
  add column if not exists release_gate_value numeric(14,2) not null default 0;

do $$ begin
  alter table public.project_contract_services add constraint project_contract_services_billing_model_check
    check (billing_model in ('fixed','monthly','event'));
exception when duplicate_object then null; end $$;

create table if not exists public.billing_adjustments (
  id uuid primary key default gen_random_uuid(),
  adjustment_code text not null unique,
  project_id uuid not null references public.projects(id) on delete restrict,
  project_code text not null,
  bill_id uuid not null references public.bills(id) on delete restrict,
  bill_code text not null,
  mirror_bill_id uuid references public.bills(id) on delete restrict,
  mirror_bill_code text,
  contract_id uuid references public.project_contracts(id) on delete set null,
  contract_service_id uuid references public.project_contract_services(id) on delete set null,
  service_name text not null,
  service_key text not null,
  billing_category text not null,
  adjustment_type text not null check (adjustment_type in ('Credit Note','Debit Note')),
  amount numeric(14,2) not null check (amount > 0),
  reason text not null,
  notes text,
  status text not null default 'Posted' check (status in ('Posted','Void')),
  posted_by text,
  posted_at timestamptz not null default now(),
  voided_by text,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_adjustments_project_idx on public.billing_adjustments(project_id, posted_at desc);
create index if not exists billing_adjustments_bill_idx on public.billing_adjustments(bill_id, posted_at desc);
create index if not exists billing_adjustments_service_idx on public.billing_adjustments(contract_service_id, posted_at desc);
create index if not exists billing_adjustments_mirror_bill_idx on public.billing_adjustments(mirror_bill_id);
create index if not exists billing_adjustments_contract_idx on public.billing_adjustments(contract_id);

alter table public.billing_adjustments enable row level security;
revoke all on table public.billing_adjustments from anon, authenticated;
grant all on table public.billing_adjustments to service_role;

create table if not exists public.supervision_billing_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_code text not null,
  contract_id uuid not null references public.project_contracts(id) on delete cascade,
  contract_service_id uuid not null references public.project_contract_services(id) on delete cascade,
  service_name text not null default 'Site Supervision',
  service_key text not null default 'site-supervision',
  monthly_amount numeric(14,2) not null check (monthly_amount > 0),
  billing_day integer not null default 1 check (billing_day between 1 and 28),
  start_date date not null,
  end_date date,
  next_run_date date not null,
  status text not null default 'Active' check (status in ('Active','Paused','Stopped')),
  auto_issue boolean not null default false,
  description_template text not null default 'Monthly Supervision — {MONTH} {YEAR}',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, contract_service_id)
);

create index if not exists supervision_billing_rules_due_idx on public.supervision_billing_rules(status, next_run_date);
create index if not exists supervision_billing_rules_contract_idx on public.supervision_billing_rules(contract_id);
create index if not exists supervision_billing_rules_service_idx on public.supervision_billing_rules(contract_service_id);
alter table public.supervision_billing_rules enable row level security;
revoke all on table public.supervision_billing_rules from anon, authenticated;
grant all on table public.supervision_billing_rules to service_role;

create or replace function public.billing_v2_generate_monthly_supervision(p_as_of date default current_date)
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  r public.supervision_billing_rules%rowtype;
  v_period date;
  v_sequence integer;
  v_name text;
  v_milestone_id uuid;
  v_created integer := 0;
  v_next date;
begin
  for r in
    select * from public.supervision_billing_rules
    where status = 'Active' and next_run_date <= p_as_of
      and (end_date is null or next_run_date <= end_date)
    order by next_run_date, project_code
  loop
    v_period := r.next_run_date;
    while v_period <= p_as_of and (r.end_date is null or v_period <= r.end_date) loop
      v_sequence := 100000 + extract(year from v_period)::int * 100 + extract(month from v_period)::int;
      v_name := replace(replace(r.description_template, '{MONTH}', trim(to_char(v_period, 'Month'))), '{YEAR}', to_char(v_period, 'YYYY'));
      insert into public.billing_milestones(
        contract_service_id,contract_id,project_id,project_code,service_name,service_key,billing_category,
        sequence_no,milestone_name,trigger_status,percentage,gross_amount,discount_amount,net_amount,
        status,ready_at,ready_by,source,idempotency_key,created_at,updated_at
      ) values (
        r.contract_service_id,r.contract_id,r.project_id,r.project_code,r.service_name,r.service_key,'Supervision Bill',
        v_sequence,v_name,'Monthly Cycle',0,r.monthly_amount,0,r.monthly_amount,
        'ready_to_bill',now(),'Billing Scheduler','Billing 2.0 Monthly Supervision',
        'monthly:'||r.id::text||':'||to_char(v_period,'YYYY-MM'),now(),now()
      ) on conflict(contract_service_id,sequence_no) do nothing returning id into v_milestone_id;
      if v_milestone_id is not null then
        v_created := v_created + 1;
        insert into public.billing_events(
          project_id,project_code,contract_id,contract_service_id,milestone_id,event_type,event_key,
          service_name,workflow_status,amount,actor,details,created_at
        ) values (
          r.project_id,r.project_code,r.contract_id,r.contract_service_id,v_milestone_id,'milestone_ready',
          'monthly-ready:'||r.id::text||':'||to_char(v_period,'YYYY-MM'),r.service_name,'Monthly Cycle',
          r.monthly_amount,'Billing Scheduler',jsonb_build_object('period',to_char(v_period,'YYYY-MM'),'ruleId',r.id,'recurring',true),now()
        ) on conflict(event_key) do nothing;
      end if;
      v_period := (date_trunc('month',v_period + interval '1 month') + (r.billing_day - 1) * interval '1 day')::date;
    end loop;
    v_next := v_period;
    update public.supervision_billing_rules
      set next_run_date=v_next,
          status=case when end_date is not null and v_next > end_date then 'Stopped' else status end,
          updated_at=now()
    where id=r.id;
  end loop;
  return v_created;
end;
$$;

revoke all on function public.billing_v2_generate_monthly_supervision(date) from public,anon,authenticated;
grant execute on function public.billing_v2_generate_monthly_supervision(date) to service_role;

-- Final billing becomes billable before client delivery so delivery gates cannot be circular.
update public.billing_milestones m
set trigger_status=case
  when s.workflow_type='engineering' and m.milestone_name='Final Delivery' then 'Printed'
  when s.workflow_type='municipality' and m.milestone_name='Final Delivery' then 'File Received'
  when s.workflow_type='other' and m.milestone_name='Final Delivery' then 'Report Ready'
  else m.trigger_status end,
  updated_at=now()
from public.project_contract_services s
where s.id=m.contract_service_id and m.status='scheduled' and m.milestone_name='Final Delivery';

-- Monthly automation only creates Ready-to-Bill milestones; Accounts still issues the bill.
do $$
declare v_job bigint;
begin
  for v_job in select jobid from cron.job where command like '%billing_v2_generate_monthly_supervision%' loop
    perform cron.unschedule(v_job);
  end loop;
  perform cron.schedule('billing-v2-monthly-supervision','10 2 * * *','select public.billing_v2_generate_monthly_supervision(current_date);');
end $$;
