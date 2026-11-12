# LAND VIEW invoice payment presentation — 13 November 2026

Scope: **read-only presentation**, built on invoice design PR #163. No financial table writes, migrations, payment allocation changes, retrospective Paid status changes or client notifications.

## Why the display needed an update

Before this change, project invoices mixed three distinct amounts:
- payment received by the project (including money not allocated to an invoice);
- money allocated to one or more specific invoices;
- collectible due after write-offs, settled legacy records and project-level relief.

The old invoice page recalculated category due as gross minus discount minus received, even though `loadReceivableAuthority` independently computes collectible due. It also displayed "Verified" payments without indicating invoice allocation status. This was especially misleading for advances and historical Paid records.

Read-only database sample at implementation: 419 payment rows, 658 allocation rows; of eligible financial payments, 17 without invoice allocations and 3 partially allocated. These counts are a snapshot, not an amount to collect.

## New read-only data contract

`GET /api/project-billing` retains its original sheets and `billPayments` response and additionally returns `paymentReview`:
- `complete`: requires nontruncated canonical source and a match between category and project collectible balances;
- `summary`: received, allocated, unallocated, remaining unallocated after relief, invoice due before relief, write-offs, collectible due, historical Paid/allocation review count, collectible due by category;
- `payments`: effective project payments with date, receipt reference URL (HTTP/S only), payment method, reference number, posted amount, invoice allocations and unapplied amount.

`attachInvoicePaymentReview` runs **after** existing build/merge/verification steps. Only when the snapshot is complete does it use canonical collectible due for the project and category display. It never mutates the source object. An incomplete snapshot leaves existing amounts untouched and surfaces a warning.

## Rendering rules

- Project statements: show Received / Applied / Unallocated independently; never imply that "Verified" means an invoice is settled.
- Single invoices: continue using the exact bill's allocations and due. They do not inherit project-wide payment-reconciliation values.
- Historical Paid/allocation differences are a review warning, not automatically new client debt.
- The old `gross - discount - paid = due` sentence is removed because it is not always true after settlement and adjustments.
- Receipt links render only for validated same-origin `/verify/receipt/<32-character-hex-token>` paths. All 303 existing live receipt URLs match this pattern. External and malformed destinations are excluded. The screen ledger is collapsible to reduce repetition; A4 documents retain payment tables and category summaries.
- Incomplete ledger or a reconciliation mismatch must never be silently treated as an audited collectible value.

## Release and checks

Target branch: `design/invoice-readability-20261113`, PR #163. Run invoice regression, existing billing-document tests, TypeScript, targeted ESLint and one Vercel preview. Inspect A4 output with:
1. a single bill partly paid by a larger project payment;
2. a project with at least one unallocated receipt;
3. a historical Paid bill with allocation gap;
4. a long service name, long address and more than one page of payments.

Keep production on Invoice System 3.0 until these cases are visually and functionally checked. A restorable Supabase backup is still unverified.
