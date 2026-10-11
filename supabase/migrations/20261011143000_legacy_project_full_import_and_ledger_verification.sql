alter table public.projects
  add column if not exists legacy_import boolean not null default false,
  add column if not exists legacy_imported_at timestamptz,
  add column if not exists legacy_imported_by text;

alter table public.payments
  add column if not exists ledger_transaction_id uuid references public.transactions(id) on delete set null,
  add column if not exists ledger_transaction_code text,
  add column if not exists ledger_verification_status text not null default 'unlinked',
  add column if not exists ledger_verified_at timestamptz,
  add column if not exists ledger_verification_notes text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_ledger_verification_status_check') then
    alter table public.payments
      add constraint payments_ledger_verification_status_check
      check (ledger_verification_status in ('unlinked','verified','mismatch'));
  end if;
end $$;

create unique index if not exists payments_one_ledger_transaction_link_idx
  on public.payments(ledger_transaction_id)
  where ledger_transaction_id is not null;

create index if not exists payments_ledger_verification_status_idx
  on public.payments(ledger_verification_status);

create or replace function public.create_legacy_project_full(
  p_project jsonb,
  p_bills jsonb default '[]'::jsonb,
  p_payments jsonb default '[]'::jsonb,
  p_created_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      unit_price, quantity, amount, discount, net_amount, status, notes,
      created_via, source_created_by, source_created_at, legacy_source_id, idempotency_key
    ) values (
      'LEG-BILL-' || upper(replace(gen_random_uuid()::text,'-','')),
      v_project_id, nullif(v_bill->>'bill_date','')::date,
      nullif(trim(v_bill->>'billing_category'),''), nullif(trim(v_bill->>'category'),''),
      nullif(trim(v_bill->>'description'),''), nullif(v_bill->>'unit_price','')::numeric,
      nullif(v_bill->>'quantity','')::numeric, v_bill_amount, v_bill_discount,
      v_bill_amount - v_bill_discount, coalesce(nullif(trim(v_bill->>'status'),''),'Issued'),
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
      affects_business_balance, received_from, received_by, approval_status,
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
      'Income', false, nullif(trim(v_payment->>'received_from'),''), nullif(trim(v_payment->>'received_by'),''),
      'Approved', nullif(trim(p_created_by),''), now(), v_verification_notes,
      'legacy-import:' || v_project_code || ':payment:' || v_payment_count::text || ':' || gen_random_uuid()::text,
      'POSTED', v_verification_notes, nullif(trim(p_created_by),''), now(),
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
$$;

revoke all on function public.create_legacy_project_full(jsonb,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.create_legacy_project_full(jsonb,jsonb,jsonb,text) to service_role;
