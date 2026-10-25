-- Billing 2.0 writes invoice allocation metadata back to payments.
-- Those metadata-only updates must never re-run the canonical payment -> ledger sync.

drop trigger if exists trg_payment_transaction on public.payments;

create trigger trg_payment_transaction
after insert or update of
  project_id,
  payment_date,
  amount,
  payment_method,
  reference_no,
  notes,
  deposit_account,
  payment_for,
  income_category,
  transaction_type,
  affects_business_balance,
  approval_status,
  status,
  service_type,
  finance_scope,
  source_created_by,
  source_created_at
on public.payments
for each row execute function private.sync_payment_transaction();
