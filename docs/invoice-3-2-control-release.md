# LAND VIEW — Invoice 3.2 controlled release

## Accounting invariants

- No automatic historical payment backfill, unbilled revenue recognition, or debt creation.
- Invoice allocation corrections may only move **one existing allocation row** from one active invoice to another active invoice in the **same project and billing category**. The value, recorded payment, bill and ledger entry are unchanged.
- Draft, void, settled/historical Paid and over-capacity destinations are not eligible for this automated route. Historical Paid gaps remain explicit finance-review exceptions.
- Corrections require a specific reason, an authenticated finance role, a **different administrator** to approve, same-origin POST and server-side preflight checks immediately before the update.
- A successful approval audit must be recorded **before** the compare-and-set row update, and a completion audit after it. If the update or final audit fails, block/review; do not compensate via blind writes.
- Every invoice remains an issued historical document; credit/debit notes and approved allocation corrections are surfaced as separate revisions.
- Cross-ledger comparison uses canonical posted payment code `TXN-PAY-<payment_code>` and assesses payment-to-transaction amount and finance scope. Missing attachments are informational; historical transactions and unavailable ledger reads are not falsely certified.
- The Supabase data gateway caps read queries at 5,000 rows. Allocation edits are disabled when any required dataset reaches the cap.

## Rollout / verification

1. Open only one feature preview, using synthetic tests and real-data read-only controls. Never submit mutation tests against actual financial records.
2. Run focused invoice regression tests, static security assertions, TypeScript typecheck and a Next.js build as release gates.
3. Verify the correction center is accessible only to finance roles; requests are audited, approval is admin-only and requester and approver cannot be the same user.
4. In authenticated previews review one fully paid bill, one partially paid bill and one invoice with discount. Confirm amount, payment reference and status agree with the Finance ledger and saved document history. Do not send reminders or customer notifications while testing.
5. After acceptance, release without schema migration. Preserve source code commit and rollback point. Treat historical reconciliation exceptions as manual investigations.
6. Repository-wide lint/test debt is reported as diagnostic until unrelated historical failures are addressed. It is not represented as clean.

## Existing navigation
- /admin/finance/invoices
- /admin/finance/integrity
- /admin/finance/allocation-corrections
- /admin/finance/adjustments

No live client, bill, payment, receipt, or personal information is included in this documentation.
