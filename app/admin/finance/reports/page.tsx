"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FinancialReportV44, AgeBandV44 } from "@/lib/billing-reports-v44";

const money=(value:number)=>"৳"+Number(value||0).toLocaleString("en-BD",{minimumFractionDigits:2,maximumFractionDigits:2});
const bands:AgeBandV44[]=["0_30","31_60","61_90","91_plus","undated"];
const ageNames:Record<AgeBandV44,string>={"0_30":"0–30 days","31_60":"31–60 days","61_90":"61–90 days","91_plus":"91+ days",undated:"Undated"};
function csvCell(value:unknown) {
 const raw=String(value??"");
 const protectedText=/^[=+@\-\t\r]/.test(raw)?"'"+raw:raw;
 return '"'+protectedText.replace(/"/g,'""')+'"';
}
function csvDownload(filename:string,columns:(string|number)[][]) {
 const csv="\ufeff"+columns.map(row=>row.map(csvCell).join(",")).join("\r\n");
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 const link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);
 link.click();link.remove();URL.revokeObjectURL(url);
}
function monthStartOfLast12(isoDate:string) {
 const match=/^(\d{4})-(\d{2})/.exec(isoDate);
 if(!match)return "";
 const y=Number(match[1]),m=Number(match[2])-1;
 const date=new Date(Date.UTC(y,m-11,1));
 return date.toISOString().slice(0,7);
}
export default function BillingReports44() {
 const [report,setReport]=useState<FinancialReportV44|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [query,setQuery]=useState("");
 const [onlyDue,setOnlyDue]=useState(false);
 const [fromMonth,setFromMonth]=useState("");
 const [toMonth,setToMonth]=useState("");
 const [exportKind,setExportKind]=useState("projects");
 const load=useCallback(async()=>{
   setLoading(true);setError("");setNotice("");
   try {
     const response=await fetch("/api/billing/reports-v44",{cache:"no-store",credentials:"same-origin"});
     const json=await response.json().catch(()=>null);
     if(!response.ok||!json?.success)throw new Error(String(json?.error||"Could not read the billing report."));
     setReport(json.data as FinancialReportV44);
   }catch(cause){setError(cause instanceof Error?cause.message:"Could not read the billing report.");}
   finally{setLoading(false);}
 },[]);
 useEffect(()=>{const timer=window.setTimeout(()=>{void load();},0);return ()=>window.clearTimeout(timer);},[load]);

 const projects=(report?.projects||[]).filter(row=>(!onlyDue||row.collectibleDue>.009)&&
   (!query||[row.projectCode,row.projectName,row.client].some(value=>value.toLowerCase().includes(query.trim().toLowerCase()))));
 const filterFrom=fromMonth|| (report?monthStartOfLast12(report.ageReferenceDate):"");
 const filterTo=toMonth || (report?report.ageReferenceDate.slice(0,7):"");
 const months=(report?.months||[]).filter(row=>row.month>=filterFrom&&row.month<=filterTo);
 const monthlyTotal=months.reduce((sum,row)=>sum+row.payments,0);
 const monthlyOperational=months.reduce((sum,row)=>sum+row.operational,0);
 const monthMax=Math.max(1,...months.map(row=>row.payments));
 const summary=report?.summary;
 const fileDate=report?.ageReferenceDate||"report";

 function exportReport() {
   if(!report)return;
   let rows:(string|number)[][];
   if(exportKind==="monthly")rows=[
     ["Month","Client payments credited (BDT)","Operational receipts (BDT)","Legacy client credits (BDT)","Payment count","Legacy count","Date fallback count"],
     ...months.map(item=>[item.month,item.payments,item.operational,item.legacy,item.paymentCount,item.legacyCount,item.fallbackDateCount]),
   ];
   else if(exportKind==="aging")rows=[
     ["Invoice issue-date age","Open invoices before project-level offsets (BDT)"],
     ...bands.map(key=>[ageNames[key],report.aging[key]]),
   ];
   else if(exportKind==="summary")rows=[
     ["Metric","Value"],["Net billed services",summary?.netBilled||0],
     ["Client payments credited",summary?.creditedPayments||0],
     ["Operational collections",summary?.operationalCollections||0],
     ["Historical client credits",summary?.legacyCreditedPayments||0],
     ["Collectible due",summary?.collectibleDue||0],
     ["Net write-offs",summary?.netWrittenOff||0],
     ["Remaining advances",summary?.remainingAdvance||0],
     ["Open invoices before project-level offsets",summary?.openInvoicesBeforeOffsets||0],
     ["Undated client payments",summary?.undatedPaymentAmount||0],
   ];
   else rows=[
    ["Project","Client","Project name","Net billed","Client payments credited","Collectible due","Open invoice balances before offsets","Advance after offsets","Age 0-30","Age 31-60","Age 61-90","Age 91+","Undated","Bill date fallbacks","Invoices without usable date"],
    ...projects.map(p=>[p.projectCode,p.client,p.projectName,p.netBilled,p.creditedPayments,p.collectibleDue,p.openInvoicesBeforeOffsets,p.remainingAdvance,p.aging["0_30"],p.aging["31_60"],p.aging["61_90"],p.aging["91_plus"],p.aging.undated,p.agingDateFallbacks,p.undatedInvoiceCount]),
   ];
   csvDownload("LAND-VIEW-Billing-4.4-"+exportKind+"-"+fileDate+".csv",rows);
   setNotice("CSV exported from the current read-only billing snapshot.");
 }
 const printUrl="/api/billing/reports-v44/print?autoprint=1";
 return <main className="br44">
 <style>{`
 .br44{max-width:1520px;margin:0 auto;color:var(--lv-text-primary);display:grid;gap:14px}.br44 *{box-sizing:border-box}
 .br44 h1{font-size:27px;margin:5px 0}.br44 h2{font-size:18px;margin:0}.br44 h3{font-size:14px;margin:0}
 .br44 p{font-size:12px;line-height:1.55;color:var(--lv-text-secondary);margin:5px 0}
 .br44-eyebrow{font-size:11px;letter-spacing:.12em;color:var(--lv-brand-text);font-weight:900}
 .br44-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
 .br44-actions{display:flex;flex-wrap:wrap;gap:9px}
 .br44 button,.br44 a.br44-button{display:inline-flex;align-items:center;justify-content:center;min-height:43px;padding:9px 14px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:12px;text-decoration:none;font-weight:800;cursor:pointer}
 .br44 button.primary,.br44 a.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)!important}
 .br44 button:disabled{opacity:.55;cursor:not-allowed}
 .br44-panel{background:var(--lv-surface-panel);border:1px solid var(--lv-border-default);border-radius:13px;padding:15px;display:grid;gap:12px}
 .br44-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
 .br44-kpi{padding:14px;border-radius:10px;border:1px solid var(--lv-border-subtle);background:var(--lv-surface-muted)}
 .br44-kpi small{font-size:11px;color:var(--lv-text-secondary)}.br44-kpi strong{display:block;font-size:21px;margin:6px 0;font-variant-numeric:tabular-nums}
 .br44-kpi p{font-size:11px}.br44-kpi.emphasis{border-color:var(--lv-brand-border);background:var(--lv-brand-soft)}
 .br44-note{font-size:12px;line-height:1.6;border-left:3px solid var(--lv-brand-primary);background:var(--lv-surface-muted);padding:11px 13px;border-radius:6px}
 .br44-grid{display:grid;grid-template-columns:1fr 1.18fr;gap:13px}
 .br44-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
 .br44 table{border-collapse:collapse;width:100%;min-width:750px}.br44 th,.br44 td{border-bottom:1px solid var(--lv-border-subtle);padding:10px 8px;text-align:left;vertical-align:top;font-size:12px}
 .br44 th{background:var(--lv-surface-muted);font-size:11px;color:var(--lv-text-secondary)}
 .br44 td.right,.br44 th.right{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
 .br44 td small{font-size:11px;color:var(--lv-text-secondary);display:block;margin-top:4px}
 .br44 table a{color:var(--lv-brand-text);font-weight:800}
 .br44-band{display:grid;grid-template-columns:140px 1fr 135px;gap:9px;align-items:center;font-size:12px}
 .br44-track{height:11px;background:var(--lv-surface-muted);border:1px solid var(--lv-border-subtle);border-radius:10px;overflow:hidden}
 .br44-fill{height:100%;background:var(--lv-brand-primary);border-radius:10px}
 .br44-band strong{text-align:right;font-variant-numeric:tabular-nums}
 .br44-months{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:9px;align-items:end;min-height:210px;padding:8px}
 .br44-month{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:10px;min-width:0}
 .br44-column{width:100%;max-width:54px;height:160px;display:flex;align-items:flex-end;border-bottom:1px solid var(--lv-border-default)}
 .br44-column div{width:100%;background:var(--lv-brand-primary);min-height:0;border-radius:5px 5px 0 0}
 .br44-month strong{font-size:10px;overflow:hidden;text-overflow:ellipsis;max-width:100%}
 .br44-month label{font-size:10px;color:var(--lv-text-secondary);text-align:center;white-space:nowrap}
 .br44-filters{display:flex;gap:9px;flex-wrap:wrap;align-items:flex-end}
 .br44-filters label{font-size:11px;display:grid;gap:5px;font-weight:800}
 .br44 input,.br44 select{min-height:42px;padding:8px 10px;background:var(--lv-surface-input);color:var(--lv-text-primary);border:1px solid var(--lv-border-default);border-radius:7px;font-size:13px}
 .br44-filters input[type=search]{min-width:220px}
 .br44-check{display:flex!important;gap:7px!important;align-items:center}.br44-check input{min-height:16px;width:17px;height:17px}
 .br44-msg{border:1px solid var(--lv-border-default);border-radius:9px;padding:11px 13px;font-size:12px}
 .br44-error{border-color:var(--lv-danger);color:var(--lv-danger)}
 .br44-success{border-color:var(--lv-success);color:var(--lv-success)}
 .br44-metadata{font-size:11px;color:var(--lv-text-secondary);font-variant-numeric:tabular-nums}
 .br44-empty{color:var(--lv-text-secondary);padding:18px}
 @media(max-width:1120px){.br44-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.br44-grid{grid-template-columns:1fr}}
 @media(max-width:650px){.br44 h1{font-size:23px}.br44-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.br44-kpi strong{font-size:17px}.br44-band{grid-template-columns:94px 1fr 92px;gap:6px;font-size:10px}.br44-band strong{font-size:10px}.br44-months{grid-template-columns:repeat(6,minmax(0,1fr));gap:5px}.br44-month strong{font-size:9px}.br44-actions,.br44-filters{width:100%}.br44-actions>*{flex:1}.br44-filters label{flex:1 1 130px}.br44-filters input[type=search]{min-width:0;font-size:16px}}
 `}</style>
 <header className="br44-head">
 <div><span className="br44-eyebrow">LAND VIEW / BILLING 4.4</span><h1>Financial Reports & Receivable Aging</h1>
 <p>Current client billing KPIs, monthly collections and invoice-age indicators from the canonical finance ledger.</p></div>
 <div className="br44-actions">
 <Link href="/admin/billing/project-statement" className="br44-button">Project Statements</Link>
 <button type="button" disabled={loading} onClick={()=>void load()}>{loading?"Refreshing…":"Refresh report"}</button>
 {report&&<a className="br44-button primary" href={printUrl} target="_blank" rel="noopener noreferrer">Print / Save PDF</a>}
 </div>
 </header>
 {error&&<div role="alert" className="br44-msg br44-error">{error}</div>}
 {notice&&<div role="status" className="br44-msg br44-success">{notice}</div>}
 {!report&&loading&&<div className="br44-panel" role="status">Reading project receivables and payment dates without changing financial records…</div>}
 {report&&summary&&<>
 <div className="br44-metadata">Snapshot {new Date(report.snapshotAt).toLocaleString("en-BD",{timeZone:"Asia/Dhaka"})} · {summary.projectCount} registered projects · {summary.projectsWithDue} with collectible due</div>
 <section className="br44-kpis" aria-label="Financial overview">
 {[
  ["Net billed services",summary.netBilled,"After posted adjustments"],
  ["Client payment credits",summary.creditedPayments,"Includes historical client credits"],
  ["Current collectible due",summary.collectibleDue,"After write-offs and advance relief"],
  ["Remaining advances",summary.remainingAdvance,"After project-level offsets"],
  ["Operational collections",summary.operationalCollections,"Effective non-legacy cash ledger payments"],
  ["Historical client credits",summary.legacyCreditedPayments,"Not new cash ledger receipts"],
  ["Open invoices before relief",summary.openInvoicesBeforeOffsets,"Invoice-aging source amount"],
  ["Net written off",summary.netWrittenOff,"Current write-off balance after recoveries"],
 ].map(([name,value,detail],i)=><div className={"br44-kpi"+(i===2?" emphasis":"")} key={String(name)}>
   <small>{name}</small><strong>{money(Number(value))}</strong><p>{detail}</p>
 </div>)}
 </section>
 <div className="br44-grid">
 <section className="br44-panel">
  <div><h2>Receivable aging by issue date</h2><p>Not an overdue report: contractual due dates were not recorded for the current invoices.</p></div>
  {bands.map(key=><div className="br44-band" key={key}>
    <span>{ageNames[key]}</span><div className="br44-track"><div className="br44-fill" style={{width:(summary.openInvoicesBeforeOffsets>0?100*report.aging[key]/summary.openInvoicesBeforeOffsets:0)+"%"}} /></div>
    <strong>{money(report.aging[key])}</strong>
   </div>)}
   <p className="br44-note">These age buckets add up to open invoice balances <strong>before</strong> project-wide relief. Do not add them to collectible due. Issue-date age does not establish contractual late payment.</p>
 </section>
 <section className="br44-panel">
  <div><h2>Monthly client collections</h2><p>Operational cash receipts and historical client credits are shown separately in the table. A payment's creation date is used only if its payment date is missing.</p></div>
  <div className="br44-filters">
    <label>From month<input aria-label="From month" type="month" value={fromMonth||filterFrom} onChange={e=>setFromMonth(e.target.value)}/></label>
    <label>To month<input aria-label="To month" type="month" value={toMonth||filterTo} onChange={e=>setToMonth(e.target.value)}/></label>
  </div>
  <div><strong>{money(monthlyTotal)}</strong> <span className="br44-metadata">credited in selected months · operational {money(monthlyOperational)}</span></div>
  <div className="br44-months">{months.slice(-12).map(item=><div key={item.month} className="br44-month" title={item.month+" · "+money(item.payments)}>
    <strong>{item.payments>0?Math.round(item.payments).toLocaleString("en-BD"):"0"}</strong>
    <div className="br44-column"><div style={{height:100*item.payments/monthMax+"%"}} /></div>
    <label>{item.month.slice(5)} / {item.month.slice(2,4)}</label>
  </div>)}</div>
  {!months.length&&<p className="br44-empty">No payments dated in this range.</p>}
  <div className="br44-table-wrap"><table><thead><tr><th>Month</th><th className="right">Credited</th><th className="right">Operational</th><th className="right">Historical</th><th className="right">Count</th><th className="right">Date fallback</th></tr></thead>
   <tbody>{[...months].reverse().map(item=><tr key={item.month}><td>{item.month}</td><td className="right">{money(item.payments)}</td>
    <td className="right">{money(item.operational)}</td><td className="right">{money(item.legacy)}</td>
    <td className="right">{item.paymentCount}</td><td className="right">{item.fallbackDateCount}</td></tr>)}</tbody></table></div>
 </section>
 </div>
 <section className="br44-panel">
  <div><h2>Project receivables</h2><p>Compare canonical collectible balances with outstanding invoices aged by issue date. Project offsets are not double-counted.</p></div>
  <div className="br44-filters">
   <label>Find project or client<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="LV-157 or client"/></label>
   <label className="br44-check"><input type="checkbox" checked={onlyDue} onChange={e=>setOnlyDue(e.target.checked)}/> Projects with collectible due only</label>
   <label>CSV report
    <select value={exportKind} onChange={e=>setExportKind(e.target.value)}>
      <option value="projects">Visible project rows</option><option value="monthly">Selected monthly collections</option>
      <option value="aging">Aging summary</option><option value="summary">Financial KPIs</option>
    </select></label>
   <button type="button" onClick={exportReport} disabled={!report}>Download CSV</button>
  </div>
  <p className="br44-metadata">Showing {projects.length} of {report.projects.length} project balances. Print/PDF contains the full unfiltered snapshot; CSV uses the selected filters.</p>
  <div className="br44-table-wrap"><table><thead><tr><th>File / Client</th><th className="right">Collectible due</th><th className="right">Open invoices*</th>
   <th className="right">0–30</th><th className="right">31–60</th><th className="right">61–90</th><th className="right">91+</th><th className="right">Undated</th><th>Statement</th></tr></thead>
   <tbody>{projects.map(p=><tr key={p.projectId}><td><strong>{p.projectCode}</strong><small>{p.client||p.projectName||"Project"}</small></td>
    <td className="right"><strong>{money(p.collectibleDue)}</strong></td>
    <td className="right">{money(p.openInvoicesBeforeOffsets)}</td>
    <td className="right">{money(p.aging["0_30"])}</td><td className="right">{money(p.aging["31_60"])}</td>
    <td className="right">{money(p.aging["61_90"])}</td><td className="right">{money(p.aging["91_plus"])}</td><td className="right">{money(p.aging.undated)}</td>
    <td><Link href={"/admin/billing/project-statement?fileId="+encodeURIComponent(p.projectCode)}>Open statement</Link></td>
   </tr>)}</tbody></table></div>
  {!projects.length&&<p className="br44-empty">No projects match the filters.</p>}
 </section>
 <section className="br44-panel">
  <h2>Data quality and report definitions</h2>
  <div className="br44-note"><strong>Invoice aging:</strong> {report.methodology.aging}</div>
  <div className="br44-note"><strong>Monthly receipts:</strong> {report.methodology.collections}</div>
  <div className="br44-note"><strong>Collectible due:</strong> {report.methodology.due}</div>
  <p>Invoices with recorded due dates among currently open items: {summary.invoiceDueDatePresentCount}. Invoice dates taken from the bill date instead: {summary.invoiceDateFallbackCount}. Payments with no usable date: {summary.undatedPaymentCount} ({money(summary.undatedPaymentAmount)}). These remain part of totals even when they cannot appear in a month bucket.</p>
 </section>
 </>}
 </main>;
}
