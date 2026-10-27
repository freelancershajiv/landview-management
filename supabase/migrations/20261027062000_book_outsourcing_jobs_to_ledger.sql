create or replace function private.sync_outsourcing_job_expense()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_party public.outsourcing_parties%rowtype;
  v_project public.projects%rowtype;
  v_expense_id uuid;
  v_expense_code text;
  v_category text;
  v_description text;
  v_status text;
  v_method text;
begin
  -- Historical/auto-linked jobs already have an Accounts/Ledger source. Do not re-book them.
  if upper(coalesce(new.job_code,'')) like 'OUTJOB-AUTO-%'
     or upper(coalesce(new.job_code,'')) like 'OUTJOB-HIST-%' then
    return new;
  end if;

  select * into v_party from public.outsourcing_parties where id = new.party_id;
  if v_party.id is null then
    raise exception 'Outsourcing party not found.';
  end if;

  if new.project_id is not null then
    select * into v_project from public.projects where id = new.project_id;
  end if;

  v_expense_code := 'EXP-OUT-JOB-' || regexp_replace(new.job_code, '^OUTJOB-', '', 'i');
  v_category := case
    when new.finance_scope = 'municipality_file_pass' then 'Municipality Fee'
    else trim(coalesce(nullif(new.service_type,''),'Outsourcing') || ' Outsourcing')
  end;
  v_description := trim(coalesce(nullif(new.service_type,''),'Outsourcing') || ' outsourcing - ' || coalesce(nullif(v_party.name,''),'Outsource Party'));
  v_status := case when lower(trim(coalesce(new.status,''))) in ('cancelled','canceled') then 'VOID' else 'POSTED' end;
  v_method := coalesce(nullif(trim(coalesce(v_party.preferred_payment_method,'')),''),'Cash');

  select id into v_expense_id
  from public.expenses
  where expense_code = v_expense_code
  limit 1;

  if v_expense_id is null then
    insert into public.expenses (
      expense_code, project_id, expense_date, file_id, project_name_snapshot,
      category, description, amount, approval_status, approved_by_code, approved_at,
      paid_to, payment_method, reference_no, notes, status, source_created_by,
      source_created_at, service_type, finance_scope
    ) values (
      v_expense_code, new.project_id, coalesce(new.assigned_date,current_date),
      v_project.project_code, v_project.project_name,
      v_category, v_description, new.agreed_amount,
      'Approved', coalesce(nullif(new.created_by,''),'LAND VIEW'), now(),
      v_party.name, v_method, new.job_code,
      trim(concat_ws(' · ', 'Outsource job ' || new.job_code, 'Booked at agreed amount; payments only update paid/due.', nullif(new.notes,''))),
      v_status, coalesce(nullif(new.created_by,''),'LAND VIEW'), coalesce(new.created_at,now()),
      new.service_type, new.finance_scope
    )
    returning id into v_expense_id;
  else
    update public.expenses
    set project_id = new.project_id,
        expense_date = coalesce(new.assigned_date,current_date),
        file_id = v_project.project_code,
        project_name_snapshot = v_project.project_name,
        category = v_category,
        description = v_description,
        amount = new.agreed_amount,
        approval_status = 'Approved',
        approved_by_code = coalesce(nullif(new.created_by,''), approved_by_code, 'LAND VIEW'),
        approved_at = coalesce(approved_at, now()),
        paid_to = v_party.name,
        payment_method = v_method,
        reference_no = new.job_code,
        notes = trim(concat_ws(' · ', 'Outsource job ' || new.job_code, 'Booked at agreed amount; payments only update paid/due.', nullif(new.notes,''))),
        status = v_status,
        source_created_by = coalesce(nullif(new.created_by,''), source_created_by, 'LAND VIEW'),
        service_type = new.service_type,
        finance_scope = new.finance_scope
    where id = v_expense_id;
  end if;

  return new;
end;
$function$;

revoke all on function private.sync_outsourcing_job_expense() from public, anon, authenticated;

drop trigger if exists trg_outsourcing_job_expense on public.outsourcing_jobs;
create trigger trg_outsourcing_job_expense
after insert or update of project_id, party_id, service_type, agreed_amount, assigned_date, status, finance_scope
on public.outsourcing_jobs
for each row execute function private.sync_outsourcing_job_expense();

create or replace function private.sync_outsourcing_payment_expense()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_job public.outsourcing_jobs%rowtype;
  v_party public.outsourcing_parties%rowtype;
  v_project public.projects%rowtype;
  v_linked_expense public.expenses%rowtype;
  v_linked_transaction public.transactions%rowtype;
  v_expense_id uuid;
  v_expense_code text;
  v_job_expense_code text;
  v_description text;
  v_status text;
  v_category text;
