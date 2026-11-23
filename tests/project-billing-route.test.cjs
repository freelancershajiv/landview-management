const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { NextRequest } = require("next/server");

function loadTs(file, dependencies = {}) {
  const module = { exports: {} };
  const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(outputText, {
    exports: module.exports,
    require: (name) => dependencies[name] ?? require(name),
    process: { env: {} },
    URL,
  });
  return module.exports;
}

test("project billing routes preserve exact allocations and show collectible due after write-off", async () => {
  const projectId = "LV-072";
  const makeBill = (code, amount, status) => ({
    id: code, bill_code: code, project_id: "project", amount, status,
    description: "Architecture", billing_category: "Engineering Bill",
  });
  const bills = [makeBill("BILL-A", 10_000, "Issued"), makeBill("BILL-B", 8_000, "Issued"), makeBill("BILL-DRAFT", 25_000, "Draft")];
  const rows = {
    projects: [{ id: "project" }],
    bills,
    invoices: [
      { id: "invoice-a", invoice_code: "INV-A", bill_code: "BILL-A", project_id: "project" },
      { id: "invoice-b", invoice_code: "INV-B", bill_code: "BILL-B", project_id: "project" },
    ],
    payments: [{
      id: "payment", payment_code: "PAY-A", project_id: "project", amount: 10_000,
      approval_status: "Approved", affects_business_balance: false, is_legacy_manual: true,
      income_category: "Engineering Bill",
    }],
    payment_invoice_allocations: [{ invoice_id: "invoice-a", payment_id: "payment", allocated_amount: 10_000 }],
    billing_writeoff_log: [{ project_id: "project", billing_category: "Engineering Bill", event_type: "write_off", amount: 8_000 }],
  };
  const gateway = {
    normalizeProjectCode: (value) => value,
    selectRows: async (table) => rows[table] ?? [],
    paymentLegacy: (row) => ({ Payment_ID: row.payment_code }),
    handleLandviewDataAction: async (action) => action === "getProject" ? { Client_Name: "Test client" } : {
      bills: bills.map((bill) => ({ ...bill, Bill_ID: bill.bill_code })),
    },
  };
  const authority = loadTs("lib/billing-receivable-authority.ts", { "@/lib/supabase-data": gateway });
  const { GET } = loadTs("app/api/project-billing/route.ts", {
    "@/lib/supabase-data": gateway,
    "@/lib/local-session": { requireLocalSession: async () => ({ role: "admin" }), roleOf: (user) => user.role },
    "@/lib/service-workflow": {},
    "@/lib/billing-receivable-authority": authority,
    "@/lib/invoice-allocation-assessment": loadTs("lib/invoice-allocation-assessment.ts"),
  });
  const { proxy } = loadTs("proxy.ts");
  const url = (path) => `https://app.landview.com.bd${path}`;
  const directRequest = new NextRequest(url(`/api/project-billing?fileId=${projectId}`));
  assert.equal(proxy(directRequest).headers.get("x-middleware-rewrite"), null);

  const full = await GET(directRequest);
  assert.equal(full.status, 200);
  const { data } = await full.json();
  assert.deepEqual(data.billPayments.map(({ billCode, amount }) => [billCode, amount]), [["BILL-A", 10_000]]);
  const billSheet = data.sheets.find(({ tab }) => tab === "Design Bill");
  assert.deepEqual(billSheet.rows.map((row) => [row[5], row[9], row[10]]), [
    ["BILL-A", "10000", "0"],
    ["BILL-B", "0", "8000"],
  ]);

  const { buildSheetInvoices } = loadTs("lib/sheet-invoices.ts", {
    "./service-order": loadTs("lib/service-order.ts"),
  });
  const invoice = buildSheetInvoices(data.sheets, projectId, { useCollectibleDue: true });
  assert.equal(invoice.totals.due, 0);
  assert.equal(invoice.totals.paid, 10_000);
  assert.equal(invoice.client.status, "Settled");

  const legacyRequest = new NextRequest(url(`/api/landview?action=getProjectBilling&Project_ID=${projectId}`));
  const target = proxy(legacyRequest).headers.get("x-middleware-rewrite");
  assert.equal(new URL(target).pathname, "/api/project-billing");
  const summary = await GET(new NextRequest(target));
  assert.equal(summary.status, 200);
  const { data: legacy } = await summary.json();
  assert.equal(legacy.totalBill, 18_000);
  assert.equal(legacy.totalPaid, 10_000);
  assert.equal(legacy.due, 0);
  assert.equal(legacy.payments[0].Is_Legacy_Manual, true);
  assert.deepEqual(legacy.bills.map(({ Bill_ID }) => Bill_ID), ["BILL-A", "BILL-B"]);
});

test("a service-targeted remainder stays unapplied while historical credits still settle project due", async () => {
  const rows = {
    bills: [
      { id: "soil", bill_code: "SOIL", project_id: "project", billing_category: "Other Services Bill", amount: 10_000 },
      { id: "municipality", bill_code: "MUN", project_id: "project", billing_category: "Other Services Bill", amount: 50_000 },
    ],
    invoices: [{ id: "soil-invoice", bill_code: "SOIL", project_id: "project" }],
    payments: [{
      id: "targeted", project_id: "project", amount: 15_000, income_category: "Other Services Bill",
      approval_status: "Approved", billing_service_targeted: true,
    }],
    payment_invoice_allocations: [{ invoice_id: "soil-invoice", payment_id: "targeted", allocated_amount: 10_000 }],
  };
  const { loadReceivableAuthority } = loadTs("lib/billing-receivable-authority.ts", {
    "@/lib/supabase-data": { selectRows: async (table) => rows[table] ?? [] },
  });
  const read = async () => (await loadReceivableAuthority({ projectId: "project" })).projects.get("project");
  const before = await read();
  assert.equal(before.otherDue, 50_000);
  assert.equal(before.paid, 15_000);
  assert.equal(before.remainingUnallocated, 5_000);

  rows.payments.push({
    id: "legacy", project_id: "project", amount: 7_000, income_category: "Other Services Bill",
    approval_status: "Approved", is_legacy_manual: true, affects_business_balance: false,
  });
  const after = await read();
  assert.equal(after.otherDue, 43_000);
  assert.equal(after.remainingUnallocated, 5_000);
});

