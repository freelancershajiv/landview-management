update public.app_sessions a
set active = false,
    revoked_at = coalesce(revoked_at, now()),
    expires_at = least(coalesce(expires_at, now()), now())
where active = true
  and not exists (
    select 1 from auth.sessions s where s.id::text = a.session_key
  );
