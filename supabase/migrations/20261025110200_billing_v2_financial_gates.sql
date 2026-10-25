-- Billing 2.0 start and delivery financial gates with audited one-time overrides.

create table if not exists public.billing_gate_overrides (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_code text not null,
  contract_service_id uuid not null references public.project_contract_services(id) on delete cascade,
  service_name text not null,
  target_status text not null,
  reason text not null,
  approved_by text not null,
  status text not null default 'Pending' check (status in ('Pending','Consumed','Cancelled')),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists billing_gate_overrides_pending_idx on public.billing_gate_overrides(contract_service_id,status,expires_at);
create index if not exists billing_gate_overrides_project_idx on public.billing_gate_overrides(project_id);
alter table public.billing_gate_overrides enable row level security;
revoke all on table public.billing_gate_overrides from anon,authenticated;
grant all on table public.billing_gate_overrides to service_role;

create or replace function public.billing_v2_service_paid(p_project_id uuid,p_service_key text,p_billing_category text,p_service_name text)
returns numeric
language plpgsql
stable
set search_path to 'public'
as $$
declare v_paid numeric := 0;
begin
  if p_billing_category='Engineering Bill' then
    select coalesce(sum(a.allocated_amount),0) into v_paid
    from public.payment_service_allocations a
    join public.payments p on p.id=a.payment_id
    where a.project_id=p_project_id and a.service_key=p_service_key
      and coalesce(p.affects_business_balance,true)=true
      and lower(coalesce(p.transaction_type,''))<>'personal income'
      and lower(replace(replace(coalesce(p.approval_status,p.status,''),'_',' '),'-',' '))
        in ('','approved','pre approved','received','paid','verified','complete','completed','full paid','fully paid','posted');
  elsif p_billing_category='Supervision Bill' then
    select coalesce(sum(p.amount),0) into v_paid from public.payments p
    where p.project_id=p_project_id
      and lower(coalesce(p.payment_for,p.income_category,'')) like '%supervision%'
      and coalesce(p.affects_business_balance,true)=true
      and lower(coalesce(p.transaction_type,''))<>'personal income'
      and lower(replace(replace(coalesce(p.approval_status,p.status,''),'_',' '),'-',' '))
        in ('','approved','pre approved','received','paid','verified','complete','completed','full paid','fully paid','posted');
  else
    select coalesce(sum(p.amount),0) into v_paid from public.payments p
    where p.project_id=p_project_id
      and coalesce(p.affects_business_balance,true)=true
      and lower(coalesce(p.transaction_type,''))<>'personal income'
      and lower(replace(replace(coalesce(p.approval_status,p.status,''),'_',' '),'-',' '))
        in ('','approved','pre approved','received','paid','verified','complete','completed','full paid','fully paid','posted')
      and public.billing_v2_service_key(public.billing_v2_canonical_service_name(coalesce(nullif(p.service_type,''),p.payment_for,p.income_category,'')))=p_service_key;
  end if;
  return greatest(0,coalesce(v_paid,0));
end;
$$;

create or replace function public.billing_v2_service_billed(p_project_id uuid,p_service_key text,p_billing_category text)
returns numeric
language plpgsql
stable
set search_path to 'public'
as $$
declare v_billed numeric := 0;
begin
  select coalesce(sum(coalesce(b.amount,0)-coalesce(b.discount,0)),0) into v_billed
  from public.bills b
  where b.project_id=p_project_id
    and lower(coalesce(b.status,'')) not in ('void','voided','cancelled','canceled','rejected')
    and public.billing_v2_service_key(
      case when lower(coalesce(b.billing_category,b.category,'')) like '%supervision%' then 'Site Supervision'
           else public.billing_v2_legacy_service_name(b.description,coalesce(b.billing_category,b.category,'')) end
    )=p_service_key;
  return greatest(0,coalesce(v_billed,0));
end;
$$;

revoke all on function public.billing_v2_service_paid(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.billing_v2_service_billed(uuid,text,text) from public,anon,authenticated;
grant execute on function public.billing_v2_service_paid(uuid,text,text,text) to service_role;
grant execute on function public.billing_v2_service_billed(uuid,text,text) to service_role;

create or replace function public.billing_v2_enforce_delivery_gate()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  s public.project_contract_services%rowtype;
  v_override public.billing_gate_overrides%rowtype;
  v_billed numeric := 0;
  v_paid numeric := 0;
  v_required numeric := 0;
  v_allowed boolean := false;
  v_gate text;
  v_gate_value numeric := 0;
begin
  if new.status is not distinct from old.status then return new; end if;
  select * into s from public.project_contract_services
  where project_id=new.project_id and service_key=new.service_key and active=true limit 1;
  if s.id is null then return new; end if;

  -- Start gate when leaving Not Started.
  if coalesce(old.status,'Not Started')='Not Started' and coalesce(new.status,'Not Started')<>'Not Started'
     and coalesce(s.start_gate,'None')<>'None' then
    v_gate:=s.start_gate; v_gate_value:=coalesce(s.start_gate_value,0);
    v_paid:=public.billing_v2_service_paid(new.project_id,s.service_key,s.billing_category,s.service_name);
    if v_gate='Any Payment' then v_required:=0.01; v_allowed:=v_paid>0;
    elsif v_gate='Minimum Amount' then v_required:=greatest(0,v_gate_value); v_allowed:=v_paid+0.01>=v_required;
    elsif v_gate='Minimum Percent' then v_required:=greatest(0,coalesce(s.contract_net,0))*greatest(0,v_gate_value)/100.0; v_allowed:=v_paid+0.01>=v_required;
    elsif v_gate='Fully Paid' then v_required:=greatest(0,coalesce(s.contract_net,0)); v_allowed:=v_paid+0.01>=v_required;
    else v_allowed:=true; end if;
    if not v_allowed then
      raise exception 'Financial start gate blocked %: paid BDT %, required BDT % under rule %.',s.service_name,round(v_paid,2),round(v_required,2),v_gate;
    end if;
  end if;

  -- Delivery release gate.
  if new.status not in ('Delivered','Delivered to Client') or coalesce(s.release_gate,'None')='None' then return new; end if;
  select * into v_override from public.billing_gate_overrides
  where contract_service_id=s.id and target_status=new.status and status='Pending' and expires_at>now()
  order by created_at desc limit 1;
  if v_override.id is not null then
    update public.billing_gate_overrides set status='Consumed',consumed_at=now() where id=v_override.id;
    insert into public.billing_events(project_id,project_code,contract_id,contract_service_id,event_type,event_key,service_name,workflow_status,amount,actor,details,created_at)
    values(new.project_id,new.project_code,s.contract_id,s.id,'delivery_gate_override','delivery-gate-override:'||v_override.id::text,
           s.service_name,new.status,0,v_override.approved_by,jsonb_build_object('reason',v_override.reason,'gate',s.release_gate),now())
    on conflict(event_key) do nothing;
    return new;
  end if;

  v_billed:=public.billing_v2_service_billed(new.project_id,s.service_key,s.billing_category);
  v_paid:=public.billing_v2_service_paid(new.project_id,s.service_key,s.billing_category,s.service_name);
  v_gate:=s.release_gate; v_gate_value:=coalesce(s.release_gate_value,0);
  if v_gate in ('No Overdue Invoice','Fully Paid') then v_required:=v_billed; v_allowed:=v_paid+0.01>=v_required;
  elsif v_gate='Minimum Amount' then v_required:=greatest(0,v_gate_value); v_allowed:=v_paid+0.01>=v_required;
  elsif v_gate='Minimum Percent' then v_required:=greatest(0,coalesce(s.contract_net,0))*greatest(0,v_gate_value)/100.0; v_allowed:=v_paid+0.01>=v_required;
  else v_allowed:=true; end if;
  if not v_allowed then
    raise exception 'Financial delivery gate blocked %: paid BDT %, required BDT % under rule %. Use Billing Controls for an approved one-time override if necessary.',
      s.service_name,round(v_paid,2),round(v_required,2),v_gate;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_billing_v2_delivery_gate on public.project_service_workflows;
create trigger trg_billing_v2_delivery_gate
before update of status on public.project_service_workflows
for each row execute function public.billing_v2_enforce_delivery_gate();
