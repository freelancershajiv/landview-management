create or replace function public.billing_v2_canonical_service_name(p_service text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_raw text := trim(coalesce(p_service, ''));
  v_norm text := lower(trim(coalesce(p_service, '')));
begin
  v_norm := regexp_replace(v_norm, '[–—_/]+', ' ', 'g');
  v_norm := regexp_replace(v_norm, '\s+', ' ', 'g');
  if v_norm in ('municipality approval','municipal approval','municipality file pass','file pass','plan pass')
     or v_norm like '%municipality file pass%' then
    return 'Municipality Approval Contract';
  end if;
  if v_norm like '%site visit%soil test%' then
    return 'Soil Test';
  end if;
  return v_raw;
end;
$$;

create or replace function public.billing_v2_normalize_contract_service()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.service_name := billing_v2_canonical_service_name(new.service_name);
  new.service_key := billing_v2_service_key(new.service_name);
  if new.service_name = 'Municipality Approval Contract' then
    new.workflow_type := 'municipality';
  elsif lower(coalesce(new.billing_category,'')) like '%engineering%' then
    new.workflow_type := 'engineering';
  elsif new.service_name = 'Site Supervision' then
    new.workflow_type := 'other';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_billing_v2_normalize_contract_service on public.project_contract_services;
create trigger trg_billing_v2_normalize_contract_service
before insert or update of service_name, service_key, billing_category, workflow_type
on public.project_contract_services
for each row execute function public.billing_v2_normalize_contract_service();

create or replace function public.billing_v2_normalize_milestone_service()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_service project_contract_services%rowtype;
begin
  select * into v_service from project_contract_services where id = new.contract_service_id limit 1;
  if v_service.id is not null then
    new.service_name := v_service.service_name;
    new.service_key := v_service.service_key;
    new.billing_category := v_service.billing_category;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_billing_v2_normalize_milestone_service on public.billing_milestones;
create trigger trg_billing_v2_normalize_milestone_service
before insert or update of contract_service_id, service_name, service_key, billing_category
on public.billing_milestones
for each row execute function public.billing_v2_normalize_milestone_service();

revoke all on function public.billing_v2_canonical_service_name(text) from public, anon, authenticated;
revoke all on function public.billing_v2_normalize_contract_service() from public, anon, authenticated;
revoke all on function public.billing_v2_normalize_milestone_service() from public, anon, authenticated;
grant execute on function public.billing_v2_canonical_service_name(text) to service_role;
grant execute on function public.billing_v2_normalize_contract_service() to service_role;
grant execute on function public.billing_v2_normalize_milestone_service() to service_role;
