alter table public.project_contractor_contracts
  add column if not exists pricing_type text not null default 'rate',
  add column if not exists contract_amount numeric(16,2) not null default 0,
  add column if not exists scope_description text,
  add column if not exists start_date date,
  add column if not exists target_completion_date date;

alter table public.project_contractor_contracts
  drop constraint if exists project_contractor_contracts_pricing_type_check;
alter table public.project_contractor_contracts
  add constraint project_contractor_contracts_pricing_type_check
  check (pricing_type in ('rate','lump_sum'));

alter table public.project_management_ledger
  add column if not exists contractor_contract_id uuid;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname='project_management_ledger_contractor_contract_id_fkey'
      and conrelid='public.project_management_ledger'::regclass
  ) then
    alter table public.project_management_ledger
      add constraint project_management_ledger_contractor_contract_id_fkey
      foreign key (contractor_contract_id)
      references public.project_contractor_contracts(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.project_contractor_progress_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  contract_id uuid not null references public.project_contractor_contracts(id) on delete cascade,
  progress_date date not null default current_date,
  progress_percent numeric(6,2) not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  completed_quantity numeric(16,3) not null default 0 check (completed_quantity >= 0),
  stage_name text,
  floor_label text,
  description text not null,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_management_ledger_contractor_contract_id_idx
  on public.project_management_ledger(contractor_contract_id);
create index if not exists project_contractor_progress_project_idx
  on public.project_contractor_progress_updates(project_id, progress_date desc);
create index if not exists project_contractor_progress_contract_idx
  on public.project_contractor_progress_updates(contract_id, progress_date desc, created_at desc);

create or replace function public.normalize_project_contractor_party(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(regexp_replace(
    regexp_replace(lower(coalesce(value,'')), '\m(contactor|contractor)\M', ' ', 'g'),
    '\s+', ' ', 'g'
  ));
$$;

with candidate as (
  select l.id as ledger_id, min(c.id::text)::uuid as contract_id, count(*) as candidate_count
  from public.project_management_ledger l
  join public.project_contractor_contracts c
    on c.project_id=l.project_id
   and lower(coalesce(c.party_type,'Contractor'))='contractor'
   and c.active=true
   and public.normalize_project_contractor_party(coalesce(l.paid_to,l.supplier,'')) = public.normalize_project_contractor_party(c.contractor_name)
  where l.contractor_contract_id is null
    and coalesce(l.credit,0)>0
    and public.normalize_project_contractor_party(coalesce(l.paid_to,l.supplier,'')) <> ''
  group by l.id
)
update public.project_management_ledger l
set contractor_contract_id=candidate.contract_id
from candidate
where l.id=candidate.ledger_id and candidate.candidate_count=1;

with candidate as (
  select l.id as ledger_id, min(c.id::text)::uuid as contract_id, count(*) as candidate_count
  from public.project_management_ledger l
  join public.project_contractor_contracts c
    on c.project_id=l.project_id
   and lower(coalesce(c.party_type,'Contractor'))='contractor'
   and c.active=true
   and public.normalize_project_contractor_party(coalesce(l.paid_to,l.supplier,'')) = public.normalize_project_contractor_party(c.contractor_name)
   and lower(trim(coalesce(l.category,''))) = lower(trim(coalesce(c.category,'')))
  where l.contractor_contract_id is null
    and coalesce(l.credit,0)>0
    and public.normalize_project_contractor_party(coalesce(l.paid_to,l.supplier,'')) <> ''
  group by l.id
)
update public.project_management_ledger l
set contractor_contract_id=candidate.contract_id
from candidate
where l.id=candidate.ledger_id and candidate.candidate_count=1;

create or replace function public.assign_project_contractor_contract_id()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_party text;
  v_match uuid;
  v_count integer;
begin
  if new.contractor_contract_id is not null then return new; end if;
  if coalesce(new.credit,0) <= 0 then return new; end if;
  v_party := public.normalize_project_contractor_party(coalesce(new.paid_to,new.supplier,''));
  if v_party='' then return new; end if;

  select min(c.id::text)::uuid, count(*) into v_match, v_count
  from public.project_contractor_contracts c
  where c.project_id=new.project_id
    and lower(coalesce(c.party_type,'Contractor'))='contractor'
    and c.active=true
    and public.normalize_project_contractor_party(c.contractor_name)=v_party;
  if v_count=1 then new.contractor_contract_id:=v_match; return new; end if;

  select min(c.id::text)::uuid, count(*) into v_match, v_count
  from public.project_contractor_contracts c
  where c.project_id=new.project_id
    and lower(coalesce(c.party_type,'Contractor'))='contractor'
    and c.active=true
    and public.normalize_project_contractor_party(c.contractor_name)=v_party
    and lower(trim(coalesce(c.category,'')))=lower(trim(coalesce(new.category,'')));
  if v_count=1 then new.contractor_contract_id:=v_match; end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_project_contractor_contract_id on public.project_management_ledger;
create trigger trg_assign_project_contractor_contract_id
before insert or update of project_id,paid_to,supplier,category,credit,contractor_contract_id
on public.project_management_ledger
for each row execute function public.assign_project_contractor_contract_id();