const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const read = (name) => fs.readFileSync(name, "utf8");
const logic = read("lib/billing-reconciliation-41.ts");
const api = read("app/api/billing/reconciliation-41/route.ts");
const page = read("app/admin/finance/reconciliation/page.tsx");
const nav = read("components/billing-navigation.tsx");
const layout = read("app/admin/finance/layout.tsx");
const sandbox = { exports: {}, module: { exports: {} } };
sandbox.exports = sandbox.module.exports;
const compiled = ts.transpileModule(logic, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(compiled, sandbox, { filename: "billing-reconciliation-41.js" });
const { paymentReconciliationIssues, reviewStatus } = sandbox.module.exports;
const baseline = { amount: 4000, effective: true, historical: false,
  issuedReceipt: true, receiptAmount: 4000, receiptProjectMatches: true,
  linkedLedger: true, ledgerAmount: 4000, paymentScope: "main", ledgerScope: "main", ledgerProjectMatches: true,
  allocated: 4000 };
const types = facts => [...paymentReconciliationIssues({ ...baseline, ...facts })].map(c => c.type);

test("effective, matching payments do not create reconciliation findings", () => {
  assert.deepEqual(types({}), []);
});

test("missing issued receipt does not incorrectly create outstanding debt", () => {
  const entries = paymentReconciliationIssues({ ...baseline, issuedReceipt: false });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, "receipt_not_issued");
  assert.equal(entries[0].difference, 0);
  assert.match(entries[0].explanation, /no currently issued/i);
});

test("missing ledger reference is a review item, not an amount adjustment", () => {
  const entries = paymentReconciliationIssues({ ...baseline, linkedLedger: false, ledgerAmount: null });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, "ledger_transaction_unlinked");
  assert.equal(entries[0].difference, 0);
  assert.match(entries[0].explanation, /not establish a new client due|before adjustments/);
});

test("historical/excluded payments do not become active receivables", () => {
  assert.deepEqual(types({ effective: false, historical: false, issuedReceipt: false }), []);
  const entries = paymentReconciliationIssues({ ...baseline, effective: false, historical: true,
    issuedReceipt: false, linkedLedger: false, allocated: 0 });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, "historical_evidence");
  assert.equal(entries[0].severity, "historical");
  assert.equal(entries[0].difference, 0);
});

test("only actual monetary differences are represented as differences", () => {
  const amounts = paymentReconciliationIssues({ ...baseline, ledgerAmount: 3600, receiptAmount: 3900, allocated: 4500 });
  const byType = Object.fromEntries(amounts.map(item => [item.type, item.difference]));
  assert.equal(byType.ledger_amount_mismatch, 400);
  assert.equal(byType.receipt_amount_mismatch, 100);
  assert.equal(byType.payment_overallocated, 500);
  assert.equal(byType.unallocated_advance, undefined);
});

test("unallocated money appears only as an informational advance", () => {
  const entries = paymentReconciliationIssues({ ...baseline, allocated: 1200 });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, "unallocated_advance");
  assert.equal(entries[0].severity, "info");
  assert.equal(entries[0].difference, 2800);
});

test("cross-project mismatches are identified without modifying references", () => {
  const names = types({ receiptProjectMatches: false, ledgerProjectMatches: false });
  assert.ok(names.includes("receipt_project_mismatch"));
  assert.ok(names.includes("ledger_project_mismatch"));
});

test("evidence review state is bound to exact snapshot fingerprint", () => {
  const pending = [{action: "requested", actor: "EMP-002", fingerprint: "a", createdAt: "2026-11-15T00:00:00Z"}];
  assert.equal(reviewStatus(pending, "a"), "pending");
  assert.equal(reviewStatus(pending, "b"), "open");
  assert.equal(reviewStatus([...pending, {action: "reviewed", actor: "admin", fingerprint: "a", createdAt: "2026-11-15T00:02:00Z"}], "a"), "reviewed");
  assert.equal(reviewStatus([...pending, {action: "rejected", actor: "admin", fingerprint: "a", createdAt: "2026-11-15T00:03:00Z"}], "a"), "rejected");
});

test("Reconciliation API is read-only except audit decision records", () => {
  assert.match(api, /await requireLocalSession\(request\)/);
  assert.match(api, /roleOf\(user\)/);
  assert.match(api, /export async function GET/);
  assert.match(api, /export async function POST/);
  assert.match(api, /recordAuditEvent/);
  for (const table of ["payments", "payment_receipts", "transactions", "payment_invoice_allocations", "projects", "app_audit_log"])
    assert.ok(api.includes(`selectRows("${table}"`), `Missing read from ${table}`);
  for (const action of ["updateRows", "deleteRows", "insertRows", "upsertRows", "supabaseGateway", "applyBillingWriteOff", "applyBillingDiscount"])
    assert.ok(!api.includes(action+"("), `Unexpected financial write ${action}`);
  assert.match(api, /if \(item\.requestedBy === who\)/);
  assert.match(api, /if \(roleOf\(user\) !== "admin"\)/);
  assert.match(api, /fingerprint = createHash\("sha256"\)/);
  assert.match(api, /item\.fingerprint !== fingerprint/);
  assert.match(api, /if \(!originAllowed\(request\)\)/);
});

test("Reconciliation UI provides queue, mobile cards, case history, and safe review actions", () => {
  assert.match(nav, /href: "\/admin\/billing\/reconciliation"/);
  assert.match(layout, /<BillingNavigation \/>/);
  assert.match(page, /\/api\/billing\/reconciliation-41/);
  assert.match(page, /r41-mobile/);
  assert.match(page, /Request evidence review/);
  assert.match(page, /Mark evidence reviewed/);
  assert.match(page, /Export visible CSV/);
  assert.match(page, /A missing receipt or transaction reference is an investigation item/);
  assert.doesNotMatch(page, /\/api\/billing\/write|\bdeleteRows\(/);
});
