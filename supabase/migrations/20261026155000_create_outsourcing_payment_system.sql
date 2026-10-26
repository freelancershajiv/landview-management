create table if not exists public.outsourcing_parties (
  id uuid primary key default gen_random_uuid(),
  party_code text not null unique,
  name text not null,
  party_type text not null default 'Individual' check (party_type in ('Individual','Firm')),
  phone text,
  email text,
  expertise text,
  preferred_payment_method text,
  notes text,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outsourcing_jobs (
  id uuid primary key default gen_random_uuid(),
  job_code text not null unique,
  project_id uuid references public.projects(id) on delete restrict,
  party_id uuid not null references public.outsourcing_parties(id) on delete restrict,
  service_type text not null,
  scope_description text,
  assigned_date date not null default current_date,
  target_date date,
  completed_date date,
  agreed_amount numeric(14,2) not null default 0 check (agreed_amount >= 0),
  status text not null default 'Assigned' check (status in ('Assigned','In Progress','Submitted','Completed','Cancelled')),
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finance_scope text not null default 'main' check (finance_scope in ('main','municipality_file_pass'))
);

create table if not exists public.outsourcing_payments (
  id uuid primary key default gen_random_uuid(),
  payment_code text not null unique,
  job_id uuid not null references public.outsourcing_jobs(id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text,
  reference_no text,
  notes text,
  status text not null default 'POSTED' check (status in ('POSTED','VOID')),
  expense_id uuid unique references public.expenses(id) on delete restrict,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outsourcing_jobs_project_idx on public.outsourcing_jobs(project_id);
create index if not exists outsourcing_jobs_party_idx on public.outsourcing_jobs(party_id);
create index if not exists outsourcing_jobs_status_idx on public.outsourcing_jobs(status);
create index if not exists outsourcing_payments_job_idx on public.outsourcing_payments(job_id);
create index if not exists outsourcing_payments_date_idx on public.outsourcing_payments(payment_date);

alter table public.outsourcing_parties enable row level security;
alter table public.outsourcing_jobs enable row level security;
alter table public.outsourcing_payments enable row level security;

revoke all on table public.outsourcing_parties from anon, authenticated;
revoke all on table public.outsourcing_jobs from anon, authenticated;
revoke all on table public.outsourcing_payments from anon, authenticated;
grant select, insert, update, delete on table public.outsourcing_parties to service_role;
grant select, insert, update, delete on table public.outsourcing_jobs to service_role;
grant select, insert, update, delete on table public.outsourcing_payments to service_role;

create or replace function private.normalize_outsourcing_job_finance_scope()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_service text := lower(trim(coalesce(new.service_type, '')));
begin
  if v_service ~ '(municipality|file[[:space:]-]*pass)' then
    new.finance_scope := 'municipality_file_pass';
  else
    new.finance_scope := 'main';
  end if;
  return new;
end;
$function$;

revoke all on function private.normalize_outsourcing_job_finance_scope() from public, anon, authenticated;

drop trigger if exists trg_normalize_outsourcing_job_finance_scope on public.outsourcing_jobs;
create trigger trg_normalize_outsourcing_job_finance_scope
before insert or update of service_type on public.outsourcing_jobs
for each row execute function private.normalize_outsourcing_job_finance_scope();

create or replace function private.sync_outsourcing_payment_expense()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_job public.outsourcing_jobs%rowtype;
  v_party public.outsourcing_parties%rowtype;
  v_project public.projects%rowtype;
  v_expense_id uuid;
  v_expense_code text;
  v_description text;
  v_status text;
  v_category text;
begin
  select * into v_job from public.outsourcing_jobs where id = new.job_id;
  if v_job.id is null then raise exception 'Outsourcing job not found.'; end if;

  select * into v_party from public.outsourcing_parties where id = v_job.party_id;
  if v_party.id is null then raise exception 'Outsourcing party not found.'; end if;

  if v_job.project_id is not null then
    select * into v_project from public.projects where id = v_job.project_id;
  end if;

  v_expense_code := 'EXP-OUT-' || regexp_replace(new.payment_code, '^OUTPAY-', '', 'i');
  v_description := trim(coalesce(v_job.service_type, 'Outsourcing') || ' outsourcing payment - ' || coalesce(v_party.name, 'Outsource Party'));
  v_status := case when new.status = 'VOID' then 'VOID' else 'POSTED' end;
  v_category := case when v_job.finance_scope = 'municipality_file_pass' then 'Municipality Fee' else 'Outsourcing Payment' end;

  if tg_op = 'INSERT' or new.expense_id is null then
    insert into public.expenses (
      expense_code, project_id, expense_date, file_id, project_name_snapshot,
      category, description, amount, approval_status, approved_by_code, approved_at,
      paid_to, payment_method, reference_no, notes, status, source_created_by,
      source_created_at, service_type, finance_scope
    ) values (
      v_expense_code, v_job.project_id, new.payment_date, v_project.project_code, v_project.project_name,
      v_category, v_description, new.amount, 'Approved', coalesce(new.created_by, 'LAND VIEW'), now(),
      v_party.name, new.payment_method, new.reference_no,
      trim(concat_ws(' · ', 'Outsource ' || v_job.job_code, nullif(new.notes,''))),
      v_status, coalesce(new.created_by, 'LAND VIEW'), now(), v_job.service_type, v_job.finance_scope
    )
    returning id into v_expense_id;
    new.expense_id := v_expense_id;
  else
    update public.expenses
    set project_id = v_job.project_id,
        expense_date = new.payment_date,
        file_id = v_project.project_code,
        project_name_snapshot = v_project.project_name,
        category = v_category,
        description = v_description,
        amount = new.amount,
        approval_status = 'Approved',
        paid_to = v_party.name,
        payment_method = new.payment_method,
        reference_no = new.reference_no,
        notes = trim(concat_ws(' · ', 'Outsource ' || v_job.job_code, nullif(new.notes,''))),
        status = v_status,
        source_created_by = coalesce(new.created_by, source_created_by, 'LAND VIEW'),
        service_type = v_job.service_type,
        finance_scope = v_job.finance_scope
    where id = new.expense_id;
  end if;

  return new;
end;
$function$;

revoke all on function private.sync_outsourcing_payment_expense() from public, anon, authenticated;

drop trigger if exists trg_outsourcing_payment_expense on public.outsourcing_payments;
create trigger trg_outsourcing_payment_expense
before insert or update on public.outsourcing_payments
for each row execute function private.sync_outsourcing_payment_expense();

drop trigger if exists outsourcing_parties_set_updated_at on public.outsourcing_parties;
create trigger outsourcing_parties_set_updated_at before update on public.outsourcing_parties for each row execute function public.set_updated_at();
drop trigger if exists outsourcing_jobs_set_updated_at on public.outsourcing_jobs;
create trigger outsourcing_jobs_set_updated_at before update on public.outsourcing_jobs for each row execute function public.set_updated_at();
drop trigger if exists outsourcing_payments_set_updated_at on public.outsourcing_payments;
create trigger outsourcing_payments_set_updated_at before update on public.outsourcing_payments for each row execute function public.set_updated_at();

drop trigger if exists trg_audit_outsourcing_parties on public.outsourcing_parties;
create trigger trg_audit_outsourcing_parties after insert or update or delete on public.outsourcing_parties for each row execute function public.capture_business_audit();
drop trigger if exists trg_audit_outsourcing_jobs on public.outsourcing_jobs;
create trigger trg_audit_outsourcing_jobs after insert or update or delete on public.outsourcing_jobs for each row execute function public.capture_business_audit();
drop trigger if exists trg_audit_outsourcing_payments on public.outsourcing_payments;
create trigger trg_audit_outsourcing_payments after insert or update or delete on public.outsourcing_payments for each row execute function public.capture_business_audit();
