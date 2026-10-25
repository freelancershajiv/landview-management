-- Billing 2.0 invoice -> payment allocation -> receipt lifecycle.
-- Existing bills/payments remain canonical. This migration adds derived invoice,
-- allocation and receipt records, plus server-side lifecycle automation.

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete restrict,
  bill_code text not null,
  milestone_id uuid null references public.billing_milestones(id) on delete set null,
  contract_service_id uuid null references public.project_contract_services(id) on delete set null,
  service_name text not null,
  service_key text not null,
  billing_category text not null,
  description text null,
  gross_amount numeric not null default 0,
  discount_amount numeric not null default 0,
  net_amount numeric not null default 0,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(invoice_id,bill_id)
);

create table if not exists public.payment_invoice_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  payment_code text not null,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  invoice_code text not null,
  bill_id uuid null references public.bills(id) on delete set null,
  bill_code text null,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_code text not null,
  service_name text null,
  service_key text null,
  billing_category text null,
  allocated_amount numeric not null check (allocated_amount > 0),
  created_by text null,
  created_at timestamptz not null default now(),
  unique(payment_id,invoice_id,bill_id)
);

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_code text not null unique,
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  payment_code text not null unique,
  project_id uuid null references public.projects(id) on delete set null,
  project_code text null,
  client_name_snapshot text null,
  amount numeric not null default 0,
  allocated_amount numeric not null default 0,
  unallocated_amount numeric not null default 0,
  payment_date date null,
  payment_method text null,
  deposit_account text null,
  reference_no text null,
  notes text null,
  status text not null default 'Issued',
  verification_token text not null unique default replace(gen_random_uuid()::text,'-',''),
  receipt_path text null,
  issued_by text null,
  issued_at timestamptz not null default now(),
  voided_by text null,
  voided_at timestamptz null,
  void_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payments
  add column if not exists invoice_allocated_amount numeric not null default 0,
  add column if not exists invoice_unallocated_amount numeric not null default 0,
  add column if not exists invoice_allocation_status text not null default 'Unallocated';

alter table public.invoice_items enable row level security;
alter table public.payment_invoice_allocations enable row level security;
alter table public.payment_receipts enable row level security;
revoke all on public.invoice_items, public.payment_invoice_allocations, public.payment_receipts from public, anon, authenticated;
grant select,insert,update,delete on public.invoice_items, public.payment_invoice_allocations, public.payment_receipts to service_role;

create unique index if not exists invoices_bill_code_unique_idx on public.invoices(bill_code) where bill_code is not null;
create index if not exists invoice_items_invoice_idx on public.invoice_items(invoice_id);
create index if not exists invoice_items_bill_idx on public.invoice_items(bill_id);
create index if not exists invoice_items_service_idx on public.invoice_items(service_key,billing_category);
create index if not exists invoice_items_milestone_idx on public.invoice_items(milestone_id) where milestone_id is not null;
create index if not exists invoice_items_contract_service_idx on public.invoice_items(contract_service_id) where contract_service_id is not null;
create index if not exists payment_invoice_allocations_payment_idx on public.payment_invoice_allocations(payment_id);
create index if not exists payment_invoice_allocations_invoice_idx on public.payment_invoice_allocations(invoice_id);
create index if not exists payment_invoice_allocations_bill_idx on public.payment_invoice_allocations(bill_id) where bill_id is not null;
create index if not exists payment_invoice_allocations_project_idx on public.payment_invoice_allocations(project_id,created_at desc);
create index if not exists payment_receipts_project_idx on public.payment_receipts(project_id,issued_at desc);
create index if not exists payments_invoice_allocation_status_idx on public.payments(invoice_allocation_status,payment_date desc);

create or replace function public.billing_v2_refresh_invoice(p_invoice_id uuid)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_bill_net numeric := 0;
  v_debits numeric := 0;
  v_credits numeric := 0;
  v_amount numeric := 0;
  v_paid numeric := 0;
  v_due numeric := 0;
  v_status text := 'ISSUED';
