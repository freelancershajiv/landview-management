const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path, "utf8");

const home = read("app/admin/whatsapp/page.tsx");
const ops = read("app/admin/whatsapp/operations/page.tsx");
const nav = read("app/admin/whatsapp/layout.tsx");
const css = read("app/admin/whatsapp/whatsapp-workspace.css");

test("WhatsApp workspace has one simple navigation and an inbox-first command view", () => {
  assert.match(nav, /import "\.\/whatsapp-workspace\.css"/);
  assert.match(nav, /\/admin\/whatsapp\/operations/);
  assert.match(nav, /\/admin\/whatsapp/);
  assert.match(home, /WhatsApp workspace/);
  for (const label of ["Phone connection", "Unread conversations", "Failed deliveries", "Queued messages"]) {
    assert.ok(home.includes(label), "missing summary: " + label);
  }
  assert.match(home, /useState<"inbox" \| "connection">\("inbox"\)/);
  assert.match(home, /aria-pressed=\{view === "inbox"\}/);
  assert.match(home, /aria-pressed=\{view === "connection"\}/);
  assert.match(home, /visibleConversations\.map\(/);
});

test("Client inbox filters do not reset the manually chosen conversation", () => {
  assert.match(home, /conversationQuery/);
  assert.match(home, /conversationFilter === "unread"/);
  assert.match(home, /conversationFilter === "handoff"/);
  assert.match(home, /setSelectedId\(\(current\) => current \|\| rows\[0\]\?\.id \|\| ""\)/);
  assert.doesNotMatch(home, /if \(!selectedId && rows\[0\]\?\.id\) setSelectedId\(rows\[0\]\.id\)/);
  assert.match(home, /activeConversationRef\.current !== id/);
  assert.match(home, /activeConversationRef\.current = selectedId/);
  assert.match(home, /setMessages\(\[\]\)/);
});

test("Pairing repair retains explicit confirmation and slow-provider poll guard", () => {
  assert.match(home, /lv-wa-v2-repair/);
  assert.match(home, /Advanced connection troubleshooting/);
  assert.match(home, /confirm\(/);
  assert.match(home, /action: "reset"/);
  assert.match(home, /<BotCard/);
  assert.match(home, /<EmployeeWhatsAppConnect/);
  assert.match(home, /statusRequestInFlight\.current/);
  assert.match(home, /window\.setInterval\(loadStatus, 15000\)/);
  assert.match(home, /window\.setInterval\(loadConversations, 15000\)/);
  assert.match(home, /window\.setInterval\(loadDeliveryStats, 60000\)/);
});

test("Existing reply handoff and delivery mutation contracts are preserved", () => {
  for (const value of [
    'action: "reply"', 'action: "handoff"', 'conversationId: selectedId',
    '/api/admin/whatsapp/client', "sendReply()", "setHandoff(", "loadMessages(selectedId)"
  ]) assert.ok(home.includes(value), "missing inbox behavior " + value);
  for (const value of [
    '"retry"', '"retry_all_failed"', '"update_rule"', '"update_template"',
    '"update_group"', "post(action: string"
  ]) assert.ok(ops.includes(value), "missing delivery action " + value);
});

test("Delivery center deep-links failures and groups daily actions and settings", () => {
  assert.match(ops, /new URLSearchParams\(window\.location\.search\)\.get\("tab"\)/);
  assert.match(ops, /filteredMessages/);
  assert.match(ops, /Filter delivery queue/);
  assert.match(ops, /Daily work/);
  assert.match(ops, /Automation settings/);
  assert.match(ops, /tabs\.slice\(0, 3\)/);
  assert.match(ops, /tabs\.slice\(3\)/);
  assert.match(ops, /How WhatsApp delivery works/);
  assert.match(ops, /lv-wa-v2-triage/);
  assert.match(home, /\/admin\/whatsapp\/operations\?tab=failed/);
  assert.match(home, /\/admin\/whatsapp\/operations\?tab=log/);
});

test("Semantic styling is scoped to WhatsApp with responsive phone layouts", () => {
  assert.match(css, /@media screen/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:480px\)/);
  for (const selector of [
    ".lv-wa-v2-hero", ".lv-wa-v2-summary", ".lv-wa-v2-contact",
    ".lv-wa-v2-message-list", ".lv-wa-v2-composer", ".lv-wa-v2-triage",
    ".lv-wa-v2-ops-nav", ".lv-wa-v2-rule-row", ".lv-wa-v2-repair"
  ]) assert.ok(css.includes(selector), "missing component: " + selector);
  for (const token of ["--lv-brand-primary", "--lv-surface-panel", "--lv-text-primary", "--lv-border-default", "--lv-danger"]) {
    assert.ok(css.includes(token), "missing shared theme token: " + token);
  }
  assert.doesNotMatch(css, /@media print|@page|fetch\(|create table|alter table|localStorage/i);
});
