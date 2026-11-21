/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Node test runner */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const sql = read("supabase/migrations/20261113090000_project_client_document_lifecycle_v4.sql");
const route = read("app/api/admin/projects/client-documents/route.ts");
const ui = read("components/project-client-document-registry.tsx");
const summary = read("app/api/admin/projects/v4-summary/route.ts");
const gateway = read("supabase/functions/landview-data/index.ts");
const workspace = read("components/project-v4-workspace.tsx");

test("default project document requirements are the five approved categories", () => {
  for (const name of ["Photo","NID / Passport / Birth Certificate","Ownership Registry Paper","Khotian","Land Tax Slip"]) {
    assert.ok(ui.includes(name), name);
    assert.ok(route.includes(name), name);
  }
  assert.match(route, /projectByCode\(input\.projectId\)/);
  assert.match(summary, /receiptCount: registered, onHandCount: inCustody.length/);
  assert.match(workspace, /ProjectClientDocumentRegistry/);
});

test("project document editing is off by default and forbidden from preview deployments", () => {
  assert.match(route, /process\.env\.VERCEL_ENV === "production"/);
  assert.match(route, /LANDVIEW_V4_DOCUMENT_WRITES_ENABLED === "true"/);
  assert.match(route, /LANDVIEW_V4_DOCUMENT_BACKUP_VERIFIED === "true"/);
  assert.match(route, /if \(!writesEnabled\(\)\) return response/);
  assert.match(route, /migrationReady\(projectId\)/);
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /documents\.manage/);
  assert.match(route, /documents\.view/);
  assert.match(ui, /disabled=\{!registry\.writeEnabled\}/);
});

test("receiving is project scoped, idempotent, and receipt code is allocated by database", () => {
  assert.match(route, /filters: \{ project_id: projectId, idempotency_key: idempotency \}/);
  assert.match(route, /UUID\.test\(idempotency\)/);
  assert.match(route, /insertRows\("client_document_register", payload\)/);
  assert.doesNotMatch(route, /register_code:\s*crypto|register_code:\s*\x60/);
  assert.match(route, /return_status: form === "Digital" \? "Not Applicable" : "Held by LAND VIEW"/);
  assert.match(route, /FORMS\.has\(form\)/);
  assert.match(route, /IDENTITY_TYPES\.has\(identityType\)/);
});

test("verification and return updates use optimistic concurrency and do not touch other projects", () => {
  assert.match(route, /filters: \{ project_id: projectId, id \}/);
  assert.match(route, /filters\.verification_status = current/);
  assert.match(route, /filters\.return_status = "Held by LAND VIEW"/);
  assert.match(route, /changes = \{\s*return_status: "Returned"/);
  assert.match(route, /"Document changed concurrently\. Reload and retry\."/);
  assert.doesNotMatch(route, /updateRows\("bills"|updateRows\("invoices"|updateRows\("payments"/);
  assert.doesNotMatch(route, /sendWhatsApp|notifyClient|sendEmail/);
});

test("migration is additive, keeps pre-existing client docs intact, and creates atomic custody events", () => {
  assert.match(sql, /alter table public\.client_document_register/);
  assert.match(sql, /add column if not exists verification_status text not null default 'Unverified'/);
  assert.match(sql, /create unique index if not exists client_document_register_v4_idempotency_uq/);
  assert.match(sql, /project_client_document_events/);
  assert.match(sql, /after insert or update of verification_status, return_status/);
  assert.match(sql, /create trigger landview_v4_client_document_events/);
  assert.match(sql, /alter table public\.project_client_document_events enable row level security/);
  assert.match(sql, /revoke all on public\.project_client_document_events from public, anon, authenticated/);
  assert.doesNotMatch(sql, /\btruncate\b|\bdrop table\b|\bdelete from\b|\bupdate public\.client_document_register\b/i);
  assert.ok(gateway.includes('"project_client_document_events"'));
});

test("no sensitive identity numbers or documents are put in receipts or outbox", () => {
  assert.match(ui, /Do not enter NID\/passport numbers here/);
  assert.match(ui, /escapeHtml\(/);
  assert.match(route, /Never return any scan bytes, identity numbers or private files/);
  assert.doesNotMatch(route, /whatsapp_client_outbox/);
});
