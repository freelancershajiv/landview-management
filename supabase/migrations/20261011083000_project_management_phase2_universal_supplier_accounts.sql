create or replace function public.normalize_supplier_key(value text)
returns text language sql immutable parallel safe set search_path = public
as $$ select lower(regexp_replace(trim(coalesce(value,'')), '\s+', ' ', 'g')); $$;

create table if not exists public.project_supplier_accounts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  supplier_name text not null,
  supplier_key text not null,
  primary_category text,
  billing_unit text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_supplier_accounts_project_supplier_key_uq unique(project_id, supplier_key)
);
alter table public.project_supplier_accounts enable row level security;
revoke all on table public.project_supplier_accounts from anon, authenticated;

alter table public.project_contractor_contracts
  add column if not exists supplier_account_id uuid references public.project_supplier_accounts(id) on delete set null;
alter table public.project_management_ledger
  add column if not exists supplier_account_id uuid references public.project_supplier_accounts(id) on delete set null,
  add column if not exists supplier_movement_type text;
alter table public.project_management_ledger drop constraint if exists project_management_ledger_supplier_movement_type_check;
alter table public.project_management_ledger add constraint project_management_ledger_supplier_movement_type_check
  check (supplier_movement_type is null or supplier_movement_type in ('advance_fund','advance_cash','delivery','direct_purchase','refund','adjustment'));

create index if not exists project_supplier_accounts_project_idx on public.project_supplier_accounts(project_id,active,supplier_name);
create index if not exists project_management_ledger_supplier_account_idx on public.project_management_ledger(project_id,supplier_account_id,entry_date);
create index if not exists project_management_ledger_supplier_movement_idx on public.project_management_ledger(project_id,supplier_movement_type,entry_date) where supplier_movement_type is not null;

insert into public.project_supplier_accounts(project_id,supplier_name,supplier_key,primary_category,billing_unit,active,created_at,updated_at)
select c.project_id,min(c.contractor_name),public.normalize_supplier_key(c.contractor_name),
       min(c.category) filter(where nullif(trim(c.category),'') is not null),
       min(c.billing_unit) filter(where nullif(trim(c.billing_unit),'') is not null),
       bool_or(c.active),min(c.created_at),max(c.updated_at)
from public.project_contractor_contracts c
where lower(trim(coalesce(c.party_type,'')))='supplier' and public.normalize_supplier_key(c.contractor_name)<>''
group by c.project_id,public.normalize_supplier_key(c.contractor_name)
on conflict(project_id,supplier_key) do update set
  supplier_name=excluded.supplier_name,
  primary_category=coalesce(excluded.primary_category,public.project_supplier_accounts.primary_category),
  billing_unit=coalesce(excluded.billing_unit,public.project_supplier_accounts.billing_unit),
  active=excluded.active,
  updated_at=greatest(public.project_supplier_accounts.updated_at,excluded.updated_at);

update public.project_contractor_contracts c set supplier_account_id=a.id
from public.project_supplier_accounts a
where lower(trim(coalesce(c.party_type,'')))='supplier' and c.project_id=a.project_id
  and public.normalize_supplier_key(c.contractor_name)=a.supplier_key and c.supplier_account_id is distinct from a.id;

update public.project_management_ledger l set supplier_account_id=a.id
from public.project_supplier_accounts a
where l.project_id=a.project_id
  and public.normalize_supplier_key(coalesce(nullif(l.paid_to,''),nullif(l.supplier,''),''))=a.supplier_key
  and l.supplier_account_id is null;

update public.project_management_ledger l
set supplier_movement_type=case
  when a.supplier_key=public.normalize_supplier_key('Sattapur Brick Field') and l.entry_date in(date '2025-11-20',date '2025-11-23') and l.credit>0 then 'direct_purchase'
  when l.debit>0 then 'advance_fund'
  when l.credit>0 then 'delivery'
  else 'adjustment' end
from public.project_supplier_accounts a
where l.supplier_account_id=a.id and l.supplier_movement_type is null;

