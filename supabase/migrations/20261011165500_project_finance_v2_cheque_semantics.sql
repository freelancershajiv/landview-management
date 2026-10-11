alter table public.project_management_summary
  add column if not exists finance_v2_opening_held_cheques jsonb not null default '[]'::jsonb;

update public.project_management_summary s
set finance_v2_opening_held_cheques = coalesce((
  select jsonb_agg(
    jsonb_build_object(
      'id', l.id::text,
      'amount', l.debit,
      'details', l.details,
      'entry_date', l.entry_date
    ) order by l.entry_date, l.serial_no
  )
  from public.project_management_ledger l
  where l.project_id = s.project_id
    and l.created_at <= s.finance_v2_cutover_at
    and lower(coalesce(l.payment_method,'')) = 'cheque'
    and lower(coalesce(l.cheque_status,'')) = 'on_hold'
    and l.debit > 0
), '[]'::jsonb)
where s.finance_v2_enabled = true
  and s.finance_v2_cutover_at is not null
  and s.finance_v2_opening_held_cheques = '[]'::jsonb;

create or replace function public.normalize_project_management_ledger()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.serial_no is null then
    perform pg_advisory_xact_lock(hashtext(new.project_id::text));
    select coalesce(max(l.serial_no),0) + 1
      into new.serial_no
    from public.project_management_ledger l
    where l.project_id = new.project_id;
  end if;

  new.entry_type := case
    when coalesce(new.debit,0) > 0 and coalesce(new.credit,0) = 0 then 'income'
    when coalesce(new.credit,0) > 0 and coalesce(new.debit,0) = 0 then 'expense'
    else 'adjustment'
  end;

  if lower(trim(coalesce(new.category,''))) = 'cheque'
     or lower(trim(coalesce(new.payment_method,''))) = 'cheque' then
    new.payment_method := 'cheque';
    if coalesce(new.memo,'') ~* '^CHEQUE_STATUS:ON_HOLD' then
      new.cheque_status := 'on_hold';
    elsif coalesce(new.memo,'') ~* '^CHEQUE_STATUS:CASHED' then
      new.cheque_status := 'cashed';
    else
      new.cheque_status := coalesce(nullif(new.cheque_status,''),'cashed');
    end if;
  else
    new.cheque_status := null;
    new.payment_method := coalesce(
      nullif(new.payment_method,''),
      case
        when lower(trim(coalesce(new.category,''))) = 'bank transfer' then 'bank_transfer'
        when lower(trim(coalesce(new.category,''))) in ('cash','scrap selling') then 'cash'
        else 'unspecified'
      end
    );
  end if;

  new.source_type := coalesce(nullif(new.source_type,''), new.source);
  if new.source_id is null and coalesce(new.memo,'') ~ '^MASTER_LEDGER:(transaction|expense):' then
    new.source_id := substring(new.memo from '^MASTER_LEDGER:(?:transaction|expense):(.+)$');
  end if;

  new.approval_status := coalesce(nullif(new.approval_status,''),'approved');
  new.approved_by := coalesce(new.approved_by,new.created_by);
  new.approved_at := coalesce(new.approved_at,new.created_at,now());
  new.updated_by := coalesce(new.updated_by,new.created_by);
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end;
$function$;
