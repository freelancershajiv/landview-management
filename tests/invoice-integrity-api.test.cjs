const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (filename) => fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
const route = read("app/api/billing/integrity/route.ts");
const page = read("app/admin/finance/integrity/page.tsx");

test("integrity API requires session and finance-admin role before reading data", () => {
  assert.match(route, /await requireLocalSession\(request\)/);
  assert.match(route, /\["admin", "manager", "accounts"\]\.includes\(roleOf\(user\)\)/);
  assert.ok(route.indexOf("await requireLocalSession(request)") < route.indexOf("await Promise.all(["));
});

test("integrity API is read only and never posts payments or changes billing", () => {
  assert.match(route, /export async function GET\(request: NextRequest\)/);
  assert.doesNotMatch(route, /export async function POST|export async function PATCH|export async function DELETE/);
  assert.doesNotMatch(route, /insertRows|updateRows|deleteRows|upsertRows|\.rpc\(/);
  for (const table of ["projects", "bills", "invoices", "payments", "payment_invoice_allocations"]) {
    assert.ok(route.includes(`selectRows("${table}"`), `must read ${table}`);
  }
});

test("paid-vs-allocation gap is explicitly a review exception, not an automatic debt", () => {
  assert.match(route, /status === "paid" && invoice/);
  assert.match(route, /allocated \+ 0\.01 < net/);
  assert.match(route, /type: "paid_allocation_gap"/);
  assert.match(page, /not<\/b> a verified outstanding receivable/);
});

test("integrity page is available from canonical Billing 4.0 navigation", () => {
  const layout = read("app/admin/finance/layout.tsx");
  const navigation = read("components/billing-navigation.tsx");
  assert.match(layout, /<BillingNavigation \/>/);
  assert.match(navigation, /href: "\/admin\/billing\/integrity"/);
  assert.match(page, /fetch\("\/api\/billing\/integrity"/);
});

test("Action Center flags a settled service bill with an open delivery hold", async () => {
  const ts = require("typescript");
  const vm = require("node:vm");
  const { NextRequest } = require("next/server");
  const fixture = {
    projects: [{ id: "project", project_code: "LV-243" }],
    bills: [{ id: "bill", project_id: "project", bill_code: "BILL-243", description: "Soil Test", net_amount: 17500, status: "Paid", category: "Other Services Bill" }],
    invoices: [{ id: "invoice", project_id: "project", bill_code: "BILL-243", invoice_code: "INV-243", status: "Paid" }],
    payments: [{ id: "payment", project_id: "project", payment_code: "PAY-243", amount: 17500 }],
    payment_invoice_allocations: [{ project_id: "project", payment_id: "payment", invoice_id: "invoice", allocated_amount: 17500 }],
    project_service_workflows: [{ project_id: "project", service_key: "soil-test", service_name: "Soil Test", status: "Working", paid_amount: 0, net_amount: 17500 }],
    project_contract_services: [],
  };
  const modules = {
    "@/lib/local-session": { requireLocalSession: async () => ({ role: "manager" }), roleOf: (user) => user.role },
    "@/lib/supabase-data": { selectRows: async (table) => fixture[table] },
    "@/lib/billing-receivable-authority": { receivablePaymentIsEffective: () => true },
    "@/lib/project-task-templates": { canonicalProjectService: (value) => value, taskKeyPart: (value) => value.toLowerCase().replaceAll(" ", "-") },
  };
  const load = (source) => {
    const exports = {};
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    vm.runInNewContext(outputText, { exports, require: (name) => modules[name] ?? require(name) });
    return exports;
  };
  modules["@/lib/service-workflow"] = load(read("lib/service-workflow.ts"));

  const { GET } = load(route);
  const scan = async (query) => {
    const response = await GET(new NextRequest("https://app.landview.com.bd/api/billing/integrity" + query));
    const result = await response.json();
    assert.equal(response.status, 200, result.error);
    return result.data.exceptions;
  };
  assert.deepEqual(await scan(""), []);
  const [exception] = await scan("?delivery=1");
  assert.equal(exception.type, "delivery_allocation_gap");
  assert.equal(exception.amount, 17500);
  assert.equal(exception.invoiceCode, "INV-243");
  assert.deepEqual(exception.paymentCodes, ["PAY-243"]);

  fixture.project_service_workflows[0].paid_amount = 17500;
  assert.deepEqual(await scan("?delivery=1"), []);
});
