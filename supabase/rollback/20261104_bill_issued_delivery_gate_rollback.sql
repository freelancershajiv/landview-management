-- Emergency rollback ONLY for migration 20261104124500.
-- Restore the former business rule without deleting financial data or backfilled workflows.
-- Use only after a production incident is confirmed.

begin;
drop trigger if exists trg_landview_document_delivery_requires_payment on public.documents;
drop trigger if exists trg_landview_final_delivery_requires_payment on public.project_service_workflows;
drop trigger if exists trg_landview_bill_issued_starts_work on public.bills;

drop function if exists public.landview_enforce_document_file_delivery();
drop function if exists public.landview_enforce_workflow_file_delivery();
drop function if exists public.landview_start_workflow_on_bill_issue();
drop function if exists public.landview_assert_service_fully_paid(uuid,text,text,text);
drop function if exists public.landview_verified_service_paid(uuid,text,text);
drop function if exists public.landview_issued_service_total(uuid,text);
drop function if exists public.landview_bill_service_label(text,text);

update public.project_contract_services
  set start_gate='None', release_gate='None'
  where active=true and start_gate='None' and release_gate='Fully Paid';
alter table public.project_contract_services
  alter column start_gate set default 'Any Payment',
  alter column release_gate set default 'No Overdue Invoice';
commit;

-- Workflows created by issued bills are intentionally retained.
-- They may contain subsequent manual edits, documents, and audit history.
-- Restore application code from Git branch backup/bill-issued-workflow-2026-11-04 separately.