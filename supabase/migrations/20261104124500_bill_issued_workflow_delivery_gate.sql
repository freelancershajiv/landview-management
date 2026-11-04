-- LAND VIEW: issuing a bill starts work; full service payment is mandatory before delivery.
-- No client file is released merely because a workflow status can be selected.

create or replace function public.landview_bill_service_label(p_description text, p_category text)
returns text language plpgsql immutable set search_path=public as $$
declare
  v_raw text := trim(regexp_replace(coalesce(p_description,''), '^\[[^]]+\]\s*', '', 'i'));
  v_lower text := lower(v_raw);
  v_label text;
begin
  if lower(coalesce(p_category,'')) like '%supervision%' then return 'Site Supervision'; end if;
  if v_lower ~ 'district vetting' then return 'District Vetting Committee Approval'; end if;
  if v_lower ~ 'municipality land noc|land noc' then return 'Municipality Land NOC'; end if;
  if v_lower ~ 'fire service approval' then return 'Fire Service Approval'; end if;
  if v_lower ~ 'consultancy fee' then return 'Consultancy Fees'; end if;
  if v_lower ~ 'submission fee' then return 'Submission Fees'; end if;
  v_label := public.billing_v2_legacy_service_name(p_description,p_category);
  if v_label = 'Other Service' then
    return left(nullif(v_raw,''),160);
  end if;
  return nullif(v_label,'');
end;
$$;

create or replace function public.landview_issued_service_total(p_project uuid,p_service_key text)
returns numeric language sql stable set search_path=public as $$
  select coalesce(sum(greatest(0,coalesce(b.amount,0)-coalesce(b.discount,0))),0)
  from public.bills b
  where b.project_id=p_project
    and lower(trim(coalesce(b.status,''))) in ('issued','unpaid','partially paid','paid','open')
    and lower(coalesce(b.created_via,'')) not like '%credit note%'
    and lower(coalesce(b.created_via,'')) not like '%debit note%'
    and public.billing_v2_service_key(
      public.landview_bill_service_label(b.description,coalesce(b.billing_category,b.category,''))
    )=p_service_key;
$$;

create or replace function public.landview_assert_service_fully_paid(
  p_project_id uuid,p_service_key text,p_billing_category text,p_service_name text
) returns void language plpgsql stable set search_path=public as $$
declare
  v_billed numeric;
  v_contract_net numeric;
  v_paid numeric;
  v_required numeric;
begin
  v_billed := public.landview_issued_service_total(p_project_id,p_service_key);
  select coalesce(max(greatest(0,contract_net)),0) into v_contract_net
    from public.project_contract_services
    where project_id=p_project_id and service_key=p_service_key and active=true;
  v_required := greatest(coalesce(v_billed,0),coalesce(v_contract_net,0));
  v_paid := public.billing_v2_service_paid(p_project_id,p_service_key,p_billing_category,p_service_name);
  if v_required < 0.01 then
    raise exception 'Payment required before file delivery for %: no issued service bill was found.',p_service_name;
  end if;
  if v_paid+0.009 < v_required then
    raise exception 'Payment required before file delivery for %: paid BDT %, required BDT %, due BDT %.',
      p_service_name,round(v_paid,2),round(v_required,2),round(greatest(0,v_required-v_paid),2);
  end if;
end;
$$;

create or replace function public.landview_start_workflow_on_bill_issue()
returns trigger language plpgsql set search_path=public as $$
declare
  v_project_code text;
  v_service text;
  v_key text;
  v_category text;
  v_type text;
  v_contract_type text;
  v_billed numeric;
  v_paid numeric;
