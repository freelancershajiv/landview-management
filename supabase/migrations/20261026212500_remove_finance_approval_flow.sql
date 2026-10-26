drop trigger if exists trg_enforce_emp0001_expense_approval on public.expenses;
drop function if exists public.enforce_emp0001_expense_approval();

create or replace function public.force_finance_expense_immediate_post()
returns trigger
language plpgsql
as $$
declare
  normalized_status text := lower(trim(coalesce(new.status, '')));
  normalized_scope text := lower(trim(coalesce(new.finance_scope, 'main')));
begin
  if normalized_scope not in ('main', 'municipality_file_pass') then
    return new;
  end if;

  if normalized_status in ('void', 'voided', 'cancelled', 'canceled', 'rejected', 'draft') then
    return new;
  end if;

  new.approval_status := 'Approved';
  new.status := 'POSTED';
  new.approved_by_code := coalesce(
    nullif(trim(coalesce(new.approved_by_code, '')), ''),
    nullif(trim(coalesce(new.source_created_by, '')), ''),
    nullif(trim(coalesce(new.requested_by_code, '')), ''),
    'LAND VIEW'
  );
  new.approved_at := coalesce(new.approved_at, now());
  new.reviewed_by_code := coalesce(nullif(trim(coalesce(new.reviewed_by_code, '')), ''), new.approved_by_code);
  new.reviewed_at := coalesce(new.reviewed_at, new.approved_at, now());
  new.decided_at := coalesce(new.decided_at, new.approved_at, now());
  return new;
end;
$$;

create or replace function public.force_finance_payment_immediate_post()
returns trigger
language plpgsql
as $$
declare
  normalized_status text := lower(trim(coalesce(new.status, '')));
begin
  if coalesce(new.is_legacy_manual, false) then
    return new;
  end if;

  if normalized_status in ('void', 'voided', 'cancelled', 'canceled', 'rejected', 'draft') then
    return new;
  end if;

  new.approval_status := 'Approved';
  if normalized_status in ('', 'pending', 'approved', 'received') then
    new.status := 'POSTED';
  end if;
  new.approved_by := coalesce(
    nullif(trim(coalesce(new.approved_by, '')), ''),
    nullif(trim(coalesce(new.received_by, '')), ''),
    nullif(trim(coalesce(new.source_created_by, '')), ''),
    'LAND VIEW'
  );
  new.approved_at := coalesce(new.approved_at, now());
  new.reviewed_by := coalesce(nullif(trim(coalesce(new.reviewed_by, '')), ''), new.approved_by);
  new.reviewed_at := coalesce(new.reviewed_at, new.approved_at, now());
  return new;
end;
$$;

drop trigger if exists trg_force_finance_expense_immediate_post on public.expenses;
create trigger trg_force_finance_expense_immediate_post
before insert or update on public.expenses
for each row execute function public.force_finance_expense_immediate_post();

drop trigger if exists trg_force_finance_payment_immediate_post on public.payments;
create trigger trg_force_finance_payment_immediate_post
before insert or update on public.payments
for each row execute function public.force_finance_payment_immediate_post();

alter table public.expenses alter column approval_status set default 'Approved';
alter table public.expenses alter column status set default 'POSTED';
alter table public.payments alter column approval_status set default 'Approved';
alter table public.payments alter column status set default 'POSTED';

update public.expenses
set approval_status = 'Approved',
    status = 'POSTED',
    approved_by_code = coalesce(nullif(trim(coalesce(approved_by_code, '')), ''), nullif(trim(coalesce(source_created_by, '')), ''), nullif(trim(coalesce(requested_by_code, '')), ''), 'LAND VIEW'),
    approved_at = coalesce(approved_at, now()),
    reviewed_by_code = coalesce(nullif(trim(coalesce(reviewed_by_code, '')), ''), nullif(trim(coalesce(source_created_by, '')), ''), nullif(trim(coalesce(requested_by_code, '')), ''), 'LAND VIEW'),
    reviewed_at = coalesce(reviewed_at, now()),
    decided_at = coalesce(decided_at, now())
where lower(coalesce(finance_scope, 'main')) in ('main', 'municipality_file_pass')
  and (lower(coalesce(approval_status, '')) = 'pending' or lower(coalesce(status, '')) = 'pending');

update public.payments
set approval_status = 'Approved',
    status = case when lower(coalesce(status, '')) in ('', 'pending', 'approved', 'received') then 'POSTED' else status end,
    approved_by = coalesce(nullif(trim(coalesce(approved_by, '')), ''), nullif(trim(coalesce(received_by, '')), ''), nullif(trim(coalesce(source_created_by, '')), ''), 'LAND VIEW'),
    approved_at = coalesce(approved_at, now()),
    reviewed_by = coalesce(nullif(trim(coalesce(reviewed_by, '')), ''), nullif(trim(coalesce(received_by, '')), ''), nullif(trim(coalesce(source_created_by, '')), ''), 'LAND VIEW'),
    reviewed_at = coalesce(reviewed_at, now())
where coalesce(is_legacy_manual, false) = false
  and (lower(coalesce(approval_status, '')) = 'pending' or lower(coalesce(status, '')) = 'pending');
