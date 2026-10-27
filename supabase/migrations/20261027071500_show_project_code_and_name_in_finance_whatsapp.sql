do $migration$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef('public.queue_land_view_ledger_whatsapp_update()'::regprocedure)
    into v_def;

  v_old := E'  v_project_name text;\n';
  v_new := E'  v_project_code text;\n  v_project_name text;\n';
  if position(v_old in v_def) = 0 then
    raise exception 'Could not find project declaration in WhatsApp formatter.';
  end if;
  v_def := replace(v_def, v_old, v_new);

  v_old := E'    select p.project_name into v_project_name\n    from public.projects p\n    where p.id = new.project_id\n    limit 1;';
  v_new := E'    select p.project_code, p.project_name into v_project_code, v_project_name\n    from public.projects p\n    where p.id = new.project_id\n    limit 1;';
  if position(v_old in v_def) = 0 then
    raise exception 'Could not find project lookup in WhatsApp formatter.';
  end if;
  v_def := replace(v_def, v_old, v_new);

  v_old := E'      ''💵 *Client Payment | '' || coalesce(nullif(trim(new.project_code_snapshot), ''''), ''Project'') || ''*'',\n      '''',';
  v_new := E'      ''💵 *Client Payment*'',\n      '''',\n      ''Project: '' || coalesce(nullif(trim(new.project_code_snapshot), ''''), nullif(trim(coalesce(v_project_code, '''')), ''''), ''Project'') || case when nullif(trim(coalesce(v_project_name, '''')), '''') is not null then '' — '' || trim(v_project_name) else '''' end,';
  if position(v_old in v_def) = 0 then
    raise exception 'Could not find client payment WhatsApp heading.';
  end if;
  v_def := replace(v_def, v_old, v_new);

  v_old := E'      ''🔴 *Expense | '' || coalesce(nullif(trim(new.project_code_snapshot), ''''), ''Project'') || ''*'',\n      '''',';
  v_new := E'      ''🔴 *Project Expense*'',\n      '''',\n      ''Project: '' || coalesce(nullif(trim(new.project_code_snapshot), ''''), nullif(trim(coalesce(v_project_code, '''')), ''''), ''Project'') || case when nullif(trim(coalesce(v_project_name, '''')), '''') is not null then '' — '' || trim(v_project_name) else '''' end,';
  if position(v_old in v_def) = 0 then
    raise exception 'Could not find project expense WhatsApp heading.';
  end if;
  v_def := replace(v_def, v_old, v_new);

  execute v_def;
end;
$migration$;
