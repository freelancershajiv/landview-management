const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const component = fs.readFileSync(path.join(root,"components/project-billing-document.tsx"), "utf8");
const style = fs.readFileSync(path.join(root,"app/admin/finance/invoices/invoice.module.css"), "utf8");

test("invoice presentation keeps the existing financial sources and categories", () => {
  assert.match(component, /const netBilled = Math\.max\(0, Number\(category\.gross \|\| 0\) - Number\(category\.discount \|\| 0\)\)/);
  assert.match(component, /category\.payments\.map\(/);
  assert.match(component, /amountText\(category\.due\)/);
  assert.match(component, /billLineAmounts\(item\)/);
});

test("deposit table is easier to scan with amount in rightmost column", () => {
  assert.match(component, /<th>Payment details<\/th><th>Verification<\/th><th>Amount \(BDT\)<\/th>/);
  const cells = component.match(/<td className=\{styles\.verificationCell\}>[\s\S]*?<\/td><td className=\{styles\.moneyCell\}>\{amountText\(payment\.amount\)\}<\/td>/);
  assert.ok(cells, "Verification should precede the right-aligned amount");
  assert.match(style, /\.printPage \.sheetMain \.depositTable th:nth-child\(5\)/);
});

test("print title identifies a single invoice, due statement or project statement correctly", () => {
  assert.match(component, /result\.document\?\.kind === "single"/);
  assert.match(component, /"Service Invoice"/);
  assert.match(component, /"Outstanding Due Statement"/);
  assert.match(component, /\{printDocumentTitle\}/);
});

test("discount and grand total use reusable print-safe styles", () => {
  assert.match(component, /styles\.discountHeader/);
  assert.match(component, /styles\.discountValue/);
  assert.match(component, /styles\.grandTotalRow/);
  assert.doesNotMatch(component, /margin:"-10px"/);
  assert.match(style, /\.printPage \.sheetMain \.grandTotalRow td/);
});

test("screen and print have separately scoped readable type sizes", () => {
  assert.match(style, /Invoice readability refresh v1/);
  assert.match(style, /@media screen \{/);
  assert.match(style, /\.tableWrap table\{min-width:590px;font-size:13px/);
  assert.match(style, /\.printPage \.sheetMain table\{font-size:9pt/);
  assert.match(style, /\.printPage \.sheetInfoRow span/);
  assert.match(style, /\.printPage \.sheetSummary\{grid-template-columns:repeat\(2/);
});
