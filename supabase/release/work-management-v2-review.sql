-- STAGED RELEASE SCRIPT: apply as a tracked migration after review and backup.
-- Additive; no existing task status or completed record is rewritten.
begin;
alter table public.todo_items
  add column if not exists review_required boolean not null default false,
  add column if not exists review_state text not null default 'not_submitted',
  add column if not exists review_note text,
  add column if not exists review_actor text,
  add column if not exists review_changed_at timestamptz;
alter table public.todo_items drop constraint if exists todo_items_review_state_check;
alter table public.todo_items add constraint todo_items_review_state_check
  check (review_state in ('not_submitted','submitted','revision_requested','approved')
     and (review_required or review_state = 'not_submitted')
     and (not review_required or not is_delivery_step));
create index if not exists todo_items_review_queue_idx on public.todo_items(review_state, updated_at)
  where review_required and status <> 'Done';
create or replace function public.landview_guard_todo_review()
returns trigger language plpgsql security invoker set search_path=public as $$
declare material_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.review_required and new.status = 'Done' then
      raise exception 'Management review must be approved before completing this task.';
    end if;
    if new.review_state <> 'not_submitted' then
      raise exception 'New tasks cannot have a preapproved review state.';
    end if;
    return new;
  end if;
  if old.review_required and not new.review_required and old.review_state <> 'not_submitted' then
    raise exception 'Review settings cannot change after submission.';
  end if;
  material_changed := new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.reference_type is distinct from old.reference_type
    or new.project_code is distinct from old.project_code
    or new.proposal_code is distinct from old.proposal_code
    or new.workflow_id is distinct from old.workflow_id
    or new.assigned_employee_id is distinct from old.assigned_employee_id;
  if new.status = 'Done' and old.status <> 'Done' and (old.review_required or new.review_required)
     and (not old.review_required or not new.review_required or old.review_state <> 'approved' or new.review_state <> 'approved' or material_changed) then
    raise exception 'Management review must be approved before completing this task.';
  end if;
  if new.review_required and new.status <> 'Done' and
    (material_changed or (old.status = 'Done' and new.status <> 'Done') or
      (new.status = 'To Do' and old.status <> 'To Do')) then
    new.review_state := 'not_submitted';
    new.review_note := null;
    new.review_actor := null;
    new.review_changed_at := now();
  end if;
  if new.review_state is distinct from old.review_state and new.review_state <> 'not_submitted' then
    if not new.review_required or new.status <> 'In Progress' or old.status <> 'In Progress' then
      raise exception 'Review transitions require an in-progress task.';
    end if;
    if not ((new.review_state = 'submitted' and old.review_state in ('not_submitted','revision_requested'))
       or (new.review_state in ('approved','revision_requested') and old.review_state = 'submitted')) then
      raise exception 'Invalid management review transition.';
    end if;
    if new.review_state = 'revision_requested' and nullif(trim(new.review_note),'') is null then
      raise exception 'A revision note is required.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists todo_items_guard_review on public.todo_items;
create trigger todo_items_guard_review before insert or update on public.todo_items
  for each row execute function public.landview_guard_todo_review();
commit;
