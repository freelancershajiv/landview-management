# LAND VIEW Billing 4.2 — Atomic Full Bill Editor

This release replaces the Full Bill Editor's sequential per-row updates with one transaction-backed RPC (`billing_v42_apply_full_revision`). A failed validation, constraint, trigger or audit insert rolls back the **entire batch**.

## Workflows
- **Add service:** Creates a bill and its invoice in the same database transaction using the existing bill trigger.
- **Modify draft:** Changes amount, quantity, rate, discount, service, date, category and notes only while the bill remains Draft.
- **Void draft:** Preserves the original bill for auditing, marks it Void with zero receivable, and voids its draft invoice. It does not physically erase the bill.
- **Revise issued service:** Preserves original bill ID and issued gross/quantity/rate, permits validated metadata and discount changes, and stores old and new snapshots.
- **Remove unpaid issued service:** Creates an audited Credit Note and mirror using the existing credit-note schema within the same transaction. If the invoice has paid/allocated money, removal is blocked pending a separate financial correction/refund review.
- **Idempotency:** One UUID request key, one SHA-256 request hash, and a unique billing_events event key. A repeated same request returns prior result. A changed request with the same key is rejected.
- **Audit:** One `billing_events` record of type `full_bill_revision_v42` includes every operation's before and after values, operator, reason and result. The existing bill audit triggers also apply.

## Security and architecture
Browser -> authenticated same-origin `/api/billing/full-revision-v42` -> Vercel OIDC-trusted Supabase gateway action `applyFullBillRevisionV42` -> service-role-only database RPC.

The SQL function is `SECURITY INVOKER`; EXECUTE is revoked from PUBLIC/anon/authenticated, granted only to service_role. The Next.js API enforces admin/manager/accounts permissions and a reason >=12 chars. The RPC itself checks source snapshots under row locks and invoice locks, validates every operation **before** writing, and uses a single PostgreSQL transaction.

## Backward compatibility
No existing table, invoice, receipt, payment, ledger, allocation, WhatsApp setting, or project is modified by the migration itself. The current `/admin/billing/full-bill-editor` URL is unchanged. Existing direct bill and adjustment routes continue working. Historical missing bill dates and quantity/rate fields are preserved when untouched.

## Verification
1. Run `node --test tests/billing-full-editor-v42.test.cjs`, existing invoice tests, scoped lint, typecheck and production build.
2. Apply additive SQL migration; verify function EXECUTE privilege and run read-only status checks. Confirm invalid/no-op preview cannot modify financial records.
3. Deploy the existing gateway with only the new RPC action and same OIDC authentication setting (verify_jwt=false because this function authenticates Vercel OIDC itself). Check health after deploy.
4. Open a single preview and inspect editor, revision history, permission failures and validation using fake/invalid request only. **Never generate live synthetic paid invoices.**
5. Merge to main and verify production deployment READY, runtime errors clear, and all financial counts/sums unchanged before any user-initiated edits.

## Known guardrails
- Editing paid issued bill metadata across categories/services is blocked; discount cannot reduce amount below allocated money.
- Issued invoices are not deleted or reissued automatically. Any generated client PDF needs to be freshly rendered from canonical invoice records; previously downloaded PDFs remain historical snapshots.
- Single-bill edits through older screens remain separate workflows. The atomic guarantee applies specifically to `Full Bill Editor 4.2`.
- Receipt and ledger reconciliation remains Billing 4.1; this release does not backfill historical financial records.
