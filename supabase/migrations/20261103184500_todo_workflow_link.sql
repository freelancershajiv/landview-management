alter table public.todo_items
  add column if not exists workflow_id uuid;

alter table public.todo_items
  drop constraint if exists todo_items_workflow_reference_check,
  drop constraint if exists todo_items_workflow_id_fkey;

alter table public.todo_items
  add constraint todo_items_workflow_reference_check
  check (workflow_id is null or reference_type = 'Project'),
  add constraint todo_items_workflow_id_fkey
  foreign key (workflow_id) references public.project_service_workflows(id) on delete set null;

create index if not exists todo_items_workflow_id_idx
  on public.todo_items(workflow_id)
  where workflow_id is not null;
