/* eslint-disable @typescript-eslint/no-require-imports -- Node's built-in test runner uses CommonJS in this repository. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (filename) => fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
const route = read("app/api/admin/projects/v4-summary/route.ts");
const preview = read("app/admin/projects/[projectId]/v4-preview/page.tsx");

test("v4 summary authenticates and authorizes before reading private project information", () => {
  assert.match(route, /await requireLocalSession\(request\)/);
  assert.match(route, /\["admin", "manager"\]\.includes\(roleOf\(user\)\)/);
  assert.ok(route.indexOf("await requireLocalSession(request)") < route.indexOf('selectRows("projects"'));
  assert.match(route, /Cache-Control": "private, no-store/);
});

test("v4 summary is truly read-only and avoids billing snapshot helpers with side effects", () => {
  assert.match(route, /export async function GET\(request: NextRequest\)/);
  assert.doesNotMatch(route, /export async function POST|export async function PATCH|export async function DELETE/);
  assert.doesNotMatch(route, /insertRows|updateRows|deleteRows|upsertRows|syncIssuedServiceWorkflows/);
  assert.doesNotMatch(route, /getBillingV2Snapshot\s*\(|getAdjustedBillingV2Snapshot\s*\(/);
  assert.match(route, /loadReceivableAuthority\(\{ projectId:/);
});

test("five project-level client document requirements are visible without inserting records", () => {
  for (const term of ["Photo", "NID / Passport / Birth Certificate", "Ownership Registry Paper", "Khotian", "Land Tax Slip"]) {
    assert.ok(route.includes(term), term);
  }
  assert.match(route, /client_document_register/);
  assert.match(route, /The legacy register does not establish formal verification/);
  assert.match(preview, /Client Document Requirements/);
  assert.match(preview, /formal verification/);
});

test("project overview preserves existing modules and never advertises unverified live actions", () => {
  assert.match(preview, /read-only design preview/);
  assert.match(preview, /Current Project View/);
  assert.match(preview, /Lifecycle Workspace/);
  assert.match(preview, /Existing pages remain the editable source/);
  assert.doesNotMatch(preview, /method:\s*["']POST["']|method:\s*["']PATCH["']|method:\s*["']DELETE["']/);
});