begin
  select coalesce(sum(coalesce(b.net_amount,greatest(coalesce(b.amount,0)-coalesce(b.discount,0),0))),0)
    into v_bill_net
  from public.invoice_items ii
  join public.bills b on b.id=ii.bill_id
  where ii.invoice_id=p_invoice_id;

  select
    coalesce(sum(case when lower(coalesce(a.adjustment_type,''))='debit' and lower(coalesce(a.status,''))='posted' then a.amount else 0 end),0),
    coalesce(sum(case when lower(coalesce(a.adjustment_type,''))='credit' and lower(coalesce(a.status,''))='posted' then a.amount else 0 end),0)
    into v_debits,v_credits
  from public.billing_adjustments a
  where exists(select 1 from public.invoice_items ii where ii.invoice_id=p_invoice_id and ii.bill_id=a.bill_id);

  v_amount := greatest(0,v_bill_net+v_debits-v_credits);
  select coalesce(sum(allocated_amount),0) into v_paid
  from public.payment_invoice_allocations where invoice_id=p_invoice_id;
  v_due := greatest(0,v_amount-v_paid);
  v_status := case
    when v_amount <= 0.009 then 'ADJUSTED'
    when v_paid >= v_amount-0.009 then 'PAID'
    when v_paid > 0.009 then 'PARTIALLY PAID'
    else 'ISSUED'
  end;

  update public.invoices
  set amount=round(v_amount,2),paid_amount_snapshot=round(v_paid,2),due_amount_snapshot=round(v_due,2),
      total_bill_snapshot=round(v_amount,2),total_paid_snapshot=round(v_paid,2),status=v_status,
      updated_at=now(),source_updated_at=now()
  where id=p_invoice_id;
end;
$$;
revoke all on function public.billing_v2_refresh_invoice(uuid) from public,anon,authenticated;
grant execute on function public.billing_v2_refresh_invoice(uuid) to service_role;

