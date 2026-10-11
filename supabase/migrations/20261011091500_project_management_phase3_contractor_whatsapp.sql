create or replace function public.queue_project_contractor_bill_whatsapp()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_group text; v_project_code text; v_project_name text; v_contractor text; v_category text;
  v_total_certified numeric:=0; v_paid numeric:=0; v_payable numeric:=0; v_advance numeric:=0; v_message text;
begin
  if lower(coalesce(new.status,'')) <> 'certified' then return new; end if;
  if tg_op='UPDATE' and lower(coalesce(old.status,''))='certified' then return new; end if;
  select c.contractor_name,c.category,s.whatsapp_group_invite_code,p.project_code,p.project_name
    into v_contractor,v_category,v_group,v_project_code,v_project_name
  from public.project_contractor_contracts c join public.projects p on p.id=c.project_id
  left join public.project_management_summary s on s.project_id=p.id
  where c.id=new.contract_id and lower(coalesce(c.party_type,'Contractor'))='contractor' limit 1;
  if v_contractor is null or nullif(trim(coalesce(v_group,'')),'') is null then return new; end if;
  select coalesce(sum(b.net_amount),0) into v_total_certified from public.project_contractor_bills b where b.contract_id=new.contract_id and lower(coalesce(b.status,''))='certified';
  select coalesce(sum(l.credit),0) into v_paid from public.project_management_ledger l where l.contractor_contract_id=new.contract_id and coalesce(l.credit,0)>0;
  v_payable:=greatest(v_total_certified-v_paid,0); v_advance:=greatest(v_paid-v_total_certified,0);
  v_message:=left(concat_ws(E'\n','🧾 *LAND VIEW — CONTRACTOR BILL CERTIFIED*','*Project:* '||coalesce(v_project_code,'LAND VIEW Project')||case when nullif(trim(coalesce(v_project_name,'')),'') is not null then ' — '||trim(v_project_name) else '' end,'*Contractor:* '||v_contractor,'*Category:* '||coalesce(v_category,'Contractor'),'*Bill:* '||coalesce(new.bill_code,'—'),'*Date:* '||to_char(new.bill_date,'DD Mon YYYY'),'*Work:* '||coalesce(new.description,'—'),'*Certified Amount:* BDT '||to_char(coalesce(new.net_amount,0),'FM999G999G999G999G990D00'),'*Total Certified:* BDT '||to_char(v_total_certified,'FM999G999G999G999G990D00'),'*Paid to Date:* BDT '||to_char(v_paid,'FM999G999G999G999G990D00'),case when v_payable>0 then '*Contractor Payable:* BDT '||to_char(v_payable,'FM999G999G999G999G990D00') when v_advance>0 then '*Contractor Advance:* BDT '||to_char(v_advance,'FM999G999G999G999G990D00') else '*Account Position:* Settled' end,case when nullif(trim(coalesce(new.created_by,'')),'') is not null then '*Added By:* '||trim(new.created_by) else null end,'_Certified through LAND VIEW Project Management._'),4000);
  insert into public.whatsapp_finance_outbox(dedupe_key,message,group_invite_code) values('project-contractor-bill-certified:'||new.id::text,v_message,v_group) on conflict(dedupe_key) do nothing;
  begin perform net.http_get(url:='https://landview-whatsapp-bot.onrender.com/health',timeout_milliseconds:=5000); exception when others then null; end;
  return new;
end;
$$;

drop trigger if exists trg_project_contractor_bill_whatsapp on public.project_contractor_bills;
create trigger trg_project_contractor_bill_whatsapp after insert or update of status on public.project_contractor_bills for each row execute function public.queue_project_contractor_bill_whatsapp();

create or replace function public.queue_project_contractor_progress_whatsapp()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_group text; v_project_code text; v_project_name text; v_contractor text; v_category text; v_certified numeric:=0; v_paid numeric:=0; v_message text;
begin
  select c.contractor_name,c.category,s.whatsapp_group_invite_code,p.project_code,p.project_name
    into v_contractor,v_category,v_group,v_project_code,v_project_name
  from public.project_contractor_contracts c join public.projects p on p.id=c.project_id
  left join public.project_management_summary s on s.project_id=p.id
  where c.id=new.contract_id and lower(coalesce(c.party_type,'Contractor'))='contractor' limit 1;
  if v_contractor is null or nullif(trim(coalesce(v_group,'')),'') is null then return new; end if;
  select coalesce(sum(b.net_amount),0) into v_certified from public.project_contractor_bills b where b.contract_id=new.contract_id and lower(coalesce(b.status,''))='certified';
  select coalesce(sum(l.credit),0) into v_paid from public.project_management_ledger l where l.contractor_contract_id=new.contract_id and coalesce(l.credit,0)>0;
  v_message:=left(concat_ws(E'\n','🏗️ *LAND VIEW — CONTRACTOR WORK PROGRESS*','*Project:* '||coalesce(v_project_code,'LAND VIEW Project')||case when nullif(trim(coalesce(v_project_name,'')),'') is not null then ' — '||trim(v_project_name) else '' end,'*Contractor:* '||v_contractor,'*Category:* '||coalesce(v_category,'Contractor'),'*Date:* '||to_char(new.progress_date,'DD Mon YYYY'),'*Physical Progress:* '||to_char(coalesce(new.progress_percent,0),'FM990D00')||'%',case when nullif(trim(coalesce(new.stage_name,'')),'') is not null then '*Stage:* '||trim(new.stage_name) else null end,case when nullif(trim(coalesce(new.floor_label,'')),'') is not null then '*Floor / Zone:* '||trim(new.floor_label) else null end,'*Work Update:* '||coalesce(new.description,'—'),'*Certified to Date:* BDT '||to_char(v_certified,'FM999G999G999G999G990D00'),'*Paid to Date:* BDT '||to_char(v_paid,'FM999G999G999G999G990D00'),case when nullif(trim(coalesce(new.created_by,'')),'') is not null then '*Added By:* '||trim(new.created_by) else null end,'_Physical progress is tracked separately from billing and payment._'),4000);
  insert into public.whatsapp_finance_outbox(dedupe_key,message,group_invite_code) values('project-contractor-progress:'||new.id::text,v_message,v_group) on conflict(dedupe_key) do nothing;
  begin perform net.http_get(url:='https://landview-whatsapp-bot.onrender.com/health',timeout_milliseconds:=5000); exception when others then null; end;
  return new;
end;
$$;

drop trigger if exists trg_project_contractor_progress_whatsapp on public.project_contractor_progress_updates;
create trigger trg_project_contractor_progress_whatsapp after insert on public.project_contractor_progress_updates for each row execute function public.queue_project_contractor_progress_whatsapp();