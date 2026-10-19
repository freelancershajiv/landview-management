create or replace function public.queue_emp0002_site_visit_whatsapp_recovery()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_employee_code text;
  v_employee_name text;
  v_project_code text;
  v_message text;
  v_location_verification text;
begin
  if lower(coalesce(new.whatsapp_publish_status,'')) not in ('skipped','failed') then
    return new;
  end if;

  if coalesce(new.whatsapp_publish_reason,'') !~* '(did not become ready in time|fetch failed|HTTP (429|502|503|504)|service is waking up|send request failed)' then
    return new;
  end if;

  select upper(coalesce(employee_code,'')), coalesce(name,new.visited_by,'')
    into v_employee_code, v_employee_name
  from public.employees
  where id = new.employee_id
  limit 1;

  if v_employee_code is distinct from 'EMP-0002' then
    return new;
  end if;

  select coalesce(project_code,'')
    into v_project_code
  from public.projects
  where id = new.project_id
  limit 1;

  v_location_verification := case
    when nullif(trim(coalesce(new.location_verification_status,'')),'') is null then null
    else (case when upper(new.location_verification_status) = 'VERIFIED' then '✅ Verified' else new.location_verification_status end)
      || case when new.location_distance_m is not null then ' · ' || round(new.location_distance_m)::text || ' m from site' else '' end
      || case when new.location_accuracy_m is not null then ' · GPS ±' || round(new.location_accuracy_m)::text || ' m' else '' end
  end;

  v_message := left(concat_ws(E'\n',
    '🏗️ *Site Visit | ' || coalesce(nullif(v_project_code,''), 'Project') || '*',
    '',
    case when new.visit_date is not null then 'Date: ' || to_char(new.visit_date, 'DD Mon YYYY') end,
    case when coalesce(v_employee_name,'') <> '' or coalesce(v_employee_code,'') <> '' then 'Visited By: ' || concat_ws(' · ', nullif(v_employee_name,''), nullif(v_employee_code,'')) end,
    case when nullif(trim(coalesce(new.visit_purpose,new.purpose,'')),'') is not null then 'Purpose: ' || coalesce(nullif(trim(new.visit_purpose),''), nullif(trim(new.purpose),'')) end,
    case when nullif(trim(coalesce(new.observations,'')),'') is not null then 'Problem: ' || trim(new.observations) end,
    case when nullif(trim(coalesce(new.action_required,'')),'') is not null then 'Action: ' || trim(new.action_required) end,
    case when nullif(trim(coalesce(new.notes,'')),'') is not null then 'Notes: ' || trim(new.notes) end,
    case when v_location_verification is not null then 'Location: ' || v_location_verification end,
    case when new.location_latitude is not null and new.location_longitude is not null then '📍 https://maps.google.com/?q=' || new.location_latitude::text || ',' || new.location_longitude::text end
  ), 4000);

  insert into public.whatsapp_site_visit_outbox (dedupe_key,message,group_invite_code,status,next_attempt_at)
  values ('site-visit:' || new.visit_code, v_message, 'IyK3AgVZUwB4g3XJ0qokmT', 'pending', now())
  on conflict (dedupe_key) do nothing;

  return new;
end;
$function$;