create or replace function public.billing_v2_client_jid(p_phone text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare d text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
  if d='' then return null; end if;
  if length(d)=11 and left(d,2)='01' then d := '88'||d; end if;
  if length(d)<10 then return null; end if;
  return d||'@s.whatsapp.net';
end;
$$;
revoke all on function public.billing_v2_client_jid(text) from public,anon,authenticated;
grant execute on function public.billing_v2_client_jid(text) to service_role;

create or replace function public.billing_v2_create_invoice_for_bill(p_bill_id uuid,p_notify boolean default true)
returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  b public.bills%rowtype;
  p public.projects%rowtype;
  inv public.invoices%rowtype;
  v_service text;
  v_key text;
  v_milestone public.billing_milestones%rowtype;
  v_new boolean := false;
  v_jid text;
  v_invoice_code text;
begin
  select * into b from public.bills where id=p_bill_id;
  if not found then return null; end if;
  if lower(coalesce(b.status,'')) in ('void','voided','cancelled','canceled','rejected') then return null; end if;
  select * into p from public.projects where id=b.project_id;
  if not found then return null; end if;

  select * into inv from public.invoices where bill_code=b.bill_code limit 1;
  if not found then
    v_invoice_code := 'INV-'||b.bill_code;
    insert into public.invoices(
      invoice_code,invoice_no,project_id,issue_date,amount,status,notes,bill_code,category,
      paid_amount_snapshot,due_amount_snapshot,project_name_snapshot,client_name_snapshot,total_bill_snapshot,total_paid_snapshot,
      source_created_by,source_created_at,source_updated_at,created_at,updated_at
    ) values (
      v_invoice_code,v_invoice_code,p.id,coalesce(b.bill_date,current_date),coalesce(b.net_amount,0),
      case when lower(coalesce(b.status,''))='draft' then 'DRAFT' else 'ISSUED' end,
      coalesce(b.notes,''),b.bill_code,coalesce(b.billing_category,b.category,'Engineering Bill'),0,coalesce(b.net_amount,0),
      p.project_name,p.client_name_snapshot,coalesce(b.net_amount,0),0,b.source_created_by,coalesce(b.source_created_at,b.created_at),now(),now(),now()
    ) returning * into inv;
    v_new := true;
  end if;

  v_service := public.billing_v2_legacy_service_name(b.description,coalesce(b.billing_category,b.category,''));
  v_key := public.billing_v2_service_key(v_service);
  select * into v_milestone from public.billing_milestones where bill_id=b.id order by created_at desc limit 1;

  insert into public.invoice_items(
    invoice_id,bill_id,bill_code,milestone_id,contract_service_id,service_name,service_key,billing_category,description,
    gross_amount,discount_amount,net_amount,sort_order,created_at,updated_at
  ) values (
    inv.id,b.id,b.bill_code,v_milestone.id,v_milestone.contract_service_id,v_service,v_key,
    coalesce(b.billing_category,b.category,'Engineering Bill'),b.description,coalesce(b.amount,0),coalesce(b.discount,0),coalesce(b.net_amount,0),1,now(),now()
  ) on conflict(invoice_id,bill_id) do update set
    milestone_id=coalesce(excluded.milestone_id,public.invoice_items.milestone_id),
    contract_service_id=coalesce(excluded.contract_service_id,public.invoice_items.contract_service_id),
    service_name=excluded.service_name,service_key=excluded.service_key,billing_category=excluded.billing_category,
    description=excluded.description,gross_amount=excluded.gross_amount,discount_amount=excluded.discount_amount,
    net_amount=excluded.net_amount,updated_at=now();

  perform public.billing_v2_refresh_invoice(inv.id);

  if p_notify and v_new and lower(coalesce(b.status,''))<>'draft' and coalesce(p.whatsapp_updates_enabled,false)=true then
    v_jid := public.billing_v2_client_jid(coalesce(nullif(p.whatsapp_checked_phone,''),p.phone_number_snapshot));
    if v_jid is not null and lower(coalesce(p.whatsapp_number_status,'valid')) not in ('invalid','blocked') then
      insert into public.whatsapp_client_outbox(
        to_jid,message,status,attempt_count,next_attempt_at,dedupe_key,source,event_key,priority,recipient_group,template_key,created_at,updated_at
      ) values (
        v_jid,
        '🧾 *LAND VIEW — INVOICE ISSUED*'||E'\n'||
        '*File ID:* '||p.project_code||E'\n'||
        '*Invoice:* '||inv.invoice_code||E'\n'||
        '*Amount:* BDT '||to_char(coalesce(b.net_amount,0),'FM999G999G999G990D00')||E'\n'||
        '*Service:* '||v_service||E'\n\n'||
        'View your billing in the LAND VIEW Client Portal:'||E'\n'||'https://app.landview.com.bd/client/billing/'||p.project_code,
        'pending',0,now(),'billing-invoice:'||b.bill_code,'billing','client.invoice_issued','routine','client','client.invoice_issued',now(),now()
      ) on conflict(dedupe_key) do nothing;
    end if;
  end if;
  return inv.id;
end;
$$;
revoke all on function public.billing_v2_create_invoice_for_bill(uuid,boolean) from public,anon,authenticated;
grant execute on function public.billing_v2_create_invoice_for_bill(uuid,boolean) to service_role;

create or replace function public.billing_v2_invoice_bill_trigger()
returns trigger language plpgsql security invoker set search_path to 'public'
as $$ begin perform public.billing_v2_create_invoice_for_bill(new.id,true); return new; end; $$;
revoke all on function public.billing_v2_invoice_bill_trigger() from public,anon,authenticated;
grant execute on function public.billing_v2_invoice_bill_trigger() to service_role;

drop trigger if exists billing_v2_invoice_bill_sync on public.bills;
create trigger billing_v2_invoice_bill_sync
after insert or update of bill_date,billing_category,category,description,amount,discount,status,notes on public.bills
for each row execute function public.billing_v2_invoice_bill_trigger();

create or replace function public.billing_v2_adjustment_invoice_trigger()
returns trigger language plpgsql security invoker set search_path to 'public'
as $$ declare v_invoice uuid; begin
  select i.id into v_invoice from public.invoices i where i.bill_code=coalesce(new.bill_code,old.bill_code) limit 1;
  if v_invoice is not null then perform public.billing_v2_refresh_invoice(v_invoice); end if;
  return coalesce(new,old);
end; $$;
revoke all on function public.billing_v2_adjustment_invoice_trigger() from public,anon,authenticated;
grant execute on function public.billing_v2_adjustment_invoice_trigger() to service_role;

drop trigger if exists billing_v2_adjustment_invoice_sync on public.billing_adjustments;
create trigger billing_v2_adjustment_invoice_sync after insert or update or delete on public.billing_adjustments
for each row execute function public.billing_v2_adjustment_invoice_trigger();

create or replace function public.billing_v2_allocation_invoice_trigger()
returns trigger language plpgsql security invoker set search_path to 'public'
as $$ begin
  if tg_op='DELETE' then perform public.billing_v2_refresh_invoice(old.invoice_id); return old; end if;
  perform public.billing_v2_refresh_invoice(new.invoice_id);
  if tg_op='UPDATE' and old.invoice_id is distinct from new.invoice_id then perform public.billing_v2_refresh_invoice(old.invoice_id); end if;
  return new;
end; $$;
revoke all on function public.billing_v2_allocation_invoice_trigger() from public,anon,authenticated;
grant execute on function public.billing_v2_allocation_invoice_trigger() to service_role;

drop trigger if exists billing_v2_payment_invoice_refresh on public.payment_invoice_allocations;
create trigger billing_v2_payment_invoice_refresh after insert or update or delete on public.payment_invoice_allocations
for each row execute function public.billing_v2_allocation_invoice_trigger();

create or replace function public.billing_v2_reconcile_payment(p_payment_code text,p_actor text default 'LAND VIEW',p_notify boolean default true)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  pay public.payments%rowtype;
  proj public.projects%rowtype;
  sa record; inv record;
  v_remaining numeric; v_segment numeric; v_take numeric; v_due numeric;
  v_service_key text; v_service_name text; v_category text;
  v_allocated numeric := 0; v_count integer := 0; v_single_invoice uuid;
  v_receipt public.payment_receipts%rowtype; v_jid text;
begin
  select * into pay from public.payments where payment_code=p_payment_code limit 1;
  if not found then raise exception 'Payment % was not found.',p_payment_code; end if;
  if pay.project_id is null then raise exception 'Only project payments can be reconciled.'; end if;
  select * into proj from public.projects where id=pay.project_id;
  if not found then raise exception 'Payment project was not found.'; end if;

  delete from public.payment_invoice_allocations where payment_id=pay.id;
  v_remaining := greatest(0,coalesce(pay.amount,0));
  v_category := coalesce(pay.income_category,pay.payment_for,'Engineering Bill');

  for sa in select psa.* from public.payment_service_allocations psa where psa.payment_id=pay.id order by psa.created_at,psa.id loop
    v_segment := least(greatest(0,coalesce(sa.allocated_amount,0)),v_remaining);
    if v_segment<=0.009 then continue; end if;
    for inv in
      select i.id invoice_id,i.invoice_code,i.bill_code,i.category,ii.bill_id,ii.service_name,ii.service_key,
             greatest(0,coalesce(i.due_amount_snapshot,i.amount,0)) due
      from public.invoices i join public.invoice_items ii on ii.invoice_id=i.id
      where i.project_id=pay.project_id and ii.service_key=sa.service_key
        and lower(coalesce(i.status,'')) not in ('void','voided','cancelled','canceled','draft','paid','adjusted')
      order by i.issue_date nulls first,i.created_at,i.id
    loop
      exit when v_segment<=0.009 or v_remaining<=0.009;
      v_due:=greatest(0,inv.due); if v_due<=0.009 then continue; end if;
      v_take:=least(v_segment,v_due,v_remaining);
      insert into public.payment_invoice_allocations(payment_id,payment_code,invoice_id,invoice_code,bill_id,bill_code,project_id,project_code,service_name,service_key,billing_category,allocated_amount,created_by,created_at)
      values(pay.id,pay.payment_code,inv.invoice_id,inv.invoice_code,inv.bill_id,inv.bill_code,pay.project_id,proj.project_code,inv.service_name,inv.service_key,inv.category,v_take,p_actor,now());
      v_segment:=v_segment-v_take; v_remaining:=v_remaining-v_take; v_allocated:=v_allocated+v_take;
      perform public.billing_v2_refresh_invoice(inv.invoice_id);
    end loop;
  end loop;

  if not exists(select 1 from public.payment_service_allocations where payment_id=pay.id) then
    v_service_name:=case when coalesce(pay.service_type,'')<>'' then public.billing_v2_canonical_service_name(pay.service_type)
                         when lower(v_category) like '%supervision%' then 'Site Supervision' else null end;
    if v_service_name is not null then v_service_key:=public.billing_v2_service_key(v_service_name); end if;
    if v_service_key is not null then
      for inv in
        select i.id invoice_id,i.invoice_code,i.bill_code,i.category,ii.bill_id,ii.service_name,ii.service_key,
               greatest(0,coalesce(i.due_amount_snapshot,i.amount,0)) due
        from public.invoices i join public.invoice_items ii on ii.invoice_id=i.id
        where i.project_id=pay.project_id and ii.service_key=v_service_key
          and lower(coalesce(i.status,'')) not in ('void','voided','cancelled','canceled','draft','paid','adjusted')
        order by i.issue_date nulls first,i.created_at,i.id
      loop
        exit when v_remaining<=0.009;
        v_take:=least(v_remaining,greatest(0,inv.due)); if v_take<=0.009 then continue; end if;
        insert into public.payment_invoice_allocations(payment_id,payment_code,invoice_id,invoice_code,bill_id,bill_code,project_id,project_code,service_name,service_key,billing_category,allocated_amount,created_by,created_at)
        values(pay.id,pay.payment_code,inv.invoice_id,inv.invoice_code,inv.bill_id,inv.bill_code,pay.project_id,proj.project_code,inv.service_name,inv.service_key,inv.category,v_take,p_actor,now());
        v_remaining:=v_remaining-v_take; v_allocated:=v_allocated+v_take;
        perform public.billing_v2_refresh_invoice(inv.invoice_id);
      end loop;
    end if;
  end if;

  if v_remaining>0.009 then
    for inv in
      select i.id invoice_id,i.invoice_code,i.bill_code,i.category,ii.bill_id,ii.service_name,ii.service_key,
             greatest(0,coalesce(i.due_amount_snapshot,i.amount,0)) due
      from public.invoices i join public.invoice_items ii on ii.invoice_id=i.id
      where i.project_id=pay.project_id and lower(coalesce(i.category,''))=lower(v_category)
        and lower(coalesce(i.status,'')) not in ('void','voided','cancelled','canceled','draft','paid','adjusted')
      order by i.issue_date nulls first,i.created_at,i.id
    loop
      exit when v_remaining<=0.009;
      v_take:=least(v_remaining,greatest(0,inv.due)); if v_take<=0.009 then continue; end if;
      insert into public.payment_invoice_allocations(payment_id,payment_code,invoice_id,invoice_code,bill_id,bill_code,project_id,project_code,service_name,service_key,billing_category,allocated_amount,created_by,created_at)
      values(pay.id,pay.payment_code,inv.invoice_id,inv.invoice_code,inv.bill_id,inv.bill_code,pay.project_id,proj.project_code,inv.service_name,inv.service_key,inv.category,v_take,p_actor,now());
      v_remaining:=v_remaining-v_take; v_allocated:=v_allocated+v_take;
      perform public.billing_v2_refresh_invoice(inv.invoice_id);
    end loop;
  end if;

  select count(*),(array_agg(invoice_id order by created_at))[1] into v_count,v_single_invoice
  from public.payment_invoice_allocations where payment_id=pay.id;
  update public.payments set invoice_id=case when v_count=1 then v_single_invoice else null end,updated_at=now() where id=pay.id;

  insert into public.payment_receipts(
    receipt_code,payment_id,payment_code,project_id,project_code,client_name_snapshot,amount,allocated_amount,unallocated_amount,
    payment_date,payment_method,deposit_account,reference_no,notes,status,issued_by,issued_at,created_at,updated_at
  ) values (
    'RCPT-'||pay.payment_code,pay.id,pay.payment_code,pay.project_id,proj.project_code,proj.client_name_snapshot,coalesce(pay.amount,0),v_allocated,greatest(0,v_remaining),
    pay.payment_date,pay.payment_method,pay.deposit_account,pay.reference_no,pay.notes,'Issued',p_actor,now(),now(),now()
  ) on conflict(payment_id) do update set
    amount=excluded.amount,allocated_amount=excluded.allocated_amount,unallocated_amount=excluded.unallocated_amount,payment_date=excluded.payment_date,
    payment_method=excluded.payment_method,deposit_account=excluded.deposit_account,reference_no=excluded.reference_no,notes=excluded.notes,updated_at=now()
  returning * into v_receipt;

  update public.payment_receipts set receipt_path='/verify/receipt/'||verification_token where id=v_receipt.id returning * into v_receipt;
  update public.payments set receipt_url=v_receipt.receipt_path,updated_at=now() where id=pay.id;

  if p_notify and coalesce(proj.whatsapp_updates_enabled,false)=true then
    v_jid:=public.billing_v2_client_jid(coalesce(nullif(proj.whatsapp_checked_phone,''),proj.phone_number_snapshot));
    if v_jid is not null and lower(coalesce(proj.whatsapp_number_status,'valid')) not in ('invalid','blocked') then
      insert into public.whatsapp_client_outbox(to_jid,message,status,attempt_count,next_attempt_at,dedupe_key,source,event_key,priority,recipient_group,template_key,created_at,updated_at)
      values(v_jid,
        '✅ *LAND VIEW — PAYMENT RECEIVED*'||E'\n'||'*File ID:* '||proj.project_code||E'\n'||'*Receipt:* '||v_receipt.receipt_code||E'\n'||
        '*Amount:* BDT '||to_char(coalesce(pay.amount,0),'FM999G999G999G990D00')||E'\n'||'*Date:* '||coalesce(to_char(pay.payment_date,'DD Mon YYYY'),'')||E'\n\n'||
        'Verify / view receipt:'||E'\n'||'https://app.landview.com.bd'||v_receipt.receipt_path,
        'pending',0,now(),'billing-payment:'||pay.payment_code,'billing','client.payment_received','routine','client','client.payment_received',now(),now())
      on conflict(dedupe_key) do nothing;
    end if;
  end if;

  return jsonb_build_object('paymentCode',pay.payment_code,'amount',pay.amount,'allocated',round(v_allocated,2),'unallocated',round(greatest(0,v_remaining),2),'receiptCode',v_receipt.receipt_code,'receiptPath',v_receipt.receipt_path,'invoiceCount',v_count);
end;
$$;
revoke all on function public.billing_v2_reconcile_payment(text,text,boolean) from public,anon,authenticated;
grant execute on function public.billing_v2_reconcile_payment(text,text,boolean) to service_role;

create or replace function public.billing_v2_payment_lifecycle_trigger()
returns trigger language plpgsql security invoker set search_path to 'public'
as $$ declare v_status text; v_actor text; begin
  if new.project_id is null or new.affects_business_balance is false or lower(coalesce(new.transaction_type,''))='personal income' then return new; end if;
  v_status:=lower(regexp_replace(coalesce(new.approval_status,new.status,''),'[_-]+',' ','g'));
  if v_status<>'' and v_status not in ('approved','pre approved','received','paid','verified','complete','completed','full paid','fully paid','posted') then return new; end if;
  v_actor:=coalesce(nullif(new.source_created_by,''),nullif(new.received_by,''),'LAND VIEW');
  perform public.billing_v2_reconcile_payment(new.payment_code,v_actor,true);
  return new;
end; $$;
revoke all on function public.billing_v2_payment_lifecycle_trigger() from public,anon,authenticated;
grant execute on function public.billing_v2_payment_lifecycle_trigger() to service_role;

drop trigger if exists billing_v2_payment_lifecycle_sync on public.payments;
create trigger billing_v2_payment_lifecycle_sync
after insert or update of project_id,amount,income_category,payment_for,service_type,approval_status,status,payment_date,payment_method,deposit_account,reference_no,notes
on public.payments for each row execute function public.billing_v2_payment_lifecycle_trigger();

create or replace function public.billing_v2_service_allocation_reconcile_trigger()
returns trigger language plpgsql security invoker set search_path to 'public'
as $$ declare v_code text; v_actor text; begin
  v_code:=case when tg_op='DELETE' then old.payment_code else new.payment_code end;
  v_actor:=case when tg_op='DELETE' then coalesce(old.created_by,'LAND VIEW') else coalesce(new.created_by,'LAND VIEW') end;
  if coalesce(v_code,'')<>'' then perform public.billing_v2_reconcile_payment(v_code,v_actor,false); end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
revoke all on function public.billing_v2_service_allocation_reconcile_trigger() from public,anon,authenticated;
grant execute on function public.billing_v2_service_allocation_reconcile_trigger() to service_role;

drop trigger if exists billing_v2_service_allocation_reconcile on public.payment_service_allocations;
create trigger billing_v2_service_allocation_reconcile after insert or update or delete on public.payment_service_allocations
for each row execute function public.billing_v2_service_allocation_reconcile_trigger();

create or replace function public.billing_v2_payment_receipt_snapshot_trigger()
returns trigger language plpgsql security invoker set search_path to 'public'
as $$ begin
  update public.payments
  set invoice_allocated_amount=coalesce(new.allocated_amount,0),
      invoice_unallocated_amount=coalesce(new.unallocated_amount,0),
      invoice_allocation_status=case when coalesce(new.unallocated_amount,0)<=0.009 and coalesce(new.allocated_amount,0)>0.009 then 'Allocated'
                                     when coalesce(new.allocated_amount,0)>0.009 then 'Partially Allocated' else 'Unallocated' end,
      receipt_url=coalesce(new.receipt_path,receipt_url),updated_at=now()
  where id=new.payment_id;
  return new;
end; $$;
revoke all on function public.billing_v2_payment_receipt_snapshot_trigger() from public,anon,authenticated;
grant execute on function public.billing_v2_payment_receipt_snapshot_trigger() to service_role;

drop trigger if exists billing_v2_payment_receipt_snapshot_sync on public.payment_receipts;
create trigger billing_v2_payment_receipt_snapshot_sync
after insert or update of allocated_amount,unallocated_amount,receipt_path on public.payment_receipts
for each row execute function public.billing_v2_payment_receipt_snapshot_trigger();

create or replace function public.billing_v2_invoice_item_apply_advances_trigger()
returns trigger language plpgsql security invoker set search_path to 'public'
as $$ declare v_project uuid; r record; begin
  select project_id into v_project from public.invoices where id=new.invoice_id;
  if v_project is null then return new; end if;
  for r in
    select payment_code from public.payments
    where project_id=v_project and coalesce(invoice_unallocated_amount,0)>0.009
      and coalesce(affects_business_balance,true)=true and lower(coalesce(transaction_type,''))<>'personal income'
      and lower(regexp_replace(coalesce(approval_status,status,''),'[_-]+',' ','g')) in ('','approved','pre approved','received','paid','verified','complete','completed','full paid','fully paid','posted')
    order by payment_date,created_at,id
  loop
    perform public.billing_v2_reconcile_payment(r.payment_code,'Advance Auto Allocation',false);
  end loop;
  return new;
end; $$;
revoke all on function public.billing_v2_invoice_item_apply_advances_trigger() from public,anon,authenticated;
grant execute on function public.billing_v2_invoice_item_apply_advances_trigger() to service_role;

drop trigger if exists billing_v2_invoice_item_apply_advances on public.invoice_items;
create trigger billing_v2_invoice_item_apply_advances
after insert or update of service_key,billing_category,net_amount on public.invoice_items
for each row execute function public.billing_v2_invoice_item_apply_advances_trigger();

-- Silent, non-destructive backfill. Existing bill/payment/ledger rows are not rewritten.
do $$ declare r record; begin
  for r in select id from public.bills where lower(coalesce(status,'')) not in ('void','voided','cancelled','canceled','rejected') order by created_at,id loop
    perform public.billing_v2_create_invoice_for_bill(r.id,false);
  end loop;
end $$;

do $$ declare r record; begin
  for r in
    select payment_code from public.payments
    where project_id is not null and coalesce(affects_business_balance,true)=true
      and lower(coalesce(transaction_type,''))<>'personal income'
      and lower(regexp_replace(coalesce(approval_status,status,''),'[_-]+',' ','g')) in ('','approved','pre approved','received','paid','verified','complete','completed','full paid','fully paid','posted')
    order by payment_date,created_at,id
  loop
    begin
      perform public.billing_v2_reconcile_payment(r.payment_code,'System Reconcile',false);
    exception when others then
      raise notice 'Billing lifecycle reconcile skipped payment %: %',r.payment_code,sqlerrm;
    end;
  end loop;
end $$;
