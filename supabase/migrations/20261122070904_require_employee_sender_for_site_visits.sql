-- Employee visits use the verified direct sender. The legacy group worker
-- always uses the business account, including for recovered and retried jobs.
drop trigger if exists trg_emp0002_site_visit_whatsapp_recovery on public.site_visits;
drop function if exists public.queue_emp0002_site_visit_whatsapp_recovery();

alter table public.whatsapp_site_visit_outbox
  add constraint site_visits_require_employee_sender check (
    status not in ('pending', 'sending') or (
      dedupe_key not like 'site-visit:%' and dedupe_key not like 'site-visit-fallback:%'
      -- Older project-stage notices in this queue also have event_key = 'site.visit'.
      and (coalesce(event_key, 'site.visit') <> 'site.visit' or dedupe_key like 'project-stage:%')
    )
  ) not valid;

with stopped as (
  update public.whatsapp_site_visit_outbox
     set status = 'suppressed',
         last_error = 'Retry the Site Visit from the visiting employee’s verified WhatsApp.',
         updated_at = now()
   where status in ('pending', 'sending')
     and (dedupe_key like 'site-visit:%' or dedupe_key like 'site-visit-fallback:%'
          or (coalesce(event_key, 'site.visit') = 'site.visit' and dedupe_key not like 'project-stage:%'))
  returning dedupe_key
)
update public.site_visits v
   set whatsapp_publish_status = 'failed',
       whatsapp_publish_reason = 'Retry the Site Visit from the visiting employee’s verified WhatsApp.'
  from stopped
 where stopped.dedupe_key in ('site-visit:' || v.visit_code, 'site-visit-fallback:' || v.visit_code)
   and v.whatsapp_publish_status = 'queued' and v.whatsapp_sent_at is null;

alter table public.whatsapp_site_visit_outbox validate constraint site_visits_require_employee_sender;