begin
  -- Drafts, voids, adjustments, and zero-value lines must not start work.
  if lower(trim(coalesce(new.status,''))) not in ('issued','unpaid','partially paid','paid','open')
     or coalesce(new.amount,0)-coalesce(new.discount,0) <= 0
     or lower(coalesce(new.created_via,'')) like '%credit note%'
     or lower(coalesce(new.created_via,'')) like '%debit note%' then
    return new;
  end if;
  select project_code into v_project_code from public.projects where id=new.project_id;
  if v_project_code is null then return new; end if;

  v_category := case
    when lower(coalesce(new.billing_category,new.category,'')) like '%supervision%' then 'Supervision Bill'
    when lower(coalesce(new.billing_category,new.category,'')) ~ 'other|soil|survey|municipality|file pass' then 'Other Services Bill'
    else 'Engineering Bill'
  end;
  v_service := public.landview_bill_service_label(new.description,coalesce(new.billing_category,new.category,''));
  v_key := public.billing_v2_service_key(v_service);
  if v_service is null or v_key is null or length(v_key)=0 then return new; end if;
  v_billed := public.landview_issued_service_total(new.project_id,v_key);
  if v_billed <= 0 then return new; end if;

  select workflow_type into v_contract_type from public.project_contract_services
    where project_id=new.project_id and service_key=v_key and active=true limit 1;
  v_type := coalesce(v_contract_type,case
    when v_service='Municipality Approval Contract' then 'municipality'
    when v_service in ('Architectural Design','Structural Design','3D Design - Exterior','3D Design - Interior',
                       'Electrical Design','Fire Safety Design','Plumbing Design','Plan Approval Design',
                       'Estimate & Costing','Design Books','Re-Design Fees') then 'engineering'
    else 'other' end);
  v_paid := public.billing_v2_service_paid(new.project_id,v_key,v_category,v_service);

  insert into public.project_service_workflows(
    project_id,project_code,billing_category,service_name,service_key,workflow_type,
    status,net_amount,paid_amount,activated_at,updated_by,created_at,updated_at
  ) values (
    new.project_id,v_project_code,v_category,v_service,v_key,v_type,
    'Working',v_billed,v_paid,now(),'Bill Issued',now(),now()
  )
  on conflict (project_id,service_key) do update
    set net_amount=excluded.net_amount,
        paid_amount=excluded.paid_amount,
        updated_at=now()
    where public.project_service_workflows.net_amount is distinct from excluded.net_amount
       or public.project_service_workflows.paid_amount is distinct from excluded.paid_amount;
  return new;
end;
$$;

drop trigger if exists trg_landview_bill_issued_starts_work on public.bills;
create trigger trg_landview_bill_issued_starts_work
after insert or update of status,amount,discount,billing_category,category,description
on public.bills for each row execute function public.landview_start_workflow_on_bill_issue();

