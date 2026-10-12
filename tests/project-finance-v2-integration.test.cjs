/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Project Management API uses Finance V2 current-state snapshot with legacy fallback", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../app/api/project-management/route.ts"), "utf8");
  assert.match(source, /calculateProjectFinanceV2Snapshot\(rows, summary\.financeV2Config\)/);
  assert.match(source, /financeV2Snapshot\?\.chequeOnHold \?\? legacyChequeOnHold/);
  assert.match(source, /financeV2Snapshot\?\.cashBalance \?\? \(debit - credit - legacyChequeOnHold\)/);
  assert.match(source, /financeVersion: financeV2Snapshot \? "v2" : "legacy"/);
  assert.match(source, /totals: \{ debit, credit, balance: debit - credit \}/);
});

test("Project Management UI renders canonical current-state values from the API", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../app/projectmanagement/page.tsx"), "utf8");
  assert.match(source, /data\?\.summary\?\.chequeOnHold==null\?legacyChequeOnHold:num\(data\.summary\.chequeOnHold\)/);
  assert.match(source, /data\?\.summary\?\.engShajivBalance==null\?totalDebit-totalCredit-currentChequeOnHold:num\(data\.summary\.engShajivBalance\)/);
  assert.match(source, /money\(engShajivBalance\)/);
});
