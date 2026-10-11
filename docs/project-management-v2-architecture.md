# LAND VIEW Project Management V2

## Goal

Build Project Management V2 beside the current production system. V1 remains untouched until V2 balances and workflows are verified project-by-project.

## Non-negotiable rules

1. Cash movement and quantity/work movement are separate records.
2. Every financial movement belongs to exactly one project.
3. Every supplier/contractor movement links to a stable party record, not a typed name.
4. Every derived balance comes from source records; no synthetic expense rows.
5. Editing a financial record must preserve an audit history.
6. WhatsApp is an output event after a successful save. Messaging failure must not roll back or duplicate accounting data.
7. V2 initially reads production data but does not write to V1 tables.

## Domain model

Project
- Transactions
- Parties
- Supplier movements
- Contracts
- Contractor bills
- Work progress
- Site visits
- Documents
- Reports
- Activity log

## Core finance formulas

Project Cash Balance = Cleared Income - Cash Expense

Supplier Advance = max(0, Supplier Payments - Accepted Supplier Value)

Supplier Payable = max(0, Accepted Supplier Value - Supplier Payments)

Contractor Advance = max(0, Contractor Payments - Certified Work)

Contractor Payable = max(0, Certified Work - Contractor Payments)

Cheque On Hold = sum of uncleared cheque income

## V2 modules

1. Control Center
2. Finance
3. Suppliers
4. Contractors
5. Work Progress
6. Site Visits
7. Documents
8. Reports
9. Activity

## Existing production data to preserve

The current database already contains useful structures that V2 should migrate or adapt rather than duplicate blindly:

- `projects`
- `project_management_ledger`
- `project_management_summary`
- `project_supplier_accounts`
- `project_contractor_contracts`
- `project_contractor_bills`
- `project_contractor_progress_updates`
- `project_employees`
- `project_lifecycle_transitions`

The current ledger already has fields for serial number, entry type, payment method, cheque status, source links, approval status, supplier account links, supplier movement type, supplier advance applied and contractor contract links. V2 should normalize their meaning and remove inference-based accounting.

## Planned V2 tables

### project_parties_v2
Stable identity for a supplier, contractor or other project party.

Suggested fields:
- id
- project_id
- party_type
- display_name
- normalized_key
- phone
- primary_category
- active
- created_at
- updated_at

### project_transactions_v2
Only real cash/bank/cheque movements.

Suggested fields:
- id
- project_id
- serial_no
- transaction_date
- transaction_type: income | expense
- amount
- party_id
- category
- payment_method
- cheque_status
- bank_name
- reference_no
- reference_type
- reference_id
- details
- memo
- approval_status
- created_by
- approved_by
- created_at
- updated_at

### project_supplier_movements_v2
Non-cash supplier value movements such as material delivery, return or adjustment.

Suggested fields:
- id
- project_id
- party_id
- movement_date
- movement_type: delivery | return | adjustment
- category
- quantity
- unit
- rate
- value
- reference_no
- details
- created_by
- created_at
- updated_at

### project_contracts_v2
Contractor or service contracts linked to a stable party.

### project_contract_bills_v2
Certified work values only; payments stay in `project_transactions_v2`.

### project_progress_v2
Physical progress independent of money.

### project_activity_v2
Append-only audit/event history for financial and project-management actions.

## Migration strategy

### Phase 1 - Foundation
- Build V2 branch and code structure.
- Add pure calculation functions and types.
- Add read-only V2 Control Center shell.
- Document mapping from V1 data to V2 objects.
- Do not alter production tables.

### Phase 2 - Read-only reconciliation
- Read existing V1 data into V2 adapters.
- Compare V2 balances against V1 per project.
- Explicitly test LV-157 supplier advances, contractor balances, cheque holds and cash balance.
- Resolve every mismatch before writes are enabled.

### Phase 3 - New V2 schema
- Create V2 tables with RLS and explicit grants as needed.
- Backfill V2 records from validated V1 mappings.
- Run Supabase security/performance advisors.

### Phase 4 - Controlled writes
- Enable Add Income / Add Expense in V2.
- Enable suppliers and contractor workflows.
- Log every change in activity history.
- Keep V1 available as fallback.

### Phase 5 - Cutover
- Verify all managed projects.
- Replace `/projectmanagement` with V2 only after approval.
- Keep a documented rollback point.

## Safety

The production restore point for this rebuild is commit `b58de9c24a8f8b18c9c03b3bd57a1214fcb20847`.

No V2 development should be merged to `main` until the user explicitly approves the tested preview.
