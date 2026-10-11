create or replace function public.queue_land_view_ledger_whatsapp_update()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_project_name text;
  v_kind text;
  v_amount numeric;
  v_message text;
  v_balance numeric := 0;
begin
  if upper(coalesce(new.source_type, '')) in ('MANUAL_IMPORT','OFFICIAL_LEDGER_IMPORT','RONY_PERSONAL') then
    return new;
  end if;

  if coalesce(new.credit, 0) > 0 and coalesce(new.debit, 0) = 0 then
    v_kind := case when upper(coalesce(new.source_type, '')) = 'PAYMENT' then '🟢 Client Payment / Income' else '🟢 Income' end;
    v_amount := new.credit;
  elsif coalesce(new.debit, 0) > 0 and coalesce(new.credit, 0) = 0 then
    v_kind := '🔴 Expense';
    v_amount := new.debit;
  elsif coalesce(new.amount, 0) > 0 then
    v_kind := case when upper(coalesce(new.direction, '')) = 'CREDIT' then '🟢 Income' else '🔴 Expense' end;
    v_amount := new.amount;
  else
    return new;
  end if;

  if new.project_id is not null then
    select p.project_name into v_project_name
    from public.projects p
    where p.id = new.project_id
    limit 1;
  end if;

  -- 26 Dec 2024 is the first counted accounting date. Older transactions stay
  -- visible for historical/project cross-verification but have zero balance impact.
  with ledger_rows as (
    select
      t.transaction_code,
      t.transaction_date,
      t.ledger_order,
      coalesce(t.debit, 0) as effective_debit,
      coalesce(t.credit, 0) as effective_credit,
      trim(regexp_replace(lower(coalesce(t.transaction_type, '')), '[_-]+', ' ', 'g')) as transaction_type_norm,
      trim(regexp_replace(lower(coalesce(nullif(trim(t.status), ''), 'Posted')), '[_-]+', ' ', 'g')) as status_norm
    from public.transactions t
  ), included as (
    select *
    from ledger_rows
    where nullif(trim(coalesce(transaction_code, '')), '') is not null
      and transaction_date is not null
      and transaction_date >= date '2024-12-26'
      and (effective_debit > 0 or effective_credit > 0)
      and (
        transaction_code like 'TXN-LEDGER-2025-%'
        or transaction_code like 'TXN-HIST-2026-%'
        or (
          transaction_code not like 'TXN-LEDGER-2025-%'
          and transaction_code not like 'TXN-HIST-2026-%'
          and status_norm = 'posted'
          and transaction_type_norm not in ('transfer', 'personal income', 'personal expense')
          and transaction_date between date '2026-09-01' and date '2026-12-31'
        )
      )
  )
  select coalesce(sum(effective_credit - effective_debit), 0)
    into v_balance
  from included
  where transaction_date < new.transaction_date
     or (
       transaction_date = new.transaction_date
       and (
         coalesce(ledger_order, 2147483647) < coalesce(new.ledger_order, 2147483647)
         or (
           coalesce(ledger_order, 2147483647) = coalesce(new.ledger_order, 2147483647)
           and transaction_code <= new.transaction_code
         )
       )
     );

  v_message := left(concat_ws(E'\n',
    '💰 *LAND VIEW — FINANCE LEDGER UPDATE*',
    '*Type:* ' || v_kind,
    '*Date:* ' || to_char(coalesce(new.transaction_date, current_date), 'DD Mon YYYY'),
    case when nullif(trim(coalesce(new.project_code_snapshot, '')), '') is not null then '*Project:* ' || trim(new.project_code_snapshot) || case when nullif(trim(coalesce(v_project_name, '')), '') is not null then ' — ' || trim(v_project_name) else '' end else null end,
    case when nullif(trim(coalesce(new.account_snapshot, '')), '') is not null then '*Account:* ' || trim(new.account_snapshot) else null end,
    case when nullif(trim(coalesce(new.category, '')), '') is not null then '*Category:* ' || trim(new.category) else null end,
    case when nullif(trim(coalesce(new.description, '')), '') is not null then '*Details:* ' || regexp_replace(trim(new.description), E'[\r\n]+', ' ', 'g') else null end,
    '*Amount:* BDT ' || to_char(coalesce(v_amount, 0), 'FM999G999G999G999G990D00'),
    '*Current Balance:* BDT ' || to_char(coalesce(v_balance, 0), 'FM999G999G999G999G990D00'),
    case when nullif(trim(coalesce(new.payment_method, '')), '') is not null then '*Method:* ' || trim(new.payment_method) else null end,
    case when nullif(trim(coalesce(new.reference_no, '')), '') is not null then '*Reference:* ' || trim(new.reference_no) else null end,
    case when nullif(trim(coalesce(new.transaction_code, '')), '') is not null then '*Transaction:* ' || trim(new.transaction_code) else null end,
    case when nullif(trim(coalesce(new.source_created_by, '')), '') is not null then '*Added By:* ' || trim(new.source_created_by) else null end,
    '_Saved automatically from the LAND VIEW Finance Ledger._'
  ), 4000);

  insert into public.whatsapp_finance_outbox (dedupe_key, message, group_invite_code)
  values ('landview-ledger:' || new.id::text, v_message, 'name:LAND VIEW Finance')
  on conflict (dedupe_key) do nothing;

  begin
    perform net.http_get(url := 'https://landview-whatsapp-bot.onrender.com/health', timeout_milliseconds := 5000);
  exception when others then null; end;
  return new;
end;
$function$;
