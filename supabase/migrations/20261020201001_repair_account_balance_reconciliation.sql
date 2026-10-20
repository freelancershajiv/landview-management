-- LAND VIEW account reconciliation repair.
-- Preserve migrated physical balances as explicit opening balances, align account
-- snapshots with effective account movements, and prevent future status drift.

with effective_movement as (
  select account_id,
         coalesce(sum(coalesce(credit, 0) - coalesce(debit, 0)), 0)::numeric as movement
  from public.transactions
  where account_id is not null
    and lower(regexp_replace(trim(coalesce(nullif(status, ''), 'POSTED')), '[_-]+', ' ', 'g'))
        in ('posted', 'pre approved', 'special ledger')
  group by account_id
)
update public.accounts a
set opening_balance = round(
      coalesce(a.current_balance_snapshot, 0) - coalesce(m.movement, 0),
      2
    ),
    updated_at = now()
from effective_movement m
where m.account_id = a.id;

update public.accounts a
set opening_balance = round(coalesce(a.current_balance_snapshot, 0), 2),
    updated_at = now()
where not exists (
  select 1
  from public.transactions t
  where t.account_id = a.id
    and lower(regexp_replace(trim(coalesce(nullif(t.status, ''), 'POSTED')), '[_-]+', ' ', 'g'))
        in ('posted', 'pre approved', 'special ledger')
);

create or replace function private.resolve_transaction_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.accounts%rowtype;
  v_name text;
begin
  if new.account_id is not null then
    select * into v_account from public.accounts where id = new.account_id limit 1;
  end if;

  if v_account.id is null and nullif(trim(coalesce(new.account_code_snapshot, '')), '') is not null then
    select * into v_account
    from public.accounts
    where lower(trim(account_code)) = lower(trim(new.account_code_snapshot))
    limit 1;
  end if;

  v_name := lower(trim(coalesce(new.account_snapshot, '')));

  if v_account.id is null and v_name <> '' then
    select * into v_account
    from public.accounts
    where lower(trim(account_name)) = v_name
    limit 1;
  end if;

  if v_account.id is null and v_name in ('bank', 'bank account') then
    select * into v_account
    from public.accounts
    where lower(trim(account_name)) = 'bank account'
       or lower(trim(account_code)) = 'acc-bank'
    order by case when lower(trim(account_code)) = 'acc-bank' then 0 else 1 end
    limit 1;
  end if;

  if v_account.id is null and v_name in ('other', 'other account') then
    select * into v_account
    from public.accounts
    where lower(trim(account_name)) = 'other account'
    limit 1;
  end if;

  if v_account.id is not null then
    new.account_id := v_account.id;
    new.account_code_snapshot := v_account.account_code;
    new.account_snapshot := v_account.account_name;
  end if;

  return new;
end;
$$;

revoke all on function private.resolve_transaction_account() from public;

drop trigger if exists trg_transactions_resolve_account on public.transactions;
create trigger trg_transactions_resolve_account
before insert or update of account_id, account_code_snapshot, account_snapshot
on public.transactions
for each row
execute function private.resolve_transaction_account();

