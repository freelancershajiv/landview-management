-- Keep service-targeted receipts within their selected services.
alter table public.payment_invoice_allocations
  add column if not exists manually_reassigned boolean not null default false;
alter table public.payments
  add column if not exists billing_request_fingerprint text,
  add column if not exists billing_service_targeted boolean not null default false;

create or replace function public.billing_mark_reassigned_allocation()
returns trigger language plpgsql set search_path to 'public'
as $$
begin
  if new.invoice_id is distinct from old.invoice_id then
    new.manually_reassigned := true;
  end if;
  return new;
end;
$$;
revoke all on function public.billing_mark_reassigned_allocation() from public,anon,authenticated;
grant execute on function public.billing_mark_reassigned_allocation() to service_role;
drop trigger if exists billing_mark_reassigned_allocation on public.payment_invoice_allocations;
create trigger billing_mark_reassigned_allocation
before update of invoice_id on public.payment_invoice_allocations
for each row execute function public.billing_mark_reassigned_allocation();

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
  v_service_key text; v_category text;
  v_allocated numeric := 0; v_count integer := 0; v_single_invoice uuid;
  v_receipt public.payment_receipts%rowtype; v_jid text;
  v_has_service_allocations boolean; v_has_correction boolean;
begin
  select * into pay from public.payments where payment_code=p_payment_code for update;
  if not found then raise exception 'Payment % was not found.',p_payment_code; end if;
  if pay.project_id is null then raise exception 'Only project payments can be reconciled.'; end if;
  select * into proj from public.projects where id=pay.project_id;
  if not found then raise exception 'Payment project was not found.'; end if;

  v_remaining := greatest(0,coalesce(pay.amount,0));
  v_category := coalesce(pay.income_category,pay.payment_for,'Engineering Bill');

  select exists (
    select 1 from public.payment_invoice_allocations a
    where a.payment_id=pay.id and (
      a.manually_reassigned or exists (
        select 1 from public.app_audit_log l
        where l.action='billing.allocation.correction.applied'
          and l.target=proj.project_code
          and l.details->>'allocationId'=a.id::text
      )
    )
  ) into v_has_correction;

  if v_has_correction then
    select coalesce(sum(allocated_amount),0) into v_allocated
    from public.payment_invoice_allocations where payment_id=pay.id;
    if v_allocated>v_remaining+0.009 then
      raise exception 'Payment amount cannot be reduced below its approved allocations.';
    end if;
    v_remaining:=greatest(0,v_remaining-v_allocated);
  else
    delete from public.payment_invoice_allocations where payment_id=pay.id;
    select exists (select 1 from public.payment_service_allocations where payment_id=pay.id)
      into v_has_service_allocations;

    v_service_key := public.billing_v2_service_key(public.billing_v2_canonical_service_name(pay.service_type));
    for sa in
      select psa.service_key, psa.allocated_amount, false as category_only, psa.created_at, psa.id
      from public.payment_service_allocations psa where psa.payment_id=pay.id
      union all
      select v_service_key, v_remaining, nullif(trim(pay.service_type),'') is null, null, null
      where not v_has_service_allocations
      order by created_at,id
    loop
      v_segment := least(greatest(0,coalesce(sa.allocated_amount,0)),v_remaining);
      if v_segment<=0.009 then continue; end if;
      for inv in
        select i.id invoice_id,i.invoice_code,i.bill_code,i.category,ii.bill_id,ii.service_name,ii.service_key
        from public.invoices i join public.invoice_items ii on ii.invoice_id=i.id
        where i.project_id=pay.project_id
          and ((sa.category_only and lower(coalesce(i.category,''))=lower(v_category))
            or (not sa.category_only and ii.service_key=sa.service_key))
          and lower(coalesce(i.status,'')) not in ('void','voided','cancelled','canceled','draft','adjusted','rejected','returned')
        order by i.issue_date nulls first,i.created_at,i.id,ii.id
      loop
        exit when v_segment<=0.009 or v_remaining<=0.009;
        -- Another payment may have filled this invoice while this transaction waited.
        select coalesce(i.amount,0) into v_due
        from public.invoices i where i.id=inv.invoice_id
          and lower(coalesce(i.status,'')) not in ('void','voided','cancelled','canceled','draft','adjusted','rejected','returned')
        for update;
        if not found then continue; end if;
        select greatest(0,v_due-coalesce(sum(a.allocated_amount),0)) into v_due
        from public.payment_invoice_allocations a where a.invoice_id=inv.invoice_id;
        if v_due<=0.009 then continue; end if;
        v_take:=least(v_segment,v_due,v_remaining);
        insert into public.payment_invoice_allocations(payment_id,payment_code,invoice_id,invoice_code,bill_id,bill_code,project_id,project_code,service_name,service_key,billing_category,allocated_amount,created_by,created_at)
        values(pay.id,pay.payment_code,inv.invoice_id,inv.invoice_code,inv.bill_id,inv.bill_code,pay.project_id,proj.project_code,inv.service_name,inv.service_key,inv.category,v_take,p_actor,now());
        v_segment:=v_segment-v_take; v_remaining:=v_remaining-v_take; v_allocated:=v_allocated+v_take;
        perform public.billing_v2_refresh_invoice(inv.invoice_id);
      end loop;
    end loop;
  end if;

  select count(*),(array_agg(invoice_id order by created_at))[1] into v_count,v_single_invoice
  from public.payment_invoice_allocations where payment_id=pay.id;
  update public.payments
  set invoice_id=case when v_count=1 then v_single_invoice else null end,
      invoice_allocated_amount=round(v_allocated,2),
      invoice_unallocated_amount=round(greatest(0,v_remaining),2),
      invoice_allocation_status=case when v_allocated<=0.009 then 'Unallocated'
        when v_remaining<=0.009 then 'Allocated' else 'Partially Allocated' end,
      updated_at=now()
  where id=pay.id;

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
  if new.payment_code=current_setting('landview.staged_payment',true) then return new; end if;
  if lower(regexp_replace(coalesce(new.status,''),'[_-]+',' ','g'))
     in ('draft','void','voided','cancelled','canceled','rejected','returned') then return new; end if;
  if new.project_id is null or new.affects_business_balance is false or lower(coalesce(new.transaction_type,''))='personal income' then return new; end if;
  v_status:=lower(regexp_replace(coalesce(new.approval_status,new.status,''),'[_-]+',' ','g'));
  if v_status<>'' and v_status not in ('approved','pre approved','received','paid','verified','complete','completed','full paid','fully paid','posted') then return new; end if;
  v_actor:=coalesce(nullif(new.source_created_by,''),nullif(new.received_by,''),'LAND VIEW');
  perform public.billing_v2_reconcile_payment(new.payment_code,v_actor,true);
  return new;
