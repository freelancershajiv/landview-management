-- NULL preserves historical reconciliation. An empty array is an intentional advance.
-- A bill payment stores its exact bill IDs and amounts before the receipt is issued.
alter table public.payments add column if not exists billing_bill_targets jsonb;

-- The optional payment is being allocated in this transaction. Its as-yet-unapplied cash
-- must not reduce the amount available to itself. Other receipts still reduce collectible due.
create or replace function public.billing_collectible_by_category(p_project_id uuid, p_reserve_payment_id uuid)
returns numeric[] language plpgsql stable set search_path to 'public'
as $$
declare
  v_inactive text[] := array['draft','cancelled','canceled','void','voided','rejected','returned'];
  v_due numeric[];
  v_preferred numeric[];
  v_reduction numeric;
  v_applied numeric;
  v_index integer;
begin
  with project_payments as (
    select p.*, (
      public.billing_receivable_status(p.transaction_type)<>'personal income'
      and (p.affects_business_balance is distinct from false or p.is_legacy_manual is true)
      and public.billing_receivable_status(p.status)<>all(v_inactive)
      and public.billing_receivable_status(p.approval_status)<>all(v_inactive)
      and coalesce(nullif(public.billing_receivable_status(p.approval_status),''),public.billing_receivable_status(p.status))
        in ('','approved','received','paid','verified','complete','completed','full paid','fully paid','posted')
    ) as effective
    from public.payments p where p.project_id=p_project_id
  ), project_bills as (
    select * from public.bills where project_id=p_project_id
  ), active_invoices as (
    select id, trim(bill_code) as bill_code from public.invoices where project_id=p_project_id
      and public.billing_receivable_status(status)<>all(v_inactive)
  ), active_allocations as (
    select a.invoice_id,a.payment_id,greatest(0,a.allocated_amount) as amount
    from public.payment_invoice_allocations a
    join active_invoices i on i.id=a.invoice_id
    left join project_payments p on p.id=a.payment_id
    where a.project_id=p_project_id and (p.id is null or p.effective)
  ), invoice_paid as (
    select i.bill_code, sum(a.amount) as paid
    from active_allocations a join active_invoices i on i.id=a.invoice_id
    group by i.bill_code
  ), payment_applied as (
    select payment_id,sum(amount) as paid from active_allocations group by payment_id
  ), adjustments as (
    select coalesce(nullif(trim(a.bill_code),''),trim(b.bill_code)) as bill_code,
      sum(case public.billing_receivable_status(a.adjustment_type)
        when 'debit note' then greatest(0,a.amount)
        when 'credit note' then -greatest(0,a.amount)
        else 0 end) as net
    from public.billing_adjustments a left join project_bills b on b.id=a.bill_id
    where a.project_id=p_project_id and public.billing_receivable_status(a.status)<>all(v_inactive)
    group by 1
  ), bill_amounts as (
    select public.billing_receivable_category(coalesce(nullif(b.billing_category,''),b.category)) as category,
      public.billing_receivable_status(b.status) in ('paid','full paid','fully paid','settled','complete','completed') as settled,
      greatest(0,greatest(0,coalesce(b.net_amount,coalesce(b.amount,0)-coalesce(b.discount,0)))+coalesce(a.net,0)) as net,
      coalesce(i.paid,0) as paid
    from project_bills b
    left join adjustments a on a.bill_code=trim(b.bill_code) and nullif(trim(b.bill_code),'') is not null
    left join invoice_paid i on i.bill_code=trim(b.bill_code) and nullif(trim(b.bill_code),'') is not null
    where public.billing_receivable_status(b.status)<>all(v_inactive)
      and lower(coalesce(b.created_via,'')) not like '%credit note%'
      and lower(coalesce(b.created_via,'')) not like '%debit note%'
  ), bills_by_category as (
    select category,sum(net) as billed,
      sum(case when settled or net-paid<=0.009 then 0 else net-paid end) as due
    from bill_amounts group by category
  ), payments_by_category as (
    select public.billing_receivable_category(coalesce(nullif(p.income_category,''),p.payment_for)) as category,
      sum(greatest(0,p.amount)) as paid,
      sum(case when p.billing_service_targeted is true or p.id=p_reserve_payment_id then 0 else greatest(0,p.amount-coalesce(a.paid,0)) end) as available,
      sum(case when p.billing_service_targeted is true or p.id=p_reserve_payment_id then greatest(0,p.amount-coalesce(a.paid,0)) else 0 end) as reserved
    from project_payments p left join payment_applied a on a.payment_id=p.id
    where p.effective group by 1
  ), writeoffs_by_category as (
    select public.billing_receivable_category(billing_category) as category,
      greatest(0,sum(case replace(public.billing_receivable_status(event_type),' ','_')
        when 'write_off' then abs(amount) when 'recovery' then -abs(amount) else 0 end)) as written
    from public.billing_writeoff_log where project_id=p_project_id group by 1
  ), figures as (
    select c.category,greatest(0,coalesce(b.due,0)-coalesce(w.written,0)) as collectible,
      coalesce(p.available,0) as available,
      coalesce(b.billed,0)-coalesce(p.paid,0)+coalesce(p.reserved,0)-coalesce(w.written,0) as project_balance
    from generate_series(1,3) c(category)
    left join bills_by_category b on b.category=c.category
    left join payments_by_category p on p.category=c.category
    left join writeoffs_by_category w on w.category=c.category
  )
  select array_agg(collectible order by category),array_agg(available order by category),
    greatest(0,sum(collectible)-greatest(0,sum(project_balance)))
  into v_due,v_preferred,v_reduction
  from figures;

  for v_index in 1..3 loop
    exit when v_reduction<=0.009;
    v_applied:=least(v_due[v_index],v_preferred[v_index],v_reduction);
    v_due[v_index]:=v_due[v_index]-v_applied;
    v_reduction:=v_reduction-v_applied;
  end loop;
  for v_index in select i from generate_series(1,3) i order by v_due[i] desc,i loop
    exit when v_reduction<=0.009;
    v_applied:=least(v_due[v_index],v_reduction);
    v_due[v_index]:=v_due[v_index]-v_applied;
    v_reduction:=v_reduction-v_applied;
  end loop;
  return v_due;
