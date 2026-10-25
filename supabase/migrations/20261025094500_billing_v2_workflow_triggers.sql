create or replace function public.billing_v2_service_key(p_service text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '-' from regexp_replace(
    regexp_replace(lower(coalesce(p_service, '')), '\s*&\s*', '-and-', 'g'),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

create or replace function public.billing_v2_capture_proposal_bill()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_project projects%rowtype;
  v_contract_id uuid;
  v_service_id uuid;
  v_service_name text;
  v_service_key text;
  v_workflow_type text;
  v_item proposal_items%rowtype;
  v_net numeric(14,2);
  v_gross numeric(14,2);
  v_discount numeric(14,2);
  v_now timestamptz := now();
  v_shares numeric[];
  v_names text[];
  v_triggers text[];
  v_i integer;
  v_gross_part numeric(14,2);
  v_discount_part numeric(14,2);
  v_net_part numeric(14,2);
  v_gross_used numeric(14,2) := 0;
  v_discount_used numeric(14,2) := 0;
  v_net_used numeric(14,2) := 0;
begin
  if coalesce(new.created_via, '') <> 'Proposal Auto Conversion' then
    return new;
  end if;

  select * into v_project from projects where id = new.project_id limit 1;
  if v_project.id is null then return new; end if;

  if new.legacy_source_id is not null then
    select * into v_item from proposal_items where item_code = new.legacy_source_id limit 1;
  end if;

  v_service_name := coalesce(nullif(trim(v_item.service), ''), trim(regexp_replace(regexp_replace(coalesce(new.description,''), '^\[[^]]+\]\s*', ''), '\s+—.*$', '')));
  if v_service_name = '' then v_service_name := 'Service'; end if;
  v_service_key := billing_v2_service_key(v_service_name);
  v_gross := greatest(0, coalesce(new.amount, 0));
  v_discount := least(v_gross, greatest(0, coalesce(new.discount, 0)));
  v_net := greatest(0, coalesce(new.net_amount, v_gross - v_discount));

  insert into project_contracts(project_id, project_code, proposal_code, status, original_gross, contract_discount, contract_net, source, created_by, created_at, updated_at)
  values(v_project.id, v_project.project_code, v_project.reclassified_proposal_code, 'Active', 0, 0, 0, 'Billing 2.0 Proposal Contract', new.source_created_by, v_now, v_now)
  on conflict(project_id) do nothing;
  select id into v_contract_id from project_contracts where project_id = v_project.id limit 1;

  if lower(coalesce(new.billing_category, new.category, '')) like '%engineering%' then
    v_workflow_type := 'engineering';
  elsif lower(v_service_name) like '%municipality%approval%' or lower(v_service_name) like '%municipality%file%pass%' then
    v_workflow_type := 'municipality';
  else
    v_workflow_type := 'other';
  end if;

  insert into project_contract_services(
    contract_id, project_id, project_code, proposal_item_code, service_name, service_key,
    billing_category, workflow_type, contract_gross, contract_discount, contract_net,
    start_gate, release_gate, active, created_at, updated_at
  ) values(
    v_contract_id, v_project.id, v_project.project_code, new.legacy_source_id, v_service_name, v_service_key,
    coalesce(new.billing_category, new.category, 'Engineering Bill'), v_workflow_type, v_gross, v_discount, v_net,
    'Any Payment', 'No Overdue Invoice', true, v_now, v_now
  )
  on conflict(contract_id, service_key) do update set
    proposal_item_code = excluded.proposal_item_code,
    service_name = excluded.service_name,
    billing_category = excluded.billing_category,
    workflow_type = excluded.workflow_type,
    contract_gross = excluded.contract_gross,
    contract_discount = excluded.contract_discount,
    contract_net = excluded.contract_net,
    updated_at = excluded.updated_at
  returning id into v_service_id;

  if coalesce(new.billing_category, new.category, '') = 'Supervision Bill' then
    v_shares := array[0.5, 0.5];
    v_names := array['Supervision Mobilization', 'Supervision Completion'];
    v_triggers := array['Contract Accepted', 'Delivered'];
  elsif v_workflow_type = 'municipality' then
    v_shares := array[0.5, 0.25, 0.25];
    v_names := array['Advance', 'File Submission', 'Final Delivery'];
    v_triggers := array['Contract Accepted', 'File Submitted', 'Delivered to Client'];
  elsif v_workflow_type = 'engineering' then
    v_shares := array[0.25, 0.25, 0.25, 0.25];
    v_names := array['Advance', 'Design Ready', 'Design Sent', 'Final Delivery'];
    v_triggers := array['Contract Accepted', 'Ready', 'Sent', 'Delivered'];
  else
    v_shares := array[0.5, 0.25, 0.25];
    v_names := array['Advance', 'Report Ready', 'Final Delivery'];
    v_triggers := array['Contract Accepted', 'Report Ready', 'Delivered'];
  end if;

  for v_i in 1..array_length(v_shares, 1) loop
    if v_i = array_length(v_shares, 1) then
      v_gross_part := round((v_gross - v_gross_used)::numeric, 2);
      v_discount_part := round((v_discount - v_discount_used)::numeric, 2);
      v_net_part := round((v_net - v_net_used)::numeric, 2);
    else
      v_gross_part := round((v_gross * v_shares[v_i])::numeric, 2);
      v_discount_part := round((v_discount * v_shares[v_i])::numeric, 2);
      v_net_part := round((v_net * v_shares[v_i])::numeric, 2);
      v_gross_used := v_gross_used + v_gross_part;
      v_discount_used := v_discount_used + v_discount_part;
      v_net_used := v_net_used + v_net_part;
    end if;

    insert into billing_milestones(
      contract_service_id, contract_id, project_id, project_code, service_name, service_key,
      billing_category, sequence_no, milestone_name, trigger_status, percentage,
      gross_amount, discount_amount, net_amount, status, ready_at, ready_by,
      source, idempotency_key, created_at, updated_at
    ) values(
      v_service_id, v_contract_id, v_project.id, v_project.project_code, v_service_name, v_service_key,
      coalesce(new.billing_category, new.category, 'Engineering Bill'), v_i, v_names[v_i], v_triggers[v_i], v_shares[v_i],
      v_gross_part, v_discount_part, v_net_part,
      case when v_triggers[v_i] = 'Contract Accepted' then 'ready_to_bill' else 'scheduled' end,
      case when v_triggers[v_i] = 'Contract Accepted' then v_now else null end,
      case when v_triggers[v_i] = 'Contract Accepted' then new.source_created_by else null end,
      'Billing 2.0 Proposal Contract',
      'milestone:' || v_project.project_code || ':' || v_service_key || ':' || v_i::text,
      v_now, v_now
    )
    on conflict(contract_service_id, sequence_no) do update set
      milestone_name = excluded.milestone_name,
      trigger_status = excluded.trigger_status,
      percentage = excluded.percentage,
      gross_amount = excluded.gross_amount,
      discount_amount = excluded.discount_amount,
      net_amount = excluded.net_amount,
      updated_at = excluded.updated_at;
  end loop;

  update project_contracts pc set
    original_gross = totals.gross,
    contract_discount = totals.discount,
    contract_net = totals.net,
    updated_at = v_now
  from (
    select contract_id, coalesce(sum(contract_gross),0) as gross, coalesce(sum(contract_discount),0) as discount, coalesce(sum(contract_net),0) as net
    from project_contract_services where contract_id = v_contract_id group by contract_id
  ) totals
  where pc.id = totals.contract_id;

  insert into billing_events(project_id, project_code, contract_id, contract_service_id, event_type, event_key, service_name, amount, actor, details, created_at)
  values(v_project.id, v_project.project_code, v_contract_id, v_service_id, 'contract_service_created', 'contract-service:' || v_service_id::text, v_service_name, v_net, new.source_created_by, jsonb_build_object('proposalCode', v_project.reclassified_proposal_code), v_now)
  on conflict(event_key) do nothing;

  return null;
end;
$$;

drop trigger if exists trg_billing_v2_capture_proposal_bill on public.bills;
create trigger trg_billing_v2_capture_proposal_bill before insert on public.bills for each row execute function public.billing_v2_capture_proposal_bill();

create or replace function public.billing_v2_normalize_milestone_bill()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.created_via, '') = 'Billing 2.0 Milestone' then
    new.description := regexp_replace(coalesce(new.description,''), '\s+—\s+.*$', '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_billing_v2_normalize_milestone_bill on public.bills;
create trigger trg_billing_v2_normalize_milestone_bill before insert on public.bills for each row execute function public.billing_v2_normalize_milestone_bill();

create or replace function public.billing_v2_unlock_from_workflow()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_service project_contract_services%rowtype;
  v_statuses text[];
  v_current_rank integer;
  v_trigger_rank integer;
  v_milestone billing_milestones%rowtype;
  v_now timestamptz := now();
begin
  if new.status is not distinct from old.status then return new; end if;

  select * into v_service from project_contract_services
  where project_id = new.project_id and service_key = new.service_key and active = true limit 1;
  if v_service.id is null then return new; end if;

  if new.workflow_type = 'municipality' then
    v_statuses := array['Payment Received','Working','Bank Draft OK','File Submitted','Meeting Approved','File Received','Delivered to Client'];
  elsif new.workflow_type = 'engineering' then
    v_statuses := array['Working','Ready','Sent','Approved','Ready to Print','Printed','Delivered'];
  else
    v_statuses := array['Working','Report Ready','Delivered'];
  end if;

  v_current_rank := array_position(v_statuses, new.status);
  if v_current_rank is null then return new; end if;

  for v_milestone in select * from billing_milestones where contract_service_id = v_service.id and status = 'scheduled' order by sequence_no loop
    v_trigger_rank := array_position(v_statuses, v_milestone.trigger_status);
    if v_trigger_rank is not null and v_trigger_rank <= v_current_rank then
      update billing_milestones set status = 'ready_to_bill', ready_at = v_now, ready_by = new.updated_by, updated_at = v_now where id = v_milestone.id;
      insert into billing_events(project_id, project_code, contract_id, contract_service_id, milestone_id, event_type, event_key, service_name, workflow_status, amount, actor, details, created_at)
      values(new.project_id, new.project_code, v_service.contract_id, v_service.id, v_milestone.id, 'milestone_ready', 'milestone-ready:' || v_milestone.id::text, new.service_name, new.status, v_milestone.net_amount, new.updated_by, jsonb_build_object('milestone', v_milestone.milestone_name, 'trigger', v_milestone.trigger_status), v_now)
      on conflict(event_key) do nothing;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_billing_v2_unlock_from_workflow on public.project_service_workflows;
create trigger trg_billing_v2_unlock_from_workflow after update of status on public.project_service_workflows for each row execute function public.billing_v2_unlock_from_workflow();

revoke all on function public.billing_v2_service_key(text) from public, anon, authenticated;
revoke all on function public.billing_v2_capture_proposal_bill() from public, anon, authenticated;
revoke all on function public.billing_v2_normalize_milestone_bill() from public, anon, authenticated;
revoke all on function public.billing_v2_unlock_from_workflow() from public, anon, authenticated;
grant execute on function public.billing_v2_service_key(text) to service_role;
grant execute on function public.billing_v2_capture_proposal_bill() to service_role;
grant execute on function public.billing_v2_normalize_milestone_bill() to service_role;
grant execute on function public.billing_v2_unlock_from_workflow() to service_role;
