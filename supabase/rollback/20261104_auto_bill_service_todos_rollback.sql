-- Emergency rollback for bill-issued automatic To Do generation.
-- Keep generated To Dos, manual edits, assignments and task history intact.
-- This DOES NOT disable the full-payment file-delivery gate added earlier.

begin;
drop trigger if exists zz_landview_generate_todos_on_bill_issue on public.bills;
drop trigger if exists todo_items_validate_bill_automation on public.todo_items;
drop trigger if exists service_todo_assignment_fill_unassigned on public.service_todo_assignment_rules;
drop function if exists public.landview_generate_todos_on_bill_issue();
drop function if exists public.landview_generate_service_todos(uuid);
drop function if exists public.landview_validate_automated_todo();
drop function if exists public.landview_apply_todo_default_owner();
drop function if exists public.landview_service_todo_steps(text);
commit;

-- Existing generated records intentionally remain, avoiding data loss.
-- Restore application source using backup/bill-todo-automation-2026-11-04.
-- Do not delete todo_items or service_todo_generation_log during rollback.