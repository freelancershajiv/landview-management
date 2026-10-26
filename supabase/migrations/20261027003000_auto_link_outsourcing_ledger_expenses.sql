alter table public.outsourcing_payments
  add column if not exists expense_origin text not null default 'generated';

alter table public.outsourcing_payments
  drop constraint if exists outsourcing_payments_expense_origin_check;
alter table public.outsourcing_payments
  add constraint outsourcing_payments_expense_origin_check
  check (expense_origin in ('generated','linked'));

insert into public.outsourcing_parties (
  party_code, name, party_type, expertise, notes, active, created_by
)
values (
  'OUTP-UNASSIGNED',
  'Unassigned Outsource Vendor',
  'Firm',
  'Needs vendor assignment',
  'System placeholder for outsourced ledger expenses where Paid To was not recorded.',
  true,
  'LAND VIEW'
)
on conflict (party_code) do update
set active = true,
    updated_at = now();

create or replace function private.normalize_outsourcing_service(p_value text)
returns text
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v text := lower(trim(coalesce(p_value,'')));
begin
  v := replace(replace(v, '–', '-'), '—', '-');
  if v ~ 'digital[[:space:]-]*survey' then
    return 'Digital Survey';
  elsif v ~ 'soil[[:space:]-]*test' then
    return 'Soil Test';
  elsif v ~ 'electrical[[:space:]-]*design' then
    return 'Electrical Design';
  elsif v ~ '3d[[:space:]-]*design' then
    if v ~ 'interior' then
      return '3D Design – Interior';
    elsif v ~ 'exterior' then
      return '3D Design – Exterior';
    else
      return '3D Design';
    end if;
  end if;
  return null;
end;
$function$;

revoke all on function private.normalize_outsourcing_service(text) from public, anon, authenticated;

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
  v_expense_id uuid;
  v_expense_code text;
  v_description text;
  v_status text;
  v_category text;
begin
  -- Ledger-linked outsourcing payments do not own the Accounts expense.
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

create or replace function private.sync_outsourcing_for_expense(p_expense_id uuid)
returns void
language plpgsql
set search_path to ''
as $function$
declare
  v_expense public.expenses%rowtype;
  v_service text;
  v_party_id uuid;
  v_job_id uuid;
  v_existing_payment public.outsourcing_payments%rowtype;
  v_existing_job public.outsourcing_jobs%rowtype;
  v_old_job_id uuid;
  v_paid_to text;
  v_payment_code text;
  v_job_code text;
  v_party_code text;
  v_paid numeric(14,2);
  v_actor text;
  v_is_active boolean;