create or replace function public.landview_enforce_workflow_file_delivery()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status in ('Delivered','Delivered to Client') then
    perform public.landview_assert_service_fully_paid(
      new.project_id,new.service_key,new.billing_category,new.service_name
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_landview_final_delivery_requires_payment on public.project_service_workflows;
create trigger trg_landview_final_delivery_requires_payment
before update of status on public.project_service_workflows for each row
execute function public.landview_enforce_workflow_file_delivery();

create or replace function public.landview_enforce_document_file_delivery()
returns trigger language plpgsql set search_path=public as $$
declare
  v_workflow public.project_service_workflows%rowtype;
  v_release boolean := false;
begin
  if new.service_workflow_id is null then return new; end if;
  if tg_op='INSERT' then
    v_release := coalesce(new.workflow_status,'')='Delivered'
      or coalesce(new.client_visible,false)
      or coalesce(new.delivered_quantity,0)>0
      or new.delivered_at is not null;
  else
    v_release := (coalesce(new.workflow_status,'')='Delivered'
                  and old.workflow_status is distinct from new.workflow_status)
      or (coalesce(new.client_visible,false) and not coalesce(old.client_visible,false))
      or coalesce(new.delivered_quantity,0)>coalesce(old.delivered_quantity,0)
      or (new.delivered_at is not null and old.delivered_at is null);
  end if;
  if not v_release then return new; end if;
  select * into v_workflow from public.project_service_workflows
    where id=new.service_workflow_id limit 1;
  if v_workflow.id is null then
    raise exception 'A valid service workflow is required before releasing the file.';
  end if;
  perform public.landview_assert_service_fully_paid(
    v_workflow.project_id,v_workflow.service_key,v_workflow.billing_category,v_workflow.service_name
  );
  return new;
end;
$$;

drop trigger if exists trg_landview_document_delivery_requires_payment on public.documents;
create trigger trg_landview_document_delivery_requires_payment
before insert or update of workflow_status,client_visible,delivered_quantity,delivered_at,service_workflow_id
on public.documents for each row execute function public.landview_enforce_document_file_delivery();

-- Work starts upon issuing a bill, not upon receiving a payment.
alter table public.project_contract_services
  alter column start_gate set default 'None',
  alter column release_gate set default 'Fully Paid';
update public.project_contract_services set start_gate='None',release_gate='Fully Paid'
  where active=true and (start_gate is distinct from 'None' or release_gate is distinct from 'Fully Paid');

-- Historical closed projects and previously delivered workflows are intentionally untouched.
-- Backfill only outstanding billed services of projects which are still in progress.
with candidates as (
  select distinct p.id project_id,p.project_code,
    public.landview_bill_service_label(b.description,coalesce(b.billing_category,b.category,'')) as service_name,
    case
      when lower(coalesce(b.billing_category,b.category,'')) like '%supervision%' then 'Supervision Bill'
      when lower(coalesce(b.billing_category,b.category,'')) ~ 'other|soil|survey|municipality|file pass' then 'Other Services Bill'
      else 'Engineering Bill'
    end as category
  from public.bills b join public.projects p on p.id=b.project_id
  where coalesce(p.lifecycle_phase,'') <> 'Completed'
    and lower(trim(coalesce(b.status,''))) in ('issued','unpaid','partially paid','paid','open')
    and greatest(0,coalesce(b.amount,0)-coalesce(b.discount,0))>0
    and lower(coalesce(b.created_via,'')) not like '%credit note%'
    and lower(coalesce(b.created_via,'')) not like '%debit note%'
), totals as (
  select c.*,public.billing_v2_service_key(c.service_name) service_key,
     public.landview_issued_service_total(c.project_id,public.billing_v2_service_key(c.service_name)) billed,
     public.billing_v2_service_paid(c.project_id,public.billing_v2_service_key(c.service_name),c.category,c.service_name) paid
  from candidates c where nullif(c.service_name,'') is not null
)
insert into public.project_service_workflows (
  project_id,project_code,service_name,service_key,billing_category,workflow_type,
  status,net_amount,paid_amount,activated_at,updated_by,created_at,updated_at
)
select t.project_id,t.project_code,t.service_name,t.service_key,t.category,
  coalesce((select s.workflow_type from public.project_contract_services s
            where s.project_id=t.project_id and s.service_key=t.service_key and s.active=true limit 1),
    case when t.service_name='Municipality Approval Contract' then 'municipality'
         when t.service_name in ('Architectural Design','Structural Design','3D Design - Exterior','3D Design - Interior',
             'Electrical Design','Fire Safety Design','Plumbing Design','Plan Approval Design','Estimate & Costing',
             'Design Books','Re-Design Fees') then 'engineering' else 'other' end),
  'Working',t.billed,t.paid,now(),'Bill Issued Backfill',now(),now()
from totals t where t.billed>0.01 and t.billed>t.paid+0.009
on conflict (project_id,service_key) do nothing;

-- Trigger functions are internal only; direct Data API execution is not permitted.
revoke all on function public.landview_bill_service_label(text,text) from public,anon,authenticated;
revoke all on function public.landview_issued_service_total(uuid,text) from public,anon,authenticated;
revoke all on function public.landview_assert_service_fully_paid(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.landview_start_workflow_on_bill_issue() from public,anon,authenticated;
revoke all on function public.landview_enforce_workflow_file_delivery() from public,anon,authenticated;
revoke all on function public.landview_enforce_document_file_delivery() from public,anon,authenticated;
grant execute on function public.landview_bill_service_label(text,text) to service_role;
grant execute on function public.landview_issued_service_total(uuid,text) to service_role;
grant execute on function public.landview_assert_service_fully_paid(uuid,text,text,text) to service_role;
grant execute on function public.landview_start_workflow_on_bill_issue() to service_role;
grant execute on function public.landview_enforce_workflow_file_delivery() to service_role;
grant execute on function public.landview_enforce_document_file_delivery() to service_role;