begin
  if coalesce(new.expense_origin, 'generated') = 'ledger_linked' then
    if new.source_transaction_code is null or new.expense_id is not null then
      raise exception 'A ledger-linked outsourcing payment requires a source transaction and no expense row.';
    end if;

    select * into v_linked_transaction
    from public.transactions
    where transaction_code = new.source_transaction_code;

    if v_linked_transaction.id is null then
      raise exception 'Linked ledger transaction not found.';
    end if;

    if tg_op='UPDATE'
       and old.status <> 'VOID'
       and new.status='VOID' then
      raise exception 'This outsourcing payment is linked from historical LAND VIEW Ledger. Edit the source ledger record instead.';
    end if;

    return new;
  end if;

  if coalesce(new.expense_origin, 'generated') = 'linked' then
    if new.expense_id is null then
      raise exception 'A linked outsourcing payment requires an expense.';
    end if;
    select * into v_linked_expense from public.expenses where id = new.expense_id;
    if v_linked_expense.id is null then
      raise exception 'Linked Accounts expense not found.';
    end if;

    if tg_op = 'UPDATE'
       and old.status <> 'VOID'
       and new.status = 'VOID'
       and lower(trim(coalesce(v_linked_expense.status,'posted'))) not in ('void','voided','cancelled','canceled','rejected') then
      raise exception 'This outsourcing payment is linked from Main Accounts. Void or edit the original Accounts expense instead.';
    end if;
    return new;
  end if;

  select * into v_job from public.outsourcing_jobs where id = new.job_id;
  if v_job.id is null then raise exception 'Outsourcing job not found.'; end if;

  -- New jobs book the full agreed outsourcing cost once when the job is created.
  -- Their payment rows only track paid/due and must not create another ledger debit.
  v_job_expense_code := 'EXP-OUT-JOB-' || regexp_replace(v_job.job_code, '^OUTJOB-', '', 'i');
  if new.expense_id is null
     and exists (select 1 from public.expenses where expense_code = v_job_expense_code) then
    return new;
  end if;

  -- Legacy jobs without a job-level expense keep the previous payment-to-ledger behavior.
  select * into v_party from public.outsourcing_parties where id = v_job.party_id;
  if v_party.id is null then raise exception 'Outsourcing party not found.'; end if;

  if v_job.project_id is not null then
    select * into v_project from public.projects where id = v_job.project_id;
  end if;

  v_expense_code := 'EXP-OUT-' || regexp_replace(new.payment_code, '^OUTPAY-', '', 'i');
  v_description := trim(coalesce(v_job.service_type, 'Outsourcing') || ' outsourcing payment - ' || coalesce(v_party.name, 'Outsource Party'));
  v_status := case when new.status = 'VOID' then 'VOID' else 'POSTED' end;
  v_category := case when v_job.finance_scope = 'municipality_file_pass' then 'Municipality Fee' else 'Outsourcing Payment' end;

  if new.expense_id is null then
    insert into public.expenses (
      expense_code, project_id, expense_date, file_id, project_name_snapshot,
      category, description, amount, approval_status, approved_by_code, approved_at,
      paid_to, payment_method, reference_no, notes, status, source_created_by,
      source_created_at, service_type, finance_scope
    ) values (
      v_expense_code, v_job.project_id, new.payment_date, v_project.project_code, v_project.project_name,
      v_category, v_description, new.amount, 'Approved', coalesce(new.created_by, 'LAND VIEW'), now(),
      v_party.name, new.payment_method, new.reference_no,
      trim(concat_ws(' · ', 'Outsource ' || v_job.job_code, nullif(new.notes,''))),
      v_status, coalesce(new.created_by, 'LAND VIEW'), now(), v_job.service_type, v_job.finance_scope
    )
    returning id into v_expense_id;
    new.expense_id := v_expense_id;
  else
    update public.expenses
    set project_id = v_job.project_id,
        expense_date = new.payment_date,
        file_id = v_project.project_code,
        project_name_snapshot = v_project.project_name,
        category = v_category,
        description = v_description,
        amount = new.amount,
        approval_status = 'Approved',
        paid_to = v_party.name,
        payment_method = new.payment_method,
        reference_no = new.reference_no,
        notes = trim(concat_ws(' · ', 'Outsource ' || v_job.job_code, nullif(new.notes,''))),
        status = v_status,
        source_created_by = coalesce(new.created_by, source_created_by, 'LAND VIEW'),
        service_type = v_job.service_type,
        finance_scope = v_job.finance_scope
    where id = new.expense_id;
  end if;

  return new;
end;
$function$;

revoke all on function private.sync_outsourcing_payment_expense() from public, anon, authenticated;
