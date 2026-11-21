# Billing 4.4.2 — Correct project-only collections reconciliation

On 2026-11-21 the production Billing 4.4 dashboard returned:
`Collections totals do not reconcile with canonical effective payments.`

## Confirmed root cause

`loadReceivableAuthority()` loads the global `payments` register, which contains both project client payments and office income. Its canonical `totals.paid` is computed from `projects` and **only includes effective payments with a nonempty `projectId`**.

`compileFinancialReportV44()` was incorrectly summing **all** effective payments from the global register (including project-less office income) when calculating operational / legacy monthly collections. Production has **13 project-less Office Income transactions totaling BDT 72,850**, all approved and effective. They should remain in the business ledger but **never be counted as project collections**. The original report's error was a scope mismatch, not altered or corrupt financial records.

## Change

In `lib/billing-reports-v44.ts`, skip any payment without a project ID or without a matching project in the canonical authority before calculating monthly/all-time project collections. Keep effective-payment checks. This scope matches the authority's own `projectIds` construction. This makes the collection totals, monthly dated payments plus undated credited payments, and canonical `totals.paid` reconcile without hiding any legitimately project-linked payment.

Add test with the exact 13 production office-income amounts and assert that report payment / due totals remain correct, including existing undated historical credits.

**No database change, migration, transaction adjustment, or historical date modification.**

## Verification

Run updated 4.4 regression suite, focused lint, TypeScript, quality checks, Vercel preview and production build. Check production deploy READY and before/after raw financial baseline. Authenticated browser rendering requires an existing user session; API is access-protected.
