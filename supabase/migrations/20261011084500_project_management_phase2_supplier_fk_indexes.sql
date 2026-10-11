create index if not exists project_contractor_contracts_supplier_account_id_idx
  on public.project_contractor_contracts(supplier_account_id)
  where supplier_account_id is not null;

create index if not exists project_management_ledger_supplier_account_fk_idx
  on public.project_management_ledger(supplier_account_id)
  where supplier_account_id is not null;