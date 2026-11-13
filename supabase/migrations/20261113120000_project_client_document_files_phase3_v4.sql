-- LAND VIEW v4 Phase 3: private client scans + explicit service-document links
-- ADDITIVE ONLY; DO NOT APPLY before independently verified backup/PITR,
-- staged migration, gateway rollout and reconciliation.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-client-documents-v4', 'project-client-documents-v4', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf']::text[])
on conflict (id) do nothing;

create table if not exists public.project_client_document_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  register_id uuid not null references public.client_document_register(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 160),
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  file_size integer not null check (file_size between 1 and 10485760),
  status text not null default 'pending' check (status in ('pending','stored')),
  created_by text not null,
  created_at timestamptz not null default now(),
  stored_at timestamptz,
  constraint project_client_document_files_path_check
    check (storage_path ~ '^projects/[0-9a-f-]{36}/receipts/[0-9a-f-]{36}/[0-9a-f-]{36}\\.(pdf|jpg|png|webp)$')
);

create index if not exists project_client_document_files_register_idx
  on public.project_client_document_files (project_id, register_id, created_at desc);

create table if not exists public.project_service_document_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  service_key text not null check (length(service_key) between 1 and 160),
  requirement_key text not null
    check (requirement_key in ('photo','identity','ownership','khotian','tax')),
  active boolean not null default false,
  configured_by text not null,
  configured_at timestamptz not null default now(),
  unique (project_id, service_key, requirement_key)
);

create index if not exists project_service_document_requirements_project_idx
  on public.project_service_document_requirements (project_id, service_key, active);

alter table public.project_client_document_files enable row level security;
alter table public.project_service_document_requirements enable row level security;

-- The Next.js server must authorize a LAND VIEW session then invoke the
-- OIDC-protected Edge Function. No direct browser database access is permitted.
revoke all on public.project_client_document_files from public, anon, authenticated;
revoke all on public.project_service_document_requirements from public, anon, authenticated;
grant select, insert, update on public.project_client_document_files to service_role;
grant select, insert, update on public.project_service_document_requirements to service_role;

-- Private storage: no storage.objects policies for anon/authenticated.
-- Service role signs narrowly scoped, single-use-path upload URLs server-side.
commit;

-- RELEASE CHECKS (read-only)
-- select id, public, file_size_limit from storage.buckets where id='project-client-documents-v4';
-- select count(*) from public.project_client_document_files;
-- select count(*) from public.project_service_document_requirements;
-- Confirm anonymous requests cannot read the bucket or either metadata table.
