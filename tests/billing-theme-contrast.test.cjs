const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const read=file=>fs.readFileSync(file,"utf8");

const financeLayout=read("app/admin/finance/layout.tsx");
const css=read("app/admin/finance/billing-v4-accessibility.css");
const workspace=read("app/admin/finance/workspace/page.tsx");
const due=read("app/admin/finance/due-bills/page.tsx");
const payment=read("app/admin/finance/service-payments/page.tsx");
const writeoffs=read("app/admin/finance/writeoffs/page.tsx");
const nav=read("components/billing-navigation.tsx");
const billManager=read("app/admin/finance/bills/page.tsx");

test("all current Billing sections and future statement links use a single finance layout",()=>{
  assert.match(financeLayout,/import "\.\/billing-v4-accessibility\.css"/);
  assert.match(nav,/\/admin\/billing\/workspace/);
  assert.match(nav,/\/admin\/billing\/bills/);
  assert.match(nav,/\/admin\/billing\/invoice-center/);
  assert.match(nav,/\/admin\/billing\/service-payments/);
  assert.match(nav,/\/admin\/billing\/project-statement/);
  assert.match(nav,/\/admin\/billing\/due-bills/);
  assert.match(nav,/\/admin\/billing\/writeoffs/);
  assert.match(nav,/\/admin\/billing\/reconciliation/);
  assert.match(nav,/\/admin\/billing\/invoices/);
  assert.match(nav,/\/admin\/billing\/full-bill-editor/);
});

test("solid red Billing tabs cannot use soft-red tab-active semantics",()=>{
  assert.match(workspace,/data-lv-button=\{tab==="services"\?"primary":"secondary"\}/);
  assert.match(workspace,/data-lv-button=\{tab==="schedule"\?"primary":"secondary"\}/);
  assert.match(due,/data-lv-button=\{filter===key\?"primary":"secondary"\}/);
  assert.doesNotMatch(workspace,/data-lv-button=\{tab===\w+\?"tab-active":/);
  assert.doesNotMatch(due,/data-lv-button=\{filter===key\?"tab-active":/);
  assert.match(css,/\.b2-shell \.b2-tab\.active\[data-lv-button="primary"\]/);
  assert.match(css,/\.due-page \.due-filter\.active\[data-lv-button="primary"\]/);
  assert.match(billManager,/data-lv-button="primary"/);
});

test("Receive Payment actions explicitly distinguish red primary and neutral reset",()=>{
  assert.match(payment,/className="rp-btn" data-lv-button="primary" style=/);
  assert.match(payment,/className="rp-btn" data-lv-button="secondary" style=/);
  assert.match(payment,/className="rp-btn" data-lv-button="primary" disabled=/);
  assert.match(payment,/data-lv-button=\{category===item\?"primary":"secondary"\}/);
  assert.match(css,/\.rp \.rp-btn:not\(\[data-lv-button="secondary"\]\)/);
  assert.match(css,/\.portal-admin \.rp \.rp-btn\[data-lv-button="secondary"\][\s\S]*?color: var\(--lv-text-primary\) !important;/);
  assert.match(css,/\.portal-admin \.rp \.rp-btn\[data-lv-button="secondary"\] \{[\s\S]*?background: var\(--lv-control-bg\) !important;/);
});

test("Write-off mode selection and save button use solid-red selected foregrounds",()=>{
  assert.match(writeoffs,/data-lv-button=\{action==="saveWriteOff"\?"primary":"secondary"\}/);
  assert.match(writeoffs,/data-lv-button=\{action==="recoverWriteOff"\?"primary":"secondary"\}/);
  assert.match(writeoffs,/className="wo-submit" data-lv-button="primary"/);
  assert.match(css,/\.wo-page \.wo-toggle button\.active\[data-lv-button="primary"\]/);
  assert.match(css,/\.wo-page \.wo-submit\[data-lv-button="primary"\]/);
});

test("Billing contrast authority is scoped, covers red controls, and leaves print untouched",()=>{
  assert.match(css,/\/\* Billing contrast authority/);
  const part=css.slice(css.indexOf("/* Billing contrast authority"));
  assert.match(part,/@media screen/);
  assert.doesNotMatch(part,/@media print|@page|!print|display:\s*none|\.receipt-print-page/);
  for(const token of [
    ".billing-nav-core a[aria-current=\"page\"]",
    ".billing-nav-advanced a[aria-current=\"page\"]",
    ".bv4-head-actions a.primary", ".bv4-jump-links a.primary",
    ".b2-shell .b2-btn.primary", ".bm-page .bm-btn.primary",
    ".due-page .due-link.primary", ".rp .rp-tab.active",
    ".r41 button.primary", ".sv43 button.primary", ".sv43 a.sv43-button.primary",
    ".lv-receipts a.lv-receipt-action.primary", ".wo-page .wo-submit",
    ".fbe-btn.primary", ".direct-bill-page .db-btn.primary",
    ".integrity-head button", ".ic-head-actions .ic-primary",
    ".bc-btn.primary", ".adj-btn.primary", ".ab-btn.primary", ".po-btn.primary"
  ]) assert.ok(part.includes(token),"Missing audited red billing control "+token);
  assert.match(part,/color:\s*#fff !important/);
  assert.match(part,/-webkit-text-fill-color:\s*#fff !important/);
  assert.ok(part.includes("var(--lv-brand-primary)"));
  assert.doesNotMatch(part,/\.billing-ledger-link\s*,/);
});

test("white-on-brand-red Billing controls meet WCAG AA contrast in light and dark",()=>{
  function luminance(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
    .map(v=>v<=0.04045?v/12.92:((v+.055)/1.055)**2.4)
    .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
  for(const red of ["#d61f26","#ad171d","#a92c33"]){
    const ratio=1.05/(luminance(red)+.05);
    assert.ok(ratio>=4.5,"White on "+red+" is "+ratio.toFixed(2)+":1");
  }
});

test("Billing UI fix does not introduce database or payment side-effects",()=>{
  const section=css.slice(css.indexOf("/* Billing contrast authority"));
  assert.doesNotMatch(section,/fetch\(|POST|UPDATE |INSERT |ALTER TABLE|supabase|write_off\(/i);
  for(const name of [
    "app/api/billing/project-statement/route.ts",
    "app/api/billing/full-revision-v42/route.ts",
    "app/api/billing/project-receipts/route.ts"
  ]) assert.ok(fs.existsSync(name),"Keep the current Billing 4.2/4.3 API "+name);
});
