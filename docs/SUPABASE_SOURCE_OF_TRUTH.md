# LAND VIEW — Data Source of Truth

## Production rule

Supabase PostgreSQL is the single source of truth for LAND VIEW business data.

This includes:

- Projects and project stages
- Clients and employees
- Proposals and proposal activity
- Bills, payments, accounts, transactions, expenses and finance ledgers
- Workflow tasks
- Permissions and audit records
- Site visits and site-visit job metadata
- Leads and website analytics
- Application/session audit data

Supabase Auth is the authoritative login/session source. `public.app_sessions` is the Admin-facing PostgreSQL session register synchronized from `auth.sessions`.

## File storage

File/media storage is separate from business data. Google Drive and other configured object/file storage may be used for project documents or media, but they must not become the authoritative source for project, finance, workflow, employee, permission, session or analytics records.

## Legacy compatibility

`Code.gs` is retained only as historical/legacy reference. It is not the production ERP data path and must not be used to introduce new Google Sheets business-data dependencies.

Some compatibility APIs may still return data in a table/"sheet" shape for older UI code. Those adapters must read from Supabase and must not fetch a Google Sheet or Apps Script endpoint. For example, the current `getFinanceSheet` compatibility adapter is generated from Supabase PostgreSQL data and returns an empty external `url` field.

Environment variables left over from earlier architecture are not evidence of an active data path. New code must not use a legacy Apps Script endpoint or a second Supabase project for business records.

## Development rule

When adding or modifying a module:

1. Store authoritative structured data in Supabase PostgreSQL.
2. Use Supabase Auth for authenticated identity/session state.
3. Use file storage only for file bytes and file metadata needed to locate them.
4. Route server-side database access through the LAND VIEW Supabase gateway or a narrowly scoped OIDC-protected service.
5. Do not add new Google Sheets/Apps Script reads or writes for ERP data.
6. Preserve auditability and idempotency for finance, approvals and destructive actions.
