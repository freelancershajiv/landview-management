create table if not exists public.site_visit_media_jobs (
  id uuid primary key default gen_random_uuid(),
  site_visit_id uuid not null references public.site_visits(id) on delete cascade,
  media_kind text not null check (media_kind in ('visit','problem')),
  source_path text not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  retry_count integer not null default 0 check (retry_count >= 0),
  max_retries integer not null default 5 check (max_retries between 1 and 20),
  next_retry_at timestamptz not null default now(),
  locked_at timestamptz,
  lock_token uuid,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  drive_file_id text,
  drive_file_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_visit_id, media_kind, source_path)
);

create index if not exists site_visit_media_jobs_ready_idx
  on public.site_visit_media_jobs(status, next_retry_at, created_at);
create index if not exists site_visit_media_jobs_visit_idx
  on public.site_visit_media_jobs(site_visit_id, created_at desc);

alter table public.site_visit_media_jobs enable row level security;

create or replace function public.enqueue_site_visit_media_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visit_photo_path is not null and btrim(new.visit_photo_path) <> ''
     and (tg_op = 'INSERT' or old.visit_photo_path is distinct from new.visit_photo_path) then
    insert into public.site_visit_media_jobs(site_visit_id, media_kind, source_path, status, retry_count, next_retry_at, locked_at, lock_token, last_error, updated_at)
    values (new.id, 'visit', new.visit_photo_path, 'pending', 0, now(), null, null, null, now())
    on conflict (site_visit_id, media_kind, source_path) do update
      set status = 'pending', retry_count = 0, next_retry_at = now(), locked_at = null, lock_token = null,
          started_at = null, completed_at = null, last_error = null, updated_at = now();
  end if;

  if new.problem_photo_path is not null and btrim(new.problem_photo_path) <> ''
     and (tg_op = 'INSERT' or old.problem_photo_path is distinct from new.problem_photo_path) then
    insert into public.site_visit_media_jobs(site_visit_id, media_kind, source_path, status, retry_count, next_retry_at, locked_at, lock_token, last_error, updated_at)
    values (new.id, 'problem', new.problem_photo_path, 'pending', 0, now(), null, null, null, now())
    on conflict (site_visit_id, media_kind, source_path) do update
      set status = 'pending', retry_count = 0, next_retry_at = now(), locked_at = null, lock_token = null,
          started_at = null, completed_at = null, last_error = null, updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_site_visit_media_jobs on public.site_visits;
create trigger trg_enqueue_site_visit_media_jobs
after insert or update of visit_photo_path, problem_photo_path on public.site_visits
for each row execute function public.enqueue_site_visit_media_jobs();

insert into public.site_visit_media_jobs(site_visit_id, media_kind, source_path)
select id, 'visit', visit_photo_path
from public.site_visits
where visit_photo_path is not null and btrim(visit_photo_path) <> ''
on conflict (site_visit_id, media_kind, source_path) do nothing;

insert into public.site_visit_media_jobs(site_visit_id, media_kind, source_path)
select id, 'problem', problem_photo_path
from public.site_visits
where problem_photo_path is not null and btrim(problem_photo_path) <> ''
on conflict (site_visit_id, media_kind, source_path) do nothing;

create or replace function public.claim_site_visit_media_job(
  p_lock_token uuid,
  p_lock_timeout_minutes integer default 10
)
returns table (
  job_id uuid,
  site_visit_id uuid,
  media_kind text,
  source_path text,
  retry_count integer,
  max_retries integer,
  drive_file_id text,
  drive_file_url text,
  visit_code text,
  project_id uuid,
  project_code text,
  project_name text,
  client_name_snapshot text,
  location_latitude double precision,
  location_longitude double precision,
  location_accuracy_m double precision
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select j.id
    from public.site_visit_media_jobs j
    where j.retry_count < j.max_retries
      and j.next_retry_at <= now()
      and (
        j.status in ('pending','failed')
        or (j.status = 'processing' and (j.locked_at is null or j.locked_at < now() - make_interval(mins => greatest(1, p_lock_timeout_minutes))))
      )
    order by j.created_at asc
    for update skip locked
    limit 1
  ), claimed as (
    update public.site_visit_media_jobs j
    set status = 'processing',
        locked_at = now(),
        lock_token = p_lock_token,
        started_at = coalesce(j.started_at, now()),
        last_error = null,
        updated_at = now()
    from candidate c
    where j.id = c.id
    returning j.*
  )
  select c.id, c.site_visit_id, c.media_kind, c.source_path, c.retry_count, c.max_retries,
         c.drive_file_id, c.drive_file_url,
         sv.visit_code, sv.project_id, p.project_code, p.project_name, p.client_name_snapshot,
         sv.location_latitude, sv.location_longitude, sv.location_accuracy_m
  from claimed c
  join public.site_visits sv on sv.id = c.site_visit_id
  join public.projects p on p.id = sv.project_id;
end;
$$;

create or replace function public.complete_site_visit_media_job(
  p_job_id uuid,
  p_lock_token uuid,
  p_drive_file_id text,
  p_drive_file_url text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.site_visit_media_jobs%rowtype;
begin
  select * into v_job
  from public.site_visit_media_jobs
  where id = p_job_id and status = 'processing' and lock_token = p_lock_token
  for update;

  if not found then return false; end if;

  if v_job.media_kind = 'visit' then
    update public.site_visits
    set visit_photo_drive_file_id = p_drive_file_id,
        visit_photo_drive_url = nullif(p_drive_file_url,''),
        visit_photo_path = case when visit_photo_path = v_job.source_path then null else visit_photo_path end,
        updated_at = now()
    where id = v_job.site_visit_id;
  else
    update public.site_visits
    set problem_photo_drive_file_id = p_drive_file_id,
        problem_photo_drive_url = nullif(p_drive_file_url,''),
        problem_photo_path = case when problem_photo_path = v_job.source_path then null else problem_photo_path end,
        updated_at = now()
    where id = v_job.site_visit_id;
  end if;

  update public.site_visit_media_jobs
  set status = 'completed', drive_file_id = p_drive_file_id, drive_file_url = nullif(p_drive_file_url,''),
      completed_at = now(), locked_at = null, lock_token = null, last_error = null, updated_at = now()
  where id = p_job_id;
  return true;
end;
$$;

create or replace function public.fail_site_visit_media_job(
  p_job_id uuid,
  p_lock_token uuid,
  p_error text
)
returns table(retry_count integer, max_retries integer, next_retry_at timestamptz, terminal boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.site_visit_media_jobs j
  set status = 'failed',
      retry_count = j.retry_count + 1,
      next_retry_at = now() + make_interval(mins => least(60, (2 ^ least(5, j.retry_count))::integer)),
      last_error = left(coalesce(p_error,'Media sync failed.'), 2000),
      locked_at = null,
      lock_token = null,
      updated_at = now()
  where j.id = p_job_id and j.status = 'processing' and j.lock_token = p_lock_token
  returning j.retry_count, j.max_retries, j.next_retry_at, (j.retry_count >= j.max_retries);
end;
$$;

create or replace function public.retry_site_visit_media_job(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.site_visit_media_jobs
  set status = 'pending', retry_count = 0, next_retry_at = now(), locked_at = null, lock_token = null,
      last_error = null, completed_at = null, updated_at = now()
  where id = p_job_id and status <> 'completed';
  return found;
end;
$$;

revoke all on function public.claim_site_visit_media_job(uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_site_visit_media_job(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_site_visit_media_job(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.retry_site_visit_media_job(uuid) from public, anon, authenticated;
revoke all on function public.enqueue_site_visit_media_jobs() from public, anon, authenticated;
