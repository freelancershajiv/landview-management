do $migration$
declare
  ddl text;
  old_block text := $old$
          and status_norm = 'posted'
          and transaction_type_norm not in ('transfer', 'personal income', 'personal expense')
$old$;
  new_block text := $new$
          and (
            status_norm = 'posted'
            or (
              transaction_type_norm in ('expense', 'office expense')
              and effective_debit > 0
              and status_norm not in ('rejected', 'returned', 'cancelled', 'canceled', 'void', 'voided', 'draft', 'special ledger')
            )
          )
          and transaction_type_norm not in ('transfer', 'personal income', 'personal expense')
$new$;
begin
  select pg_get_functiondef(p.oid)
    into ddl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'queue_land_view_ledger_whatsapp_update'
  limit 1;

  if ddl is null then
    raise exception 'queue_land_view_ledger_whatsapp_update() not found';
  end if;

  if position(old_block in ddl) = 0 then
    if position('special ledger' in lower(ddl)) > 0 and position('status_norm not in' in lower(ddl)) > 0 then
      return;
    end if;
    raise exception 'Expected LAND VIEW WhatsApp balance block not found';
  end if;

  ddl := replace(ddl, old_block, new_block);
  execute ddl;
end;
$migration$;
