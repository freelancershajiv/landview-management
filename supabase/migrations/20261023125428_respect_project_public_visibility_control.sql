alter table public.projects
  alter column public_display set default true;

create or replace function public.enforce_project_public_defaults()
returns trigger
language plpgsql
set search_path = 'pg_catalog, public'
as $$
begin
  new.public_map_enabled := nullif(btrim(coalesce(new.location_tag, '')), '') is not null;
  return new;
end;
$$;

revoke execute on function public.enforce_project_public_defaults() from public, anon, authenticated;
grant execute on function public.enforce_project_public_defaults() to postgres, service_role;
