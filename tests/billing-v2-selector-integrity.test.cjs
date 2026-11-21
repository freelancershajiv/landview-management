const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const css = fs.readFileSync("app/admin/finance/billing-v4-accessibility.css", "utf8");
const section = css.slice(css.indexOf("/* Billing contrast authority"));

test("Billing primary control descendant selectors do not accidentally repeat", () => {
  assert.ok(section.startsWith("/* Billing contrast authority"), "Billing contrast authority must remain present");
  const po = section.split("\n").map(line => line.trim()).filter(line => line.startsWith(".portal-admin .po-btn.primary"));
  assert.equal(po.length, 2, "The outsourcing primary button should have one fill and one descendant foreground override");
  const descendant = po.find(line => line.includes(":is("));
  assert.ok(descendant, "Descendant foreground override is required");
  assert.match(descendant, /:is\(span,strong,b,small,i,svg,label\)/);
  assert.doesNotMatch(descendant, /:is\([^)]*\)\s+:is\(/, "Nested repetition breaks descendant coverage");
});

test("Billing accessibility guard still respects print and neutral buttons", () => {
  assert.match(section, /@media screen/);
  assert.doesNotMatch(section, /@media print|@page/);
  assert.match(section, /\.rp \.rp-btn\[data-lv-button="secondary"\]/);
  assert.match(section, /color:\s*#fff !important/);
  assert.match(section, /-webkit-text-fill-color:\s*#fff !important/);
});
