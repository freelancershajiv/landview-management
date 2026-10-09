alter table public.app_sessions add column if not exists ip_address text;
alter table public.app_sessions add column if not exists user_agent text;

create or replace function public.sync_auth_session_to_app_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_key text;
  v_username text;
  v_full_name text;
  v_role text;
  v_employee_code text;
  v_project_ids text;
  v_last_seen timestamptz;
  v_expires timestamptz;
begin
  if tg_op = 'DELETE' then
    update public.app_sessions
       set active = false,
           revoked_at = coalesce(revoked_at, now()),
           last_seen_at = greatest(coalesce(last_seen_at, old.updated_at, old.created_at, now()), now()),
           expires_at = least(coalesce(expires_at, now()), now())
     where session_key = old.id::text;
    return old;
  end if;

  select au.user_key, au.username, au.full_name, au.role, au.employee_code, au.project_ids
    into v_user_key, v_username, v_full_name, v_role, v_employee_code, v_project_ids
    from public.app_users au
   where au.auth_user_id = new.user_id
   limit 1;

  v_last_seen := coalesce(new.refreshed_at at time zone 'UTC', new.updated_at, new.created_at, now());
  v_expires := coalesce(new.not_after, new.created_at + interval '30 days', now() + interval '30 days');

  insert into public.app_sessions (
    session_key, user_id, username, full_name, role, employee_code, project_ids,
    user_json, remembered, active, created_at, last_seen_at, expires_at, revoked_at,
    device_id, ip_address, user_agent
  ) values (
    new.id::text,
    coalesce(v_user_key, new.user_id::text),
    v_username,
    v_full_name,
    coalesce(v_role, 'unknown'),
    v_employee_code,
    v_project_ids,
    jsonb_build_object(
      'userId', coalesce(v_user_key, new.user_id::text),
      'username', coalesce(v_username, ''),
      'name', coalesce(v_full_name, ''),
      'role', coalesce(v_role, 'unknown'),
      'employeeId', coalesce(v_employee_code, ''),
      'projectIds', coalesce(v_project_ids, '')
    ),
    false,
    v_expires > now(),
    coalesce(new.created_at, now()),
    v_last_seen,
    v_expires,
    case when v_expires <= now() then now() else null end,
    nullif(new.tag, ''),
    nullif(new.ip::text, ''),
    nullif(new.user_agent, '')
  )
  on conflict (session_key) do update set
    user_id = excluded.user_id,
    username = excluded.username,
    full_name = excluded.full_name,
    role = excluded.role,
    employee_code = excluded.employee_code,
    project_ids = excluded.project_ids,
    user_json = excluded.user_json,
    active = excluded.active,
    last_seen_at = excluded.last_seen_at,
    expires_at = excluded.expires_at,
    revoked_at = excluded.revoked_at,
    device_id = excluded.device_id,
    ip_address = excluded.ip_address,
    user_agent = excluded.user_agent;

  return new;
end;
$$;

revoke all on function public.sync_auth_session_to_app_sessions() from public, anon, authenticated;

drop trigger if exists landview_sync_auth_sessions on auth.sessions;
create trigger landview_sync_auth_sessions
after insert or update or delete on auth.sessions
for each row execute function public.sync_auth_session_to_app_sessions();

insert into public.app_sessions (
  session_key, user_id, username, full_name, role, employee_code, project_ids,
  user_json, remembered, active, created_at, last_seen_at, expires_at, revoked_at,
  device_id, ip_address, user_agent
)
select
  s.id::text,
  coalesce(au.user_key, s.user_id::text),
  au.username,
  au.full_name,
  coalesce(au.role, 'unknown'),
  au.employee_code,
  au.project_ids,
  jsonb_build_object(
    'userId', coalesce(au.user_key, s.user_id::text),
    'username', coalesce(au.username, ''),
    'name', coalesce(au.full_name, ''),
    'role', coalesce(au.role, 'unknown'),
    'employeeId', coalesce(au.employee_code, ''),
    'projectIds', coalesce(au.project_ids, '')
  ),
  false,
  coalesce(s.not_after, s.created_at + interval '30 days', now() + interval '30 days') > now(),
  coalesce(s.created_at, now()),
  coalesce(s.refreshed_at at time zone 'UTC', s.updated_at, s.created_at, now()),
  coalesce(s.not_after, s.created_at + interval '30 days', now() + interval '30 days'),
  case when coalesce(s.not_after, s.created_at + interval '30 days', now() + interval '30 days') <= now() then now() else null end,
  nullif(s.tag, ''),
  nullif(s.ip::text, ''),
  nullif(s.user_agent, '')
from auth.sessions s
left join public.app_users au on au.auth_user_id = s.user_id
on conflict (session_key) do update set
  user_id = excluded.user_id,
  username = excluded.username,
  full_name = excluded.full_name,
  role = excluded.role,
  employee_code = excluded.employee_code,
  project_ids = excluded.project_ids,
  user_json = excluded.user_json,
  active = excluded.active,
  last_seen_at = excluded.last_seen_at,
  expires_at = excluded.expires_at,
  revoked_at = excluded.revoked_at,
  device_id = excluded.device_id,
  ip_address = excluded.ip_address,
  user_agent = excluded.user_agent;

create or replace function public.terminate_app_auth_session(p_session_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_deleted boolean := false;
begin
  begin
    v_id := p_session_key::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  delete from auth.sessions where id = v_id;
  v_deleted := found;

  update public.app_sessions
     set active = false,
         revoked_at = coalesce(revoked_at, now()),
         last_seen_at = now(),
         expires_at = least(coalesce(expires_at, now()), now())
   where session_key = p_session_key;

  return v_deleted;
end;
$$;

revoke all on function public.terminate_app_auth_session(text) from public, anon, authenticated;
grant execute on function public.terminate_app_auth_session(text) to service_role;
