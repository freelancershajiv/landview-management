do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'landview-todo-recurring-15min' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'landview-todo-recurring-15min',
  '*/15 * * * *',
  $$
    select net.http_get(
      url := 'https://app.landview.com.bd/api/cron/todo-recurring',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'todo_reminder_cron_secret'
          limit 1
        )
      ),
      timeout_milliseconds := 50000
    ) as request_id;
  $$
);