end;
$$;


create or replace function public.billing_collectible_by_category(p_project_id uuid)
returns numeric[] language sql stable set search_path to 'public'
as $$ select public.billing_collectible_by_category(p_project_id,null::uuid) $$;
revoke all on function public.billing_collectible_by_category(uuid,uuid) from public,anon,authenticated;
grant execute on function public.billing_collectible_by_category(uuid,uuid) to service_role;

create or replace function public.billing_apply_bill_targets(pay public.payments, p_project_code text, p_actor text)
returns numeric language plpgsql security invoker set search_path to 'public'
as $$
declare
  v_targeted boolean := jsonb_array_length(pay.billing_bill_targets)>0;
  v_category integer := public.billing_receivable_category(pay.income_category);
  v_allocated numeric;
  v_budget numeric;
  v_cap numeric;
  v_relief numeric;
  v_due numeric;
  v_take numeric;
  line record;
  v_closed text[] := array['draft','void','voided','cancelled','canceled','adjusted','rejected','returned','paid','full paid','fully paid','settled','complete','completed'];
begin
  select coalesce(sum(a.allocated_amount),0) into v_allocated
  from public.payment_invoice_allocations a where a.payment_id=pay.id;

  if v_allocated>pay.amount or (v_targeted and pay.amount<>(select sum(t.amount) from jsonb_to_recordset(pay.billing_bill_targets) t(amount numeric))) then
    raise exception 'Payment amount conflicts with existing bill allocations.';
  end if;
  if v_allocated=pay.amount then return v_allocated; end if;
  v_cap:=(public.billing_collectible_by_category(pay.project_id,pay.id))[v_category];
  v_budget:=least(pay.amount-v_allocated,v_cap);
  if v_targeted and v_budget<pay.amount-v_allocated then
    raise exception 'Collectible balance changed. Refresh the project before receiving this payment.';
  end if;

  if v_budget<=0 then return v_allocated; end if;

  for line in
    with locked as materialized (
    select i.id as invoice_id,i.invoice_code,i.category,i.amount as invoice_amount,i.created_at,i.issue_date,
      ii.bill_id,b.bill_code,ii.service_name,ii.service_key,b.net_amount as bill_net,t.amount as requested
    from public.bills b
    join public.invoice_items ii on ii.bill_id=b.id
    join public.invoices i on i.id=ii.invoice_id and i.project_id=b.project_id and i.bill_code=b.bill_code
    left join jsonb_to_recordset(pay.billing_bill_targets) t(bill_id uuid,amount numeric) on t.bill_id=b.id
    where b.project_id=pay.project_id and (not v_targeted or t.bill_id is not null)
      and public.billing_receivable_category(coalesce(nullif(b.billing_category,''),b.category))=v_category
      and public.billing_receivable_category(i.category)=v_category
      and public.billing_receivable_status(b.status)<>all(v_closed) and public.billing_receivable_status(i.status)<>all(v_closed)
      and lower(coalesce(b.created_via,'')) not like '%credit note%' and lower(coalesce(b.created_via,'')) not like '%debit note%'
    order by i.issue_date nulls first,i.created_at,i.id,ii.id
    for update of b,i
    ), balances as (
      select l.*,greatest(0,least(l.invoice_amount,l.bill_net+coalesce(adj.net,0))-alloc.paid) as bill_due,alloc.own
      from locked l
      cross join lateral (
        select coalesce(sum(a.allocated_amount),0) as paid,
          coalesce(sum(a.allocated_amount) filter(where a.payment_id=pay.id),0) as own
        from public.payment_invoice_allocations a where a.invoice_id=l.invoice_id
      ) alloc
      cross join lateral (
        select sum(case public.billing_receivable_status(d.adjustment_type)
          when 'credit note' then -greatest(0,d.amount) when 'debit note' then greatest(0,d.amount) else 0 end) as net
        from public.billing_adjustments d where d.project_id=pay.project_id
          and coalesce(nullif(trim(d.bill_code),''),case when d.bill_id=l.bill_id then l.bill_code end)=l.bill_code
          and public.billing_receivable_status(d.status) not in ('draft','void','voided','cancelled','canceled','rejected','returned')
      ) adj
    )
    select balances.*,sum(bill_due) over () as total_open from balances
    order by issue_date nulls first,created_at,invoice_id
  loop
    exit when v_budget<=0;
    v_due:=line.bill_due;
    if not v_targeted then
      -- Apply category relief to oldest open balances before using any of this advance.
      v_relief:=coalesce(v_relief,greatest(0,line.total_open-v_cap));
      v_due:=greatest(0,line.bill_due-v_relief);
      v_relief:=greatest(0,v_relief-line.bill_due);
    end if;
    v_take:=least(v_budget,v_due);
    if v_targeted then
      if line.requested-line.own>v_take then raise exception 'Selected bill changed. Refresh bill % before receiving payment.',line.bill_code; end if;
      v_take:=line.requested-line.own;
    end if;
    if v_take<=0 then continue; end if;
    insert into public.payment_invoice_allocations as existing
      (payment_id,payment_code,invoice_id,invoice_code,bill_id,bill_code,project_id,project_code,service_name,service_key,billing_category,allocated_amount,created_by,created_at)
    values(pay.id,pay.payment_code,line.invoice_id,line.invoice_code,line.bill_id,line.bill_code,pay.project_id,p_project_code,
      line.service_name,line.service_key,line.category,v_take,p_actor,now())
    on conflict (payment_id,invoice_id,bill_id) do update set allocated_amount=existing.allocated_amount+excluded.allocated_amount;
    v_allocated:=v_allocated+v_take;
    v_budget:=v_budget-v_take;
  end loop;
  if v_targeted and v_allocated<>pay.amount then raise exception 'Selected bill changed. The full payment could not be applied.'; end if;
  return v_allocated;
