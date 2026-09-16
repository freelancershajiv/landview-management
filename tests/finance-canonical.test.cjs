const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Finance router exposes only the canonical eight finance tables", () => {
  const source = read("ModularDatabaseRouter.gs");
  const financeBlock = source.match(/finance:\s*\[(.*?)\]/s)?.[1] || "";
  const names = [...financeBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(names, ["Bills", "Payments", "Invoices", "Expenses", "Accounts", "Transfers", "Transactions", "Import Audit"]);
  assert.equal(financeBlock.includes("Summary"), false);
  assert.equal(financeBlock.includes("Accounting Expenses"), false);
});

test("canonical runtime enforces payment effectiveness and manual unique project IDs", () => {
  const source = read("zzzzz_CanonicalFinanceRuntime.gs");
  assert.match(source, /lvCanonicalPaymentEffective_/);
  assert.match(source, /Approval_Status/);
  assert.match(source, /Project_ID is required and must use the LV-### format/);
  assert.match(source, /Project_ID already exists/);
  assert.match(source, /lvCanonicalGuardMutation_/);
  assert.match(source, /Idempotency_Key/);
});

test("finance ledger posts to Transactions and never recreates the old accounting workbook", () => {
  const source = read("FinanceLedger.gs");
  assert.match(source, /Transactions/);
  assert.match(source, /Accounts/);
  assert.match(source, /TXN-PAY-/);
  assert.match(source, /TXN-EXP-/);
  assert.match(source, /TXN-TRF-/);
  assert.equal(source.includes("1e51Mq3hOj9rUH9ugF8SiHe4SYJW3dJ3Bcw9JNgii_bs"), false);
  assert.equal(source.includes('getSheetByName("Accounting Expenses")'), false);
  assert.equal(source.includes('insertSheet("Accounting Expenses")'), false);
});

test("accounts page renders the canonical cashbook and does not request retired accounting worksheets", () => {
  const layout = read("app/admin/accounts/layout.tsx");
  const page = read("app/admin/accounts/page.tsx");
  assert.equal(layout.includes("ReconciledLedgerPanel"), false);
  assert.equal(page.includes("Accounting Income"), false);
  assert.equal(page.includes("Accounting Expenses"), false);
  assert.equal(page.includes("getFinanceSheet"), false);
  assert.match(page, /landViewApi\.getPayments\(\)/);
  assert.match(page, /landViewApi\.getErpRecords\("expenses"\)/);
  assert.match(page, /Running balance/);
  assert.match(page, /debit/);
  assert.match(page, /credit/);
});

test("owner bearer link is retired and admin layout excludes employees", () => {
  const ownerSource = read("app/owner-access/[token]/route.ts");
  const magicSource = read("zzzz_AdminMagicAccess.gs");
  const adminLayout = read("app/admin/layout.tsx");
  assert.equal(ownerSource.includes("OWNER_ACCESS_TOKEN_SHA256"), false);
  assert.equal(ownerSource.includes("_ownerMagic"), false);
  assert.equal(magicSource.includes("function loginUser"), false);
  assert.match(ownerSource, /owner-link-retired/);
  assert.match(adminLayout, /requirePortalSession\(\["admin", "manager", "accounts"\]\)/);
});

test("invoice API never falls back to deleted finance worksheets", () => {
  const route = read("app/api/project-billing/route.ts");
  assert.match(route, /getProjectBilling/);
  assert.match(route, /getProject/);
  assert.equal(route.includes('action: "getFinanceSheet"'), false);
  assert.match(route, /canonical-api-aggregate/);
});

test("billing money writes use a one-attempt dedicated gateway", () => {
  const gateway = read("app/api/billing/write/route.ts");
  const page = read("app/admin/finance/page.tsx");
  assert.match(gateway, /Intentionally one backend request only/);
  assert.equal(gateway.includes("for (let attempt"), false);
  assert.match(gateway, /Idempotency_Key/);
  assert.match(page, /\/api\/billing\/write/);
});

test("runtime approval reads do not seed September 2026 rows", () => {
  const source = read("zzzzzz_CanonicalApprovalRuntime.gs");
  assert.match(source, /ensureSeptember2026PendingExpensesCore_ = function\(\) \{ return 0; \}/);
  assert.match(source, /ensureSeptember2026IncomeCore_ = function\(\) \{ return 0; \}/);
  assert.match(source, /syncLandViewIncomeExpenseLedger/);
});
