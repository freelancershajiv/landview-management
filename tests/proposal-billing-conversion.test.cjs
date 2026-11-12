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
  assert.match(source, /BEFORE INSERT trigger creates the/);
});

test("retries do not modify previously issued, paid, or voided proposal bill rows", () => {
  const functionBody = source.slice(planIndex, source.indexOf("async function preview(", planIndex));
  assert.doesNotMatch(functionBody, /updateRows\("bills"/);
  assert.doesNotMatch(functionBody, /deleteRows\("bills"/);
  assert.match(source, /if \(projectRows\.length\) \{/);
  assert.match(source, /alreadyConverted: true/);
});

test("proposal billing preflight runs before project creation or repair", () => {
  const preflight = source.indexOf("validateProposalBillPlan(proposalId, proposal, billPlan);");
  const newProject = source.indexOf("    let sequence = await nextProjectNumber();", source.indexOf("export async function POST("));
  assert.ok(preflight > 0 && preflight < newProject);
  assert.match(source, /missing or duplicate billing-line IDs/);
  assert.match(source, /billing total does not match its accepted net/);
});

test("billing preflight rejects inconsistent accepted totals, duplicate IDs and negative net lines", () => {
  const ts = require("typescript");
  const start = source.indexOf("function validateProposalBillPlan(");
  const end = source.indexOf("async function ensureProposalBills(", start);
  assert.ok(start >= 0 && end > start);
  const compiled = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const validate = new Function("text", "numberOf", compiled + "\nreturn validateProposalBillPlan;")(
    (value) => String(value ?? "").trim(),
    (value) => Number(value ?? 0),
  );
  const item = (item_code, amount, discount, netAmount) => ({ item: { item_code }, amount, discount, netAmount });
  assert.doesNotThrow(() => validate("PROP-TEST", { net_amount: 100 }, [item("LINE-1", 150, 50, 100)]));
  assert.throws(() => validate("PROP-TEST", { net_amount: 99 }, [item("LINE-1", 150, 50, 100)]), /accepted net/);
  assert.throws(() => validate("PROP-TEST", { net_amount: 100 }, [item("LINE-1", 150, 50, 100), item("LINE-1", 50, 0, 50)]), /duplicate/);
  assert.throws(() => validate("PROP-TEST", { net_amount: 0 }, [item("LINE-1", 150, 200, 0)]), /invalid amount or discount/);
});
