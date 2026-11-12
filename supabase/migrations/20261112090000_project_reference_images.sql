create table if not exists public.project_reference_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  project_code text not null,
  category text not null check (category in ('Exterior','Interior','Floor Plan','Elevation','Structural','Materials','Other')),
  caption text,
  object_key text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by text,
  uploaded_by_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_reference_images_project_created_idx
  on public.project_reference_images(project_id, created_at desc);
alter table public.project_reference_images enable row level security;
