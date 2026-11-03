alter table public.todo_items
  add column if not exists due_time time without time zone,
  add column if not exists reminder_enabled boolean not null default false,
  add column if not exists reminder_minutes_before integer,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists overdue_notified_at timestamptz,
  add column if not exists notification_last_attempt_at timestamptz,
  add column if not exists notification_last_error text;

alter table public.todo_items
  drop constraint if exists todo_items_reminder_minutes_check;
alter table public.todo_items
  add constraint todo_items_reminder_minutes_check
  check (reminder_minutes_before is null or reminder_minutes_before between 0 and 10080);

alter table public.todo_items
  drop constraint if exists todo_items_reminder_ready_check;
alter table public.todo_items
  add constraint todo_items_reminder_ready_check
  check (
    reminder_enabled = false
    or (
      due_date is not null
      and due_time is not null
      and assigned_employee_id is not null
      and reminder_minutes_before is not null
    )
  );

create index if not exists todo_items_deadline_idx
  on public.todo_items (due_date, due_time)
  where status <> 'Done';
create index if not exists todo_items_reminder_pending_idx
  on public.todo_items (reminder_enabled, due_date, due_time)
  where status <> 'Done' and reminder_enabled = true;

create or replace function public.todo_reset_notification_state()
returns trigger
language plpgsql
as $$
begin
  if new.reminder_enabled = false then
    new.reminder_minutes_before := null;
    new.reminder_sent_at := null;
    new.overdue_notified_at := null;
    new.notification_last_attempt_at := null;
    new.notification_last_error := null;
    return new;
  end if;

  if tg_op = 'UPDATE' and (
    old.due_date is distinct from new.due_date
    or old.due_time is distinct from new.due_time
    or old.reminder_enabled is distinct from new.reminder_enabled
    or old.reminder_minutes_before is distinct from new.reminder_minutes_before
    or old.assigned_employee_id is distinct from new.assigned_employee_id
    or (old.status = 'Done' and new.status <> 'Done')
  ) then
    new.reminder_sent_at := null;
    new.overdue_notified_at := null;
    new.notification_last_attempt_at := null;
    new.notification_last_error := null;
  end if;

  return new;
end;
$$;

drop trigger if exists todo_items_reset_notification_state on public.todo_items;
create trigger todo_items_reset_notification_state
before insert or update on public.todo_items
for each row execute function public.todo_reset_notification_state();
