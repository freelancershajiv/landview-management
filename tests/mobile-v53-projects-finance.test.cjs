const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");

const css = read("app/admin/admin-mobile-v5.css");
const due = read("app/admin/finance/due-bills/page.tsx");
const projects = read("app/admin/projects/page.tsx");

test("Due Bills mobile cards use the same filtered invoice allocation data as desktop", () => {
  assert.match(due, /className="due-mobile-cards"/);
  assert.match(due, /visibleRows\.map\(\(row\) => <article className="due-mobile-card"/);
  assert.match(due, /className="due-table"/);
  assert.match(due, /<tbody>\{visibleRows\.map\(\(row\) => <tr/);
  assert.match(due, /money\(row\.totalDue\)/);
  for (const key of ["engineeringDue", "supervisionDue", "otherDue", "unallocatedAmount", "lastPaymentAmount", "lastPaymentDate"]) {
    assert.ok(due.includes("row." + key), "missing receivables field " + key);
  }
});

test("Mobile due actions navigate to original billing, receiving and statements", () => {
  const card = due.slice(due.indexOf('<div className="due-mobile-cards"'), due.indexOf('<div className="due-table-wrap">'));
  for (const href of [
    "/admin/finance/workspace?fileId=",
    "/admin/finance/service-payments?fileId=",
    "/admin/finance/invoices?fileId="
  ]) {
    assert.ok(card.includes(href), "missing billing destination " + href);
  }
  assert.match(card, /encodeURIComponent\(row\.projectId\)/);
  assert.doesNotMatch(card, /\bfetch\(|\bpost\(|\bput\(/i);
});

test("Projects register retains every lifecycle and WhatsApp control", () => {
  assert.match(projects, /className="register-scroll"/);
  assert.match(projects, /<table className="project-table">/);
  assert.match(projects, /className="projects-mobile-swipe"/);
  assert.match(projects, /href=\{\x60\/admin\/projects\/\$\{encodeURIComponent\(id\)\}\x60\}/);
  assert.match(projects, /aria-label=\{\x60Open \$\{id\} project dashboard\x60\}/);
  for (const control of ["toggleWhatsAppUpdates(", "toggleWhatsAppGroupUpdates(", "updateProjectStage(", "assignService("]) {
    assert.ok(projects.includes(control), "missing existing control " + control);
  }
});

test("Project table sticky identifier does not trap expanded team-assignments row", () => {
  assert.match(css, /project-table tbody td:first-child:not\(\[colspan\]\)/);
  assert.match(css, /project-table tbody td\[colspan\] \{/);
  assert.match(css, /project-table \.project-main/);
  assert.match(css, /project-id-link/);
});

test("Due cards are mobile only; desktop table remains the original primary view", () => {
  assert.match(css, /@media screen\s*\{/);
  assert.match(css, /\.portal-admin \.due-mobile-cards \{ display: none; \}/);
  assert.match(css, /@media screen and \(max-width: 900px\)/);
  assert.match(css, /\.due-mobile-cards \{[\s\S]*?display: grid !important/);
  assert.match(css, /\.due-table-wrap:has\(> \.due-table\)/);
  assert.match(css, /\.due-mobile-actions \.due-link\.primary/);
  assert.match(css, /-webkit-text-fill-color: #fff !important/);
});

test("Project, finance and billing interactions stay phone-sized and scroll in their own panels", () => {
  for (const className of [
    ".projects-register .register-scroll",
    ".pc .pc-tabs",
    ".b2-shell .b2-kpis",
    ".bm-page .bm-btn",
    ".b2-shell .b2-table-wrap",
    ".bm-page .bm-table-wrap",
    ".pm-finance-summary .pm-stats"
  ]) {
    assert.ok(css.includes(className), "missing responsive treatment " + className);
  }
  assert.match(css, /min-height: 44px !important/);
  assert.match(css, /font-size: 16px !important/);
  assert.match(css, /overflow-x: auto !important/);
});

test("Mobile UX changes have no financial write logic or data schema edits", () => {
  const mobileMarkup = due.slice(due.indexOf("A compact read-only representation"), due.indexOf('<div className="due-table-wrap">'));
  assert.doesNotMatch(mobileMarkup, /onClick=\{\(\)\s*=>\s*(?:void\s+)?(?:save|post|delete|update|remove)/);
  assert.doesNotMatch(css, /\bfetch\s*\(|\bPOST\b|create table|alter table/i);
});
