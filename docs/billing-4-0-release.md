# LAND VIEW Billing 4.0 — reliability and URL consolidation

## Scope
- Canonical management URL: `/admin/billing`; existing `/admin/finance/:path*` URLs redirect temporarily to the canonical path.
- Existing pages are reused through a Next.js rewrite, not copied, renamed or deleted. Existing billing API addresses remain unchanged.
- Billing & Accounts desktop navigation, mobile Billing dock, billing section toolbar and project-first dashboard use consistent destinations.
- General ledger at `/admin/accounts` and outsourcing/vendor ledgers stay separate.
- Full-bill creation now submits all service items in **one** PostgREST JSON-array insert; Postgres executes this as one transaction. One failed row or trigger rolls back all rows.
- The bill table already has a unique `idempotency_key` index. Individual lines use batch ID + index; retries read back the entire batch and refuse partial/mismatched state.
- Payment form stores a single pending submission key and SHA-256 input fingerprint in session storage until success or a reviewed reset. Retrying an identical uncertain submission reuses that key.
- A read-only payment status API lets authorized staff verify whether a payment submission was recorded.
- Other Services payment types are checked against the project's actual billed services rather than a hard-coded three-service list.
- Explicit Advance entry allows an amount above currently billed due for a category; the existing SQL reconciler automatically applies available open invoice amounts first and leaves the rest unallocated.
- Screen-only typography improves readability; printed documents are unchanged.

## Financial safety
No database schema changes, data corrections, write-offs, receipt backfills or historical payment mutations were executed as part of implementation. Existing database triggers and canonical invoice authority remain in place.

**Full Bill Editor limitation:** Existing issued-bill revisions still use individual audited note/metadata transactions, not one atomic multi-revision transaction. Do not describe them as atomic. The new all-or-nothing behavior applies to **new Direct / Full Bills** only.

**Advance expectation:** An advance payment is **not** a promise to remain fully unallocated; the existing reconciler applies it to eligible outstanding invoices in the selected category. The excess is retained as unallocated.

**Historical review:** Legacy payments without linked receipts or ledger references require account-level investigation, not automatic creation of new receivables.

## Release acceptance
1. Verify Billing V4 regression gate, invoice checks, TypeScript, scoped lint and Next.js build in one branch and one intended review preview.
2. Open `/admin/billing`, `/admin/billing/direct-bill`, `/admin/billing/invoices`, `/admin/billing/service-payments` and old `/admin/finance` (redirect). Check both desktop and mobile.
3. Test new batch request guardrails with synthetic invalid data only. Never create test invoices or payments in production.
4. Confirm read-only production totals match pre-release. Do not backfill receipts, reroute historical payments or reclassify posted invoices while deploying.
5. Inspect production logs and preserve prior deploy for rollback.

Maintains a conservative boundary: full historical corrections, full editor transaction consolidation and vendor module relocation should be separate controlled releases if financial review requires them.
