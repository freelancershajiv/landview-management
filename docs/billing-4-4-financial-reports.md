# LAND VIEW Billing 4.4 — Financial Reports & Invoice-Age Analytics

## Scope

Adds read-only finance reporting:
- **`/admin/billing/reports`** — financial overview, current collectible due, project aging, month-by-month effective client credits, operational collections and historical/legacy credits.
- **`GET /api/billing/reports-v44`** — private JSON, authenticated to admin/manager/accounts.
- **`GET /api/billing/reports-v44/print`** — branded paginated A4 printable management report, with `?autoprint=1` Print/Save PDF. No payment/ledger write calls.
- Four client-side CSV exports: filtered project balances, selected months, invoice aging, or financial KPI summary. Exports escape spreadsheet formulas.

## Crucial financial definitions

The current production register has **912 invoices with no recorded contractual `due_date`** (checked November 21, 2026). It is misleading to claim contractual "overdue 30/60/90 days." This version therefore reports **invoice age since invoice issue date**, with bill date as explicit fallback and a distinct undated bucket. Age bands 0–30, 31–60, 61–90, 91+ days and undated show **open invoice balances before project-wide relief**. They are *not* overdue amounts.

Canonical collectible due is taken directly from `loadReceivableAuthority().totals.due`, after recognized payment credits, write-offs and project-level advances. The report does not attempt to assign project-wide advance/write-off relief to individual invoices, so it never sums per-invoice raw dues as if they were collectible project dues.

**Client payment credits**: all effective project payments credited by the canonical authority, including genuine historical manual credits.

**Operational collections**: effective payments not marked legacy/manual or excluded from the business balance. This avoids labeling archived historical credits as fresh cash ledger receipts. This is a payments-received indicator, not audited bank reconciliation or accounting profit.

**Legacy credits**: effective historical client payments whose `is_legacy_manual` is true or whose business balance flag is false. These count toward client balances but are shown separately from operational collections.

Month attribution uses `payment_date` if valid; missing dates may fall back to `created_at`. A fallback count is shown each month because migrated historical data may have a later creation date. Payments with no usable date stay in all-time totals and appear under undated data quality. Missing months are filled with zero values between the earliest payment month and the current month.

## Safety gates

- No database migration, modification, backfill, receipt issuance, WhatsApp messages or financial writes.
- Both routes authenticate finance roles. All results use `private, no-store`; print pages are `noindex`.
- Finite-source cap: canonical authority `complete` and projects count must both be safely under their query bounds.
- Cross-check all aged open invoices against project `invoiceDueTotal`, project effective payment credits against `project.paid`, due categories against `project.totalDue`, and both monthly + undated and historical/operational sums against canonical paid totals. A mismatch fails closed rather than returning a partial/misleading report.
- Project-specific print/PDF workflows from Billing 4.3 remain unchanged.
- Reports are **current snapshots**, not historical month-end debt balances. Monthly payments are grouped by recorded dates but not rebuilt past receivable snapshots.

## Tests and release sequence

1. `node --test tests/billing-reports-v44.test.cjs`.
2. Scoped ESLint for model, API, print and page; existing invoice integrity/Billing 4.0–4.3 gates; TypeScript; production build.
3. One preview for finance read-only validation; no synthetic production payments or invoices.
4. Record counts and monetary sums of projects, bills, invoices, payments, allocations, receipts, adjustments before and after.
5. Merge and confirm Vercel READY at `app.landview.com.bd`, matching Git commit and no new runtime errors.

## Future upgrade

If genuine contractual due dates are entered for invoices, a separate *contractual overdue aging* report can be added without conflating it with invoice age. Until then, the report must not call invoice age "overdue."
