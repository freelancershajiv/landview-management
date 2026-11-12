# LAND VIEW Invoice Integrity – Phase 1

**Scope:** Read-only review of the billing/invoice code and restricted integrity checks against the production dataset. This is a public code repository: **never commit client information, financial amounts, individual project records, or exported audit results here**.

## Code-level risk

Previously, invoice display logic re-associated bill amounts based on a normalized service description plus amount. Two different bills can legitimately have identical service names and prices. That must never cause one bill's invoice code or payment allocation to be shown for another.

## Proposed change

1. Preserve permanent bill ID, invoice code and issue date while parsing and sorting financial line items.
2. Re-associate canonical payment information by permanent bill ID rather than a description/price pair whenever identity exists.
3. Exclude draft and voided items from single-invoice generation.
4. Add regression tests using synthetic bill IDs.
5. Add an authenticated, read-only `/admin/finance/integrity` screen and `/api/billing/integrity` endpoint for finance administrators to review accounting exceptions.

The integrity screen treats status/allocated-amount discrepancies as **review exceptions, not confirmed outstanding dues**. Corrections must not happen automatically.

## Backup and deployment gate

**Do not merge or repair production data until a recoverable Supabase backup is verified** in the private [Supabase Database Backups dashboard](https://supabase.com/dashboard/project/_/database/backups/scheduled), or by checking PITR. The currently available connector cannot inspect backup inventory or perform a production database export. A Git branch is only a source-code rollback point, not a database backup.

Before releasing:

1. Confirm a restorable backup exists and retain a private, approved off-site logical backup when warranted.
2. Run invoice regression tests and type checks on the exact commit.
3. Verify a preview with synthetic identical-price services and role-based access checks.
4. Manually compare invoice PDF, receipt allocations and Add Payment for known projects in the authenticated admin portal.
5. Compare finance totals before and after; roll back the code deployment on regressions. Never bulk-correct historical financial states without reconciliation.

## Remaining work

- Unify proposal conversion's bill issuance lifecycle through a reviewed domain contract.
- Retire legacy category-level paid-status shortcuts once all callers use canonical payment allocations.
- Review historical exceptions privately with Accounts before considering any data repair.

**Production financial data changed by this pull request:** none.
