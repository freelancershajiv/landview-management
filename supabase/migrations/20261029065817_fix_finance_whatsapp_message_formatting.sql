do $migration$
declare
  v_def text;
  v_updated text;
  v_newline_pattern text := $$concat_ws(E'\\n',$$;
  v_method_pattern text := $$case when nullif(trim(coalesce(new.payment_method, '')), '') is not null then 'Method: ' || trim(new.payment_method) else null end$$;
  v_method_replacement text := $$case
        when nullif(trim(coalesce(new.payment_method, '')), '') is not null
          and (
            nullif(trim(coalesce(new.account_snapshot, '')), '') is null
            or lower(trim(new.payment_method)) <> lower(trim(new.account_snapshot))
          )
        then 'Method: ' || trim(new.payment_method)
        else null
      end$$;
begin
  v_def := pg_get_functiondef('public.queue_land_view_ledger_whatsapp_update()'::regprocedure);

  if strpos(v_def, v_newline_pattern) = 0 then
    raise exception 'Expected finance WhatsApp newline pattern was not found';
  end if;

  if strpos(v_def, v_method_pattern) = 0 then
    raise exception 'Expected finance WhatsApp method pattern was not found';
  end if;

  v_updated := replace(v_def, v_newline_pattern, $$concat_ws(chr(10),$$);
  v_updated := replace(v_updated, v_method_pattern, v_method_replacement);

  execute v_updated;
end
$migration$;
