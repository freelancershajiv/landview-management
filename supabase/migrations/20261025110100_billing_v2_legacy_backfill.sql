-- Non-destructive Billing 2.0 legacy backfill.
-- Existing bills/payments remain canonical; this only creates contract/service/milestone mirrors.

create or replace function public.billing_v2_legacy_service_name(p_description text, p_category text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v text := trim(regexp_replace(coalesce(p_description,''), '^\[[^]]+\]\s*', '', 'i'));
  n text := lower(trim(regexp_replace(coalesce(p_description,''), '^\[[^]]+\]\s*', '', 'i')));
begin
  if lower(coalesce(p_category,'')) like '%supervision%' then return 'Site Supervision'; end if;
  if n ~ 'architect' then return 'Architectural Design'; end if;
  if n ~ 'structural' then return 'Structural Design'; end if;
  if n ~ '3d.*interior|interior.*3d' then return '3D Design - Interior'; end if;
  if n ~ '3d.*exterior|exterior.*3d' then return '3D Design - Exterior'; end if;
  if n='3d design' or n='3d design bill' then return '3D Design - Exterior'; end if;
  if n ~ 'electrical' then return 'Electrical Design'; end if;
  if n ~ 'fire' then return 'Fire Safety Design'; end if;
  if n ~ 'plumbing' then return 'Plumbing Design'; end if;
  if n ~ 'plan approval design' then return 'Plan Approval Design'; end if;
  if n ~ 'estimate|costing' then return 'Estimate & Costing'; end if;
  if n ~ 'design book' then return 'Design Books'; end if;
  if n ~ 're.?design' then return 'Re-Design Fees'; end if;
  if n ~ 'soil' then return 'Soil Test'; end if;
  if n ~ 'survey' then return 'Digital Survey'; end if;
  if n ~ 'municipality|file pass|plan pass' then return 'Municipality Approval Contract'; end if;
  if n ~ 'site visit|engineer supervision|engineer site visit|engr\.|eng rony' then return 'Site Supervision'; end if;
  return coalesce(nullif(public.billing_v2_canonical_service_name(v),''),'Other Service');
end;
$$;

revoke all on function public.billing_v2_legacy_service_name(text,text) from public,anon,authenticated;
grant execute on function public.billing_v2_legacy_service_name(text,text) to service_role;

with effective as (
  select p.id project_id,p.project_code,p.reclassified_proposal_code,
    case when lower(coalesce(b.billing_category,b.category,'')) like '%supervision%' then 'Supervision Bill'
         when lower(coalesce(b.billing_category,b.category,'')) like '%other%' then 'Other Services Bill'
         else 'Engineering Bill' end billing_category,
    public.billing_v2_legacy_service_name(b.description,coalesce(b.billing_category,b.category,'')) service_name,
    greatest(0,coalesce(b.amount,0)) gross,
    greatest(0,coalesce(b.discount,0)) discount,
    coalesce(b.net_amount,b.amount-b.discount,0) net
  from public.bills b join public.projects p on p.id=b.project_id
  where lower(coalesce(b.status,'')) not in ('void','voided','cancelled','canceled','rejected')
    and not exists(select 1 from public.project_contracts pc where pc.project_id=p.id)
), totals as (
  select project_id,project_code,max(reclassified_proposal_code) proposal_code,
         sum(gross) gross,sum(discount) discount,sum(net) net
  from effective group by project_id,project_code
)
insert into public.project_contracts(
  project_id,project_code,proposal_code,status,original_gross,contract_discount,contract_net,
  source,created_by,created_at,updated_at
)
select project_id,project_code,proposal_code,'Active',round(gross,2),round(discount,2),round(net,2),
       'Billing 2.0 Legacy Backfill','System Backfill',now(),now()
from totals on conflict(project_id) do nothing;

with effective as (
  select p.id project_id,p.project_code,
    case when lower(coalesce(b.billing_category,b.category,'')) like '%supervision%' then 'Supervision Bill'
         when lower(coalesce(b.billing_category,b.category,'')) like '%other%' then 'Other Services Bill'
         else 'Engineering Bill' end billing_category,
    public.billing_v2_legacy_service_name(b.description,coalesce(b.billing_category,b.category,'')) service_name,
    greatest(0,coalesce(b.amount,0)) gross,
    greatest(0,coalesce(b.discount,0)) discount,
    coalesce(b.net_amount,b.amount-b.discount,0) net
  from public.bills b join public.projects p on p.id=b.project_id
  where lower(coalesce(b.status,'')) not in ('void','voided','cancelled','canceled','rejected')
), grouped as (
  select e.project_id,e.project_code,e.billing_category,e.service_name,
         public.billing_v2_service_key(e.service_name) service_key,
         round(sum(e.gross),2) gross,round(sum(e.discount),2) discount,round(sum(e.net),2) net
  from effective e
  join public.project_contracts pc on pc.project_id=e.project_id and pc.source='Billing 2.0 Legacy Backfill'
  group by e.project_id,e.project_code,e.billing_category,e.service_name
)
insert into public.project_contract_services(
  contract_id,project_id,project_code,service_name,service_key,billing_category,workflow_type,
  contract_gross,contract_discount,contract_net,start_gate,release_gate,billing_model,active,created_at,updated_at
)
select pc.id,g.project_id,g.project_code,g.service_name,g.service_key,g.billing_category,
       case when g.service_name='Municipality Approval Contract' then 'municipality'
            when g.billing_category='Engineering Bill' and g.service_name not in ('Site Supervision','Soil Test','Digital Survey') then 'engineering'
            else 'other' end,
       g.gross,g.discount,g.net,'Any Payment','None',
       case when g.service_name='Site Supervision' then 'event' else 'fixed' end,true,now(),now()
from grouped g join public.project_contracts pc on pc.project_id=g.project_id
on conflict(contract_id,service_key) do nothing;

insert into public.billing_milestones(
  contract_service_id,contract_id,project_id,project_code,service_name,service_key,billing_category,
  sequence_no,milestone_name,trigger_status,percentage,gross_amount,discount_amount,net_amount,
  status,ready_at,ready_by,issued_at,issued_by,source,idempotency_key,created_at,updated_at
)
select s.id,s.contract_id,s.project_id,s.project_code,s.service_name,s.service_key,s.billing_category,
       1,'Legacy billed contract','Legacy',1,s.contract_gross,s.contract_discount,s.contract_net,
       'invoiced',now(),'System Backfill',now(),'System Backfill','Billing 2.0 Legacy Backfill',
       'legacy:'||s.project_code||':'||s.service_key,now(),now()
from public.project_contract_services s
join public.project_contracts pc on pc.id=s.contract_id and pc.source='Billing 2.0 Legacy Backfill'
where not exists(select 1 from public.billing_milestones m where m.contract_service_id=s.id)
on conflict(contract_service_id,sequence_no) do nothing;

insert into public.billing_events(project_id,project_code,contract_id,event_type,event_key,amount,actor,details,created_at)
select pc.project_id,pc.project_code,pc.id,'contract_backfilled','contract:'||pc.id::text,pc.contract_net,'System Backfill',
       jsonb_build_object('source','legacy bills','nonDestructive',true),now()
from public.project_contracts pc
where pc.source='Billing 2.0 Legacy Backfill'
on conflict(event_key) do nothing;

-- Existing historical projects must not be retroactively blocked by new delivery rules.
update public.project_contract_services s
set release_gate='None',release_gate_value=0,updated_at=now()
from public.project_contracts pc
where pc.id=s.contract_id and pc.source='Billing 2.0 Legacy Backfill';
