create or replace function public.queue_project_finance_whatsapp_update()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_group text;
  v_group_enabled boolean := false;
  v_project_code text;
  v_project_name text;
  v_kind text;
  v_amount numeric;
  v_party_label text;
  v_party_value text;
  v_details text;
  v_message text;
  v_balance numeric := 0;
  v_is_hold boolean := false;
  v_was_hold boolean := false;
  v_cashed_transition boolean := false;
  v_dedupe_key text;
  v_source text := lower(trim(coalesce(new.source, '')));
  v_paid_to text;
  v_cash_impact numeric := 0;
  v_amount_text text;
  v_balance_text text;
begin
  v_is_hold := lower(trim(coalesce(new.category, ''))) = 'cheque'
    and coalesce(new.debit, 0) > 0
    and coalesce(new.credit, 0) = 0
    and (
      lower(trim(coalesce(new.cheque_status, ''))) = 'on_hold'
      or coalesce(new.memo, '') ~* '^CHEQUE_STATUS:ON_HOLD'
    );

  if tg_op = 'UPDATE' then
    v_was_hold := lower(trim(coalesce(old.category, ''))) = 'cheque'
      and coalesce(old.debit, 0) > 0
      and coalesce(old.credit, 0) = 0
      and (
        lower(trim(coalesce(old.cheque_status, ''))) = 'on_hold'
        or coalesce(old.memo, '') ~* '^CHEQUE_STATUS:ON_HOLD'
      );

    v_cashed_transition := v_was_hold
      and not v_is_hold
      and lower(trim(coalesce(new.category, ''))) = 'cheque'
      and coalesce(new.debit, 0) > 0
      and coalesce(new.credit, 0) = 0
      and (
        lower(trim(coalesce(new.cheque_status, ''))) = 'cashed'
        or coalesce(new.memo, '') ~* '^CHEQUE_STATUS:CASHED'
      );

    if not v_cashed_transition then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    if v_source not in (
      'project_management',
      'supplier_advance_fund',
      'supplier_advance_cash',
      'supplier_direct_purchase',
      'supplier_delivery'
    ) then
      return new;
    end if;
    if v_is_hold then
      return new;
    end if;
  else
    return new;
  end if;

  v_paid_to := nullif(trim(coalesce(new.paid_to, new.supplier, '')), '');

  if v_source = 'supplier_delivery' then
    v_kind := 'Supplier Delivery';
    v_amount := coalesce(new.credit, 0);
    v_party_label := 'Supplier';
    v_party_value := v_paid_to;
    v_cash_impact := 0;
  elsif v_source = 'supplier_advance_cash' then
    v_kind := 'Expense';
    v_amount := coalesce(new.credit, 0);
    v_party_label := 'Paid To';
    v_party_value := v_paid_to;
    v_cash_impact := -coalesce(new.credit, 0);
  elsif v_source = 'supplier_direct_purchase' then
    v_kind := 'Expense';
    v_amount := coalesce(new.credit, 0);
    v_party_label := 'Paid To';
    v_party_value := v_paid_to;
    v_cash_impact := -greatest(coalesce(new.credit, 0) - coalesce(new.supplier_advance_applied, 0), 0);
  elsif v_source = 'supplier_advance_fund' then
    v_kind := 'Fund to Supplier';
    v_amount := coalesce(new.debit, 0);
    v_party_label := 'Received From';
    v_party_value := nullif(trim(coalesce(new.received_from, '')), '');
    v_cash_impact := 0;
  elsif coalesce(new.debit, 0) > 0 and coalesce(new.credit, 0) = 0 then
    v_kind := 'Income';
    v_amount := new.debit;
    v_party_label := 'Received From';
    v_party_value := nullif(trim(coalesce(new.received_from, '')), '');
    v_cash_impact := coalesce(new.debit, 0);
  elsif coalesce(new.credit, 0) > 0 and coalesce(new.debit, 0) = 0 then
    v_kind := 'Expense';
    v_amount := new.credit;
    v_party_label := 'Paid To';
    v_party_value := v_paid_to;
    v_cash_impact := -coalesce(new.credit, 0);
  else
    return new;
  end if;

  select
    coalesce(nullif(trim(p.whatsapp_group_target), ''), nullif(trim(s.whatsapp_group_invite_code), '')),
    coalesce(p.whatsapp_group_updates_enabled, false),
    p.project_code,
    p.project_name
  into v_group, v_group_enabled, v_project_code, v_project_name
  from public.projects p
  left join public.project_management_summary s on s.project_id = p.id
  where p.id = new.project_id
  limit 1;

  if not v_group_enabled or v_group is null then
    return new;
  end if;

  with classified as (
    select
      r.*,
      case
        when r.entry_date::date in (date '2025-11-20', date '2025-11-23') then false
        else lower(trim(coalesce(r.paid_to, r.supplier, ''))) like '%sattapur%'
          or lower(coalesce(r.details, '')) like '%sattapur brick%'
      end as is_sattapur,
      (
        lower(trim(coalesce(r.category, ''))) = 'cheque'
        and coalesce(r.debit, 0) > 0
        and (
          lower(trim(coalesce(r.cheque_status, ''))) = 'on_hold'
          or coalesce(r.memo, '') ~* '^CHEQUE_STATUS:ON_HOLD'
        )
      ) as is_held_cheque
    from public.project_management_ledger r
    where r.project_id = new.project_id
  )
  select
    coalesce(sum(coalesce(r.debit, 0)), 0)
    - coalesce(sum(
        case
          when r.is_sattapur
            and coalesce(r.credit, 0) > 0
            and lower(trim(coalesce(r.category, ''))) = 'bricks'
          then 0
          else coalesce(r.credit, 0)
        end
      ), 0)
    - coalesce(sum(
        case when r.is_sattapur and coalesce(r.debit, 0) > 0
          then coalesce(r.debit, 0)
          else 0
        end
      ), 0)
    - coalesce(sum(
        case when r.is_held_cheque then coalesce(r.debit, 0) else 0 end
      ), 0)
    into v_balance
  from classified r;

  v_details := regexp_replace(coalesce(new.details, ''), E'[\\r\\n]+', ' ', 'g');
  v_amount_text := '৳' || to_char(coalesce(v_amount, 0), 'FM999G999G999G999G990D00');
  v_balance_text := case
    when coalesce(v_balance, 0) < 0 then '-৳' || to_char(abs(v_balance), 'FM999G999G999G999G990D00')
    else '৳' || to_char(coalesce(v_balance, 0), 'FM999G999G999G999G990D00')
  end;

  v_message := left(concat_ws(E'\n',
    case
      when v_source = 'supplier_delivery' then '📦 *Supplier Delivery | ' || coalesce(v_project_code, new.project_code_snapshot, 'Project') || '*'
      else '💰 *Payment Update | ' || coalesce(v_project_code, new.project_code_snapshot, 'Project') || '*'
    end,
    '',
    case
      when v_cashed_transition then 'Cheque Cashed: ' || v_amount_text
      when v_source = 'supplier_delivery' then 'Delivery: ' || v_amount_text
      when v_source = 'supplier_advance_fund' then 'Fund to Supplier: ' || v_amount_text
      when v_kind = 'Expense' then 'Expense: ' || v_amount_text
      else 'Income: ' || v_amount_text
    end,
    case when v_party_value is not null then v_party_label || ': ' || v_party_value else null end,
    case when v_source = 'supplier_advance_fund' and v_paid_to is not null then 'Paid To: ' || v_paid_to else null end,
    case when nullif(trim(v_details), '') is not null then 'For: ' || trim(v_details) else null end,
    '',
    '*Current Balance: ' || v_balance_text || '*'
  ), 4000);

  v_dedupe_key := case
    when v_cashed_transition then 'project-finance-cheque-cashed:' || new.id::text
    else 'project-finance:' || v_source || ':' || new.id::text
  end;

  insert into public.whatsapp_finance_outbox (dedupe_key, message, group_invite_code)
  values (v_dedupe_key, v_message, v_group)
  on conflict (dedupe_key) do nothing;

  begin
    perform net.http_get(url := 'https://landview-whatsapp-bot.onrender.com/employee/status', timeout_milliseconds := 30000);
  exception when others then null;
  end;

  return new;
end;
$function$;
