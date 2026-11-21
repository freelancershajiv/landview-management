# Billing 4.4.1 — live-data audit and date-provenance repair

Read-only audit on 2026-11-21 against Supabase project `jupzgjlizxivhbmuigua`. No financial write queries were run.

## Verified project reconciliation

| Project | Net issued billed | Effective payments | Write-offs | Collectible due |
| --- | ---: | ---: | ---: | ---: |
| LV-072 | BDT 63,000 | BDT 55,000 | BDT 8,000 | **BDT 0** |
| LV-157 | BDT 320,000 | BDT 320,000 | BDT 0 | **BDT 0** |

LV-072 has Engineering BDT 45,000 billed / BDT 40,000 allocated, plus Other Services BDT 18,000 billed / BDT 15,000 allocated. The BDT 8,000 invoice remainder is offset by explicit write-offs (Engineering 5,000; Other Services 3,000). The original three LV-072 client payments (BDT 30,000, 15,000, 10,000) have `is_legacy_manual=true`, `affects_business_balance=false`, **no payment_date**, and import timestamps in October 2026. They remain genuine historical client credits, not October 2026 operational cash receipts.

LV-157 has Engineering BDT 140,000 / BDT 140,000 allocated, Supervision BDT 180,000 / BDT 180,000 allocated. No collectible due.

## Confirmed reporting errors in 4.4

1. **Imported bill issue dates** — 761 invoice records carry October 25, 2026 issue date. Among open bills, a read-only SQL scan found ~249 with no original bill date but an October 25 invoice date (about BDT 2,775,275 open before write-off and advance relief, under the audited SQL grouping). This is a migration date, not proof of original billing date. Original 4.4 would incorrectly include this amount in recent invoice-aging buckets. Revised 4.4.1 marks such open items **undated**.
2. **Missing payment dates** — 59 payments with missing `payment_date`, totaling BDT 2,233,750 (28 historical/manual BDT 613,100; 31 other payments BDT 1,620,650). Original 4.4 assigned their amounts to their `created_at` months. Those are frequently import timestamps, not actual collection dates. Revised 4.4.1 leaves these credits in lifetime totals but categorizes them **undated** instead of assigning a fabricated monthly payment date.

## Implementation rules

- Preserve `loadReceivableAuthority` unchanged. All bill/payment/advance/write-off totals remain authoritative; no database writes or backfills.
- `invoiceAgeEvidenceV44(issueDate,billDate)`: when invoice issue date is the known October 25, 2026 migration date and original bill date is absent, the age source is unverified. Put its open balance in `undated`. Otherwise use a valid invoice issue date, falling back to the original bill date.
- Only valid `payment_date` contributes to monthly collections. Do **not** fall back to `created_at` for client money attribution. Payment amounts with missing dates are still included in all-time effective totals and operational-vs-legacy classification.
- Add explicit data-quality values `unverifiedImportDateCount`, `unverifiedImportDateAmount`, `undatedPaymentCount`, and `undatedPaymentAmount` to the dashboard and A4 report.
- Monthly CSV removes the now-invalid `Date fallback` column; all-time payment totals retain undated credits.
- Issued/due dates cannot be historically certified without original supporting documents; invoice issue-age is explicitly not contractual overdue.

## Safety and acceptance

- Tests: `node --test tests/billing-reports-v44.test.cjs` plus all prior Billing 4.0–4.4 regression suites, scoped lint, TypeScript, production build.
- One review preview before merge to production; check runtime errors.
- Verify before/after projects, bills, invoices, payments, allocations, receipts, write-offs and monetary totals. No financial table mutations.
- The audit uses SQL and code review, **not** a privileged interactive browser session. Authenticated UI and real-browser Print/Save PDF still need user-side smoke testing if the connector cannot open an active login session.
