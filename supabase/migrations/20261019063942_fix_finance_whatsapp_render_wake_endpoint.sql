do $$
declare
  r record;
  ddl text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'queue_project_finance_whatsapp_update'
  loop
    ddl := pg_get_functiondef(r.oid);
    ddl := replace(
      ddl,
      'https://landview-whatsapp-bot.onrender.com/employee/status',
      'https://landview-whatsapp-bot.onrender.com/health'
    );
    execute ddl;
  end loop;
end $$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'finance-whatsapp-pending-wake';

select cron.schedule(
  'finance-whatsapp-pending-wake',
  '* * * * *',
  $$
  update public.whatsapp_finance_outbox
  set status = 'pending',
      next_attempt_at = now(),
      updated_at = now(),
      last_error = coalesce(last_error, 'Recovered stale finance sender state.')
  where status = 'sending'
    and updated_at < now() - interval '10 minutes';

  select net.http_get(
    url := 'https://landview-whatsapp-bot.onrender.com/health',
    timeout_milliseconds := 120000
  )
  where exists (
    select 1
    from public.whatsapp_finance_outbox
    where status = 'pending'
      and next_attempt_at <= now()
  );
  $$
);
