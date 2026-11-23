import { DEVELOPER_CREDIT } from "@/lib/developer-credit";
import { NextRequest, NextResponse } from "next/server";
import { buildBillingReportV44 } from "@/lib/billing-reports-v44-server";
import type { FinancialReportV44, AgeBandV44 } from "@/lib/billing-reports-v44";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const esc=(value:unknown)=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const fmt=(value:unknown)=>"BDT "+Number(value||0).toLocaleString("en-BD",{minimumFractionDigits:2,maximumFractionDigits:2});
const bands: AgeBandV44[]=["0_30","31_60","61_90","91_plus","undated"];
const labels:Record<AgeBandV44,string>={"0_30":"0–30 days","31_60":"31–60 days","61_90":"61–90 days","91_plus":"91+ days",undated:"Undated"};
const slice=<T,>(items:T[],n:number):T[][]=>Array.from({length:Math.ceil(items.length/n)},(_,i)=>items.slice(i*n,(i+1)*n));
const td=(v:unknown)=>"<td>"+esc(v)+"</td>";
const row=(values:unknown[])=>"<tr>"+values.map(td).join("")+"</tr>";
const table=(head:string[],rows:unknown[][],message:string)=>"<table><thead><tr>"+head.map(v=>"<th>"+esc(v)+"</th>").join("")+"</tr></thead><tbody>"+(rows.length?rows.map(row).join(""):row([message]))+"</tbody></table>";
type Sheet={heading:string;hint:string;body:string};
function documentHtml(data:FinancialReportV44,autoprint:boolean) {
 const s=data.summary;
 const metrics=[
  ["Net billed services",s.netBilled],["Client payments credited",s.creditedPayments],
  ["Operational collections",s.operationalCollections],["Historical client credits",s.legacyCreditedPayments],
  ["Collectible due",s.collectibleDue],["Net write-offs",s.netWrittenOff],
  ["Available advance",s.remainingAdvance],["Open invoices before offsets",s.openInvoicesBeforeOffsets],
  ["Payments without dates",s.undatedPaymentAmount],["Unverified import invoice age",s.unverifiedImportDateAmount],
 ];
 const summary=`<div class="metrics">${metrics.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(fmt(v))}</strong></div>`).join("")}</div>
 <h2>Invoice age since issue date — not contractual overdue</h2>${table(
 ["Invoice age", "Open before project-level relief"], bands.map(k=>[labels[k],fmt(data.aging[k])]),"No open invoice aging")}
 <div class="disclosure"><strong>Important financial basis</strong><p>${esc(data.methodology.aging)}</p>
 <p>${esc(data.methodology.collections)}</p><p>${esc(data.methodology.due)}</p>
 <p>Original bill dates used as fallback: ${s.invoiceDateFallbackCount}. Unverified October 25, 2026 import issue dates:
 ${s.unverifiedImportDateCount} open bills (${fmt(s.unverifiedImportDateAmount)}), counted as undated, not recent.
 Payments with no usable actual payment date: ${s.undatedPaymentCount} (${fmt(s.undatedPaymentAmount)}).
 These are included in all-time credited balances but excluded from monthly charts.</p></div>`;
 const sheets:Sheet[]=[{heading:"Billing management summary",hint:"Live canonical balance and aging methodology",body:summary}];
 const months=[...data.months].reverse();
 for(const [i,items] of slice(months,19).entries())sheets.push({
  heading:"Monthly collections",hint:`Part ${i+1} of ${Math.ceil(months.length/19)} · credited payment month`,
  body:table(["Month","Total credited","Operational","Legacy credits","Payments"],
   items.map(x=>[x.month,fmt(x.payments),fmt(x.operational),fmt(x.legacy),x.paymentCount]),"No month-dated payments"),
 });
 const projects=data.projects;
 for(const [i,items] of slice(projects,16).entries())sheets.push({
  heading:"Project receivables and invoice aging",hint:`Part ${i+1} of ${Math.ceil(projects.length/16)} · current balances`,
  body:`<p class="note">Age groups are open invoice amounts before project offsets. Project collectible due is independently canonical and may be lower.</p>`+
   table(["Project / Client","Collectible due","Open invoices*","0–30","31–60","61–90","91+","Undated"],
    items.map(x=>[x.projectCode+" · "+x.client.slice(0,24),fmt(x.collectibleDue),fmt(x.openInvoicesBeforeOffsets),
      fmt(x.aging["0_30"]),fmt(x.aging["31_60"]),fmt(x.aging["61_90"]),fmt(x.aging["91_plus"]),fmt(x.aging.undated)]),
    "No project billing activity"),
 });
 if(sheets.length>100)throw new Error("Billing report exceeds the 100-page print safeguard.");
 const pages=sheets.map((item,i)=>`<section class="page" data-v44-page="${i+1}">
  <header><div><strong>LAND <b>VIEW</b></strong><small>Architects &amp; Engineers · Feni, Bangladesh</small></div><span>BILLING REPORT · 4.4</span></header>
  <div class="intro"><small>${esc(data.ageReferenceDate)} · CURRENT FINANCIAL SNAPSHOT</small><h1>${esc(item.heading)}</h1><p>${esc(item.hint)}</p></div>
  <div class="content">${item.body}</div>
  <footer><div>LAND VIEW · Private finance report<span>Generated: ${esc(data.snapshotAt.slice(0,19))} UTC</span><span>${esc(DEVELOPER_CREDIT)}</span></div><div>Page ${i+1} / ${sheets.length}</div></footer>
 </section>`).join("");
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="robots" content="noindex,nofollow"/>
 <meta name="viewport" content="width=device-width,initial-scale=1"/><title>LAND VIEW · Billing 4.4 Financial Report</title>
 <style>
 @page{size:A4 portrait;margin:0}
 *{box-sizing:border-box}body{margin:0;background:#e6eaef;color:#193044;font-family:Arial,Helvetica,sans-serif}
 .toolbar{max-width:794px;margin:15px auto;display:flex;gap:10px;justify-content:space-between}
 .toolbar button,.toolbar a{font-size:13px;min-height:42px;border:1px solid #ccd4dc;background:#fff;border-radius:7px;padding:10px 14px;text-decoration:none;color:#193044;cursor:pointer}
 .toolbar button{background:#b9232b;color:white}
 .page{position:relative;width:794px;height:1120px;margin:0 auto 15px;background:#fff;padding:40px 39px 95px;overflow:hidden;box-shadow:0 10px 24px #1c304022}
 .page header{border-bottom:2px solid #b9232b;padding-bottom:12px;display:flex;align-items:center;justify-content:space-between}
 .page header strong{font-size:25px;letter-spacing:.08em}.page header b{color:#b9232b}
 .page header small{display:block;font-size:9px;color:#6a7c88;margin-top:3px}
 .page header>span{font-size:10px;font-weight:900;color:#687b89;letter-spacing:.1em}
 .intro{margin:20px 0}.intro small{font-size:10px;color:#9d2e31;letter-spacing:.12em;font-weight:850}
 .intro h1{font-size:23px;margin:6px 0}.intro p{font-size:11px;color:#637481;margin:0}
 .content h2{font-size:14px;margin:18px 0 9px}
 .metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
 .metrics>div{background:#f7f9fb;border:1px solid #dae2e9;border-radius:7px;padding:12px}
 .metrics span{display:block;color:#6c7b89;font-size:10px}.metrics strong{display:block;font-size:16px;margin-top:5px}
 table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border-bottom:1px solid #e2e7ec;font-size:9px;padding:8px 5px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
 th{background:#f5f7f9;color:#637584;font-weight:900;font-size:9px}
 .disclosure{margin-top:18px;border-left:3px solid #b9232b;padding:11px;background:#fcf8f4;font-size:10px;line-height:1.5}
 .disclosure p{margin:6px 0}.note{font-size:10px;color:#596d7a;line-height:1.5;background:#f5f7f9;padding:9px}
 footer{position:absolute;bottom:29px;left:39px;right:39px;border-top:1px solid #dce3ea;padding-top:11px;display:flex;justify-content:space-between;color:#6d7e8c;font-size:10px}
 footer span{display:block;margin-top:4px}
 @media print{html,body{background:white!important;width:210mm!important}
 .toolbar{display:none!important}.page{width:210mm!important;height:296.3mm!important;margin:0!important;box-shadow:none!important;break-after:page!important;page-break-after:always!important}
 .page:last-child{break-after:auto!important;page-break-after:auto!important}
 table thead{display:table-header-group}tr{break-inside:avoid}
 }
 </style></head><body><nav class="toolbar"><button onclick="window.print()">Print / Save PDF</button>
 <a href="/admin/billing/reports">Back to reports</a></nav><main>${pages}</main>
 ${autoprint?'<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},500)},{once:true});</script>':""}</body></html>`;
}
export async function GET(request:NextRequest) {
 try {
  const report=await buildBillingReportV44(request);
  const html=documentHtml(report,request.nextUrl.searchParams.get("autoprint")==="1");
  return new NextResponse(html,{headers:{
   "Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store, max-age=0",
   "X-Robots-Tag":"noindex, nofollow, noarchive","X-Content-Type-Options":"nosniff",
   "Referrer-Policy":"same-origin",
   "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
  }});
 }catch(error){
  const status=error&&typeof error==="object"&&"status" in error?Number(error.status):503;
  return new NextResponse(error instanceof Error?error.message:"Cannot print report.",{
   status:[401,403,503].includes(status)?status:503,
   headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"private, no-store"},
  });
 }
}
