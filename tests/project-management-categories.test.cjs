const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const read = path => fs.readFileSync(path, "utf8");
function loadCatalog() {
  const output = ts.transpileModule(read("lib/project-management-categories.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  });
  const context = { exports: {}, module: { exports: {} }, Set, String, Number, Array };
  context.exports = context.module.exports;
  vm.runInNewContext(output.outputText, context, { filename: "project-management-categories.js" });
  return context.module.exports;
}
const { PM_EXPENSE_CATEGORIES, pmExpenseCategoryOptions } = loadCatalog();

test("historic production expense categories are always available", () => {
  const expected = [
    "3 Decimal", "Admixture", "Animal Breakfast", "Binding Cable",
    "Blocks", "Bonus", "Brick Strike", "CCTV", "Cleaning", "Communication",
    "Deep Contractor", "Deep Materials", "Donation", "Electric Line Extension",
    "Electricity Bill", "Filling Soil Labour", "Gift", "Grill", "LAND VIEW",
    "Land View", "Launch", "Medical/Medicine", "Mr. Mahi Bhai", "Nasta",
    "Others", "Plastic/Chot", "Rent", "Sand Fill Labour", "Tin Shed", "Tubewell"
  ];
  const all = pmExpenseCategoryOptions(null);
  for (const name of expected) assert.ok(all.includes(name), "missing historical category " + name);
  assert.ok(all.length >= 50, "catalog should include full historical baseline");
  assert.equal(all[0], "Other Expenses");
});

test("a project's used categories do not replace the complete dropdown", () => {
  const source = { categories: [{category: "Bricks"}], entries: [{category: "Bricks",credit:1}] };
  const opts = pmExpenseCategoryOptions(source);
  for (const name of ["Bricks","Nasta","Bonus","Admixture","Cleaning","Security Salary"])
    assert.ok(opts.includes(name), "missing category " + name);
  assert.ok(opts.length > source.categories.length);
});

test("categories in contracts, ledger history and current edit stay selectable", () => {
  const source = {
    categories: ["Unusual Historic Work"],
    entries: [{category:"Unique Purchased Material", credit:100}],
    contractorBills: {contracts:[{category:"Local Subcontractor Work"}]}
  };
  const before = JSON.stringify(source);
  const opts = pmExpenseCategoryOptions(source, "Old Original Spelling");
  for (const x of ["Unusual Historic Work","Unique Purchased Material","Local Subcontractor Work","Old Original Spelling"])
    assert.ok(opts.includes(x), x);
  assert.equal(JSON.stringify(source), before, "must not mutate financial records");
});

test("income-only categories are excluded without changing an existing edited value", () => {
  const opts = pmExpenseCategoryOptions({categories:[{category:"Cash"},{category:"Scrap"},{category:"Cheque"}]});
  for (const name of ["Cash","Cheque","Bank Transfer","Scrap","Scrap Selling"])
    assert.ok(!opts.includes(name), name + " incorrectly offered as expense");
  assert.ok(pmExpenseCategoryOptions(null,"Cheque").includes("Cheque"),
    "an unusual existing value must still be editable without silent recoding");
});

test("the original historical spellings remain distinct", () => {
  const all = pmExpenseCategoryOptions(null);
  for (const pair of [["LAND VIEW","Land View"],["Grill","Grills"],["Other Expenses","Others"],["Door","Doors & Wood"]])
    assert.ok(pair.every(name=>all.includes(name)), "historical categories were merged: " + pair.join(" / "));
  assert.equal(new Set(PM_EXPENSE_CATEGORIES).size, PM_EXPENSE_CATEGORIES.length);
});

test("all expense creation and contractor screens share one category catalog", () => {
  const screens = [
    "app/projectmanagement/page.tsx",
    "components/project-finance-ledger-lite.tsx",
    "app/projectmanagement/contractors/page.tsx"
  ];
  for (const path of screens) {
    const source = read(path);
    assert.match(source,/pmExpenseCategoryOptions/ , path + " missing the unified catalog");
    assert.match(source,/ProjectExpenseCategorySelect/,path + " missing create-category control");
    assert.doesNotMatch(source,/const ALL_CATEGORIES = \[/,path + " retains old truncated catalog");
  }
  assert.match(read("components/project-expense-category-select.tsx"),/\+ Add new category/);
});

test("new-category names must be supplied before financial saves", () => {
  for (const path of [
    "app/projectmanagement/page.tsx",
    "components/project-finance-ledger-lite.tsx",
    "app/projectmanagement/contractors/page.tsx"
  ]) assert.match(read(path), /Select or enter (an expense|a supplier \/ contractor) category/);
});

test("master-ledger import never silently rewrites known categories as Other Expenses", () => {
  const source = read("app/api/project-management/legacy.ts");
  assert.match(source, /PM_EXPENSE_CATEGORIES/);
  assert.match(source, /includes\(exact\)\) return exact;/);
  assert.match(source, /return aliases\[raw\] \|\| exact \|\| "Other Expenses";/);
});

test("catalog does not write or migrate existing financial data", () => {
  const source=read("lib/project-management-categories.ts");
  assert.doesNotMatch(source, /fetch\(|updateRows|deleteRows|INSERT|UPDATE|ALTER TABLE|CREATE TABLE/i);
});
