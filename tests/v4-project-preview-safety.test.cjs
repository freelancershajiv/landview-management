/* eslint-disable @typescript-eslint/no-require-imports -- Node's built-in test runner uses CommonJS. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (filename) => fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
const route = read("app/api/admin/projects/v4-summary/route.ts");
const component = read("components/project-v4-workspace.tsx");
const entry = read("app/admin/projects/[projectId]/v4-preview/page.tsx");
const nav = read("components/project-workspace-nav.tsx");

test("v4 requires a real session and admin/manager authorization before accessing project data", () => {
  assert.match(route, /await requireLocalSession\(request\)/);
  assert.match(route, /\["admin", "manager"\]\.includes\(roleOf\(user\)\)/);
  assert.ok(route.indexOf("await requireLocalSession(request)") < route.indexOf('selectRows("projects"'));
  assert.match(route, /private, no-store/);
});

test("v4 summary is a read-only aggregator, never initializing contracts on GET", () => {
  assert.match(route, /export async function GET\(request: NextRequest\)/);
  assert.doesNotMatch(route, /export async function POST|export async function PATCH|export async function DELETE/);
  assert.doesNotMatch(route, /insertRows|updateRows|deleteRows|upsertRows|syncIssuedServiceWorkflows/);
  assert.doesNotMatch(route, /getBillingV2Snapshot\s*\(|getAdjustedBillingV2Snapshot\s*\(/);
  assert.match(route, /loadReceivableAuthority\(\{ projectId/);
  assert.match(route, /getAdjustedProjectServiceFinancials\(projectCode\)/);
});

test("project-wide default document checklist is exactly the five agreed requirements", () => {
  for (const name of [
    "Photo", "NID / Passport / Birth Certificate", "Ownership Registry Paper", "Khotian", "Land Tax Slip",
  ]) assert.ok(route.includes(name), "Missing " + name);
  assert.match(route, /client_document_register/);
  assert.match(route, /registered = matches\.filter\(collected\)\.length/);
  assert.match(route, /Older receipts do NOT establish formal verification/);
  assert.match(component, /Project-Wide Client Documents/);
  assert.match(component, /One project-wide checklist/);
});

test("unified project workspace contains linked operational modules without data mutation", () => {
  for (const section of [
    "Project Details", "Bills & Payments", "Client Documents", "To-Do",
    "Workflow", "Design & Delivery", "Site Visits", "Project Finance",
    "Activity History", "Notifications",
  ]) assert.ok(component.includes(section), "Missing section " + section);
  assert.match(entry, /ProjectV4Workspace/);
  assert.match(nav, /Unified v4 Preview/);
  assert.match(component, /Existing records are read-only/);
  assert.match(component, /No messages are sent from this page/);
  assert.doesNotMatch(component, /method:\s*["'](?:POST|PATCH|DELETE)["']/);
});

test("financial uncertainty is not represented as a fictitious zero or a new debt", () => {
  assert.match(route, /Financial authority returned incomplete records/);
  assert.match(route, /monetary amounts have been withheld/);
  assert.match(route, /historicalReview/);
  assert.match(route, /these are not new dues/);
  assert.match(component, /Unavailable/);
  assert.match(component, /not automatically treated as new debt/i);
});
