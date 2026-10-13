-- Historical/manual project payments count toward project settlement
-- but must never change the main LAND VIEW business ledger.

alter table public.payments
  add column if not exists is_legacy_manual boolean not null default false;

comment on column public.payments.is_legacy_manual is
  'Historical/manual project payment: counts toward project settlement but must not impact the main business ledger.';

create or replace function private.enforce_legacy_manual_payment_policy()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if coalesce(new.is_legacy_manual, false) then
    new.affects_business_balance := false;

    if new.ledger_verification_status is null
       or new.ledger_verification_status not in ('unlinked','verified','mismatch') then
      new.ledger_verification_status := 'unlinked';
    end if;

    if nullif(trim(coalesce(new.source_created_by, '')), '') is null then
      new.source_created_by := 'legacy_manual_import';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enforce_legacy_manual_payment_policy on public.payments;
create trigger trg_enforce_legacy_manual_payment_policy
before insert or update on public.payments
for each row
execute function private.enforce_legacy_manual_payment_policy();

-- Only the explicit manual legacy workflow is backfilled.
-- Existing Legacy Auto Invoice rows keep their existing accounting behavior.
update public.payments
set is_legacy_manual = true,
    affects_business_balance = false
where payment_code like 'LEG-PAY-%'
   or payment_code like 'PAY-LEG-%';

