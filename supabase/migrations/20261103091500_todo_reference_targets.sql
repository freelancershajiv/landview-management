alter table public.todo_items
  add column if not exists reference_type text not null default 'None',
  add column if not exists proposal_code text;

alter table public.todo_items
  drop constraint if exists todo_items_reference_type_check,
  drop constraint if exists todo_items_reference_target_check;

alter table public.todo_items
  add constraint todo_items_reference_type_check
  check (reference_type in ('None','Project','Proposal')),
  add constraint todo_items_reference_target_check
  check (
    (reference_type = 'None' and project_code is null and proposal_code is null)
    or (reference_type = 'Project' and project_code is not null and proposal_code is null)
    or (reference_type = 'Proposal' and proposal_code is not null and project_code is null)
  );

create index if not exists todo_items_project_code_idx
  on public.todo_items(project_code)
  where project_code is not null;

create index if not exists todo_items_proposal_code_idx
  on public.todo_items(proposal_code)
  where proposal_code is not null;
