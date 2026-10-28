create or replace function public.queue_land_view_ledger_whatsapp_update()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_project_code text;
  v_project_name text;
  v_kind text;
  v_amount numeric;
  v_message text;
  v_balance numeric := 0;
  v_amount_text text;
  v_balance_text text;
  v_balance_label text := 'Current Balance';
  v_transaction_type_norm text;
  v_is_office_income boolean := false;
  v_is_office_expense boolean := false;
  v_is_client_payment boolean := false;
  v_is_project_expense boolean := false;
begin
  if upper(coalesce(new.source_type, '')) in ('MANUAL_IMPORT','OFFICIAL_LEDGER_IMPORT','RONY_PERSONAL') then
    return new;
  end if;

  v_transaction_type_norm := trim(regexp_replace(lower(coalesce(new.transaction_type, '')), '[_-]+', ' ', 'g'));

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
    select p.project_code, p.project_name into v_project_code, v_project_name
    from public.projects p
    where p.id = new.project_id
    limit 1;
  end if;

  with ledger_rows as (
    select
      t.transaction_code,
      t.transaction_date,
      t.ledger_order,
      coalesce(t.debit, 0) as effective_debit,
      coalesce(t.credit, 0) as effective_credit,
      trim(regexp_replace(lower(coalesce(t.transaction_type, '')), '[_-]+', ' ', 'g')) as transaction_type_norm,
      trim(regexp_replace(lower(coalesce(nullif(trim(t.status), ''), 'Posted')), '[_-]+', ' ', 'g')) as status_norm,
      coalesce(t.finance_scope, '') as finance_scope
    from public.transactions t
  ), included as (
    select *
    from ledger_rows
    where nullif(trim(coalesce(transaction_code, '')), '') is not null
      and transaction_date is not null
      and transaction_date >= date '2024-12-26'
      and (effective_debit > 0 or effective_credit > 0)
      and (
        (
          finance_scope = 'municipality_file_pass'
          and status_norm not in ('rejected', 'returned', 'cancelled', 'canceled', 'void', 'voided', 'draft')
        )
        or (
          finance_scope <> 'municipality_file_pass'
          and (
            transaction_code like 'TXN-LEDGER-2025-%'
            or transaction_code like 'TXN-HIST-2026-%'
            or (
              transaction_code not like 'TXN-LEDGER-2025-%'
              and transaction_code not like 'TXN-HIST-2026-%'
              and (
                status_norm = 'posted'
                or (
                  transaction_type_norm in ('expense', 'office expense')
                  and effective_debit > 0
                  and status_norm not in ('rejected', 'returned', 'cancelled', 'canceled', 'void', 'voided', 'draft', 'special ledger')
                )
              )
              and transaction_type_norm not in ('transfer', 'personal income', 'personal expense')
              and transaction_date between date '2026-09-01' and date '2026-12-31'
            )
          )
        )
      )
  )
  select coalesce(sum(effective_credit - effective_debit), 0)
    into v_balance
  from included
  where (
      (coalesce(new.finance_scope, '') = 'municipality_file_pass' and finance_scope = 'municipality_file_pass')
      or
      (coalesce(new.finance_scope, '') <> 'municipality_file_pass' and finance_scope <> 'municipality_file_pass')
    )
    and (
      transaction_date < new.transaction_date
      or (
        transaction_date = new.transaction_date
        and (
          coalesce(ledger_order, 2147483647) < coalesce(new.ledger_order, 2147483647)
          or (
            coalesce(ledger_order, 2147483647) = coalesce(new.ledger_order, 2147483647)
            and transaction_code <= new.transaction_code
          )
        )
      )
    );

  v_amount_text := '৳' || to_char(coalesce(v_amount, 0), 'FM999G999G999G999G990D00');
  v_balance_text := case
    when coalesce(v_balance, 0) < 0 then '-৳' || to_char(abs(v_balance), 'FM999G999G999G999G990D00')
    else '৳' || to_char(coalesce(v_balance, 0), 'FM999G999G999G999G990D00')
  end;
  if coalesce(new.finance_scope, '') = 'municipality_file_pass' then
    v_balance_label := 'Municipality Balance';
  end if;

  v_is_client_payment := new.project_id is not null
    and coalesce(new.credit, 0) > 0
    and coalesce(new.debit, 0) = 0
    and upper(coalesce(new.source_type, '')) = 'PAYMENT';

  v_is_project_expense := new.project_id is not null
    and coalesce(new.debit, 0) > 0
    and coalesce(new.credit, 0) = 0
    and (
      v_transaction_type_norm in ('expense', 'office expense')
      or upper(coalesce(new.source_type, '')) = 'EXPENSE'
    );

  v_is_office_income := new.project_id is null
    and coalesce(new.credit, 0) > 0
    and coalesce(new.debit, 0) = 0
    and (
      v_transaction_type_norm in ('office income', 'income')
      or upper(coalesce(new.source_type, '')) = 'PAYMENT'
    );

  v_is_office_expense := new.project_id is null
    and coalesce(new.debit, 0) > 0
    and coalesce(new.credit, 0) = 0
    and (
      v_transaction_type_norm in ('expense', 'office expense')
      or upper(coalesce(new.source_type, '')) = 'EXPENSE'
    );

  if v_is_client_payment then
    v_message := left(concat_ws(E'\n',
      '💵 *Client Payment*',
      '',
      'Project: ' || coalesce(nullif(trim(new.project_code_snapshot), ''), nullif(trim(coalesce(v_project_code, '')), ''), 'Project') || case when nullif(trim(coalesce(v_project_name, '')), '') is not null then ' — ' || trim(v_project_name) else '' end,
      'Received: ' || v_amount_text,
      'Date: ' || to_char(coalesce(new.transaction_date, current_date), 'DD Mon YYYY'),
      case when nullif(trim(coalesce(new.category, '')), '') is not null then 'Category: ' || trim(new.category) else null end,
      case when nullif(trim(coalesce(new.account_snapshot, '')), '') is not null then 'Received In: ' || trim(new.account_snapshot) else null end,
      case when nullif(trim(coalesce(new.description, '')), '') is not null then 'For: ' || regexp_replace(trim(new.description), E'[\r\n]+', ' ', 'g') else null end,
      case when nullif(trim(coalesce(new.payment_method, '')), '') is not null then 'Method: ' || trim(new.payment_method) else null end,
      case when nullif(trim(coalesce(new.reference_no, '')), '') is not null then 'Reference: ' || trim(new.reference_no) else null end,
      '',
      '*' || v_balance_label || ': ' || v_balance_text || '*'
    ), 4000);
  elsif v_is_project_expense then
    v_message := left(concat_ws(E'\n',
      '🔴 *Project Expense*',
      '',
      'Project: ' || coalesce(nullif(trim(new.project_code_snapshot), ''), nullif(trim(coalesce(v_project_code, '')), ''), 'Project') || case when nullif(trim(coalesce(v_project_name, '')), '') is not null then ' — ' || trim(v_project_name) else '' end,
      'Expense: ' || v_amount_text,
      'Date: ' || to_char(coalesce(new.transaction_date, current_date), 'DD Mon YYYY'),
      case when nullif(trim(coalesce(new.category, '')), '') is not null then 'Category: ' || trim(new.category) else null end,
      case when nullif(trim(coalesce(new.account_snapshot, '')), '') is not null then 'Paid From: ' || trim(new.account_snapshot) else null end,
      case when nullif(trim(coalesce(new.description, '')), '') is not null then 'For: ' || regexp_replace(trim(new.description), E'[\r\n]+', ' ', 'g') else null end,
      case when nullif(trim(coalesce(new.payment_method, '')), '') is not null then 'Method: ' || trim(new.payment_method) else null end,
      case when nullif(trim(coalesce(new.reference_no, '')), '') is not null then 'Reference: ' || trim(new.reference_no) else null end,
      '',
      '*' || v_balance_label || ': ' || v_balance_text || '*'
    ), 4000);
  elsif v_is_office_income then
    v_message := left(concat_ws(E'\n',
      '🟢 *Office Income*',
      '',
      'Income: ' || v_amount_text,
      'Date: ' || to_char(coalesce(new.transaction_date, current_date), 'DD Mon YYYY'),
      case when nullif(trim(coalesce(new.category, '')), '') is not null then 'Category: ' || trim(new.category) else null end,
      case when nullif(trim(coalesce(new.account_snapshot, '')), '') is not null then 'Received In: ' || trim(new.account_snapshot) else null end,
      case when nullif(trim(coalesce(new.description, '')), '') is not null then 'For: ' || regexp_replace(trim(new.description), E'[\r\n]+', ' ', 'g') else null end,
      case when nullif(trim(coalesce(new.payment_method, '')), '') is not null then 'Method: ' || trim(new.payment_method) else null end,
      case when nullif(trim(coalesce(new.reference_no, '')), '') is not null then 'Reference: ' || trim(new.reference_no) else null end,
      '',
      '*' || v_balance_label || ': ' || v_balance_text || '*'
    ), 4000);
  elsif v_is_office_expense then
    v_message := left(concat_ws(E'\n',
      '🔴 *Office Expense*',
      '',
      'Expense: ' || v_amount_text,
      'Date: ' || to_char(coalesce(new.transaction_date, current_date), 'DD Mon YYYY'),
      case when nullif(trim(coalesce(new.category, '')), '') is not null then 'Category: ' || trim(new.category) else null end,
      case when nullif(trim(coalesce(new.account_snapshot, '')), '') is not null then 'Paid From: ' || trim(new.account_snapshot) else null end,
      case when nullif(trim(coalesce(new.description, '')), '') is not null then 'For: ' || regexp_replace(trim(new.description), E'[\r\n]+', ' ', 'g') else null end,
      case when nullif(trim(coalesce(new.payment_method, '')), '') is not null then 'Method: ' || trim(new.payment_method) else null end,
      case when nullif(trim(coalesce(new.reference_no, '')), '') is not null then 'Reference: ' || trim(new.reference_no) else null end,
      '',
      '*' || v_balance_label || ': ' || v_balance_text || '*'
    ), 4000);
  else
    v_message := left(concat_ws(E'\n',
      '💰 *LAND VIEW — FINANCE LEDGER UPDATE*',
      '*Type:* ' || v_kind,
      '*Date:* ' || to_char(coalesce(new.transaction_date, current_date), 'DD Mon YYYY'),
      case when nullif(trim(coalesce(new.project_code_snapshot, '')), '') is not null then '*Project:* ' || trim(new.project_code_snapshot) || case when nullif(trim(coalesce(v_project_name, '')), '') is not null then ' — ' || trim(v_project_name) else '' end else null end,
      case when nullif(trim(coalesce(new.account_snapshot, '')), '') is not null then '*Account:* ' || trim(new.account_snapshot) else null end,
      case when nullif(trim(coalesce(new.category, '')), '') is not null then '*Category:* ' || trim(new.category) else null end,
      case when nullif(trim(coalesce(new.description, '')), '') is not null then '*Details:* ' || regexp_replace(trim(new.description), E'[\r\n]+', ' ', 'g') else null end,
      '*Amount:* BDT ' || to_char(coalesce(v_amount, 0), 'FM999G999G999G999G990D00'),
      '*' || v_balance_label || ':* BDT ' || to_char(coalesce(v_balance, 0), 'FM999G999G999G999G990D00'),
      case when nullif(trim(coalesce(new.payment_method, '')), '') is not null then '*Method:* ' || trim(new.payment_method) else null end,
      case when nullif(trim(coalesce(new.reference_no, '')), '') is not null then '*Reference:* ' || trim(new.reference_no) else null end,
      case when nullif(trim(coalesce(new.transaction_code, '')), '') is not null then '*Transaction:* ' || trim(new.transaction_code) else null end,
      case when nullif(trim(coalesce(new.source_created_by, '')), '') is not null then '*Added By:* ' || trim(new.source_created_by) else null end,
      '_Saved automatically from the LAND VIEW Finance Ledger._'
    ), 4000);
  end if;

  insert into public.whatsapp_finance_outbox (dedupe_key, message, group_invite_code)
  values ('landview-ledger:' || new.id::text, v_message, 'name:LAND VIEW Finance')
  on conflict (dedupe_key) do nothing;

  begin
    perform net.http_get(url := 'https://landview-whatsapp-bot.onrender.com/health', timeout_milliseconds := 30000);
  exception when others then null;
  end;

  return new;
end;
$function$;