begin
  select * into v_expense from public.expenses where id = p_expense_id;
  if v_expense.id is null then return; end if;

  -- Expenses generated by the Outsourcing module are already represented there.
  if upper(coalesce(v_expense.expense_code,'')) like 'EXP-OUT-%' then return; end if;

  select * into v_existing_payment
  from public.outsourcing_payments
  where expense_id = v_expense.id
  limit 1;
  v_old_job_id := v_existing_payment.job_id;

  v_service := private.normalize_outsourcing_service(concat_ws(' ',
    coalesce(v_expense.service_type,''),
    coalesce(v_expense.category,''),
    coalesce(v_expense.description,'')
  ));

  v_is_active := lower(trim(coalesce(v_expense.finance_scope,'main'))) = 'main'
    and v_expense.project_id is not null
    and lower(trim(coalesce(v_expense.status,'posted'))) not in ('void','voided','cancelled','canceled','rejected','draft')
    and lower(trim(coalesce(v_expense.approval_status,'approved'))) not in ('rejected','cancelled','canceled','void','voided')
    and v_service is not null;

  if not v_is_active then
    if v_existing_payment.id is not null and coalesce(v_existing_payment.expense_origin,'generated') = 'linked' then
      update public.outsourcing_payments
      set status = 'VOID'
      where id = v_existing_payment.id and status <> 'VOID';

      if v_old_job_id is not null then
        select coalesce(sum(amount),0) into v_paid
        from public.outsourcing_payments
        where job_id = v_old_job_id and status = 'POSTED';
        if v_paid = 0 and exists (
          select 1 from public.outsourcing_jobs
          where id = v_old_job_id and job_code like 'OUTJOB-AUTO-%'
        ) then
          update public.outsourcing_jobs
          set agreed_amount = 0, status = 'Cancelled'
          where id = v_old_job_id;
        end if;
      end if;
    end if;
    return;
  end if;

  v_actor := coalesce(nullif(trim(coalesce(v_expense.source_created_by,'')),''),
                      nullif(trim(coalesce(v_expense.requested_by_code,'')),''),
                      'LAND VIEW');
  v_paid_to := nullif(trim(coalesce(v_expense.paid_to,'')), '');

  if v_paid_to is not null then
    select id into v_party_id
    from public.outsourcing_parties
    where active = true
      and (
        lower(trim(name)) = lower(v_paid_to)
        or extensions.word_similarity(lower(v_paid_to), lower(name)) >= 0.50
      )
    order by
      case when lower(trim(name)) = lower(v_paid_to) then 0 else 1 end,
      extensions.word_similarity(lower(v_paid_to), lower(name)) desc,
      created_at asc
    limit 1;

    if v_party_id is null then
      v_party_code := 'OUTP-AUTO-' || upper(substr(md5(lower(v_paid_to)),1,10));
      insert into public.outsourcing_parties (
        party_code,name,party_type,expertise,preferred_payment_method,notes,active,created_by
      ) values (
        v_party_code,v_paid_to,'Individual',v_service,nullif(v_expense.payment_method,''),
        'Auto-created from Main Accounts expense ' || v_expense.expense_code || '.',true,v_actor
      )
      on conflict (party_code) do update
      set active = true,
          expertise = case
            when coalesce(public.outsourcing_parties.expertise,'') = '' then excluded.expertise
            else public.outsourcing_parties.expertise
          end,
          updated_at = now()
      returning id into v_party_id;
    end if;
  else
    select id into v_party_id
    from public.outsourcing_parties
    where party_code = 'OUTP-UNASSIGNED'
    limit 1;
  end if;

  if v_existing_payment.id is not null then
    select * into v_existing_job from public.outsourcing_jobs where id = v_existing_payment.job_id;
    if v_existing_job.id is not null
       and v_existing_job.project_id is not distinct from v_expense.project_id
       and v_existing_job.party_id is not distinct from v_party_id
       and v_existing_job.service_type = v_service then
      v_job_id := v_existing_job.id;
      if v_existing_job.status = 'Cancelled' then
        update public.outsourcing_jobs set status = 'In Progress' where id = v_job_id;
      end if;
    end if;
  end if;

  if v_job_id is null then
    select id into v_job_id
    from public.outsourcing_jobs
    where project_id is not distinct from v_expense.project_id
      and party_id is not distinct from v_party_id
      and service_type = v_service
      and status <> 'Cancelled'
    order by created_at desc
    limit 1;
  end if;

  if v_job_id is null then
    v_job_code := 'OUTJOB-AUTO-' || upper(substr(md5(v_expense.id::text),1,12));
    insert into public.outsourcing_jobs (
      job_code,project_id,party_id,service_type,scope_description,assigned_date,
      agreed_amount,status,notes,created_by
    ) values (
      v_job_code,v_expense.project_id,v_party_id,v_service,
      nullif(trim(coalesce(v_expense.description,'')),''),
      coalesce(v_expense.expense_date,current_date),
      v_expense.amount,'In Progress',
      'Auto-linked from Main Accounts. Source expense: ' || v_expense.expense_code || '.',
      v_actor
    )
    returning id into v_job_id;
  end if;

  v_payment_code := 'OUTPAY-LINK-' || upper(substr(replace(v_expense.id::text,'-',''),1,12));

  if v_existing_payment.id is null then
    insert into public.outsourcing_payments (
      payment_code,job_id,payment_date,amount,payment_method,reference_no,notes,status,
      expense_id,expense_origin,created_by
    ) values (
      v_payment_code,v_job_id,coalesce(v_expense.expense_date,current_date),v_expense.amount,
      v_expense.payment_method,coalesce(v_expense.reference_no,v_expense.reference),
      trim(concat_ws(' · ','Linked from Main Accounts',nullif(v_expense.description,''))),
      'POSTED',v_expense.id,'linked',v_actor
    );
  else
    update public.outsourcing_payments
    set job_id = v_job_id,
        payment_date = coalesce(v_expense.expense_date,current_date),
        amount = v_expense.amount,
        payment_method = v_expense.payment_method,
        reference_no = coalesce(v_expense.reference_no,v_expense.reference),
        notes = trim(concat_ws(' · ','Linked from Main Accounts',nullif(v_expense.description,''))),
        status = 'POSTED',
        expense_origin = 'linked',
        created_by = coalesce(created_by,v_actor)
    where id = v_existing_payment.id;
  end if;

  select coalesce(sum(amount),0) into v_paid
  from public.outsourcing_payments
  where job_id = v_job_id and status = 'POSTED';

  update public.outsourcing_jobs
  set agreed_amount = greatest(agreed_amount,v_paid),
      status = case when status = 'Cancelled' then 'In Progress' else status end
  where id = v_job_id;

  if v_old_job_id is not null and v_old_job_id <> v_job_id then
    select coalesce(sum(amount),0) into v_paid
    from public.outsourcing_payments
    where job_id = v_old_job_id and status = 'POSTED';
    if v_paid = 0 and exists (
      select 1 from public.outsourcing_jobs
      where id = v_old_job_id and job_code like 'OUTJOB-AUTO-%'
    ) then
      update public.outsourcing_jobs
      set agreed_amount = 0, status = 'Cancelled'
      where id = v_old_job_id;
    end if;
  end if;
end;
$function$;

revoke all on function private.sync_outsourcing_for_expense(uuid) from public, anon, authenticated;

create or replace function private.sync_outsourcing_expense_trigger()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  perform private.sync_outsourcing_for_expense(new.id);
  return new;
end;
$function$;

revoke all on function private.sync_outsourcing_expense_trigger() from public, anon, authenticated;

drop trigger if exists trg_expense_outsourcing_auto_link on public.expenses;
create trigger trg_expense_outsourcing_auto_link
after insert or update of project_id, expense_date, category, description, amount, paid_to,
  payment_method, reference_no, reference, status, approval_status, service_type, finance_scope
on public.expenses
for each row execute function private.sync_outsourcing_expense_trigger();

do $function$
declare
  r record;
begin
  for r in
    select e.id
    from public.expenses e
    where e.project_id is not null
      and lower(coalesce(e.finance_scope,'main')) = 'main'
      and lower(coalesce(e.status,'posted')) not in ('void','voided','cancelled','canceled','rejected','draft')
      and private.normalize_outsourcing_service(concat_ws(' ',
        coalesce(e.service_type,''),coalesce(e.category,''),coalesce(e.description,'')
      )) is not null
  loop
    perform private.sync_outsourcing_for_expense(r.id);
  end loop;
end;
$function$;