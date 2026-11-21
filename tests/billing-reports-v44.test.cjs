const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const read=path=>fs.readFileSync(path,"utf8");
const logic=read("lib/billing-reports-v44.ts");
const server=read("lib/billing-reports-v44-server.ts");
const api=read("app/api/billing/reports-v44/route.ts");
const print=read("app/api/billing/reports-v44/print/route.ts");
const ui=read("app/admin/finance/reports/page.tsx");
const nav=read("components/billing-navigation.tsx");
const home=read("app/admin/finance/page.tsx");
const context={module:{exports:{}}};context.exports=context.module.exports;
const code=ts.transpileModule(logic,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,context,{filename:"billing-reports-v44.js"});
const {compileFinancialReportV44,invoiceAgeBandV44}=context.module.exports;
function fixture(){
 const invoices=[
  {billCode:"BILL-A",projectId:"A",row:{issue_date:"2026-11-01",due_date:null}},
  {billCode:"BILL-B",projectId:"B",row:{issue_date:"2026-07-01",due_date:null}},
 ];
 const bills=[
  {billCode:"BILL-A",billId:"bill-a",projectId:"A",category:"engineering",dueBeforeRelief:500,row:{bill_date:"2026-11-01"}},
  {billCode:"BILL-B",billId:"bill-b",projectId:"B",category:"other",dueBeforeRelief:300,row:{bill_date:"2026-07-01"}},
 ];
 const payments=[
  {paymentId:"p1",projectId:"A",amount:200,effective:true,row:{
   payment_date:"2026-11-15",created_at:"2026-11-15",affects_business_balance:true,is_legacy_manual:false}},
  {paymentId:"p2",projectId:"A",amount:300,effective:true,row:{
   payment_date:null,created_at:"2026-10-01",affects_business_balance:false,is_legacy_manual:true}},
  {paymentId:"p3",projectId:"B",amount:100,effective:false,row:{payment_date:"2026-11-15",affects_business_balance:true}},
 ];
 const projects=new Map([
  ["A",{projectId:"A",billed:1000,paid:500,invoiceDueTotal:500,totalDue:350,
   writeoffTotal:150,engineeringDue:350,otherDue:0,supervisionDue:0,remainingUnallocated:0,lastPaymentDate:"2026-11-15"}],
  ["B",{projectId:"B",billed:300,paid:0,invoiceDueTotal:300,totalDue:300,
   writeoffTotal:0,engineeringDue:0,otherDue:300,supervisionDue:0,remainingUnallocated:0,lastPaymentDate:""}],
 ]);
 const authority={complete:true,invoices,bills,payments,projects,
  totals:{billed:1300,paid:500,due:650,writeoff:150,remainingUnallocated:0}};
 const names=[{id:"A",project_code:"LV-157",project_name:"Feni Home",client_name_snapshot:"A Customer"},
 {id:"B",project_code:"LV-072",project_name:"Historical Due",client_name_snapshot:"B Customer"}];
 return {authority,names};
}
test("aging reports issue-date age without inventing contractual due dates",()=>{
 assert.equal(invoiceAgeBandV44("2026-11-01","2026-11-21"),"0_30");
 assert.equal(invoiceAgeBandV44("2026-10-20","2026-11-21"),"31_60");
 assert.equal(invoiceAgeBandV44("2026-09-01","2026-11-21"),"61_90");
 assert.equal(invoiceAgeBandV44("2026-07-01","2026-11-21"),"91_plus");
 assert.equal(invoiceAgeBandV44("","2026-11-21"),"undated");
 const {authority,names}=fixture();
 const report=compileFinancialReportV44(authority,names,new Date("2026-11-21T15:00:00Z"));
 assert.equal(report.summary.collectibleDue,650);
 assert.equal(report.summary.openInvoicesBeforeOffsets,800);
 assert.equal(report.aging["0_30"],500);
 assert.equal(report.aging["91_plus"],300);
 assert.equal(report.summary.invoiceDueDatePresentCount,0);
 assert.match(report.methodology.aging,/NOT contractual overdue/);
});
test("legacy client credits are separated from operational collections",()=>{
 const {authority,names}=fixture();
 const report=compileFinancialReportV44(authority,names,new Date("2026-11-21T15:00:00Z"));
 assert.equal(report.summary.creditedPayments,500);
 assert.equal(report.summary.operationalCollections,200);
 assert.equal(report.summary.legacyCreditedPayments,300);
 assert.equal(report.months.find(x=>x.month==="2026-11").operational,200);
 assert.equal(report.months.find(x=>x.month==="2026-10").legacy,300);
 assert.equal(report.months.find(x=>x.month==="2026-10").fallbackDateCount,1);
 assert.equal(report.months.reduce((s,x)=>s+x.payments,0),500);
 assert.equal(report.projects.find(x=>x.projectCode==="LV-157").collectibleDue,350);
});
test("incomplete datasets and mismatched project balances fail closed",()=>{
 const {authority,names}=fixture();
 assert.throws(()=>compileFinancialReportV44({...authority,complete:false},names),/incomplete/);
 assert.throws(()=>compileFinancialReportV44(authority,Array.from({length:5000},()=>({id:"unknown"}))),/incomplete/);
 const invalid=new Map(authority.projects);invalid.set("A",{...invalid.get("A"),invoiceDueTotal:777});
 assert.throws(()=>compileFinancialReportV44({...authority,projects:invalid},names),/did not reconcile/);
});
test("report API is private read-only and uses canonical calculation",()=>{
 assert.match(server,/requireLocalSession\(request\)/);
 assert.match(server,/FINANCE_ROLES = new Set\(\["admin","manager","accounts"\]\)/);
 assert.match(server,/loadReceivableAuthority\(\)/);
 assert.match(server,/compileFinancialReportV44\(authority, projects\)/);
 assert.match(api,/export async function GET\(request/);
 assert.match(api,/private, no-store/);
 assert.match(api,/X-Landview-Financial-Source/);
 assert.doesNotMatch(server+api+logic,/insertRows\(|updateRows\(|deleteRows\(|supabaseGateway\(/);
});
test("printable A4 management report uses same authorized snapshot",()=>{
 assert.match(print,/buildBillingReportV44\(request\)/);
 assert.match(print,/@page\{size:A4 portrait;margin:0\}/);
 assert.match(print,/data\.methodology\.aging/);
 assert.match(print,/private, no-store/);
 assert.match(print,/noindex, nofollow/);
 assert.match(print,/window\.print\(\)/);
 assert.match(print,/function documentHtml/);
});
test("financial reports are wired into Billing and provide safe CSV exports",()=>{
 assert.match(nav,/href: "\/admin\/billing\/reports"/);
 assert.match(home,/Financial Reports & Aging/);
 assert.match(ui,/\/api\/billing\/reports-v44/);
 assert.match(ui,/\/api\/billing\/reports-v44\/print\?autoprint=1/);
 assert.match(ui,/Math\.max\(1,\.\.\.months\.map/);
 assert.match(ui,/csvDownload/);
 assert.match(ui,/protectedText=\/\^\[=\+@/);
 assert.match(ui,/onlyDue/);
 assert.match(ui,/date fallback/i);
});
