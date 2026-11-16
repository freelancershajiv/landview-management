const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");
const theme = read("app/private-theme.css");

test("high-traffic Admin screens use scoped CSS files instead of inline style injection", () => {
  for (const [page, stylesheet, root] of [
    ["app/admin/projects/page.tsx","app/admin/projects/projects-register.css",".projects-register"],
    ["app/admin/projects/layout.tsx","app/admin/projects/projects-navigation.css",".projects-section-nav"],
    ["app/admin/finance/due-bills/page.tsx","app/admin/finance/due-bills/due-bills.css",".due-page"],
    ["app/admin/finance/workspace/page.tsx","app/admin/finance/workspace/billing-workspace.css",".b2-shell"],
    ["app/admin/finance/bills/page.tsx","app/admin/finance/bills/bill-manager.css",".bm-page"]
  ]) {
    const markup = read(page);
    const css = read(stylesheet);
    assert.ok(markup.includes('import "./' + stylesheet.split("/").at(-1) + '";'), page + " must import its stylesheet");
    assert.doesNotMatch(markup, /<style\b/);
    assert.ok(css.includes(root), stylesheet + " must retain route geometry");
    assert.match(css, /\.portal-admin/);
    assert.doesNotMatch(css, /\bfetch\s*\(|@media print|@page|create table|alter table/i);
  }
});

test("Admin shortcut links adopt the explicit shared button variant", () => {
  const page = read("app/admin/page.tsx");
  assert.match(page, /LVButtonLink/);
  assert.match(page, /variant="soft"/);
  assert.doesNotMatch(page, /shortcutStyle|style=\{shortcutStyle\}/);
});

test("finance aliases and high-traffic palettes have one central owner", () => {
  const pf = read("app/projectmanagement/project-finance-theme-authority.css");
  const pmx = read("app/projectmanagement/project-management-workspace-v2.css");
  assert.doesNotMatch(pf, /--pf-bg\s*:/);
  assert.doesNotMatch(pmx, /--pmx-surface\s*:/);
  for (const token of [
    "--pf-bg:", "--pf-surface:", "--pf-brand:", "--pmx-surface:", "--pmx-red:",
    "--pmx-warning:", "--lv-surface-input:", "--lv-border-subtle:"
  ]) assert.ok(theme.includes(token), "missing semantic alias " + token);
  for (const selector of [
    ".lv-clean-dashboard", ".projects-register", ".projects-section-nav",
    ".due-page", ".b2-shell", ".bm-page", ".pc", ".pf-redesign"
  ]) assert.ok(theme.includes(selector), "missing centralized module " + selector);
  assert.doesNotMatch(theme, /\bfetch\s*\(|@media print|@page/);
});
