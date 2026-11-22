const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const shell = fs.readFileSync("components/management-shell-v5.tsx", "utf8");
const style = fs.readFileSync("app/admin/sidebar-collapse.css", "utf8");
const workTypes = fs.readFileSync("components/admin-todo-discipline-progress.tsx", "utf8");
const focus = fs.readFileSync("app/admin/todo/work-types-focus.css", "utf8");
const adminLayout = fs.readFileSync("app/admin/layout.tsx", "utf8");
const financeLayout = fs.readFileSync("app/projectmanagement/layout.tsx", "utf8");

test("management sidebar toggle uses the existing accessible navigation and persists user choice", () => {
  assert.match(shell, /sidebarPreference/);
  assert.match(shell, /sidebarCollapsed = sidebarPreference \?\? workTypesActive/);
  assert.match(shell, /landview\.admin\.sidebarCollapsed\.v1/);
  assert.match(shell, /window\.addEventListener\("storage"/);
  assert.match(shell, /className="lv-desktop-sidebar-toggle"/);
  assert.match(shell, /aria-label=\{sidebarCollapsed \? "Show sidebar" : "Hide sidebar"\}/);
  assert.match(shell, /aria-expanded=\{!sidebarCollapsed\}/);
  assert.match(shell, /onClick=\{\(\) => setDesktopSidebarCollapsed\(!sidebarCollapsed\)\}/);
});

test("desktop CSS only collapses Admin and Project Management and does not affect mobile or print", () => {
  assert.match(adminLayout, /import "\.\/sidebar-collapse\.css"/);
  assert.match(financeLayout, /import "\.\.\/admin\/sidebar-collapse\.css"/);
  assert.match(style, /@media screen and \(min-width: 901px\)/);
  assert.match(style, /\.portal-admin\.lv-sidebar-collapsed \.primary-nav/);
  assert.match(style, /\.portal-admin\.lv-sidebar-collapsed \.utility-bar/);
  assert.match(style, /\.portal-admin\.lv-sidebar-collapsed \.tmg-admin-main/);
  assert.match(style, /\.portal-admin\.lv-sidebar-collapsed \.tmg-content-wrap/);
  assert.match(style, /@media screen and \(max-width: 900px\)/);
  assert.doesNotMatch(style, /@media print/);
});

test("Work Types controls the shared sidebar rather than another independent override", () => {
  assert.match(workTypes, /landview:admin-sidebar-state/);
  assert.match(workTypes, /landview:admin-sidebar-request/);
  assert.match(focus, /\.portal-admin\.lv-sidebar-collapsed:has\(\[data-work-type-board="true"\]\)/);
  assert.doesNotMatch(focus, /data-sidebar-hidden/);
  assert.match(shell, /params\.get\("tab"\) === "disciplines"/);
});

test("existing mobile drawer remains its own responsive navigation", () => {
  assert.match(shell, /ref=\{menuButtonRef\} className="mobile-menu tmg-mobile-menu"/);
  assert.match(shell, /aria-expanded=\{mobileOpen\}/);
  assert.match(shell, /setMobileOpen\(\(value\) => !value\)/);
  assert.match(style, /\.mobile-menu\.tmg-mobile-menu/);
});
