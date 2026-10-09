alter table public.app_sessions add column if not exists auth_not_after timestamptz;

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
  v_compat_expires timestamptz;
begin
  if tg_op = 'DELETE' then
    update public.app_sessions
       set active = false,
           revoked_at = coalesce(revoked_at, now()),
           last_seen_at = greatest(coalesce(last_seen_at, old.updated_at, old.created_at, now()), now()),
           auth_not_after = old.not_after,
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
  v_compat_expires := coalesce(new.not_after, new.created_at + interval '30 days', now() + interval '30 days');

  insert into public.app_sessions (
    session_key, user_id, username, full_name, role, employee_code, project_ids,
    user_json, remembered, active, created_at, last_seen_at, expires_at, auth_not_after,
    revoked_at, device_id, ip_address, user_agent
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
    new.not_after is null or new.not_after > now(),
    coalesce(new.created_at, now()),
    v_last_seen,
    v_compat_expires,
    new.not_after,
    case when new.not_after is not null and new.not_after <= now() then now() else null end,
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
    auth_not_after = excluded.auth_not_after,
    revoked_at = excluded.revoked_at,
    device_id = excluded.device_id,
    ip_address = excluded.ip_address,
    user_agent = excluded.user_agent;

  return new;
end;
$$;

update public.app_sessions a
set auth_not_after = s.not_after,
    active = s.not_after is null or s.not_after > now()
from auth.sessions s
where a.session_key = s.id::text;