create or replace function public.sync_supplier_account_from_contract()
returns trigger language plpgsql set search_path=public as $function$
declare v_key text; v_account_id uuid;
begin
  if lower(trim(coalesce(new.party_type,'')))<>'supplier' then new.supplier_account_id:=null; return new; end if;
  v_key:=public.normalize_supplier_key(new.contractor_name);
  if v_key='' then new.supplier_account_id:=null; return new; end if;
  insert into public.project_supplier_accounts(project_id,supplier_name,supplier_key,primary_category,billing_unit,active,updated_at)
  values(new.project_id,new.contractor_name,v_key,new.category,new.billing_unit,new.active,now())
  on conflict(project_id,supplier_key) do update set
    supplier_name=excluded.supplier_name,
    primary_category=coalesce(nullif(excluded.primary_category,''),public.project_supplier_accounts.primary_category),
    billing_unit=coalesce(nullif(excluded.billing_unit,''),public.project_supplier_accounts.billing_unit),
    active=excluded.active or public.project_supplier_accounts.active,
    updated_at=now()
  returning id into v_account_id;
  new.supplier_account_id:=v_account_id; return new;
end;$function$;
drop trigger if exists trg_sync_supplier_account_from_contract on public.project_contractor_contracts;
create trigger trg_sync_supplier_account_from_contract before insert or update of contractor_name,party_type,category,billing_unit,project_id,active on public.project_contractor_contracts for each row execute function public.sync_supplier_account_from_contract();

create or replace function public.link_supplier_account_to_project_ledger()
returns trigger language plpgsql set search_path=public as $function$
declare v_party text; v_account_id uuid;
begin
  v_party:=coalesce(nullif(trim(new.paid_to),''),nullif(trim(new.supplier),''),'');
  if new.supplier_account_id is null and v_party<>'' then
    select a.id into v_account_id from public.project_supplier_accounts a
    where a.project_id=new.project_id and a.supplier_key=public.normalize_supplier_key(v_party) limit 1;
    new.supplier_account_id:=v_account_id;
  end if;
  if new.supplier_account_id is not null and new.supplier_movement_type is null then
    if coalesce(new.debit,0)>0 then new.supplier_movement_type:='advance_fund';
    elsif coalesce(new.credit,0)>0 then new.supplier_movement_type:='direct_purchase'; end if;
  end if;
  return new;
end;$function$;
drop trigger if exists trg_link_supplier_account_to_project_ledger on public.project_management_ledger;
create trigger trg_link_supplier_account_to_project_ledger before insert or update of project_id,paid_to,supplier,debit,credit,supplier_account_id,supplier_movement_type on public.project_management_ledger for each row execute function public.link_supplier_account_to_project_ledger();

create or replace function public.audit_project_supplier_account()
returns trigger language plpgsql set search_path=public as $function$
declare v_row public.project_supplier_accounts; v_action text;
begin
  v_row:=case when tg_op='DELETE' then old else new end;
  v_action:=case when tg_op='INSERT' then 'project_supplier.create' when tg_op='UPDATE' then 'project_supplier.update' else 'project_supplier.delete' end;
  insert into public.app_audit_log(actor_user_key,action,target,outcome,details,actor_name,entity_type,entity_id,before_data,after_data,source)
  values('LAND VIEW',v_action,v_row.supplier_name,'success',jsonb_build_object('project_id',v_row.project_id,'supplier_name',v_row.supplier_name,'supplier_key',v_row.supplier_key),'LAND VIEW','project_supplier_accounts',v_row.id::text,case when tg_op in('UPDATE','DELETE') then to_jsonb(old) else null end,case when tg_op in('INSERT','UPDATE') then to_jsonb(new) else null end,'database_trigger');
  return case when tg_op='DELETE' then old else new end;
end;$function$;
drop trigger if exists trg_audit_project_supplier_account on public.project_supplier_accounts;
create trigger trg_audit_project_supplier_account after insert or update or delete on public.project_supplier_accounts for each row execute function public.audit_project_supplier_account();

revoke execute on function public.sync_supplier_account_from_contract() from public,anon,authenticated;
revoke execute on function public.link_supplier_account_to_project_ledger() from public,anon,authenticated;
revoke execute on function public.audit_project_supplier_account() from public,anon,authenticated;