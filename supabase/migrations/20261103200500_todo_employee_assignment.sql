alter table public.todo_items
  add column if not exists assigned_employee_id uuid;

alter table public.todo_items
  drop constraint if exists todo_items_assigned_employee_id_fkey;

alter table public.todo_items
  add constraint todo_items_assigned_employee_id_fkey
  foreign key (assigned_employee_id) references public.employees(id) on delete set null;

create index if not exists todo_items_assigned_employee_id_idx
  on public.todo_items(assigned_employee_id)
  where assigned_employee_id is not null;
