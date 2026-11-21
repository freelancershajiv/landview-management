-- Keep this transaction-side balance in parity with loadReceivableAuthority.
create or replace function public.billing_receivable_status(p_value text)
returns text language sql immutable set search_path to 'public'
as $$
  select regexp_replace(regexp_replace(lower(trim(coalesce(p_value,''))), '[_-]+',' ','g'), '\s+',' ','g')
$$;

create or replace function public.billing_receivable_category(p_value text)
returns integer language sql immutable set search_path to 'public'
as $$
  select case when public.billing_receivable_status(p_value) like '%supervision%' then 2
              when public.billing_receivable_status(p_value) ~ '(other|soil|survey|municipality|file pass)' then 3
              else 1 end
$$;

create or replace function public.billing_collectible_by_category(p_project_id uuid)
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
      sum(case when p.billing_service_targeted is true then 0 else greatest(0,p.amount-coalesce(a.paid,0)) end) as available,
      sum(case when p.billing_service_targeted is true then greatest(0,p.amount-coalesce(a.paid,0)) else 0 end) as reserved
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

revoke all on function public.billing_receivable_status(text),public.billing_receivable_category(text),public.billing_collectible_by_category(uuid) from public,anon,authenticated;
grant execute on function public.billing_receivable_status(text),public.billing_receivable_category(text),public.billing_collectible_by_category(uuid) to service_role;

create or replace function public.apply_billing_writeoff(
  p_project_code text,
  p_category text,
  p_amount numeric,
  p_writeoff_date date,
  p_reason text,
  p_notes text,
  p_created_by text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_project_id uuid;
  v_category text;
  v_amount numeric := coalesce(p_amount,0);
  v_due numeric := 0;
  v_code text;
  v_existing public.billing_writeoff_log%rowtype;
begin
  if v_amount <= 0 or v_amount <> round(v_amount,2) then raise exception 'Write-off amount must be greater than zero and use up to two decimal places.'; end if;
  if coalesce(trim(p_idempotency_key),'')='' then raise exception 'A valid idempotency key is required.'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Write-off reason is required.'; end if;
  if coalesce(trim(p_notes),'')='' then raise exception 'Write-off note is required.'; end if;

  select id into v_project_id from public.projects where upper(project_code)=upper(trim(p_project_code)) limit 1;
  if v_project_id is null then raise exception 'Project not found.'; end if;

  v_category := case lower(trim(p_category))
    when 'engineering bill' then 'Engineering Bill' when 'engineering' then 'Engineering Bill' when 'design bill' then 'Engineering Bill'
    when 'supervision bill' then 'Supervision Bill' when 'supervision' then 'Supervision Bill'
    when 'other services bill' then 'Other Services Bill' when 'others bill' then 'Other Services Bill' when 'other services' then 'Other Services Bill' when 'others' then 'Other Services Bill'
    else null end;
  if v_category is null then raise exception 'Invalid write-off category.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('billing-writeoff:'||p_idempotency_key,0));
  perform 1 from public.projects where id=v_project_id for update;

  select * into v_existing from public.billing_writeoff_log where idempotency_key=p_idempotency_key limit 1;
  if found then
    if v_existing.project_id is distinct from v_project_id or v_existing.billing_category is distinct from v_category
      or v_existing.event_type is distinct from 'write_off' or v_existing.amount is distinct from v_amount then
      raise exception 'This submission key belongs to another write-off or recovery.';
    end if;
    return jsonb_build_object('writeoffCode',v_existing.writeoff_code,'projectId',p_project_code,'category',v_existing.billing_category,'eventType',v_existing.event_type,'amount',v_existing.amount,'idempotent',true);
  end if;

  v_due := (public.billing_collectible_by_category(v_project_id))[public.billing_receivable_category(v_category)];
  if v_amount > v_due + 0.009 then raise exception 'Write-off cannot exceed the collectible category due of BDT %.', trim(to_char(v_due,'FM999999999999990.00')); end if;

  v_code := 'WO-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into public.billing_writeoff_log(writeoff_code,project_id,billing_category,event_type,amount,effective_date,reason,notes,created_by,idempotency_key)
  values(v_code,v_project_id,v_category,'write_off',v_amount,coalesce(p_writeoff_date,current_date),trim(p_reason),trim(p_notes),nullif(trim(p_created_by),''),p_idempotency_key);

  return jsonb_build_object('writeoffCode',v_code,'projectId',p_project_code,'category',v_category,'eventType','write_off','amount',v_amount,'dueBefore',v_due,'dueAfter',(public.billing_collectible_by_category(v_project_id))[public.billing_receivable_category(v_category)],'idempotent',false);
end;
$function$;

revoke all on function public.apply_billing_writeoff(text,text,numeric,date,text,text,text,text) from public,anon,authenticated;
grant execute on function public.apply_billing_writeoff(text,text,numeric,date,text,text,text,text) to service_role;
