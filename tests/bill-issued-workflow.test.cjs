const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20261104124500_bill_issued_workflow_delivery_gate.sql");
const service = read("lib/service-workflow.ts");
const api = read("app/api/service-workflow/route.ts");
const ui = read("app/admin/project-operations/overview/page.tsx");

test("issued bill activates work at zero payment without reset of existing status", () => {
  assert.match(service, /if \(service\.net <= 0\) continue;/);
  assert.doesNotMatch(service, /service\.paid <= 0/);
  assert.match(service, /status: initialWorkflowStatus\(\)/);
  assert.match(migration, /trg_landview_bill_issued_starts_work/);
  assert.match(migration, /'issued','unpaid','partially paid','paid','open'/);
  assert.match(migration, /on conflict \(project_id,service_key\) do update/);
  assert.doesNotMatch(migration, /on conflict \(project_id,service_key\) do update\s+set status/i);
});

test("delivery requires confirmed service-specific receipts and full contract or bill amount", () => {
  assert.match(migration, /landview_verified_service_paid/);
  assert.match(migration, /not in \('void','voided','cancelled'/);
  assert.match(migration, /v_required := greatest\(coalesce\(v_billed,0\),coalesce\(v_contract_net,0\)\)/);
  assert.match(migration, /if v_paid\+0\.009 < v_required then/);
  assert.match(migration, /new\.status in \('Delivered','Delivered to Client'\)/);
  assert.match(migration, /trg_landview_final_delivery_requires_payment/);
});

test("delivered documents and client visibility use the same database release gate", () => {
  assert.match(migration, /trg_landview_document_delivery_requires_payment/);
  assert.match(migration, /coalesce\(new\.client_visible,false\)/);
  assert.match(migration, /coalesce\(new\.delivered_quantity,0\)/);
  assert.match(migration, /landview_assert_service_fully_paid\(/);
});

test("creating future contracts no longer demands advance payment to start", () => {
  const contracts = read("lib/billing-v2.ts");
  assert.match(contracts, /start_gate: "None"/);
  assert.match(contracts, /release_gate: "Fully Paid"/);
  assert.match(migration, /alter column start_gate set default 'None'/);
  assert.match(migration, /alter column release_gate set default 'Fully Paid'/);
});

test("project completion never forcibly delivers outstanding services", () => {
  assert.match(api, /if \(outstanding\.length\) throw new Error/);
  assert.match(api, /const servicesClosed = 0/);
  assert.match(ui, /Delivery locked/);
  assert.match(read("app/admin/project-operations/by-project/page.tsx"), /Delivery locked/);
  assert.match(read("app/admin/project-operations/by-service/page.tsx"), /Delivery locked/);
});
