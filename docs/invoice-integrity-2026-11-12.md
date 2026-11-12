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

## Phase 2 – proposal conversion safety (code only)

The initial conversion must retain the database contract-capture hook: inserts marked `Proposal Auto Conversion` are deliberately consumed by a BEFORE INSERT trigger to populate contract services and milestones. This hook does not persist invoice bill rows.

New and repaired proposal bills now share the same bill-creation path. Positive-net amounts are Issued, and zero-net/fully discounted lines remain Draft. Existing bill states are left alone.

- Preflight validates unique item IDs, valid discounts, and accepted proposal net before project registration.
- Deterministic bill codes let the existing UNIQUE bill_code constraint reject concurrent duplicate proposal-item inserts.
- Registration stops when a proposal is already linked to an incompletely finalized project.
- Reconciliation exceptions are reviewed only; no automatic financial corrections.
- Simultaneous initial project-registration attempts still need a database-level uniqueness guarantee or transaction to close the remaining race. No migration has been applied.
- The unrelated legacy repository-wide lint/test failures are separately reported; targeted invoice checks remain required.

## Phases 3–5 – coordinated invoice release (development only)

Invoice Center provides an authenticated dashboard of canonical invoice status, effective allocations, project collectible due, search, date/category/status filters and client-safe CSV exports. Existing PDF generation, WhatsApp PDF delivery, email invoice delivery and payment recording remain established workflows, linked rather than duplicated.

Reconciliation continues to be review-only. A Paid bill with insufficient allocated payments is marked Historical review, never turned into new collectible debt. Invoice-level balance and project-level due are distinct because unallocated advances, write-offs and adjustments can reduce project receivables. The integrity screen provides CSV and historical-source breakdown.

Notifications reuse the existing persistent whatsapp_client_outbox. An administrator/manager can explicitly confirm a single reminder for a project with WhatsApp client updates enabled, a valid number and a positive canonical collectible balance. A UNIQUE dedupe key prevents more than one reminder per project per Dhaka calendar month, across manual and scheduled paths. Messages are queued, not described as delivered. WhatsApp operations remains the delivery/failed-message monitor.

Scheduled reminder safety: The weekly cron is registered for Monday 04:00 UTC (10:00 in Bangladesh), but INVOICE_REMINDERS_ENABLED must be set to exactly true before it queues messages. Leave it unset during preview and initial release. The separate manual sender is also disabled unless VERCEL_ENV is production and INVOICE_REMINDERS_MANUAL_ENABLED is true. Projects with unresolved Paid-versus-allocation gaps are excluded from both paths. Review consent and WhatsApp health, then opt in deliberately if approved. Up to 20 new reminders are queued per execution. CRON_SECRET must be configured.

Release concerns:
- The canonical authority has finite source-query limits; incomplete snapshots block automatic reminders and warn on exports.
- No production records or database migration are changed by this branch.
- Broad repository lint/test baseline includes unrelated failures. The focused invoice regression, targeted lint and typecheck form separate required checks.
- Validate reminder recipient, due, duplicate suppression, invoice PDF, email/WhatsApp delivery and Client Portal totals using synthetic or controlled preview records. Never send test messages to real clients.
- Verify a recoverable database backup before deployment. Code rollback alone cannot undo erroneous finance records.

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
