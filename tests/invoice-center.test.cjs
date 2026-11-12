const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const model = read("lib/invoice-center.ts");
const helper = read("lib/invoice-reminders.ts");
const api = read("app/api/billing/invoice-center/route.ts");
const manual = read("app/api/billing/reminders/route.ts");
const cron = read("app/api/cron/invoice-reminders/route.ts");
const page = read("app/admin/finance/invoice-center/page.tsx");

function compileFunction(source, functionName, nextFunctionName, deps = {}) {
  const start = source.indexOf("export function " + functionName + "(");
  const end = source.indexOf("export function " + nextFunctionName + "(", start);
  assert.ok(start >= 0 && end > start, functionName + " snippet is present");
  const js = ts.transpileModule(source.slice(start, end).replace(/^export /gm, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(deps), js + "\nreturn " + functionName + ";")(...Object.values(deps));
}

test("status classification preserves historical settlement uncertainty", () => {
  const status = compileFunction(model, "invoiceCenterStatus", "invoiceCenterRow");
  assert.equal(status({ settledByBill: true, amount: 1000, allocated: 0, dueBeforeRelief: 0 }), "review");
  assert.equal(status({ settledByBill: false, amount: 1000, allocated: 400, dueBeforeRelief: 600 }), "partial");
  assert.equal(status({ settledByBill: false, amount: 1000, allocated: 0, dueBeforeRelief: 1000 }), "issued");
  assert.equal(status({ settledByBill: false, amount: 1000, allocated: 1000, dueBeforeRelief: 0 }), "paid");
  assert.equal(status({ settledByBill: true, amount: 1000, allocated: 1000, dueBeforeRelief: 0 }), "paid");
});

test("client reminder eligibility checks opt-in, number, inactive state and collectible due", () => {
  const txt = (value) => String(value ?? "").trim();
  const phone = compileFunction(helper, "bangladeshPhone", "invoiceReminderMonth", { text: txt });
  const eligible = compileFunction(helper, "invoiceReminderEligibility", "invoiceReminderMessage", { text: txt, bangladeshPhone: phone });
  const project = { whatsapp_updates_enabled: true, phone_number_snapshot: "01712345678", whatsapp_number_status: "active" };
  assert.equal(phone("+8801712345678"), "01712345678");
  assert.equal(phone("12345"), "");
  assert.equal(eligible(project, 50).eligible, true);
  assert.equal(eligible({ ...project, whatsapp_updates_enabled: false }, 50).eligible, false);
  assert.equal(eligible(project, 0).eligible, false);
  assert.equal(eligible({ ...project, phone_number_snapshot: "none" }, 50).eligible, false);
  assert.equal(eligible({ ...project, whatsapp_number_status: "inactive", whatsapp_checked_phone: "01712345678" }, 50).eligible, false);
});

test("API reads canonical receivables and never writes financial records", () => {
  assert.match(api, /await requireLocalSession\(request\)/);
  assert.match(api, /\["admin", "manager", "accounts"\]/);
  assert.match(api, /loadReceivableAuthority\(\)/);
  assert.match(api, /invoiceCenterRow\(/);
  assert.doesNotMatch(api, /insertRows|updateRows|deleteRows|upsertRows/);
  assert.doesNotMatch(api, /export async function POST/);
});

test("project collectible due and invoice-level balance are independently identified", () => {
  assert.match(model, /projectCollectibleDue: round\(projectState\?\.totalDue \|\| 0\)/);
  assert.match(model, /invoiceUnallocatedBalance: round\(invoice\.dueBeforeRelief\)/);
  assert.match(page, /do not sum repeated project balances/);
  assert.match(page, /Historical review means a Paid marker/);
});

test("client messages can only be queued manually with explicit confirmation and fresh server due", () => {
  assert.match(manual, /if \(!sameOrigin\(request\)\)/);
  assert.match(manual, /body\.confirmed !== true/);
  assert.match(manual, /loadReceivableAuthority\(\{ projectId: String\(project\.id\) \}\)/);
  assert.match(manual, /\["admin", "manager"\]/);
  assert.match(manual, /invoiceReminderEligibility\(project, collectibleDue\)/);
  assert.match(page, /window\.confirm\(/);
});

test("durable WhatsApp outbox enforces monthly deduplication without overwrites", () => {
  assert.match(helper, /invoice-reminder:" \+ projectCode \+ ":" \+ invoiceReminderMonth\(date\)/);
  assert.match(helper, /selectRows\("whatsapp_client_outbox"/);
  assert.match(helper, /insertRows\("whatsapp_client_outbox"/);
  assert.doesNotMatch(helper, /upsertRows\(/);
  assert.match(helper, /source: "invoice-reminder"/);
  assert.match(helper, /recipient_group: "client"/);
});

test("scheduled reminders are off by default and authenticated", () => {
  assert.match(cron, /process\.env\.CRON_SECRET/);
  assert.match(cron, /process\.env\.INVOICE_REMINDERS_ENABLED !== "true"/);
  assert.match(cron, /invoiceReminderEligibility\(project, due\)/);
  assert.match(cron, /authority\.projects\.get\(String\(project\.id\)\)\?\.totalDue/);
  assert.match(cron, /await queueInvoiceReminder\(project, due\)/);
  assert.match(cron, /Incomplete financial snapshot; no reminders queued/);
});

test("Invoice Center supports search, status/category/date filters and safe CSV export", () => {
  assert.match(page, /setSearch\(/);
  assert.match(page, /setStatus\(/);
  assert.match(page, /setCategory\(/);
  assert.match(page, /setFromDate\(/);
  assert.match(page, /setToDate\(/);
  assert.match(page, /csvCell/);
  assert.match(page, /formula/i);
  assert.match(page, /\/admin\/finance\/invoices\?fileId=/);
});

test("weekly reminder schedule is configured without enabling external messages", () => {
  const config = JSON.parse(read("vercel.json"));
  assert.ok(config.crons.some((job) => job.path === "/api/cron/invoice-reminders" && job.schedule === "0 4 * * 1"));
  assert.ok(!config.env?.INVOICE_REMINDERS_ENABLED);
  assert.match(cron, /if \(process\.env\.INVOICE_REMINDERS_ENABLED !== "true"\)/);
});
