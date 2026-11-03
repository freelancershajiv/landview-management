create table if not exists public.todo_comments (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.todo_items(id) on delete cascade,
  todo_code text not null,
  body text not null check (char_length(body) between 1 and 4000),
  author_user_key text,
  author_employee_id uuid references public.employees(id) on delete set null,
  author_name text,
  author_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.todo_attachments (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.todo_items(id) on delete cascade,
  todo_code text not null,
  file_name text not null,
  file_id text not null unique,
  content_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  uploaded_by_user_key text,
  uploaded_by_employee_id uuid references public.employees(id) on delete set null,
  uploaded_by_name text,
  uploaded_by_role text,
  created_at timestamptz not null default now()
);

create index if not exists todo_comments_todo_code_created_idx
  on public.todo_comments(todo_code, created_at desc);
create index if not exists todo_attachments_todo_code_created_idx
  on public.todo_attachments(todo_code, created_at desc);

alter table public.todo_comments enable row level security;
alter table public.todo_attachments enable row level security;

revoke all on table public.todo_comments from anon, authenticated;
revoke all on table public.todo_attachments from anon, authenticated;
grant select, insert, update, delete on table public.todo_comments to service_role;
grant select, insert, update, delete on table public.todo_attachments to service_role;