end; $$;
revoke all on function public.billing_v2_payment_lifecycle_trigger() from public,anon,authenticated;
grant execute on function public.billing_v2_payment_lifecycle_trigger() to service_role;

create or replace function public.billing_v2_service_allocation_reconcile_trigger()
returns trigger language plpgsql security invoker set search_path to 'public'
as $$ declare v_code text; v_actor text; begin
  v_code:=case when tg_op='DELETE' then old.payment_code else new.payment_code end;
  v_actor:=case when tg_op='DELETE' then coalesce(old.created_by,'LAND VIEW') else coalesce(new.created_by,'LAND VIEW') end;
  if coalesce(v_code,'')<>'' and v_code is distinct from current_setting('landview.staged_payment',true) then perform public.billing_v2_reconcile_payment(v_code,v_actor,false); end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
revoke all on function public.billing_v2_service_allocation_reconcile_trigger() from public,anon,authenticated;
grant execute on function public.billing_v2_service_allocation_reconcile_trigger() to service_role;

-- Use one transaction for the payment, service instructions, invoice allocations and receipt.
create or replace function public.billing_record_payment(
  p_payment jsonb, p_service_allocations jsonb, p_fingerprint text
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_input public.payments%rowtype;
  v_payment public.payments%rowtype;
  v_service record;
  v_status text;
  v_previous_stage text;
begin
  v_input := jsonb_populate_record(null::public.payments,p_payment);
  if nullif(v_input.idempotency_key,'') is null or nullif(p_fingerprint,'') is null then
    raise exception 'Payment submission key is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('billing-payment:'||v_input.idempotency_key,0));
  select * into v_payment from public.payments where idempotency_key=v_input.idempotency_key;
  if found then
    if v_payment.billing_request_fingerprint is distinct from p_fingerprint then
      raise exception 'This submission key belongs to another or older payment. Review the existing receipt before retrying.';
    end if;
    return to_jsonb(v_payment);
  end if;

  v_previous_stage := current_setting('landview.staged_payment',true);
  perform set_config('landview.staged_payment',v_input.payment_code,true);
  insert into public.payments (
    payment_code,project_id,payment_date,amount,payment_method,reference_no,notes,deposit_account,
    payment_for,income_category,transaction_type,affects_business_balance,received_from,received_by,
    receipt_url,approval_status,approved_by,approved_at,reviewed_by,reviewed_at,idempotency_key,status,
    source_created_by,source_created_at,service_type,finance_scope,billing_request_fingerprint,billing_service_targeted
  ) values (
    v_input.payment_code,v_input.project_id,v_input.payment_date,v_input.amount,v_input.payment_method,v_input.reference_no,v_input.notes,v_input.deposit_account,
    v_input.payment_for,v_input.income_category,v_input.transaction_type,v_input.affects_business_balance,v_input.received_from,v_input.received_by,
    v_input.receipt_url,v_input.approval_status,v_input.approved_by,v_input.approved_at,v_input.reviewed_by,v_input.reviewed_at,v_input.idempotency_key,v_input.status,
    v_input.source_created_by,v_input.source_created_at,v_input.service_type,coalesce(v_input.finance_scope,'main'),p_fingerprint,
    nullif(trim(v_input.service_type),'') is not null or jsonb_array_length(p_service_allocations)>0
  ) returning * into v_payment;

  for v_service in
    select * from jsonb_to_recordset(p_service_allocations)
      as item(service_name text,service_key text,allocated_amount numeric,discount_allocated numeric)
  loop
    insert into public.payment_service_allocations (
      payment_id,payment_code,project_id,project_code,billing_category,service_name,service_key,
      allocated_amount,discount_allocated,created_by,created_at
    ) select v_payment.id,v_payment.payment_code,v_payment.project_id,p.project_code,'Engineering Bill',
      v_service.service_name,v_service.service_key,v_service.allocated_amount,v_service.discount_allocated,v_payment.source_created_by,now()
    from public.projects p where p.id=v_payment.project_id;
  end loop;

  perform set_config('landview.staged_payment',coalesce(v_previous_stage,''),true);
  v_status:=lower(regexp_replace(coalesce(v_payment.approval_status,v_payment.status,''),'[_-]+',' ','g'));
  if v_payment.project_id is not null and v_payment.affects_business_balance is distinct from false
     and lower(coalesce(v_payment.transaction_type,''))<>'personal income'
     and lower(regexp_replace(coalesce(v_payment.status,''),'[_-]+',' ','g'))
       not in ('draft','void','voided','cancelled','canceled','rejected','returned')
     and v_status in ('','approved','pre approved','received','paid','verified','complete','completed','full paid','fully paid','posted') then
    perform public.billing_v2_reconcile_payment(v_payment.payment_code,v_payment.source_created_by,true);
  end if;
  select * into v_payment from public.payments where id=v_payment.id;
  return to_jsonb(v_payment);
end;
$$;
revoke all on function public.billing_record_payment(jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.billing_record_payment(jsonb,jsonb,text) to service_role;
