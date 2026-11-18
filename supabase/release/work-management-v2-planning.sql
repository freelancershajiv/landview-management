-- Apply after work-management-v2-review.sql, as a tracked migration.
begin;
alter table public.todo_items
  add column if not exists estimated_minutes integer,
  add column if not exists planned_date date;
alter table public.todo_items drop constraint if exists todo_items_estimated_minutes_check;
alter table public.todo_items add constraint todo_items_estimated_minutes_check
  check (estimated_minutes is null or (estimated_minutes between 15 and 60000 and estimated_minutes % 15 = 0));
create index if not exists todo_items_employee_plan_idx on public.todo_items (assigned_employee_id, planned_date) where status <> 'Done';
create or replace function public.landview_clear_todo_personal_plan()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.assigned_employee_id is distinct from old.assigned_employee_id or new.status='Done' then
    new.planned_date := null;
  end if;
  return new;
end;
$$;
drop trigger if exists todo_items_clear_personal_plan on public.todo_items;
create trigger todo_items_clear_personal_plan before update on public.todo_items
  for each row execute function public.landview_clear_todo_personal_plan();
commit;
