# LAND VIEW Billing 4.3 — Project Statements & Verified Receipts

## New pages and documents

- `/admin/billing/project-statement?fileId=LV-157`: project-first consolidated statement dashboard.
- `GET /api/billing/project-statement?projectId=LV-157`: authenticated, read-only JSON snapshot.
- `GET /api/billing/project-statement-print?projectId=LV-157`: authenticated, paginated A4 printable document. `&autoprint=1` opens Print/Save PDF.
- The **Download PDF** button exports exactly the A4 pages from the same print document, using the existing LAND VIEW A4 PDF writer.
- The Receive Payment screen's existing receipt history now includes the Project Statement shortcut and **Download PDF** next to each verifiable individual receipt.
- Existing invoice printing, receipt verification tokens and client/ledger endpoints remain unchanged.

## Financial basis and terminology

Billing 4.3 reads `loadReceivableAuthority({projectId})` and **does not introduce a second due calculation**. This includes canonical payment-effective rules, draft exclusions, credit/debit adjustments, write-offs and the authority's existing advance offsets.

Display:
- **Net billed services:** after direct bill discounts and posted debit/credit notes;
- **Total received:** effective project payments, including legacy manual client receipts recognized as payments but not necessarily as new ledger income;
- **Amount currently payable:** canonical `project.totalDue`, **not** sum of raw invoice due values;
- **Invoice-unallocated payments:** raw amount not currently attached to invoice allocations;
- **Advance remaining after offsets:** canonical remaining unallocated/available credit after project-level offsets;
- **Invoice due before project offsets:** service-level invoice balances, not a second total due.

The statement is a **current snapshot**, not an “as-of historical balance”; it includes its generation time. Older downloaded files are snapshots and can be superseded by subsequent payments, allocations or corrections.

## Data safety

- All APIs are GET-only and set private/no-store; none writes bills, receipts, payments or ledger transactions.
- Admin/manager/accounts may open any project. Client role can open only a project explicitly linked to their session. Other roles are denied.
- Receipt links are shown only for actually issued, nonvoided tokens matching the original payment's recorded verification URL. A missing online receipt does **not** negate an effective historical payment.
- Client, project, service and adjustment labels are HTML escaped; PDF generation renders the same server document.
- Full data completeness is checked at the canonical authority limit and on extra receipts/adjustment/write-off queries; incomplete snapshots are rejected.
- The backend checks statement payment and bill totals against the receivables authority and refuses issuance if they disagree by more than one cent.
- No schema migration, data backfill, or historical financial row mutation is involved.

## PDF and print

- Both options use the same deterministic A4 pages, with a LAND VIEW brand header, page numbers, amounts in BDT, a status-date, and project identity.
- Summary page is followed by paginated invoice/bill, payment, adjustment and write-off registers, only when those registers have entries.
- Print CSS uses `@page A4` and explicit page breaks; direct download uses HTML-to-JPEG pages combined by `createA4Pdf`.
- Up to 100 document pages; content lengths are controlled to avoid overflow. PDF is generated inside the authenticated user's browser.
- **Important:** Project statements are private financial records, not publicly verifiable receipts. A receipt may only be shared using its original verified token/URL.

## Release checklist

1. Run `node --test tests/billing-project-statement-v43.test.cjs`, existing financial regression suites, focused lint, TypeScript and Next.js build.
2. Check a project with many invoices, a project with legacy manual payments, and a project with advances/write-offs in authenticated preview; use **GET only**, not synthetic payment writes.
3. Inspect A4 document preview/print, mobile view, and PDF export. The appearance may vary slightly by local printer/PDF viewer.
4. Confirm production build READY and the canonical /admin/billing/project-statement route.
5. Compare before/after bills, invoices, payments, allocations, receipts and monetary totals; the feature must not modify them.
6. Check runtime errors and preserve the previous deployment for rollback.

## Known limits

- The current statement can be printed or downloaded, but is not a permanently signed/verified historical statement. Users should download again after financial corrections.
- A payment without an issued online receipt shows its payment record but no invented receipt URL.
- Bills and client documents are not automatically emailed or WhatsApped by this release.
