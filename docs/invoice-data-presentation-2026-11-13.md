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
- Receipt paths are validated against same-origin `/verify/receipt/<32-character-hex-token>` values; all 303 live receipt URLs match this format. To avoid introducing unsafe dynamic navigation, the updated ledger displays receipt availability and identifiers without adding a direct link until security review is complete. The screen ledger is collapsible; A4 documents retain payment tables and category summaries.
- Incomplete ledger or a reconciliation mismatch must never be silently treated as an audited collectible value.

## Release and checks

Target branch: `design/invoice-readability-20261113`, PR #163. Run invoice regression, existing billing-document tests, TypeScript, targeted ESLint and one Vercel preview. Inspect A4 output with:
1. a single bill partly paid by a larger project payment;
2. a project with at least one unallocated receipt;
3. a historical Paid bill with allocation gap;
4. a long service name, long address and more than one page of payments.

Keep production on Invoice System 3.0 until these cases are visually and functionally checked. A restorable Supabase backup is still unverified.

## LV-281 print screenshot regression (13 November)

The user-supplied A4 screenshot showed that a 10,000 BDT Engineering payment was displayed as `Recorded — allocation unknown` while the applied/unallocated cells showed dashes. Read-only production SQL confirmed the exact payment code had 10,000 BDT in invoice allocations. No financial-record corrections were needed.

To ensure the document can display that canonical allocation even if the supplemental `paymentReview` response is unavailable or missing the code, the invoice page now carries the **existing bill-specific `billPayments` allocation rows** to the printed document. The renderer first looks for the complete payment review by exact payment ID, then derives the per-payment applied amount from exact `paymentCode` matches against the canonical bill-payment allocation rows. It refuses mismatches where allocations exceed the received amount. No fuzzy matching and no database write.

The same screenshot showed the `UNALLOCATED (BDT)` sixth print column clipped by an older five-column CSS override. The print stylesheet now explicitly sizes all six columns and wraps headings; the single-bill layout retains its four-column variant. Verify with Chrome Print → Save as PDF on LV-281 and other multi-category projects.

## Canonical per-row payment amounts — final LV-281 screenshot follow-up
The earlier paymentReview and billPayments fallbacks did not consistently render even where the invoice PDF itself showed the matching payment code. The definitive fix avoids relying on supplemental response objects: the server's existing `payRows` now serializes `PaymentReceivableState.allocated` and `PaymentReceivableState.unallocated` **alongside its paymentCode and received amount in the same Design Deposit / Other Deposit sheet row**. The invoice sheet parser retains both optional values; the actual A4 print renderer prefers valid received/applied/unallocated values that reconcile (±৳0.02), then uses previous exact-ID fallbacks.

The values remain read-only and come from canonical allocation calculations in `loadReceivableAuthority`. The existing invoice/bill payment logic and statuses are not edited. A missing or inconsistent sheet value must not be guessed from date, amount or project status. Regression tests assert the full server-to-PDF data path.
