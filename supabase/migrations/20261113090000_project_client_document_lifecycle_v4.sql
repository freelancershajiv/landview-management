-- LAND VIEW v4: project-wide client document lifecycle (ADDITIVE ONLY)
-- REVIEWED PLAN ONLY. Do not apply to production before backup/PITR verification.
-- The five default requirements are virtual (derived from project ID), not
-- bulk-inserted; this migration does not update existing client records.
begin;

alter table public.client_document_register
  add column if not exists requirement_key text,
  add column if not exists owner_name text,
  add column if not exists received_from text,
  add column if not exists storage_location text,
  add column if not exists document_reference text,
  add column if not exists verification_status text not null default 'Unverified',
  add column if not exists verified_by text,
  add column if not exists verified_at timestamptz,
  add column if not exists verification_notes text,
  add column if not exists returned_by text,
  add column if not exists idempotency_key uuid;

do $check$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.client_document_register'::regclass
      and conname = 'client_document_register_v4_verification_status_check'
  ) then
    alter table public.client_document_register
      add constraint client_document_register_v4_verification_status_check
      check (verification_status in ('Unverified', 'Verified', 'Rejected', 'Waived')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conrelid = 'public.client_document_register'::regclass
      and conname = 'client_document_register_v4_requirement_key_check'
  ) then
    alter table public.client_document_register
      add constraint client_document_register_v4_requirement_key_check
      check (requirement_key is null or requirement_key in ('photo','identity','ownership','khotian','tax')) not valid;
  end if;
end
$check$;

create unique index if not exists client_document_register_v4_idempotency_uq
  on public.client_document_register (idempotency_key)
  where idempotency_key is not null;

create index if not exists client_document_register_v4_requirement_idx
  on public.client_document_register (project_id, requirement_key, verification_status);

-- Event history is append-only from the server's document register trigger.
create table if not exists public.project_client_document_events (
  id uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.client_document_register(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  event_type text not null check (event_type in ('received','verified','rejected','waived','returned')),
  actor text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists project_client_document_events_project_time_idx
  on public.project_client_document_events (project_id, created_at desc);

create index if not exists project_client_document_events_register_time_idx
  on public.project_client_document_events (register_id, created_at desc);

alter table public.project_client_document_events enable row level security;
revoke all on public.project_client_document_events from public, anon, authenticated;
grant select, insert on public.project_client_document_events to service_role;

-- SECURITY INVOKER (default); the OIDC-protected server gateway uses service_role.
-- Never expose an anon/authenticated INSERT path for confidential document events.
create or replace function public.landview_v4_record_client_document_event()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'INSERT' then
    if new.collection_status in ('Received','Partial') then
      insert into public.project_client_document_events
        (register_id, project_id, event_type, actor, details)
      values
        (new.id, new.project_id, 'received', coalesce(new.received_by, new.created_by_text, ''),
          jsonb_build_object('requirementKey',new.requirement_key,'documentForm',new.document_form,
            'quantity',new.quantity,'receivedDate',new.received_date));
    end if;
  else
    if old.verification_status is distinct from new.verification_status then
      if new.verification_status in ('Verified','Rejected','Waived') then
        insert into public.project_client_document_events
          (register_id, project_id, event_type, actor, details)
        values
          (new.id, new.project_id,
            case new.verification_status when 'Verified' then 'verified'
              when 'Rejected' then 'rejected' else 'waived' end,
            coalesce(new.verified_by, ''),
            jsonb_build_object('verificationStatus',new.verification_status, 'verifiedAt',new.verified_at,
              'verificationNotes',new.verification_notes));
      end if;
    end if;
    if old.return_status is distinct from new.return_status and new.return_status='Returned' then
      insert into public.project_client_document_events
        (register_id, project_id, event_type, actor, details)
      values
        (new.id, new.project_id, 'returned', coalesce(new.returned_by,''),
          jsonb_build_object('returnedDate',new.returned_date,'returnedTo',new.returned_to));
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists landview_v4_client_document_events on public.client_document_register;
create trigger landview_v4_client_document_events
  after insert or update of verification_status, return_status
  on public.client_document_register
  for each row execute function public.landview_v4_record_client_document_event();

commit;

-- Post-migration verification (read only, run before enabling v4 document writes):
-- select count(*) from public.client_document_register;
-- select count(*) from public.project_client_document_events;
-- select count(*) from public.client_document_register where verification_status not in ('Unverified','Verified','Rejected','Waived');
-- Assert existing register counts, IDs, statuses, billing counts, and balances unchanged.
