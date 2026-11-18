const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const file = path.join(__dirname, "..", "lib", "todo-review-policy.ts");
const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("exports", "module", code)(mod.exports, mod);
const { assertReviewCompletion, reviewTransition } = mod.exports;
const task = { status: "In Progress", review_required: true, review_state: "not_submitted" };
test("only management may enable review; delivery keeps its own gate", () => {
  assert.throws(() => reviewTransition({...task, review_required:false}, "enable", "employee", ""), /Management/);
  assert.throws(() => reviewTransition({...task, review_required:false, is_delivery_step:true}, "enable", "management", ""), /delivery/);
});
test("full review and revision lifecycle", () => {
  const submitted = {...task, ...reviewTransition(task, "submit", "employee", "Drawing ready")};
  assert.equal(submitted.review_state, "submitted");
  assert.throws(() => assertReviewCompletion(submitted), /review/);
  assert.throws(() => reviewTransition(submitted, "approve", "employee", ""), /Management/);
  assert.throws(() => reviewTransition(submitted, "revise", "management", ""), /note/);
  const revised = {...submitted, ...reviewTransition(submitted, "revise", "management", "Check column detail")};
  const resubmitted = {...revised, ...reviewTransition(revised, "submit", "employee", "")};
  const approved = {...resubmitted, ...reviewTransition(resubmitted, "approve", "management", "")};
  assert.doesNotThrow(() => assertReviewCompletion(approved));
});
test("routine and previously completed tasks remain compatible", () => {
  assert.doesNotThrow(() => assertReviewCompletion({status:"In Progress"}));
  assert.doesNotThrow(() => assertReviewCompletion({...task,status:"Done"}));
  assert.throws(() => reviewTransition({...task,status:"Done"}, "submit", "employee", ""), /Completed/);
});
test("review cannot be disabled during review", () => {
  assert.throws(() => reviewTransition({...task,review_state:"submitted"}, "disable", "management", ""), /submission/);
});
