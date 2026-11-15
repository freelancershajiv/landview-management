const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (path) => fs.readFileSync(path, "utf8");
const adminBase = read("app/admin/admin-mobile-authority.css");
const v5 = read("app/admin/admin-mobile-v5.css");
const adminLayout = read("app/admin/layout.tsx");
const financeLayout = read("app/projectmanagement/layout.tsx");
const dashboard = read("components/admin-dashboard-clean.tsx");

test("single V5 final mobile layer owns the V4 management overrides", () => {
  assert.doesNotMatch(adminBase, /Mobile Management V4:/);
  assert.match(v5, /Mobile Management V4:/);
  assert.match(v5, /LAND VIEW Mobile V5/);
  for (const layout of [adminLayout, financeLayout]) {
    const contrast = layout.indexOf('import "../button-contrast-authority.css";');
    const finalMobile = layout.indexOf('import "../admin/admin-mobile-v5.css";');
    assert.ok(contrast >= 0 && finalMobile > contrast, "V5 CSS must be the final imported authority");
  }
});

test("closed navigation is hidden and mobile quick actions are usable", () => {
  assert.match(v5, /\.portal-admin\.portal-admin \.primary-nav:not\(\.open\) \{[\s\S]*?visibility: hidden !important/);
  assert.match(v5, /\.portal-admin\.portal-admin \.lv-clean-mobile-quick \{[\s\S]*?display: grid !important/);
  assert.match(v5, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(v5, /min-height: 56px !important/);
  assert.match(v5, /safe-area-inset-bottom/);
});

test("dashboard quick actions lead to existing private routes", () => {
  const block = dashboard.match(/<nav className="lv-clean-mobile-quick"[\s\S]*?<\/nav>/);
  assert.ok(block, "mobile quick navigation should exist");
  for (const href of ["/admin/projects/new", "/admin/finance/workspace", "/admin/site-visits", "/admin/todo"]) {
    assert.ok(block[0].includes('href="' + href + '"'), "missing route " + href);
  }
  assert.match(dashboard, /\.lv-clean-mobile-quick\{display:none\}/);
});

test("failed optional financial data must not display misleading zero totals", () => {
  assert.match(dashboard, /balance\?\.currentBalance != null \? money\(balance\.currentBalance\) : "—"/);
  assert.match(dashboard, /series\.length \? money\(latestMonth\.income\) : "—"/);
  assert.match(dashboard, /series\.length \? money\(latestMonth\.expenses\) : "—"/);
  assert.match(dashboard, /disabled=\{loading\} aria-busy=\{loading\}/);
});

test("mobile controls, KPI cards and history labels meet baseline dimensions", () => {
  assert.match(v5, /\.lv-clean-kpi > span \{[\s\S]*?font-size: 12px !important/);
  assert.match(v5, /\.lv-clean-kpi > small \{[\s\S]*?font-size: 11px !important/);
  assert.match(v5, /\.lv-clean-link \{[\s\S]*?font-size: 12px !important/);
  assert.match(v5, /max-width: 350px/);
  assert.match(v5, /\.lv-bottom-grid > \.lv-clean-card:last-child/);
});

test("V5 changes remain scoped to private mobile screens", () => {
  assert.match(v5, /@media screen and \(max-width: 900px\)/);
  assert.match(v5, /@media screen and \(max-width: 350px\)/);
  assert.doesNotMatch(v5, /fetch\(|localStorage|api\/landview/);
});
