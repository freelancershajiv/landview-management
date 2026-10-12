/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Project Management stores Sattapur payment as expense plus supplier advance funding", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../app/api/project-management/route.ts"), "utf8");
  assert.match(source, /payment_method:v\.paymentMethod/);
  assert.match(source, /source:sattapurPayment \? "supplier_advance_cash" : "project_management"/);
  assert.match(source, /source_type:sattapurPayment \? "supplier_advance_cash" : "project_management"/);
  assert.match(source, /supplier_movement_type:sattapurPayment \? "advance_fund" : null/);
  assert.match(source, /const debit = entries\.reduce/);
  assert.match(source, /const credit = entries\.reduce/);
  assert.doesNotMatch(source, /credit = entries\.reduce\([^\n]+\+ sattapurBricks\.depositAmount/);
});

test("Project Management UI separates expense category from payment method and uses canonical Sattapur ledger", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../app/projectmanagement/page.tsx"), "utf8");
  assert.match(source, /const PAYMENT_METHODS = \["Cash","Cheque","Bank Transfer"\]/);
  assert.match(source, /<span>Payment Method<\/span>/);
  assert.match(source, /paymentMethod:entryType==="expense"\?form\.paymentMethod:null/);
  assert.match(source, /sattapurBricks\.ledger/);
  assert.match(source, /Payments increase the Sattapur deposit/);
});
