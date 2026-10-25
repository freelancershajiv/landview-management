create or replace function public.queue_billing_v2_milestone_whatsapp()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_project_name text;
  v_milestone text;
  v_trigger text;
  v_message text;
begin
  if new.event_type not in ('milestone_ready','milestone_ready_manual') then
    return new;
  end if;

  select p.project_name into v_project_name from public.projects p where p.id = new.project_id limit 1;
  v_milestone := coalesce(new.details->>'milestone', 'Billing milestone');
  v_trigger := coalesce(new.details->>'trigger', new.workflow_status, 'Manual review');

  v_message := left(concat_ws(E'\n',
    '⏱️ *LAND VIEW — READY TO BILL*',
    '*Project:* ' || coalesce(new.project_code, '') || case when nullif(trim(coalesce(v_project_name,'')), '') is not null then ' — ' || trim(v_project_name) else '' end,
    case when nullif(trim(coalesce(new.service_name,'')), '') is not null then '*Service:* ' || trim(new.service_name) else null end,
    '*Milestone:* ' || v_milestone,
    '*Trigger:* ' || v_trigger,
    case when coalesce(new.amount,0) > 0 then '*Ready Amount:* BDT ' || to_char(new.amount, 'FM999G999G999G999G990D00') else null end,
    '_Review in Finance → Billing 2.0 before issuing the bill._'
  ), 4000);

  insert into public.whatsapp_finance_outbox(
    dedupe_key, event_key, message, group_invite_code, priority, recipient_group, template_key
  ) values(
    'billing-v2-ready:' || coalesce(new.milestone_id::text, new.id::text),
    'billing-v2-ready:' || new.id::text,
    v_message,
    'name:LAND VIEW Finance',
    'routine',
    'LAND VIEW Finance',
    'billing_v2_milestone_ready'
  ) on conflict(dedupe_key) do nothing;

  begin
    perform net.http_get(url := 'https://landview-whatsapp-bot.onrender.com/employee/status', timeout_milliseconds := 30000);
  exception when others then null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_billing_v2_milestone_whatsapp on public.billing_events;
create trigger trg_billing_v2_milestone_whatsapp
after insert on public.billing_events
for each row execute function public.queue_billing_v2_milestone_whatsapp();

revoke all on function public.queue_billing_v2_milestone_whatsapp() from public, anon, authenticated;
grant execute on function public.queue_billing_v2_milestone_whatsapp() to service_role;
