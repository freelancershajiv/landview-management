-- Keep proposal-created Billing 2.0 milestones compatible with financial delivery gates.
-- Final billing becomes billable before the actual client-delivery status.

create or replace function public.billing_v2_capture_proposal_bill()
returns trigger
language plpgsql
set search_path to 'public'
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
  if coalesce(new.created_via,'') <> 'Proposal Auto Conversion' then return new; end if;
  select * into v_project from projects where id=new.project_id limit 1;
  if v_project.id is null then return new; end if;
  if new.legacy_source_id is not null then
    select * into v_item from proposal_items where item_code=new.legacy_source_id limit 1;
  end if;

  v_service_name := coalesce(
    nullif(trim(v_item.service),''),
    trim(regexp_replace(regexp_replace(coalesce(new.description,''),'^\[[^]]+\]\s*',''),'\s+—.*$',''))
  );
  if v_service_name='' then v_service_name:='Service'; end if;
  v_service_name:=billing_v2_canonical_service_name(v_service_name);
  v_service_key:=billing_v2_service_key(v_service_name);
  v_gross:=greatest(0,coalesce(new.amount,0));
  v_discount:=least(v_gross,greatest(0,coalesce(new.discount,0)));
  v_net:=greatest(0,coalesce(new.net_amount,v_gross-v_discount));

  insert into project_contracts(
    project_id,project_code,proposal_code,status,original_gross,contract_discount,contract_net,
    source,created_by,created_at,updated_at
  ) values (
    v_project.id,v_project.project_code,v_project.reclassified_proposal_code,'Active',0,0,0,
    'Billing 2.0 Proposal Contract',new.source_created_by,v_now,v_now
  ) on conflict(project_id) do nothing;
  select id into v_contract_id from project_contracts where project_id=v_project.id limit 1;

  if v_service_name='Municipality Approval Contract' then v_workflow_type:='municipality';
  elsif lower(coalesce(new.billing_category,new.category,'')) like '%engineering%' then v_workflow_type:='engineering';
  else v_workflow_type:='other'; end if;

  insert into project_contract_services(
    contract_id,project_id,project_code,proposal_item_code,service_name,service_key,billing_category,workflow_type,
    contract_gross,contract_discount,contract_net,start_gate,release_gate,billing_model,active,created_at,updated_at
  ) values (
    v_contract_id,v_project.id,v_project.project_code,new.legacy_source_id,v_service_name,v_service_key,
    coalesce(new.billing_category,new.category,'Engineering Bill'),v_workflow_type,v_gross,v_discount,v_net,
    'Any Payment','No Overdue Invoice',case when coalesce(new.billing_category,new.category,'')='Supervision Bill' then 'event' else 'fixed' end,
    true,v_now,v_now
  )
  on conflict(contract_id,service_key) do update set
    proposal_item_code=excluded.proposal_item_code,
    service_name=excluded.service_name,
    billing_category=excluded.billing_category,
    workflow_type=excluded.workflow_type,
    contract_gross=excluded.contract_gross,
    contract_discount=excluded.contract_discount,
    contract_net=excluded.contract_net,
    updated_at=excluded.updated_at
  returning id into v_service_id;

  if coalesce(new.billing_category,new.category,'')='Supervision Bill' then
    v_shares:=array[0.5,0.5];
    v_names:=array['Supervision Mobilization','Supervision Completion'];
    v_triggers:=array['Contract Accepted','Report Ready'];
  elsif v_workflow_type='municipality' then
    v_shares:=array[0.5,0.25,0.25];
    v_names:=array['Advance','File Submission','Final Delivery'];
    v_triggers:=array['Contract Accepted','File Submitted','File Received'];
  elsif v_workflow_type='engineering' then
    v_shares:=array[0.25,0.25,0.25,0.25];
    v_names:=array['Advance','Design Ready','Design Sent','Final Delivery'];
    v_triggers:=array['Contract Accepted','Ready','Sent','Printed'];
  else
    v_shares:=array[0.5,0.25,0.25];
    v_names:=array['Advance','Report Ready','Final Delivery'];
    v_triggers:=array['Contract Accepted','Report Ready','Report Ready'];
  end if;

  for v_i in 1..array_length(v_shares,1) loop
    if v_i=array_length(v_shares,1) then
      v_gross_part:=round((v_gross-v_gross_used)::numeric,2);
      v_discount_part:=round((v_discount-v_discount_used)::numeric,2);
      v_net_part:=round((v_net-v_net_used)::numeric,2);
    else
      v_gross_part:=round((v_gross*v_shares[v_i])::numeric,2);
      v_discount_part:=round((v_discount*v_shares[v_i])::numeric,2);
      v_net_part:=round((v_net*v_shares[v_i])::numeric,2);
      v_gross_used:=v_gross_used+v_gross_part;
      v_discount_used:=v_discount_used+v_discount_part;
      v_net_used:=v_net_used+v_net_part;
    end if;
    insert into billing_milestones(
      contract_service_id,contract_id,project_id,project_code,service_name,service_key,billing_category,
      sequence_no,milestone_name,trigger_status,percentage,gross_amount,discount_amount,net_amount,
      status,ready_at,ready_by,source,idempotency_key,created_at,updated_at
    ) values (
      v_service_id,v_contract_id,v_project.id,v_project.project_code,v_service_name,v_service_key,
      coalesce(new.billing_category,new.category,'Engineering Bill'),v_i,v_names[v_i],v_triggers[v_i],v_shares[v_i],
      v_gross_part,v_discount_part,v_net_part,
      case when v_triggers[v_i]='Contract Accepted' then 'ready_to_bill' else 'scheduled' end,
      case when v_triggers[v_i]='Contract Accepted' then v_now else null end,
      case when v_triggers[v_i]='Contract Accepted' then new.source_created_by else null end,
      'Billing 2.0 Proposal Contract','milestone:'||v_project.project_code||':'||v_service_key||':'||v_i::text,v_now,v_now
    ) on conflict(contract_service_id,sequence_no) do update set
      milestone_name=excluded.milestone_name,
      trigger_status=excluded.trigger_status,
      percentage=excluded.percentage,
      gross_amount=excluded.gross_amount,
      discount_amount=excluded.discount_amount,
      net_amount=excluded.net_amount,
      updated_at=excluded.updated_at;
  end loop;

  update project_contracts pc
  set original_gross=t.gross,contract_discount=t.discount,contract_net=t.net,updated_at=v_now
  from (
    select contract_id,coalesce(sum(contract_gross),0) gross,coalesce(sum(contract_discount),0) discount,coalesce(sum(contract_net),0) net
    from project_contract_services where contract_id=v_contract_id group by contract_id
  ) t
  where pc.id=t.contract_id;

  insert into billing_events(
    project_id,project_code,contract_id,contract_service_id,event_type,event_key,service_name,amount,actor,details,created_at
  ) values (
    v_project.id,v_project.project_code,v_contract_id,v_service_id,'contract_service_created','contract-service:'||v_service_id::text,
    v_service_name,v_net,new.source_created_by,jsonb_build_object('proposalCode',v_project.reclassified_proposal_code),v_now
  ) on conflict(event_key) do nothing;

  return null;
end;
$$;