create or replace function public.create_legacy_project_full(
  p_project jsonb,
  p_bills jsonb default '[]'::jsonb,
  p_payments jsonb default '[]'::jsonb,
  p_created_by text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_project_id uuid;
  v_project_code text := upper(trim(coalesce(p_project->>'project_code','')));
  v_bill jsonb;
  v_payment jsonb;
  v_bill_amount numeric;
  v_bill_discount numeric;
  v_payment_amount numeric;
  v_bill_count integer := 0;
  v_payment_count integer := 0;
  v_verified_count integer := 0;
  v_mismatch_count integer := 0;
  v_tx public.transactions%rowtype;
  v_tx_code text;
  v_verification text;
  v_verification_notes text;
  v_payment_date date;
  v_existing_link uuid;
begin
  if v_project_code !~ '^LV-[0-9]{3,}$' then raise exception 'Invalid legacy project code.'; end if;
  if trim(coalesce(p_project->>'project_name','')) = '' then raise exception 'Project name is required.'; end if;
  if jsonb_typeof(coalesce(p_bills,'[]'::jsonb)) <> 'array' then raise exception 'Bills must be an array.'; end if;
  if jsonb_typeof(coalesce(p_payments,'[]'::jsonb)) <> 'array' then raise exception 'Payments must be an array.'; end if;

  insert into public.projects (
    project_code, project_name, client_name_snapshot, phone_number_snapshot,
    referred_by, ref_contact, project_type, location, location_tag,
    project_area_text, number_of_stories_text, start_date,
    design_stage_status, approval_stage_status, supervision_stage_status,
    site_latitude, site_longitude, site_geofence_radius_m, notes,
    public_display, public_map_enabled, floors, legacy_import,
    legacy_imported_at, legacy_imported_by, updated_at
  ) values (
    v_project_code,
    nullif(trim(p_project->>'project_name'),''),
    nullif(trim(p_project->>'client_name_snapshot'),''),
    nullif(trim(p_project->>'phone_number_snapshot'),''),
    nullif(trim(p_project->>'referred_by'),''),
    nullif(trim(p_project->>'ref_contact'),''),
    nullif(trim(p_project->>'project_type'),''),
    nullif(trim(p_project->>'location'),''),
    nullif(trim(p_project->>'location_tag'),''),
    nullif(trim(p_project->>'project_area_text'),''),
    nullif(trim(p_project->>'number_of_stories_text'),''),
    nullif(p_project->>'start_date','')::date,
    coalesce(nullif(p_project->>'design_stage_status',''),'Completed'),
    coalesce(nullif(p_project->>'approval_stage_status',''),'Completed'),
    coalesce(nullif(p_project->>'supervision_stage_status',''),'Completed'),
    nullif(p_project->>'site_latitude','')::double precision,
    nullif(p_project->>'site_longitude','')::double precision,
    coalesce(nullif(p_project->>'site_geofence_radius_m','')::integer,150),
    nullif(trim(p_project->>'notes'),''),
    coalesce((p_project->>'public_display')::boolean,true),
    coalesce((p_project->>'public_map_enabled')::boolean,false),
    nullif(p_project->>'floors','')::integer,
    true, now(), nullif(trim(p_created_by),''), now()
  ) returning id into v_project_id;

  for v_bill in select value from jsonb_array_elements(coalesce(p_bills,'[]'::jsonb)) loop
    v_bill_amount := coalesce(nullif(v_bill->>'amount','')::numeric,0);
    v_bill_discount := coalesce(nullif(v_bill->>'discount','')::numeric,0);
    if v_bill_amount <= 0 then raise exception 'Every bill amount must be greater than zero.'; end if;
    if v_bill_discount < 0 or v_bill_discount > v_bill_amount then raise exception 'Bill discount must be between zero and the bill amount.'; end if;

    insert into public.bills (
      bill_code, project_id, bill_date, billing_category, category, description,
      unit_price, quantity, amount, discount, status, notes,
      created_via, source_created_by, source_created_at, legacy_source_id, idempotency_key
    ) values (
      'LEG-BILL-' || upper(replace(gen_random_uuid()::text,'-','')),
      v_project_id, nullif(v_bill->>'bill_date','')::date,
      nullif(trim(v_bill->>'billing_category'),''), nullif(trim(v_bill->>'category'),''),
      nullif(trim(v_bill->>'description'),''), nullif(v_bill->>'unit_price','')::numeric,
      nullif(v_bill->>'quantity','')::numeric, v_bill_amount, v_bill_discount,
      coalesce(nullif(trim(v_bill->>'status'),''),'Issued'),
      nullif(trim(v_bill->>'notes'),''), 'legacy_project_import', nullif(trim(p_created_by),''), now(),
      nullif(trim(v_bill->>'legacy_source_id'),''),
      'legacy-import:' || v_project_code || ':bill:' || v_bill_count::text || ':' || gen_random_uuid()::text
    );
    v_bill_count := v_bill_count + 1;
  end loop;

  for v_payment in select value from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    v_payment_amount := coalesce(nullif(v_payment->>'amount','')::numeric,0);
    if v_payment_amount <= 0 then raise exception 'Every payment amount must be greater than zero.'; end if;
    v_payment_date := nullif(v_payment->>'payment_date','')::date;
    v_tx_code := nullif(trim(v_payment->>'ledger_transaction_code'),'');
    v_tx := null;
    v_verification := 'unlinked';
    v_verification_notes := 'Historical payment entered without a linked ledger transaction.';

    if v_tx_code is not null then
      select * into v_tx from public.transactions where transaction_code = v_tx_code limit 1;
      if v_tx.id is null then raise exception 'Ledger transaction % was not found.', v_tx_code; end if;
      if lower(coalesce(v_tx.transaction_type,'')) <> 'income' and upper(coalesce(v_tx.direction,'')) <> 'CREDIT' then raise exception 'Ledger transaction % is not an income/credit entry.', v_tx_code; end if;
      select id into v_existing_link from public.payments where ledger_transaction_id = v_tx.id limit 1;
      if v_existing_link is not null then raise exception 'Ledger transaction % is already linked to another payment.', v_tx_code; end if;

      if round(coalesce(v_tx.amount,coalesce(v_tx.credit,0))::numeric,2) = round(v_payment_amount,2)
         and (v_payment_date is null or v_tx.transaction_date = v_payment_date)
         and (v_tx.project_code_snapshot is null or v_tx.project_code_snapshot = v_project_code)
      then
        v_verification := 'verified';
        v_verification_notes := case when v_tx.project_code_snapshot is null
          then 'Amount/date matched. Ledger project was previously unassigned; link confirmed manually during legacy import.'
          else 'Amount, date and project matched the existing ledger transaction.' end;
        v_verified_count := v_verified_count + 1;
      else
        v_verification := 'mismatch';
        v_verification_notes := 'Linked ledger transaction has an amount, date or project mismatch. Review required.';
        v_mismatch_count := v_mismatch_count + 1;
      end if;
    end if;

    insert into public.payments (
      payment_code, project_id, payment_date, amount, payment_method, reference_no,
      notes, deposit_account, payment_for, income_category, transaction_type,
      affects_business_balance, is_legacy_manual, received_from, received_by, approval_status,
      reviewed_by, reviewed_at, review_notes, idempotency_key, status,
      decision_notes, source_created_by, source_created_at, service_type,
      finance_scope, legacy_source_id, ledger_transaction_id,
      ledger_transaction_code, ledger_verification_status, ledger_verified_at,
      ledger_verification_notes
    ) values (
      'LEG-PAY-' || upper(replace(gen_random_uuid()::text,'-','')),
      v_project_id, v_payment_date, v_payment_amount,
      nullif(trim(v_payment->>'payment_method'),''), nullif(trim(v_payment->>'reference_no'),''),
      nullif(trim(v_payment->>'notes'),''), nullif(trim(v_payment->>'deposit_account'),''),
      nullif(trim(v_payment->>'payment_for'),''), nullif(trim(v_payment->>'income_category'),''),
      'Income', false, true, nullif(trim(v_payment->>'received_from'),''), nullif(trim(v_payment->>'received_by'),''),
      'Approved', nullif(trim(p_created_by),''), now(), v_verification_notes,
      'legacy-import:' || v_project_code || ':payment:' || v_payment_count::text || ':' || gen_random_uuid()::text,
      'POSTED', v_verification_notes, coalesce(nullif(trim(p_created_by),''),'legacy_manual_import'), now(),
      nullif(trim(v_payment->>'service_type'),''), coalesce(nullif(trim(v_payment->>'finance_scope'),''),'main'),
      nullif(trim(v_payment->>'legacy_source_id'),''), v_tx.id, v_tx_code, v_verification,
      case when v_tx.id is not null then now() else null end, v_verification_notes
    );
    v_payment_count := v_payment_count + 1;
  end loop;

  return jsonb_build_object(
    'project_id', v_project_id, 'project_code', v_project_code,
    'bill_count', v_bill_count, 'payment_count', v_payment_count,
    'verified_payment_count', v_verified_count, 'mismatch_payment_count', v_mismatch_count,
    'unlinked_payment_count', v_payment_count - v_verified_count - v_mismatch_count
  );
end;
$function$;

create or replace function public.apply_billing_discount(
  p_project_code text,
  p_category text,
  p_amount numeric,
  p_discount_date date,
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
  v_amount numeric := coalesce(p_amount, 0);
  v_billed numeric := 0;
  v_paid numeric := 0;
  v_due numeric := 0;
  v_remaining numeric;
  v_apply numeric;
  v_code text;
  v_allocations jsonb := '[]'::jsonb;
  v_existing public.billing_discount_log%rowtype;
  r record;
begin
  if v_amount <= 0 then raise exception 'Discount amount must be greater than zero.'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'A valid idempotency key is required.'; end if;

  select * into v_existing from public.billing_discount_log where idempotency_key = p_idempotency_key limit 1;
  if found then
    return jsonb_build_object('discountCode', v_existing.discount_code, 'projectId', p_project_code, 'category', v_existing.billing_category, 'amount', v_existing.amount, 'dueBefore', null, 'dueAfter', null, 'allocations', v_existing.allocations, 'idempotent', true);
  end if;

  select id into v_project_id from public.projects where upper(project_code)=upper(trim(p_project_code)) limit 1;
  if v_project_id is null then raise exception 'Project not found.'; end if;

  v_category := case lower(trim(p_category))
    when 'engineering bill' then 'Engineering Bill' when 'engineering' then 'Engineering Bill' when 'design bill' then 'Engineering Bill'
    when 'supervision bill' then 'Supervision Bill' when 'supervision' then 'Supervision Bill'
    when 'other services bill' then 'Other Services Bill' when 'others bill' then 'Other Services Bill' when 'other services' then 'Other Services Bill' when 'others' then 'Other Services Bill'
    else null end;
  if v_category is null then raise exception 'Invalid discount category.'; end if;

  select coalesce(sum(greatest(b.amount-b.discount,0)),0) into v_billed
  from public.bills b
  where b.project_id=v_project_id
    and lower(coalesce(b.status,'')) not in ('void','voided','cancelled','canceled','rejected')
    and (case when lower(coalesce(b.billing_category,b.category,b.description,'')) like '%supervision%' then 'Supervision Bill'
              when lower(coalesce(b.billing_category,b.category,b.description,'')) ~ '(other|soil|survey|municipality|file pass)' then 'Other Services Bill'
              else 'Engineering Bill' end)=v_category;

  -- Project settlement counts approved legacy/manual payments regardless of ledger impact.
  select coalesce(sum(p.amount),0) into v_paid
  from public.payments p
  where p.project_id=v_project_id
    and lower(coalesce(p.transaction_type,'')) <> 'personal income'
    and (coalesce(trim(p.approval_status),trim(p.status),'')='' or lower(replace(replace(coalesce(p.approval_status,p.status,''),'_',' '),'-',' ')) in ('approved','received','paid','verified','complete','completed','full paid','fully paid','posted'))
    and (case
      when lower(trim(coalesce(p.income_category,''))) in ('supervision bill','supervision') then 'Supervision Bill'
      when lower(trim(coalesce(p.income_category,''))) in ('other services bill','others bill','other services','others') then 'Other Services Bill'
      when lower(trim(coalesce(p.income_category,''))) in ('engineering bill','engineering','design bill') then 'Engineering Bill'
      when lower(trim(coalesce(p.payment_for,''))) in ('supervision bill','supervision') then 'Supervision Bill'
      when lower(trim(coalesce(p.payment_for,''))) in ('other services bill','others bill','other services','others') then 'Other Services Bill'
      when lower(trim(coalesce(p.payment_for,''))) in ('engineering bill','engineering','design bill') then 'Engineering Bill'
      when lower(concat_ws(' ',p.payment_for,p.income_category,p.notes)) like '%supervision%' then 'Supervision Bill'
      when lower(concat_ws(' ',p.payment_for,p.income_category,p.notes)) ~ '(other|soil|survey|municipality|file pass|site visit)' then 'Other Services Bill'
      else 'Engineering Bill' end)=v_category;

  v_due := greatest(v_billed-v_paid,0);
  if v_amount > v_due + 0.009 then raise exception 'Discount cannot exceed the current category due of BDT %.', trim(to_char(v_due,'FM999999999999990.00')); end if;

  v_remaining := v_amount;
  for r in
    select b.id,b.bill_code,b.amount,b.discount from public.bills b
    where b.project_id=v_project_id
      and lower(coalesce(b.status,'')) not in ('void','voided','cancelled','canceled','rejected')
      and (case when lower(coalesce(b.billing_category,b.category,b.description,'')) like '%supervision%' then 'Supervision Bill'
                when lower(coalesce(b.billing_category,b.category,b.description,'')) ~ '(other|soil|survey|municipality|file pass)' then 'Other Services Bill'
                else 'Engineering Bill' end)=v_category
      and greatest(b.amount-b.discount,0)>0
    order by b.bill_date desc nulls last,b.created_at desc,b.id
    for update
  loop
    exit when v_remaining <= 0.009;
    v_apply := least(v_remaining,greatest(r.amount-r.discount,0));
    if v_apply > 0 then
      update public.bills set discount=discount+v_apply,source_updated_at=now(),updated_at=now() where id=r.id;
      v_allocations := v_allocations || jsonb_build_array(jsonb_build_object('billId',r.id,'billCode',r.bill_code,'amount',v_apply));
      v_remaining := v_remaining-v_apply;
    end if;
  end loop;

  if v_remaining > 0.009 then raise exception 'Could not allocate the full discount amount.'; end if;
  v_code := 'DISC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into public.billing_discount_log(discount_code,project_id,billing_category,amount,discount_date,notes,created_by,idempotency_key,allocations)
  values(v_code,v_project_id,v_category,v_amount,coalesce(p_discount_date,current_date),nullif(trim(p_notes),''),nullif(trim(p_created_by),''),p_idempotency_key,v_allocations);

  return jsonb_build_object('discountCode',v_code,'projectId',p_project_code,'category',v_category,'amount',v_amount,'dueBefore',v_due,'dueAfter',greatest(v_due-v_amount,0),'allocations',v_allocations,'idempotent',false);
end;
$function$;

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
  v_billed numeric := 0;
  v_paid numeric := 0;
  v_written numeric := 0;
  v_due numeric := 0;
  v_code text;
  v_existing public.billing_writeoff_log%rowtype;
begin
  if v_amount <= 0 then raise exception 'Write-off amount must be greater than zero.'; end if;
  if coalesce(trim(p_idempotency_key),'')='' then raise exception 'A valid idempotency key is required.'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Write-off reason is required.'; end if;
  if coalesce(trim(p_notes),'')='' then raise exception 'Write-off note is required.'; end if;

  select * into v_existing from public.billing_writeoff_log where idempotency_key=p_idempotency_key limit 1;
  if found then return jsonb_build_object('writeoffCode',v_existing.writeoff_code,'projectId',p_project_code,'category',v_existing.billing_category,'eventType',v_existing.event_type,'amount',v_existing.amount,'idempotent',true); end if;

  select id into v_project_id from public.projects where upper(project_code)=upper(trim(p_project_code)) limit 1;
  if v_project_id is null then raise exception 'Project not found.'; end if;

  v_category := case lower(trim(p_category))
    when 'engineering bill' then 'Engineering Bill' when 'engineering' then 'Engineering Bill' when 'design bill' then 'Engineering Bill'
    when 'supervision bill' then 'Supervision Bill' when 'supervision' then 'Supervision Bill'
    when 'other services bill' then 'Other Services Bill' when 'others bill' then 'Other Services Bill' when 'other services' then 'Other Services Bill' when 'others' then 'Other Services Bill'
    else null end;
  if v_category is null then raise exception 'Invalid write-off category.'; end if;

  perform 1 from public.projects where id=v_project_id for update;

  select coalesce(sum(greatest(b.amount-b.discount,0)),0) into v_billed
  from public.bills b
  where b.project_id=v_project_id
    and lower(coalesce(b.status,'')) not in ('void','voided','cancelled','canceled','rejected')
    and (case when lower(coalesce(b.billing_category,b.category,b.description,'')) like '%supervision%' then 'Supervision Bill'
              when lower(coalesce(b.billing_category,b.category,b.description,'')) ~ '(other|soil|survey|municipality|file pass)' then 'Other Services Bill'
              else 'Engineering Bill' end)=v_category;

  -- Project settlement counts approved legacy/manual payments regardless of ledger impact.
  select coalesce(sum(p.amount),0) into v_paid
  from public.payments p
  where p.project_id=v_project_id
    and lower(coalesce(p.transaction_type,'')) <> 'personal income'
    and (coalesce(trim(p.approval_status),trim(p.status),'')='' or lower(replace(replace(coalesce(p.approval_status,p.status,''),'_',' '),'-',' ')) in ('approved','received','paid','verified','complete','completed','full paid','fully paid','posted'))
    and (case when lower(coalesce(p.payment_for,p.income_category,p.notes,'')) like '%supervision%' then 'Supervision Bill'
              when lower(coalesce(p.payment_for,p.income_category,p.notes,'')) ~ '(other|soil|survey|municipality|file pass)' then 'Other Services Bill'
              else 'Engineering Bill' end)=v_category;

  select greatest(coalesce(sum(case when w.event_type='write_off' then w.amount else -w.amount end),0),0) into v_written
  from public.billing_writeoff_log w where w.project_id=v_project_id and w.billing_category=v_category;

  v_due := greatest(v_billed-v_paid-v_written,0);
  if v_amount > v_due + 0.009 then raise exception 'Write-off cannot exceed the collectible category due of BDT %.', trim(to_char(v_due,'FM999999999999990.00')); end if;

  v_code := 'WO-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into public.billing_writeoff_log(writeoff_code,project_id,billing_category,event_type,amount,effective_date,reason,notes,created_by,idempotency_key)
  values(v_code,v_project_id,v_category,'write_off',v_amount,coalesce(p_writeoff_date,current_date),trim(p_reason),trim(p_notes),nullif(trim(p_created_by),''),p_idempotency_key);

  return jsonb_build_object('writeoffCode',v_code,'projectId',p_project_code,'category',v_category,'eventType','write_off','amount',v_amount,'dueBefore',v_due,'dueAfter',greatest(v_due-v_amount,0),'idempotent',false);
end;
$function$;
