const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (path) => fs.readFileSync(path, "utf8");
const shell = read("components/management-shell-v5.tsx");
const mobile = read("app/admin/admin-mobile-authority.css");
const finance = read("app/projectmanagement/project-finance-mobile-authority.css");

test("Management mobile header has real branding and a working page finder", () => {
  assert.match(shell, /className="lv-mobile-brand"/);
  assert.match(shell, /aria-controls="lv-mobile-page-finder"/);
  assert.match(shell, /ref=\{mobileFindInputRef\}/);
  assert.match(shell, /setPageQuery\(event\.target\.value\)/);
  assert.match(shell, /searchablePages[\s\S]*visibleSidebar\.flatMap/);
  assert.match(shell, /router\.push\(href\)/);
  assert.doesNotMatch(shell, /<b>3<\/b>/, "never show a hard-coded unread notification count");
});

test("One authoritative mobile drawer replaces the conflicting inline fullscreen drawer", () => {
  assert.doesNotMatch(shell, /primary-nav\.open\{display:block!important;position:fixed/);
  assert.match(mobile, /width: min\(88vw, 360px\) !important/);
  assert.match(mobile, /body:has\(\.portal-admin\.portal-admin \.primary-nav\.open\)/);
  assert.match(mobile, /\.portal-admin\.portal-admin \.admin-mobile-account \{/);
  assert.match(mobile, /max-height: min\(36dvh, 285px\)/);
});

test("Mobile screen keeps search, safe-area, touch targets and dock usable", () => {
  assert.match(mobile, /\.portal-admin\.portal-admin \.global-search \{\s*display: none !important/);
  assert.match(mobile, /content: none !important/);
  assert.match(mobile, /lv-mobile-find-panel/);
  assert.match(mobile, /min-height: 44px !important/);
  assert.match(mobile, /\.lv-mobile-dock \{[\s\S]*?position:fixed !important/);
  assert.match(mobile, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,1fr\)\)/);
  assert.match(mobile, /body:has\(\.portal-admin\) \.lv-theme-switch/);
  assert.match(mobile, /@media screen and \(min-width: 901px\)/);
});

test("Finance tables swipe inside cards and summary adapts at phone widths", () => {
  assert.match(finance, /\.pmr-table-scroll/);
  assert.match(finance, /\.pmx-table-scroll/);
  assert.match(finance, /overflow-x: auto !important/);
  assert.match(finance, /@media screen and \(max-width: 560px\)/);
  assert.match(finance, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(finance, /@media screen and \(max-width: 370px\)/);
});