create or replace function private.apply_transaction_balance_delta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_delta numeric := 0;
  new_delta numeric := 0;
  old_effective boolean := false;
  new_effective boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_effective := lower(regexp_replace(trim(coalesce(nullif(old.status, ''), 'POSTED')), '[_-]+', ' ', 'g'))
                     in ('posted', 'pre approved', 'special ledger');
    if old_effective and old.account_id is not null then
      old_delta := coalesce(old.credit, 0) - coalesce(old.debit, 0);
    end if;
  end if;

  if tg_op <> 'DELETE' then
    new_effective := lower(regexp_replace(trim(coalesce(nullif(new.status, ''), 'POSTED')), '[_-]+', ' ', 'g'))
                     in ('posted', 'pre approved', 'special ledger');
    if new_effective and new.account_id is not null then
      new_delta := coalesce(new.credit, 0) - coalesce(new.debit, 0);
    end if;
  end if;

  if tg_op = 'DELETE' then
    if old.account_id is not null and old_delta <> 0 then
      update public.accounts
      set current_balance_snapshot = coalesce(current_balance_snapshot, opening_balance, 0) - old_delta,
          updated_at = now()
      where id = old.account_id;
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.account_id is not null and new_delta <> 0 then
      update public.accounts
      set current_balance_snapshot = coalesce(current_balance_snapshot, opening_balance, 0) + new_delta,
          updated_at = now()
      where id = new.account_id;
    end if;
    return new;
  end if;

  if old.account_id is distinct from new.account_id then
    if old.account_id is not null and old_delta <> 0 then
      update public.accounts
      set current_balance_snapshot = coalesce(current_balance_snapshot, opening_balance, 0) - old_delta,
          updated_at = now()
      where id = old.account_id;
    end if;
    if new.account_id is not null and new_delta <> 0 then
      update public.accounts
      set current_balance_snapshot = coalesce(current_balance_snapshot, opening_balance, 0) + new_delta,
          updated_at = now()
      where id = new.account_id;
    end if;
  elsif new.account_id is not null and new_delta is distinct from old_delta then
    update public.accounts
    set current_balance_snapshot = coalesce(current_balance_snapshot, opening_balance, 0) + (new_delta - old_delta),
        updated_at = now()
    where id = new.account_id;
  end if;

  return new;
end;
$$;

update public.transactions t
set account_id = t.account_id
where t.account_id is null
  and (
    nullif(trim(coalesce(t.account_code_snapshot, '')), '') is not null
    or lower(trim(coalesce(t.account_snapshot, ''))) in (
      select lower(trim(account_name)) from public.accounts
    )
    or lower(trim(coalesce(t.account_snapshot, ''))) in ('bank', 'bank account', 'other', 'other account')
  );

with effective_movement as (
  select account_id,
         coalesce(sum(coalesce(credit, 0) - coalesce(debit, 0)), 0)::numeric as movement
  from public.transactions
  where account_id is not null
    and lower(regexp_replace(trim(coalesce(nullif(status, ''), 'POSTED')), '[_-]+', ' ', 'g'))
        in ('posted', 'pre approved', 'special ledger')
  group by account_id
)
update public.accounts a
set current_balance_snapshot = round(
      coalesce(a.opening_balance, 0) + coalesce(m.movement, 0),
      2
    ),
    updated_at = now()
from effective_movement m
where m.account_id = a.id;

update public.accounts a
set current_balance_snapshot = round(coalesce(a.opening_balance, 0), 2),
    updated_at = now()
where not exists (
  select 1
  from public.transactions t
  where t.account_id = a.id
    and lower(regexp_replace(trim(coalesce(nullif(t.status, ''), 'POSTED')), '[_-]+', ' ', 'g'))
        in ('posted', 'pre approved', 'special ledger')
);

create or replace view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.account_code,
  a.account_name,
  a.account_type,
  a.currency,
  a.opening_balance,
  coalesce(sum(case when t.direction = 'CREDIT' then coalesce(t.amount, t.credit, 0) else 0 end), 0)::numeric(16,2) as credits,
  coalesce(sum(case when t.direction = 'DEBIT' then coalesce(t.amount, t.debit, 0) else 0 end), 0)::numeric(16,2) as debits,
  (
    a.opening_balance
    + coalesce(sum(case when t.direction = 'CREDIT' then coalesce(t.amount, t.credit, 0) else 0 end), 0)
    - coalesce(sum(case when t.direction = 'DEBIT' then coalesce(t.amount, t.debit, 0) else 0 end), 0)
  )::numeric(16,2) as calculated_balance,
  a.current_balance_snapshot
from public.accounts a
left join public.transactions t
  on t.account_id = a.id
 and lower(regexp_replace(trim(coalesce(nullif(t.status, ''), 'POSTED')), '[_-]+', ' ', 'g'))
     in ('posted', 'pre approved', 'special ledger')
where (
  (select private.is_admin())
  or coalesce((select auth.jwt() ->> 'role') = 'service_role', false)
)
group by
  a.id,
  a.account_code,
  a.account_name,
  a.account_type,
  a.currency,
  a.opening_balance,
  a.current_balance_snapshot;

grant all on public.account_balances to authenticated, service_role;