test("discounted receipts bind to bills, including legacy inputs, and honour the statement balance", async () => {
  const rows = {
    projects: [{ id: "project", project_code: "LV-001" }],
    bills: [{
      id: "bill", project_id: "project", bill_code: "BILL-R", billing_category: "Engineering Bill",
      description: "[Engineering Bill] Re-Design Bill", amount: 12_000, discount: 7_000, status: "Issued",
    }],
    invoices: [{ id: "invoice", project_id: "project", bill_code: "BILL-R", status: "Issued", amount: 5000 }],
    invoice_items: [{ bill_id: "bill", invoice_id: "invoice", service_name: "Re-Design Fees", service_key: "re-design-fees" }],
    billing_writeoff_log: [],
    payments: [],
  };
  const gateway = {
    normalizeProjectCode: (code) => code,
    selectRows: async (table) => rows[table] ?? [],
    roleOf: (user) => user.role,
    employeeCodeOf: () => "test",
    handleLandviewDataAction: async (_action, _input, _user, payment) => payment,
  };
  const authority = loadTs("lib/billing-receivable-authority.ts", { "@/lib/supabase-data": gateway });
  const workflows = loadTs("lib/service-workflow.ts", {
    "@/lib/supabase-data": gateway, "@/lib/billing-receivable-authority": authority,
    "@/lib/project-task-templates": loadTs("lib/project-task-templates.ts"),
  });
  const bills = loadTs("lib/billing-payment-bills.ts", {
    "@/lib/billing-receivable-authority": authority, "@/lib/supabase-data": gateway, "@/lib/service-workflow": workflows,
  });
  const { POST } = loadTs("app/api/billing/write/route.ts", {
    "@/lib/local-session": { requireLocalSession: async () => ({ role: "manager" }) },
    "@/lib/supabase-data": gateway, "@/lib/billing-payment-bills": bills,
    "@/lib/service-workflow": { ...workflows, syncPaidServiceWorkflows: async () => {} },
  });
  const origin = "https://app.landview.com.bd";
  const send = async (extra) => {
    const response = await POST(new NextRequest(origin + "/api/billing/write", {
      method: "POST", headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "savePayment", Project_ID: "LV-001", Payment_For: "Engineering Bill",
        Amount: 5000, Idempotency_Key: "test-redesign-payment", ...extra }),
    }));
    return { status: response.status, ...(await response.json()) };
  };
  const legacy = { Service_Allocations: [{ serviceName: "Re-Design Bill", amount: 5000 }] };
  const selected = { Bill_Allocations: [{ billId: "bill", amount: 5000 }] };
  assert.deepEqual((await send(legacy)).data.billTargets, [{ bill_id: "bill", amount: 5000 }]);
  assert.deepEqual((await send(selected)).data.billTargets, [{ bill_id: "bill", amount: 5000 }]);
  rows.bills.push({ ...rows.bills[0], id: "bill2", bill_code: "BILL-2" });
  rows.invoices.push({ ...rows.invoices[0], id: "invoice2", bill_code: "BILL-2" });
  rows.invoice_items.push({ ...rows.invoice_items[0], bill_id: "bill2", invoice_id: "invoice2" });
  assert.equal((await send(legacy)).status, 400);
  const duplicateLabels = await send({ Bill_Allocations: [{ billId: "bill2", amount: 2000 }, { billId: "bill", amount: 3000 }] });
  assert.deepEqual(duplicateLabels.data.billTargets, [{ bill_id: "bill2", amount: 2000 }, { bill_id: "bill", amount: 3000 }]);
  assert.equal((await send({ Bill_Allocations: [{ billId: "bill", amount: 2000 }, { billId: "bill", amount: 3000 }] })).status, 400);
  assert.equal((await send({ Bill_Allocations: [{ billId: "unknown", amount: 5000 }] })).status, 400);
  assert.equal((await send({ Bill_Allocations: [{ billId: "bill", amount: 4999.99 }] })).status, 400);
  assert.equal((await send({ Amount: 0.001, Bill_Allocations: [{ billId: "bill", amount: 0.001 }] })).status, 400);
  rows.billing_writeoff_log.push({ project_id: "project", billing_category: "Engineering Bill", event_type: "write_off", amount: 10000 });
  const snapshot = await bills.getPaymentBills("LV-001");
  assert.equal(snapshot.projectDue, 0);
  assert.equal(snapshot.categories["Engineering Bill"].relief, 10000);
  assert.equal(snapshot.bills.every((bill) => bill.available === 0), true);
  assert.equal((await send(selected)).status, 400);
  assert.deepEqual((await send({ Receive_Advance: true, Bill_Allocations: [] })).data.billTargets, []);
  const original = duplicateLabels.data.fingerprint;
  rows.payments.push({ billing_request_fingerprint: original });
  assert.equal((await send(selected)).status, 409);
  assert.equal((await send({ Bill_Allocations: [{ billId: "bill", amount: 2000 }, { billId: "bill2", amount: 3000 }] })).status, 409);
  assert.equal((await send({ Bill_Allocations: [{ billId: "bill2", amount: 2000 }, { billId: "bill", amount: 3000 }] })).status, 200);
});
