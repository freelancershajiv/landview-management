const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const read = path => fs.readFileSync(path, "utf8");
const model = read("lib/project-statement-v43.ts");
const renderer = read("lib/project-statement-document-v43.ts");
const api = read("app/api/billing/project-statement/route.ts");
const print = read("app/api/billing/project-statement-print/route.ts");
const pdf = read("lib/project-statement-pdf-v43.ts");
const page = read("app/admin/finance/project-statement/page.tsx");
const history = read("components/project-receipt-history.tsx");
const receiptsApi = read("app/api/billing/project-receipts/route.ts");
const nav = read("components/billing-navigation.tsx");
const dashboard = read("app/admin/finance/page.tsx");
const context = { module: { exports: {} } };
context.exports = context.module.exports;
vm.runInNewContext(ts.transpileModule(renderer, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context, { filename: "project-statement-document-v43.js" });
const render = context.module.exports.renderProjectStatementV43;
const fixture = (invoiceCount = 1,paymentCount=1) => ({
  version: "4.3", basis: "current_snapshot", generatedAt: "2026-11-21T13:50:00Z",
  project: { code: "LV-157", name: "Example house", client: "A <script>alert('bad')</script>",
    location: "Feni & Surrounding Area" },
  totals: {
    billedNetAfterAdjustments: 15000, receivedPayments: 8000, netWriteoffs: 1000,
    amountDue: 6000, engineeringDue: 5000, otherDue: 1000, supervisionDue: 0,
    invoiceUnallocated: 2000, remainingAdvanceAfterOffsets: 500,
    invoiceDueBeforeProjectOffsets: 7500,
  },
  invoices: Array.from({length:invoiceCount},(_,i)=>({
    billCode: "BILL-"+i, invoiceCode: "INV-"+i, billDate: "2026-11-15",
    category: "Engineering Bill", service: "Architectural <b>Design</b> & Drafting",
    status: "ISSUED", gross: 1000, directDiscount: 100, debitNote: 50, creditNote: 0,
    net: 950, allocated: 500, invoiceDueBeforeProjectOffsets: 450,
  })),
  payments: Array.from({length:paymentCount},(_,i)=>({
    paymentCode: "PAY-"+i, date:"2026-11-16", amount: 800, method:"Bank Transfer",
    reference:"REF-"+i, category:"Engineering Bill", allocatedToInvoices: 600,
    notAllocatedToInvoices: 200, receiptCode: i===0 ? "RCPT-1" : "",
    receiptUrl: "", receiptStatus: "No online issued receipt", legacyManual: i===1,
  })),
  adjustments: [{code:"CRN-001",date:"2026-11-17",billCode:"BILL-1",
    kind:"Credit Note",amount:100,reason:"Client-approved change"}],
  writeoffs: [{date:"2026-11-18",category:"Other Services Bill",kind:"write_off",amount:1000}],
  counts: {invoices:invoiceCount,payments:paymentCount,verifiedReceipts:1,advances:1},
});

test("standard A4 statement renders exact current authority figures and escaped client data",()=>{
  const html = render(fixture(), false);
  assert.match(html,/15000\.00|15,000\.00/);
  assert.match(html,/6,000\.00/);
  assert.match(html,/7,500\.00/);
  assert.match(html,/500\.00/);
  assert.match(html,/A &lt;script&gt;alert/);
  assert.doesNotMatch(html,/<script>alert\('bad'\)<\/script>/);
  assert.match(html,/Architectural &lt;b&gt;Design&lt;\/b&gt; &amp; Drafting/);
  assert.match(html,/Current amount payable/);
  assert.match(html,/before project-level offsets/);
  assert.match(html,/@page\{size:A4 portrait;margin:0\}/);
  assert.match(html,/LAND VIEW/);
});

test("long statements paginate their invoice, payment and adjustment registers",()=>{
  const html = render(fixture(26,28));
  const found = [...html.matchAll(/data-statement-page="\d+"/g)];
  // 1 summary + 3 invoice chunks + 3 payment chunks + 1 adjustment + 1 writeoff
  assert.equal(found.length, 9);
  assert.match(html,/Page 9 \/ 9/);
  assert.match(html,/Invoice \/ Bill/);
  assert.match(html,/Not allocated/);
  assert.match(html,/Credit \/ debit note history/);
});

test("print and direct PDF share the same paginated document",()=>{
  assert.match(print,/renderProjectStatementV43\(data,/);
  assert.match(print,/buildProjectStatementV43\(request,/);
  assert.match(print,/no-store/);
  assert.match(print,/noindex,nofollow/);
  assert.match(pdf,/\.statement-page/);
  assert.match(pdf,/createA4Pdf\(jpegPages\)/);
  assert.match(pdf,/downloadBlob\(/);
  assert.match(pdf,/PAGE_WIDTH = 794/);
  assert.match(pdf,/PAGE_HEIGHT = 1120/);
  assert.match(pdf,/pages\.length > 100/);
  assert.doesNotMatch(pdf,/http:\/\//);
});

test("statement data comes exclusively from the canonical receivable authority",()=>{
  assert.match(model,/loadReceivableAuthority\(\{ projectId \}\)/);
  assert.match(model,/projectState\?\.totalDue/);
  assert.match(model,/projectState\?\.remainingUnallocated/);
  assert.match(model,/projectState\?\.rawUnallocated/);
  assert.match(model,/payment\.effective/);
  assert.match(model,/receivableNumber/);
  assert.match(model,/Math\.abs\(paymentTotal - totals\.receivedPayments\)/);
  assert.match(model,/Math\.abs\(billedTotal - totals\.billedNetAfterAdjustments\)/);
  assert.doesNotMatch(model,/updateRows\(|insertRows\(|deleteRows\(|upsertRows\(/);
  assert.match(model,/authority\.complete/);
});

test("client statements require linked project permissions and no receipt is invented",()=>{
  assert.match(model,/requireLocalSession\(request\)/);
  assert.match(model,/role === "client" && !clientProjectCodes\(user\)\.has\(code\)/);
  assert.match(model,/No online issued receipt/);
  assert.match(model,/verifyReceipt\(receipt\.receipt_path\) === verifyReceipt\(raw\.receipt_url\)/);
  assert.match(model,/issued/);
  assert.match(api,/buildProjectStatementV43/);
  assert.match(api,/private, no-store/);
  assert.match(print,/ProjectStatementError/);
});

test("receipt list shares canonical effective-payment exclusions and supports direct PDF",()=>{
  assert.match(receiptsApi,/receivablePaymentIsEffective\(payment\)/);
  assert.match(receiptsApi,/transaction_type,affects_business_balance,is_legacy_manual/);
  assert.match(receiptsApi,/verifiedPath\(receipt\?\.receipt_path\) === verifiedPath\(payment\.receipt_url\)/);
  assert.match(history,/downloadReceiptPdfV4/);
  assert.match(history,/Project Statement \/ PDF/);
  assert.match(history,/disabled=\{Boolean\(downloading\)\}/);
});

test("user interface connects statement, payments, verified receipts and document actions",()=>{
  assert.match(nav,/href: "\/admin\/billing\/project-statement"/);
  assert.match(dashboard,/Project Statements & Receipts/);
  assert.match(page,/\/api\/billing\/project-statement\?projectId=/);
  assert.match(page,/\/api\/billing\/project-statement-print\?projectId=/);
  assert.match(page,/downloadProjectStatementPdfV43/);
  assert.match(page,/data\.payments\.map/);
  assert.match(page,/data\.invoices\.map/);
  assert.match(page,/data\.adjustments\.map/);
  assert.match(page,/data\.writeoffs\.map/);
  assert.match(page,/legacyManual/);
  assert.match(page,/amountDue/);
});
