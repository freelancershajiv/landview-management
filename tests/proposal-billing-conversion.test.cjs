const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../app/api/proposal-conversion/route.ts"), "utf8");
const planIndex = source.indexOf("async function ensureProposalBills(");
const newConversionIndex = source.indexOf("    if (billPlan.length) {", source.indexOf("export async function POST("));
const ensureCalls = [...source.matchAll(/await ensureProposalBills\(/g)].map((match) => match.index);
const issuance = source.match(/status: (entry\.netAmount > 0\.009 \? "Issued" : "Draft")/);
assert.ok(issuance, "proposal bill issuance policy must be explicit");
const statusFor = new Function("entry", `return ${issuance[1]};`);

test("positive-net proposal lines issue a real bill and zero-net lines remain non-receivable drafts", () => {
  assert.equal(statusFor({ netAmount: 1 }), "Issued");
  assert.equal(statusFor({ netAmount: 10000 }), "Issued");
  assert.equal(statusFor({ netAmount: 0 }), "Draft");
  assert.equal(statusFor({ netAmount: 0.001 }), "Draft");
});

test("proposal repair and first conversion share the same idempotent bill creation function", () => {
  assert.ok(planIndex >= 0);
  assert.equal(ensureCalls.length, 2);
  assert.ok(ensureCalls[0] > source.indexOf("if (existingConverted)"));
  assert.ok(ensureCalls[1] > newConversionIndex);
  const functionBody = source.slice(planIndex, source.indexOf("async function preview(", planIndex));
  assert.match(functionBody, /existing\.some\(/);
  assert.match(functionBody, /legacy_source_id/);
  assert.match(functionBody, /idempotency_key/);
  assert.match(functionBody, /if \(found\) continue/);
  assert.match(functionBody, /created_via: "Proposal Bill Transfer"/);
});

test("initial proposal conversion still captures contracts and billing milestones", () => {
  const capture = source.indexOf('created_via: "Proposal Auto Conversion"', newConversionIndex);
  const actualBillCall = ensureCalls[1];
  assert.ok(capture > newConversionIndex && capture < actualBillCall);
  assert.match(source.slice(newConversionIndex, actualBillCall), /await insertRows\("bills", billPlan\.map/);
  assert.match(source.slice(newConversionIndex, actualBillCall), /BEFORE INSERT trigger creates the/);
});

test("retries do not modify previously issued, paid, or voided proposal bill rows", () => {
  const functionBody = source.slice(planIndex, source.indexOf("async function preview(", planIndex));
  assert.doesNotMatch(functionBody, /updateRows\("bills"/);
  assert.doesNotMatch(functionBody, /deleteRows\("bills"/);
  assert.match(source, /if \(projectRows\.length\) \{/);
  assert.match(source, /alreadyConverted: true/);
});