end;
$$;
revoke all on function public.billing_apply_bill_targets(public.payments,text,text) from public,anon,authenticated;
grant execute on function public.billing_apply_bill_targets(public.payments,text,text) to service_role;

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

  if pay.billing_bill_targets is not null and not v_has_correction then
    perform 1 from public.projects where id=pay.project_id for update;
    v_allocated:=public.billing_apply_bill_targets(pay,proj.project_code,p_actor);
    v_remaining:=pay.amount-v_allocated;
  elsif v_has_correction then
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
  v_targets jsonb;
  v_target_count integer;
  v_category integer;
  v_cap numeric;
  v_lines uuid[];
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

  v_targets := v_input.billing_bill_targets;
  if v_targets is not null then
    if jsonb_typeof(v_targets)<>'array' or v_input.project_id is null
       or v_input.amount is null or v_input.amount<=0 or v_input.amount<>round(v_input.amount,2)
       or lower(coalesce(v_input.income_category,'')) not in ('engineering bill','other services bill','supervision bill')
       or lower(coalesce(v_input.transaction_type,''))='personal income' or v_input.affects_business_balance is false
       or jsonb_array_length(coalesce(p_service_allocations,'[]'))>0 then
      raise exception 'Invalid bill payment instructions.';
    end if;
    perform 1 from public.projects where id=v_input.project_id for update;
    if not found then raise exception 'Payment project was not found.'; end if;
    v_category:=public.billing_receivable_category(v_input.income_category);
    v_target_count:=jsonb_array_length(v_targets);
    if v_target_count>0 then
      if (select count(distinct t.bill_id)<>v_target_count or coalesce(sum(t.amount),0)<>v_input.amount
          or bool_or(t.amount is null or t.amount<=0 or t.amount<>round(t.amount,2))
          from jsonb_to_recordset(v_targets) t(bill_id uuid,amount numeric))
          or (v_category<>1 and v_target_count<>1) then
        raise exception 'Invalid bill allocations. Select distinct bills and allocate the full payment.';
      end if;
      -- Use the same lock order for a split receipt, regardless of the form's row order.
      select array_agg(locked.id) into v_lines from (
        select b.id from jsonb_to_recordset(v_targets) t(bill_id uuid)
        join public.bills b on b.id=t.bill_id and b.project_id=v_input.project_id
        join public.invoice_items ii on ii.bill_id=b.id
        join public.invoices i on i.id=ii.invoice_id and i.project_id=b.project_id and i.bill_code=b.bill_code
        where public.billing_receivable_category(coalesce(nullif(b.billing_category,''),b.category))=v_category
          and public.billing_receivable_category(i.category)=v_category
          and public.billing_receivable_status(i.status) not in ('draft','void','voided','cancelled','canceled','adjusted','rejected','returned','paid','full paid','fully paid','settled','complete','completed')
        order by b.id,i.id for update of b,i,ii
      ) locked;
      if coalesce(cardinality(v_lines),0)<>v_target_count or (select count(distinct id) from unnest(v_lines) id)<>v_target_count then raise exception 'Selected bill changed. Refresh the project balance.'; end if;
      v_cap := (public.billing_collectible_by_category(v_input.project_id))[v_category];
      if v_input.amount>v_cap then raise exception 'Collectible balance changed. Current category balance is %.',v_cap; end if;
    end if;
  end if;

  v_previous_stage := current_setting('landview.staged_payment',true);
  perform set_config('landview.staged_payment',v_input.payment_code,true);
  insert into public.payments (
    payment_code,project_id,payment_date,amount,payment_method,reference_no,notes,deposit_account,
    payment_for,income_category,transaction_type,affects_business_balance,received_from,received_by,
    receipt_url,approval_status,approved_by,approved_at,reviewed_by,reviewed_at,idempotency_key,status,
    source_created_by,source_created_at,service_type,finance_scope,billing_request_fingerprint,billing_service_targeted,billing_bill_targets
  ) values (
    v_input.payment_code,v_input.project_id,v_input.payment_date,v_input.amount,v_input.payment_method,v_input.reference_no,v_input.notes,v_input.deposit_account,
    v_input.payment_for,v_input.income_category,v_input.transaction_type,v_input.affects_business_balance,v_input.received_from,v_input.received_by,
    v_input.receipt_url,v_input.approval_status,v_input.approved_by,v_input.approved_at,v_input.reviewed_by,v_input.reviewed_at,v_input.idempotency_key,v_input.status,
    v_input.source_created_by,v_input.source_created_at,v_input.service_type,coalesce(v_input.finance_scope,'main'),p_fingerprint,
    case when v_targets is not null then v_target_count>0 else nullif(trim(v_input.service_type),'') is not null or jsonb_array_length(p_service_allocations)>0 end,
    v_targets
  ) returning * into v_payment;

  if v_category=1 and v_target_count>0 then
    -- Workflow totals are per service. The receipt keeps the individual bill IDs.
    insert into public.payment_service_allocations (
      payment_id,payment_code,project_id,project_code,billing_category,service_name,service_key,
      bill_id,bill_code,allocated_amount,discount_allocated,created_by,created_at
    )
    select v_payment.id,v_payment.payment_code,v_payment.project_id,p.project_code,'Engineering Bill',
      min(ii.service_name),ii.service_key,
      case when count(*)=1 then (array_agg(ii.bill_id))[1] end,
      case when count(*)=1 then min(ii.bill_code) end,sum(t.amount),0,v_payment.source_created_by,now()
    from jsonb_to_recordset(v_targets) t(bill_id uuid,amount numeric)
    join public.invoice_items ii on ii.bill_id=t.bill_id
    join public.invoices i on i.id=ii.invoice_id and i.project_id=v_payment.project_id
    join public.projects p on p.id=i.project_id
    where public.billing_receivable_category(i.category)=v_category and i.bill_code=ii.bill_code
      and public.billing_receivable_status(i.status) not in ('draft','void','voided','cancelled','canceled','adjusted','rejected','returned','paid','full paid','fully paid','settled','complete','completed')
    group by p.project_code,ii.service_key;
  end if;

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
