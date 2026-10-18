do $migration$
declare
  ddl text;
  old_block text := $old$
    case when v_party_value is not null then v_party_label || ': ' || v_party_value else null end,
$old$;
  new_block text := $new$
    'Date: ' || to_char(coalesce(new.entry_date, current_date), 'DD Mon YYYY'),
    case when nullif(trim(coalesce(new.category, '')), '') is not null then 'Category: ' || trim(new.category) else null end,
    case when v_party_value is not null then v_party_label || ': ' || v_party_value else null end,
$new$;
begin
  select pg_get_functiondef(p.oid)
    into ddl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'queue_project_finance_whatsapp_update'
  limit 1;

  if ddl is null then
    raise exception 'queue_project_finance_whatsapp_update() not found';
  end if;

  if position('Date: ' in ddl) > 0 and position('Category: ' in ddl) > 0 then
    return;
  end if;

  if position(old_block in ddl) = 0 then
    raise exception 'Expected WhatsApp message block not found';
  end if;

  ddl := replace(ddl, old_block, new_block);
  execute ddl;
end;
$migration$;
