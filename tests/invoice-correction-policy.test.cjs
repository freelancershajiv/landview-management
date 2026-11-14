const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const source = fs.readFileSync(path.join(__dirname, "../lib/invoice-correction-policy.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = {};
new Function("exports", compiled)(api);

const payment = { id: "p1", projectId: "project-1", category: "engineering", amount: 1000, effective: true };
const sourceInvoice = { id: "i1", projectId: "project-1", category: "engineering", billCode: "BILL-1", amount: 800, allocated: 200, settled: false, active: true };
const destination = { ...sourceInvoice, id: "i2", billCode: "BILL-2", allocated: 100, amount: 500 };
const allocation = { id: "a1", projectId: "project-1", paymentId: "p1", invoiceId: "i1", amount: 200 };

test("a valid correction reassigns one existing allocation between issued invoices", () => {
  assert.equal(api.allocationMoveError(allocation, payment, sourceInvoice, destination), "");
});
test("financial and permission invariant guards fail closed", () => {
  assert.match(api.allocationMoveError(allocation, payment, sourceInvoice, { ...destination, projectId: "p2" }), /Cross-project/);
  assert.match(api.allocationMoveError(allocation, payment, sourceInvoice, { ...destination, category: "other" }), /same billing category/);
  assert.match(api.allocationMoveError(allocation, payment, { ...sourceInvoice, settled: true }, destination), /historical settled/);
  assert.match(api.allocationMoveError(allocation, { ...payment, effective: false }, sourceInvoice, destination), /effective posted/);
  assert.match(api.allocationMoveError(allocation, payment, sourceInvoice, { ...destination, allocated: 400 }), /enough unallocated capacity/);
  assert.match(api.allocationMoveError({ ...allocation, invoiceId: "i9" }, payment, sourceInvoice, destination), /source allocation has changed/);
});
test("ledger review never manufactures money", () => {
  assert.equal(api.invoiceLedgerComparison({ paymentAmount: 100, transactionAmount: 100, transactionFound: true, historical: false, paymentScope: "main", ledgerScope: "main" }).status, "matched");
  assert.equal(api.invoiceLedgerComparison({ paymentAmount: 100, transactionAmount: 101, transactionFound: true, historical: false, paymentScope: "main", ledgerScope: "main" }).status, "review");
  assert.equal(api.invoiceLedgerComparison({ paymentAmount: 100, transactionFound: false, historical: false, paymentScope: "main" }).status, "review");
  assert.equal(api.invoiceLedgerComparison({ paymentAmount: 100, transactionFound: false, historical: true, paymentScope: "main" }).status, "historical");
});
