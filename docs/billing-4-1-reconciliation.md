# LAND VIEW Billing 4.1 — read-only reconciliation and audit-backed evidence review

## Scope: first phase only

**New page:** `/admin/billing/reconciliation` (internally reuses `/admin/finance/reconciliation` under the Billing 4.0 URL rewrite).

**Read-only detection API:** `GET /api/billing/reconciliation-41`.

**Review decision API:** `POST /api/billing/reconciliation-41`, which writes **only** to `app_audit_log`.

The data view classifies effective project payments, excluded legacy/manual entries, issued vs voided/missing payment receipts, ledger reference/amount/project/scope mismatches, overallocations, and valid unallocated advances. Its output is intentionally **not a client debt report**.

## Financial evidence definitions

- A payment is effective under `receivablePaymentIsEffective`. Cancelled/voided/personal-income records are excluded.
- `is_legacy_manual=true` or `affects_business_balance=false` is segregated into a historical-evidence class rather than new due.
- Receipt must have status `Issued` and no `voided_at`. Issued receipt amounts and project IDs are cross-checked.
- Ledger is linked by explicit `ledger_transaction_id`, explicit `ledger_transaction_code`, or `TXN-PAY-${payment_code}`. Resulting amounts, finance scope and project references are checked.
- `payment_invoice_allocations` are totalled against the original payment. Excess = overallocated finding; remainder = informational advance, not missing cash.
- Every case is bound to a SHA-256 evidence fingerprint. An audit decision for an older snapshot does not resolve a changed financial record.

## Two-person audit

1. Finance operators (admin, manager or accounts) can create a **review request** with a reason of at least 12 characters.
2. A **different administrator** can mark evidence reviewed or reject the request. Self-approval is blocked server-side.
3. Review logs contain the case, project and payment references, fingerprint, who reviewed, when and why.
4. A reviewed case stays visible until the actual underlying financial evidence changes, and no receipt, invoice, ledger, payment or allocation is automatically created/updated/deleted.

The status field means **evidence reviewed**, not **money corrected**. Any actual accounting correction remains a separately authorized workflow with original financial documentation.

## Safety gates

- API requires authenticated finance roles; POST requires same-origin request.
- GET is strictly read-only. POST calls `recordAuditEvent` and does not call financial write functions.
- Stops rather than silently shows partial results if the 5000-row data limit is reached.
- Finance evidence reviews do not send client reminders or WhatsApp notifications.
- CSV export escapes spreadsheet formulas and is based on the currently displayed filtered cases.
- No DDL, migration, backfill or production financial row change is necessary.

## Baseline verification

Before release record project, invoice, bill, payment, receipt and allocation counts and financial totals, and compare after deployment. No synthetic posted payments or receipts are created in production.

## Acceptance

- `node --test tests/billing-reconciliation-41.test.cjs`
- Scoped `eslint` for policy, route and page
- Existing invoice regression gate, Billing 4.0 tests, TypeScript and build
- One review preview before merge to production; no production database alterations

## Known limitations

- Review audit writes are append-only but are not a database-row-locked approval engine. Concurrent reviewers could create duplicate audit decisions; no financial mutations occur, and the latest decision is displayed.
- This version does **not** automatically fix historical receipts, ledger links, invoices or advances. Individual authorized corrections are separate work.
- It does not replace the Invoice Integrity or Allocation Correction pages; it links to both.
