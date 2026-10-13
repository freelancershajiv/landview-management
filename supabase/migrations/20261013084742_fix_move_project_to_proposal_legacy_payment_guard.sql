-- Project settlement history must include approved legacy/manual payments
-- even when those payments intentionally do not affect the main ledger.

create or replace function public.move_project_to_proposal(
  p_project_code text,
  p_created_by text default null::text
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_project public.projects%rowtype;
  v_project_code text := upper(trim(coalesce(p_project_code, '')));
  v_year text := to_char(current_date, 'YYYY');
  v_next integer;
  v_proposal_code text;
  v_gross numeric := 0;
  v_discount numeric := 0;
  v_net numeric := 0;
  v_bill_count integer := 0;
  v_payment_count integer := 0;
  v_payment_total numeric := 0;
  v_now timestamptz := now();
  v_actor text := nullif(trim(coalesce(p_created_by, '')), '');
begin
  if v_project_code = '' then
    raise exception 'Project ID is required.';
  end if;

  select * into v_project
  from public.projects
  where upper(project_code) = v_project_code
  for update;

  if not found then
    raise exception 'Project % was not found.', v_project_code;
  end if;

  if v_project.record_type = 'proposal' and v_project.reclassified_proposal_code is not null then
    return jsonb_build_object(
      'projectId', v_project.project_code,
      'proposalId', v_project.reclassified_proposal_code,
      'alreadyMoved', true
    );
  end if;

  select count(*), coalesce(sum(amount), 0)
    into v_payment_count, v_payment_total
  from public.payments
  where project_id = v_project.id
    and lower(coalesce(transaction_type, '')) <> 'personal income'
    and (
      lower(replace(replace(coalesce(nullif(approval_status,''), status, ''), '_', ' '), '-', ' ')) = ''
      or lower(replace(replace(coalesce(nullif(approval_status,''), status, ''), '_', ' '), '-', ' ')) in
        ('approved','received','paid','verified','complete','completed','full paid','fully paid','posted')
    );

  if v_payment_count > 0 and v_payment_total > 0 then
    raise exception 'This project has % in recorded received payments. Resolve or reclassify those payments before moving it to Proposals.', v_payment_total;
  end if;

  select count(*), coalesce(sum(amount),0), coalesce(sum(discount),0), coalesce(sum(coalesce(net_amount, amount - discount)),0)
    into v_bill_count, v_gross, v_discount, v_net
  from public.bills
  where project_id = v_project.id
    and lower(coalesce(status,'')) not in ('void','voided','cancelled','canceled','rejected');

  perform pg_advisory_xact_lock(hashtext('landview-proposal-code-' || v_year));
  select coalesce(max((substring(proposal_code from ('^PROP-' || v_year || '-([0-9]+)$')))::integer), 0) + 1
    into v_next
  from public.proposals
  where proposal_code ~ ('^PROP-' || v_year || '-[0-9]+$');
  v_proposal_code := 'PROP-' || v_year || '-' || lpad(v_next::text, 4, '0');

  insert into public.proposals (
    proposal_code, prospect_code, client_name, phone, address,
    project_title, project_location, project_type, plot_area, floors,
    gross_amount, discount, net_amount, validity_days, status,
    notes, converted_project_code, created_by, created_at, updated_at
  ) values (
    v_proposal_code, null,
    coalesce(nullif(v_project.client_name_snapshot,''), nullif(v_project.project_name,''), v_project.project_code),
    v_project.phone_number_snapshot,
    v_project.location,
    coalesce(nullif(v_project.project_name,''), v_project.project_code),
    v_project.location,
    v_project.project_type,
    coalesce(nullif(v_project.project_area_text,''), v_project.plot_area::text),
    coalesce(nullif(v_project.number_of_stories_text,''), v_project.floors::text),
    v_gross, v_discount, v_net, 30, 'Draft',
    concat_ws(E'\n', nullif(v_project.notes,''), 'Reclassified from ' || v_project.project_code || '. Historical invoice/bill records were proposals and were voided from finance totals.'),
    null,
    v_actor,
    v_now,
    v_now
  );

  insert into public.proposal_items (
    item_code, proposal_code, service, description, quantity, unit,
    rate, amount, sort_order, status, notes, category, taxable,
    created_by, created_at, updated_at
  )
  select
    'PI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    v_proposal_code,
    coalesce(nullif(b.description,''), nullif(b.billing_category,''), nullif(b.category,''), 'Professional Service'),
    b.description,
    coalesce(nullif(b.quantity,0), 1),
    'Job',
    coalesce(nullif(b.unit_price,0), b.amount),
    b.amount,
    row_number() over (order by b.bill_date nulls last, b.created_at, b.id),
    'Active',
    concat_ws(' · ', nullif(b.notes,''), 'Imported from ' || b.bill_code),
    coalesce(nullif(b.billing_category,''), b.category),
    false,
    v_actor,
    v_now,
    v_now
  from public.bills b
  where b.project_id = v_project.id
    and lower(coalesce(b.status,'')) not in ('void','voided','cancelled','canceled','rejected');

  update public.bills
  set
    status = 'Voided',
    notes = concat_ws(E'\n', nullif(notes,''), 'Moved to proposal ' || v_proposal_code || ' from ' || v_project.project_code || '. Original bill status: ' || coalesce(status,'(blank)') || '.'),
    updated_at = v_now
  where project_id = v_project.id
    and lower(coalesce(status,'')) not in ('void','voided','cancelled','canceled','rejected');

  update public.invoices
  set
    status = 'VOIDED',
    notes = concat_ws(E'\n', nullif(notes,''), 'Moved to proposal ' || v_proposal_code || ' from ' || v_project.project_code || '. Original invoice status: ' || coalesce(status,'(blank)') || '.'),
    due_amount_snapshot = 0,
    updated_at = v_now
  where project_id = v_project.id
    and lower(coalesce(status,'')) not in ('void','voided','cancelled','canceled','rejected');

  update public.projects
  set
    record_type = 'proposal',
    reclassified_proposal_code = v_proposal_code,
    design_stage_status = 'Completed',
    approval_stage_status = 'Completed',
    supervision_stage_status = 'Completed',
    public_display = false,
    notes = concat_ws(E'\n', nullif(notes,''), 'Moved to Proposals as ' || v_proposal_code || '. Historical bill/invoice rows retained as voided audit records.'),
    updated_at = v_now
  where id = v_project.id;

  insert into public.proposal_activity (
    activity_code, proposal_code, prospect_code, action, from_status, to_status,
    performed_by, performed_at, details, user_key, role, reference
  ) values (
    'PA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    v_proposal_code, null, 'Reclassified from Project', null, 'Draft',
    coalesce(v_actor, 'LAND VIEW'), v_now,
    'Source project ' || v_project.project_code || '; ' || v_bill_count || ' bill item(s); proposal value BDT ' || v_net::text || '.',
    v_actor, 'system', v_project.project_code
  );

  return jsonb_build_object(
    'projectId', v_project.project_code,
    'proposalId', v_proposal_code,
    'billCount', v_bill_count,
    'gross', v_gross,
    'discount', v_discount,
    'net', v_net,
    'alreadyMoved', false
  );
end;
$function$;
