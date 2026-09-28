"use client";

import { useEffect, useMemo, useState } from "react";

const money=(v:any)=>new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(Number(v||0));
const num=(v:any)=>{const n=Number(String(v??"").replace(/,/g,"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const dateText=(v:any)=>{const d=new Date(String(v||"").slice(0,10)+"T00:00:00");return Number.isNaN(d.getTime())?String(v||""):d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})};
const monthText=(v:string)=>{const d=new Date(v+"-01T00:00:00");return Number.isNaN(d.getTime())?v:d.toLocaleDateString("en-GB",{month:"long",year:"numeric"})};
const monthOf=(v:any)=>String(v||"").slice(0,7);
const reportCode=(projectCode:string,month:string)=>`LV-${String(projectCode||"").replace(/[^0-9A-Za-z-]/g,"")}-${String(month||"").replace("-","")}-FL`;

export default function ProjectFinanceReportPage(){
  const [data,setData]=useState<any>(null),[project,setProject]=useState(""),[month,setMonth]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState("");

  async function load(code="",requestedMonth=""){
    setLoading(true);setError("");
    try{
      const r=await fetch(code?"/api/project-management?projectId="+encodeURIComponent(code):"/api/project-management",{credentials:"same-origin",cache:"no-store"});
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not load project finance report.");
      setData(j.data);
      if(j.data?.selectedProject?.projectCode)setProject(j.data.selectedProject.projectCode);
      if(!requestedMonth && j.data?.entries?.length){
        const latest=[...j.data.entries].sort((a:any,b:any)=>String(b.entry_date||"").localeCompare(String(a.entry_date||"")))[0];
        if(latest?.entry_date)setMonth(monthOf(latest.entry_date));
      }
    }catch(e:any){setError(e?.message||"Could not load project finance report.");}
    finally{setLoading(false);}
  }

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const qProject=params.get("projectId")||"";
    const qMonth=params.get("month")||"";
    setProject(qProject);
    setMonth(qMonth);
    void load(qProject,qMonth);
  },[]);

  const entries=[...(data?.entries||[])].sort((a:any,b:any)=>{
    const d=String(a.entry_date||"").localeCompare(String(b.entry_date||""));
    if(d)return d;
    const c=String(a.created_at||"").localeCompare(String(b.created_at||""));
    if(c)return c;
    return String(a.id||"").localeCompare(String(b.id||""));
  });

  const availableMonths=useMemo(()=>{
    return Array.from(new Set(entries.map((r:any)=>monthOf(r.entry_date)).filter(Boolean))).sort((a,b)=>b.localeCompare(a));
  },[entries]);

  useEffect(()=>{
    if(data?.selectedProject && !month && availableMonths[0]) setMonth(availableMonths[0]);
  },[data,month,availableMonths]);

  const statement=useMemo(()=>{
    const selectedMonth=month || availableMonths[0] || new Date().toISOString().slice(0,7);
    const start=selectedMonth+"-01";
    const endDate=new Date(start+"T00:00:00");
    endDate.setMonth(endDate.getMonth()+1);
    const end=endDate.toISOString().slice(0,10);

    const before=entries.filter((r:any)=>String(r.entry_date||"")<start);
    const period=entries.filter((r:any)=>String(r.entry_date||"")>=start&&String(r.entry_date||"")<end);

    const opening=before.length?num(before[before.length-1].balance):0;
    const deposits=period.reduce((s:number,r:any)=>s+num(r.debit),0);
    const expenses=period.reduce((s:number,r:any)=>s+num(r.credit),0);
    const closing=opening+deposits-expenses;
    return {selectedMonth,start,end,period,opening,deposits,expenses,net:deposits-expenses,closing};
  },[entries,month,availableMonths]);

  const summary=data?.summary||{};
  const currentAdjusted=num(summary.engShajivBalance);
  const availableProjects=data?.projects||[];

  const printChunks=useMemo(()=>{
    const chunkSize=22;
    const chunks:any[][]=[];
    for(let i=0;i<period.length;i+=chunkSize) chunks.push(period.slice(i,i+chunkSize));
    return chunks.length?chunks:[[]];
  },[period]);

  function chooseProject(code:string){
    const normalized=String(code||"").trim();
    if(!normalized)return;
    const targetMonth=month||"";
    window.location.assign("/projectmanagement/report?projectId="+encodeURIComponent(normalized)+(targetMonth?"&month="+encodeURIComponent(targetMonth):""));
  }

  function changeMonth(value:string){
    setMonth(value);
    const params=new URLSearchParams(window.location.search);
    params.set("projectId",data?.selectedProject?.projectCode||project);
    if(value)params.set("month",value); else params.delete("month");
    window.history.replaceState(null,"","/projectmanagement/report?"+params.toString());
  }

  if(loading&&!data)return <main className="rpt-loading"><div><div className="rpt-spinner"/><strong>Preparing project finance report…</strong><span>Loading ledger data and reconciliation figures.</span></div></main>;

  if(data&&!data.selectedProject){
    return <main className="rpt-page"><div className="rpt-shell rpt-chooser"><div className="rpt-kicker">LAND VIEW · PROJECT FINANCE REPORT</div><h1>Select a Project</h1><p>Choose a project to generate its monthly bank-statement-style finance report.</p>{error&&<div className="rpt-error">{error}</div>}<div className="rpt-projects">{availableProjects.map((p:any)=><button key={p.id} onClick={()=>chooseProject(p.projectCode)}><b>{p.projectCode}</b><strong>{p.projectName}</strong><span>{p.clientName||"Client not recorded"}{p.location?" · "+p.location:""}</span><em>Generate report →</em></button>)}</div></div><style jsx>{styles}</style></main>;
  }

  const projectInfo=data?.selectedProject||{};
  const period=statement.period;

  return (
    <main className="rpt-page">
      <div className="rpt-shell">
        <div className="print-report" aria-hidden="true">
        {printChunks.map((chunk:any[],pageIndex:number)=>{
          const isFirst=pageIndex===0;
          const isLast=pageIndex===printChunks.length-1;
          return (
            <section className="pfr-page" key={pageIndex}>
              {isFirst ? (
                <>
                  <div className="pfr-header">
                    <div className="pfr-brand">
                      <img src="/land-view-logo.svg" alt="" />
                      <div><strong>LAND <span>VIEW</span></strong><small>ENGINEERS AND ARCHITECTS</small></div>
                    </div>
                    <div className="pfr-contact">
                      <strong>F. Rahman AC Market (2nd Floor)</strong>
                      <span>SSK Road, Feni Sadar, Feni</span>
                      <span>+88 0140 80 80 400 · +88 01902 500 400</span>
                    </div>
                    <div className="pfr-title">
                      <small>Generated {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</small>
                      <b>Project Finance Ledger</b>
                      <strong>{projectInfo.projectCode||"Project"}</strong>
                      <span>{projectInfo.projectName||"—"} · {monthText(statement.selectedMonth)}</span>
                    </div>
                  </div>

                  <div className="pfr-project-line">
                    <span><b>Project:</b> {projectInfo.projectName||"—"}</span>
                    <span><b>Project Code:</b> {projectInfo.projectCode||"—"}</span>
                    <span><b>Period:</b> {monthText(statement.selectedMonth)}</span>
                  </div>

                  <div className="pfr-summary">
                    <div><span>Opening Balance</span><strong>BDT {money(statement.opening)}</strong></div>
                    <div><span>Total Deposit</span><strong>BDT {money(statement.deposits)}</strong></div>
                    <div><span>Total Expense</span><strong>BDT {money(statement.expenses)}</strong></div>
                    <div><span>Supplier Advance</span><strong>BDT {money(summary.supplierAdvance)}</strong></div>
                    <div><span>Cheque on Hold</span><strong>BDT {money(summary.chequeOnHold)}</strong></div>
                    <div className="closing"><span>Eng Shajiv Balance</span><strong>BDT {money(currentAdjusted)}</strong></div>
                  </div>
                </>
              ) : (
                <div className="pfr-continuation">
                  <div><strong>LAND VIEW</strong> · Project Finance Ledger</div>
                  <div>{projectInfo.projectCode||"—"} · {monthText(statement.selectedMonth)}</div>
                </div>
              )}

              <table className="pfr-table">
                <thead>
                  <tr><th>Date</th><th>Details</th><th className="num">Expense</th><th className="num">Income</th><th className="num">Balance</th></tr>
                </thead>
                <tbody>
                  {isFirst&&(
                    <tr className="pfr-opening">
                      <td>{dateText(statement.start)}</td>
                      <td><strong>OPENING BALANCE</strong><small>Balance brought forward before selected period</small></td>
                      <td className="num">—</td><td className="num">—</td><td className="num">{money(statement.opening)}</td>
                    </tr>
                  )}
                  {chunk.map((r:any)=>(
                    <tr key={r.id}>
                      <td>{dateText(r.entry_date)}</td>
                      <td><strong>{r.details||"—"}</strong><small>{r.category||"Uncategorized"}</small></td>
                      <td className="num">{num(r.credit)>0?money(r.credit):"—"}</td>
                      <td className="num">{num(r.debit)>0?money(r.debit):"—"}</td>
                      <td className="num">{money(r.balance)}</td>
                    </tr>
                  ))}
                  {!period.length&&isFirst&&<tr><td colSpan={5} className="pfr-empty">No ledger transactions were recorded in this month.</td></tr>}
                </tbody>
              </table>

              {isLast&&(
                <div className="pfr-month-total">
                  <div><span>MONTH TOTAL</span><small>{period.length.toLocaleString("en-BD")} ledger entries</small></div>
                  <strong>BDT {money(statement.expenses)}</strong>
                  <strong>BDT {money(statement.deposits)}</strong>
                  <strong>BDT {money(statement.closing)}</strong>
                </div>
              )}

              <footer className="pfr-footer">
                <span><b>LAND VIEW Engineers and Architects</b> · Financial Ledger</span>
                <span>Page {pageIndex+1} of {printChunks.length}</span>
              </footer>
            </section>
          );
        })}
      </div>

      <div className="rpt-screen-toolbar">
          <a href={"/projectmanagement?projectId="+encodeURIComponent(projectInfo.projectCode||project)}>← Project Management</a>
          <div>
            <button onClick={()=>void load(projectInfo.projectCode||project)}>↻ Refresh</button>
            <button className="primary" onClick={()=>window.print()}>Print / Save PDF</button>
          </div>
        </div>

        {error&&<div className="rpt-error">{error}</div>}

        <div className="print-only print-ledger-header">
          <div className="print-brand-row">
            <div className="print-brand">
              <img src="/land-view-logo.svg" alt="LAND VIEW logo" />
              <div><strong>LAND <span>VIEW</span></strong><small>ENGINEERS AND ARCHITECTS</small></div>
            </div>
            <div className="print-contact">
              <strong>F. Rahman AC Market (2nd Floor)</strong><br />
              SSK Road, Feni Sadar, Feni<br />
              +88 0140 80 80 400 · +88 01902 500 400
            </div>
            <div className="print-title">
              <small>Generated {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</small>
              <b>Project Finance Ledger</b>
              <strong>{projectInfo.projectCode||"Project"}</strong>
              <small>{projectInfo.projectName||"—"} · {monthText(statement.selectedMonth)}</small>
            </div>
          </div>
        </div>

        <div className="print-only print-project-line">
          <span><strong>Project:</strong> {projectInfo.projectName||"—"}</span>
          <span><strong>Project Code:</strong> {projectInfo.projectCode||"—"}</span>
          <span><strong>Period:</strong> {monthText(statement.selectedMonth)}</span>
        </div>

        <div className="print-only print-summary">
          <div><span>Opening Balance</span><strong>BDT {money(statement.opening)}</strong></div>
          <div><span>Total Deposit</span><strong>BDT {money(statement.deposits)}</strong></div>
          <div><span>Total Expense</span><strong>BDT {money(statement.expenses)}</strong></div>
          <div><span>Supplier Advance</span><strong>BDT {money(summary.supplierAdvance)}</strong></div>
          <div><span>Cheque on Hold</span><strong>BDT {money(summary.chequeOnHold)}</strong></div>
          <div className="closing"><span>Eng Shajiv Balance</span><strong>BDT {money(currentAdjusted)}</strong></div>
        </div>

        <header className="rpt-letterhead">
          <div className="rpt-brand-block">
            <div className="rpt-mark">LV</div>
            <div>
              <div className="rpt-brand">LAND VIEW</div>
              <div className="rpt-brand-sub">Architects and Engineers</div>
              <div className="rpt-brand-line"/>
              <div className="rpt-doc-kicker">ACCOUNTS · PROJECT FINANCE</div>
            </div>
          </div>
          <div className="rpt-document-title">
            <div className="rpt-title-label">PROJECT LEDGER STATEMENT</div>
            <h1>Finance Account Statement</h1>
            <p>Monthly project cash movement and ledger reconciliation</p>
          </div>
          <div className="rpt-ref-box">
            <span>STATEMENT PERIOD</span>
            <strong>{monthText(statement.selectedMonth)}</strong>
            <small>Report No. {reportCode(projectInfo.projectCode,statement.selectedMonth)}</small>
            <small>Generated {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</small>
          </div>
        </header>

        <section className="rpt-project-card">
          <div><span>PROJECT CODE</span><strong>{projectInfo.projectCode||"—"}</strong></div>
          <div><span>PROJECT / CLIENT</span><strong>{projectInfo.projectName||"—"}</strong></div>
          <div><span>LOCATION</span><strong>{projectInfo.location||"Not recorded"}</strong></div>
          <div><span>ACCOUNT STATUS</span><strong>{projectInfo.status||"Active"}</strong></div>
        </section>

        <section className="rpt-account-bar">
          <div><span>ACCOUNT</span><strong>{projectInfo.projectCode||"—"} · Project Finance</strong></div>
          <div><span>PERIOD</span><strong>{monthText(statement.selectedMonth)}</strong></div>
          <div><span>TRANSACTIONS</span><strong>{period.length.toLocaleString("en-BD")}</strong></div>
          <div><span>STATEMENT TYPE</span><strong>Monthly Ledger</strong></div>
        </section>

        <section className="rpt-controls no-print">
          <label><span>REPORT MONTH</span><input type="month" value={statement.selectedMonth} onChange={e=>changeMonth(e.target.value)}/></label>
          <div><span>AVAILABLE LEDGER MONTHS</span><select value={statement.selectedMonth} onChange={e=>changeMonth(e.target.value)}><option value="">Current month</option>{availableMonths.map(m=><option key={m} value={m}>{monthText(m)}</option>)}</select></div>
          <div className="rpt-control-note">The running balance starts from all ledger activity before the selected month, just like a bank statement.</div>
        </section>

        <section className="rpt-summary-grid">
          <div><span>Opening Balance</span><strong>{money(statement.opening)}</strong><small>Balance before {monthText(statement.selectedMonth)}</small></div>
          <div><span>Total Deposit</span><strong className="deposit">{money(statement.deposits)}</strong><small>Debit entries during the month</small></div>
          <div><span>Total Expense</span><strong className="expense">{money(statement.expenses)}</strong><small>Credit entries during the month</small></div>
          <div><span>Net Movement</span><strong>{money(statement.net)}</strong><small>Deposit − Expense</small></div>
          <div><span>Closing Balance</span><strong className="closing">{money(statement.closing)}</strong><small>Ledger balance at month end</small></div>
        </section>

        <section className="rpt-reconciliation">
          <div><div><span>CURRENT RECONCILIATION SNAPSHOT</span><strong>Items tracked outside the ledger balance</strong></div><p>Supplier advance and cheque on hold are separate from the bank-statement running balance. The figure below uses the current Project Management reconciliation settings.</p></div>
          <div className="rpt-recon-values">
            <div><span>Supplier Advance</span><strong>{money(summary.supplierAdvance)}</strong></div>
            <div><span>Cheque on Hold</span><strong>{money(summary.chequeOnHold)}</strong></div>
            <div><span>Current Eng Shajiv Balance</span><strong>{money(currentAdjusted)}</strong></div>
          </div>
        </section>

        <section className="rpt-statement">
          <div className="rpt-statement-head">
            <div>
              <span>LEDGER ENTRIES</span>
              <strong>Account Activity for {monthText(statement.selectedMonth)}</strong>
            </div>
            <div className="rpt-statement-note">Amounts in BDT · Chronological order</div>
          </div>
          <div className="rpt-table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Details</th><th className="num">Expense</th><th className="num">Income</th><th className="num">Balance</th></tr></thead>
              <tbody>
                <tr className="opening-line">
                  <td>{dateText(statement.start)}</td>
                  <td><strong>OPENING BALANCE</strong><small>Balance brought forward before selected period</small></td>
                  <td className="num">—</td>
                  <td className="num">—</td>
                  <td className="num balance">{money(statement.opening)}</td>
                </tr>
                {period.map((r:any)=><tr key={r.id}>
                  <td>{dateText(r.entry_date)}</td>
                  <td><strong>{r.details||"—"}</strong><small>{r.category||"Uncategorized"}{r.memo?" · "+r.memo:""}</small></td>
                  <td className="num expense">{num(r.credit)>0?money(r.credit):"—"}</td>
                  <td className="num deposit">{num(r.debit)>0?money(r.debit):"—"}</td>
                  <td className="num balance">{money(r.balance)}</td>
                </tr>)}
                {!period.length&&<tr><td colSpan={5} className="empty">No ledger transactions were recorded in this month.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="print-only print-month-total">
            <div><span>MONTH TOTAL</span><small>{period.length.toLocaleString("en-BD")} ledger entries</small></div>
            <strong className="expense">BDT {money(statement.expenses)}</strong>
            <strong className="deposit">BDT {money(statement.deposits)}</strong>
            <strong>BDT {money(statement.closing)}</strong>
          </div>
        </section>

        <section className="rpt-closing">
          <div>
            <span>STATEMENT RECONCILIATION</span>
            <strong>Opening Balance + Deposits − Expenses = Closing Balance</strong>
          </div>
          <div className="formula">{money(statement.opening)} <b>+</b> {money(statement.deposits)} <b>−</b> {money(statement.expenses)} <b>=</b> <strong>{money(statement.closing)}</strong></div>
        </section>

        <section className="rpt-note-box">
          <div>
            <span>FINANCE CONTROL NOTE</span>
            <strong>Supplier advances and cheques on hold</strong>
            <p>Supplier Advance and Cheque on Hold are tracked separately from the ledger running balance and are reflected in the Project Management reconciliation summary.</p>
          </div>
          <div className="rpt-note-values">
            <div><span>Supplier Advance</span><strong>{money(summary.supplierAdvance)}</strong></div>
            <div><span>Cheque on Hold</span><strong>{money(summary.chequeOnHold)}</strong></div>
            <div><span>Adjusted Eng Shajiv Balance</span><strong>{money(currentAdjusted)}</strong></div>
          </div>
        </section>

        <section className="rpt-signoff">
          <div><span>Prepared by</span><strong>LAND VIEW Accounts</strong><i>Project Finance Ledger</i></div>
          <div><span>Reviewed / Approved</span><strong>____________________________</strong><i>Authorized Signature</i></div>
          <div><span>Statement Reference</span><strong>{reportCode(projectInfo.projectCode,statement.selectedMonth)}</strong><i>Keep with project accounts records</i></div>
        </section>

        <div className="print-only print-page-number" aria-hidden="true">Page</div>

        <footer className="rpt-footer">
          <div><strong>LAND VIEW Architects and Engineers</strong><br/>Project Finance Statement · {projectInfo.projectCode||"—"} · {monthText(statement.selectedMonth)}</div>
          <div>Confidential project accounts document · Generated from the LAND VIEW Project Management ledger.</div>
        </footer>
      </div>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
.print-report{display:none}
@media print{
  html,body{margin:0!important;padding:0!important;background:#fff!important;color:#111!important}
  .rpt-page{min-height:0!important;background:#fff!important;padding:0!important}
  .rpt-shell{max-width:none!important;margin:0!important}
  .rpt-shell> :not(.print-report){display:none!important}
  .print-report{display:block!important}
  .pfr-page{display:block!important;background:#fff!important;color:#111!important;break-after:page!important;page-break-after:always!important}
  .pfr-page:last-child{break-after:auto!important;page-break-after:auto!important}
  .pfr-header{display:grid!important;grid-template-columns:1.05fr 1.15fr .95fr!important;gap:4.5mm!important;align-items:start!important;border-bottom:.7mm solid #d61f26!important;padding:0 0 3.8mm!important;margin-bottom:3mm!important}
  .pfr-brand{display:flex!important;align-items:center!important;gap:2.6mm!important;min-width:0!important}
  .pfr-brand img{display:block!important;width:15mm!important;height:15mm!important;object-fit:contain!important;flex:0 0 15mm!important}
  .pfr-brand strong{display:block!important;font-size:15pt!important;line-height:.95!important;letter-spacing:-.4px!important;white-space:nowrap!important;color:#111!important}
  .pfr-brand strong span{color:#d61f26!important}
  .pfr-brand small{display:block!important;margin-top:1.2mm!important;font-size:5.8pt!important;letter-spacing:.75px!important;color:#666!important;white-space:nowrap!important}
  .pfr-contact{font-size:6.4pt!important;line-height:1.45!important;color:#333!important;padding-top:.8mm!important}
  .pfr-contact strong,.pfr-contact span{display:block!important}
  .pfr-contact strong{font-size:6.7pt!important;color:#111!important;margin-bottom:.4mm!important}
  .pfr-title{text-align:right!important;min-width:0!important}
  .pfr-title small,.pfr-title span{display:block!important;font-size:5.9pt!important;color:#666!important;line-height:1.35!important}
  .pfr-title b{display:block!important;margin-top:1.1mm!important;font-size:10.5pt!important;color:#d61f26!important;line-height:1.05!important}
  .pfr-title strong{display:block!important;margin-top:1.2mm!important;font-size:12pt!important;color:#111!important;line-height:1.05!important}
  .pfr-project-line{display:flex!important;justify-content:space-between!important;gap:4mm!important;margin-bottom:3mm!important;padding:2.2mm 2.8mm!important;border:.3mm solid #cfd5d9!important;background:#f6f7f8!important;font-size:6.3pt!important;color:#333!important}
  .pfr-summary{display:grid!important;grid-template-columns:repeat(3,1fr)!important;border:.35mm solid #cfd5d9!important;margin-bottom:3.8mm!important;background:#fff!important}
  .pfr-summary>div{min-height:14mm!important;padding:2.5mm 3mm!important;border-right:.3mm solid #cfd5d9!important;border-bottom:.3mm solid #cfd5d9!important;display:flex!important;flex-direction:column!important;justify-content:center!important;box-sizing:border-box!important}
  .pfr-summary>div:nth-child(3n){border-right:0!important}
  .pfr-summary>div:nth-last-child(-n+3){border-bottom:0!important}
  .pfr-summary span{display:block!important;font-size:6.5pt!important;color:#555!important;text-transform:uppercase!important;letter-spacing:.35px!important}
  .pfr-summary strong{display:block!important;margin-top:1.2mm!important;font-size:10.2pt!important;color:#111!important;font-variant-numeric:tabular-nums!important}
  .pfr-summary .closing{background:#d61f26!important}.pfr-summary .closing span,.pfr-summary .closing strong{color:#fff!important}
  .pfr-continuation{display:flex!important;justify-content:space-between!important;align-items:center!important;margin-bottom:2.5mm!important;padding-bottom:2mm!important;border-bottom:.5mm solid #d61f26!important;font-size:7pt!important;color:#555!important}
  .pfr-continuation strong{font-size:10pt!important;color:#111!important}
  .pfr-table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:6.55pt!important}
  .pfr-table thead{display:table-header-group!important}
  .pfr-table th{background:#34393d!important;color:#fff!important;font-size:6.5pt!important;padding:1.75mm 1.35mm!important;border:.25mm solid #34393d!important;line-height:1.05!important;vertical-align:middle!important;text-align:left!important}
  .pfr-table th.num,.pfr-table td.num{text-align:right!important;white-space:nowrap!important;font-variant-numeric:tabular-nums!important}
  .pfr-table td{font-size:6.55pt!important;color:#111!important;background:#fff!important;padding:1.55mm 1.35mm!important;border:.25mm solid #cfd5d9!important;line-height:1.18!important;vertical-align:top!important;overflow-wrap:break-word!important}
  .pfr-table th:nth-child(1),.pfr-table td:nth-child(1){width:13%!important}
  .pfr-table th:nth-child(2),.pfr-table td:nth-child(2){width:49%!important}
  .pfr-table th:nth-child(3),.pfr-table td:nth-child(3){width:13%!important}
  .pfr-table th:nth-child(4),.pfr-table td:nth-child(4){width:13%!important}
  .pfr-table th:nth-child(5),.pfr-table td:nth-child(5){width:12%!important}
  .pfr-table tr{break-inside:avoid!important;page-break-inside:avoid!important}
  .pfr-table td strong{display:block!important;font-size:6.6pt!important;font-weight:700!important;color:#111!important;line-height:1.17!important}
  .pfr-table td small{display:block!important;font-size:5.5pt!important;color:#555!important;margin-top:.5mm!important;line-height:1.18!important;white-space:normal!important;overflow:visible!important}
  .pfr-opening td{background:#f1f3f4!important;font-weight:800!important}
  .pfr-empty{text-align:center!important;padding:12mm!important;color:#555!important}
  .pfr-month-total{display:grid!important;grid-template-columns:1fr 1fr 1fr 1fr!important;margin-top:3mm!important;border:.3mm solid #cfd5d9!important;background:#fff!important;break-inside:avoid!important;page-break-inside:avoid!important}
  .pfr-month-total>*{padding:2mm 2.5mm!important;border-right:.3mm solid #cfd5d9!important;font-size:6.5pt!important;color:#111!important;box-sizing:border-box!important}
  .pfr-month-total>*:last-child{border-right:0!important}
  .pfr-month-total div{display:flex!important;flex-direction:column!important}.pfr-month-total span{font-weight:900!important;letter-spacing:.3px!important}.pfr-month-total small{margin-top:.5mm!important;color:#666!important;font-size:5.3pt!important}.pfr-month-total strong{text-align:right!important;font-variant-numeric:tabular-nums!important}
  .pfr-footer{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:5mm!important;margin-top:4mm!important;border-top:.45mm solid #d61f26!important;padding:1.8mm .8mm 0!important;font-size:6pt!important;line-height:1.25!important;color:#555!important;background:#fff!important;box-sizing:border-box!important;break-inside:avoid!important;page-break-inside:avoid!important}
  .pfr-footer b{color:#111!important;font-weight:800!important}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}
.rpt-page{min-height:100vh;background:#eef2f1;color:#1b282e;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:28px 24px 70px}
.rpt-shell{max-width:1440px;margin:0 auto}
.rpt-loading{min-height:100vh;display:grid;place-items:center;background:#eef2f1;color:#1c2930;font-family:Inter,system-ui,sans-serif}.rpt-loading>div{display:flex;flex-direction:column;align-items:center;gap:8px}.rpt-loading span{font-size:12px;color:#839097}.rpt-spinner{width:30px;height:30px;border:3px solid #dfe7e4;border-top-color:#1d6b52;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:8px}@keyframes spin{to{transform:rotate(360deg)}}
.rpt-screen-toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px}.rpt-screen-toolbar>a{color:#44675a;text-decoration:none;font-size:12px;font-weight:800}.rpt-screen-toolbar>div{display:flex;gap:8px}.rpt-screen-toolbar button{border:1px solid #d5dfdc;background:#fff;color:#43535a;border-radius:9px;padding:10px 13px;font:inherit;font-size:11px;font-weight:850;cursor:pointer}.rpt-screen-toolbar button.primary{background:#1d6b52;color:#fff;border-color:#1d6b52}
.rpt-letterhead{display:grid;grid-template-columns:1.05fr 1.65fr auto;gap:26px;align-items:center;background:#fff;border:1px solid #d8e1de;border-radius:16px;padding:21px 23px;box-shadow:0 12px 28px rgba(21,45,35,.045);position:relative;overflow:hidden}.rpt-letterhead:before{content:"";position:absolute;inset:0 auto 0 0;width:6px;background:#1d6b52}.rpt-brand-block{display:flex;align-items:center;gap:12px}.rpt-mark{width:46px;height:46px;border:2px solid #1d6b52;border-radius:12px;display:grid;place-items:center;color:#1d6b52;font-size:16px;font-weight:950;letter-spacing:-.08em}.rpt-brand{color:#1d6b52;font-weight:950;letter-spacing:.16em;font-size:18px}.rpt-brand-sub{font-size:9px;color:#82918b;margin-top:2px}.rpt-brand-line{height:1px;background:#e1ebe7;width:150px;margin:7px 0}.rpt-doc-kicker{font-size:8px;letter-spacing:.16em;font-weight:900;color:#81928c}.rpt-document-title{border-left:1px solid #e8eeec;padding-left:24px}.rpt-title-label{font-size:9px;letter-spacing:.15em;color:#1d6b52;font-weight:900}.rpt-document-title h1{margin:5px 0 3px;font-size:28px;letter-spacing:-.045em;color:#17242b}.rpt-document-title p{margin:0;color:#7d898f;font-size:11px}.rpt-ref-box{border:1px solid #dce6e2;min-width:210px;border-radius:10px;padding:11px 13px;background:#f7faf8;text-align:right}.rpt-ref-box span{display:block;color:#89969b;font-size:8px;letter-spacing:.14em;font-weight:900}.rpt-ref-box strong{display:block;margin-top:5px;font-size:15px;color:#20332d}.rpt-ref-box small{display:block;color:#7f8c91;margin-top:4px;font-size:8px}
.rpt-project-card{display:grid;grid-template-columns:1fr 2fr 1.2fr .8fr;gap:0;margin-top:10px;background:#fff;border:1px solid #d8e1de;border-radius:11px;overflow:hidden}.rpt-project-card>div{padding:12px 14px;border-right:1px solid #ebf0ee}.rpt-project-card>div:last-child{border-right:0}.rpt-project-card span,.rpt-controls span,.rpt-summary-grid span,.rpt-reconciliation span,.rpt-statement-head span,.rpt-account-bar span,.rpt-note-box span,.rpt-signoff span{display:block;color:#89969b;font-size:8px;letter-spacing:.13em;font-weight:900}.rpt-project-card strong{display:block;margin-top:4px;font-size:11px;color:#2f3e44}
.rpt-account-bar{display:grid;grid-template-columns:1.5fr 1fr .8fr 1fr;gap:0;margin-top:8px;background:#17242b;color:#fff;border-radius:10px;overflow:hidden}.rpt-account-bar>div{padding:10px 13px;border-right:1px solid rgba(255,255,255,.09)}.rpt-account-bar>div:last-child{border-right:0}.rpt-account-bar span{color:#91a7a0}.rpt-account-bar strong{display:block;margin-top:3px;font-size:10px;color:#fff}
.rpt-controls{display:grid;grid-template-columns:220px 250px 1fr;gap:12px;align-items:end;margin-top:10px;padding:12px 14px;background:#eaf2ef;border:1px solid #d3e4dd;border-radius:11px}.rpt-controls label,.rpt-controls>div{display:block}.rpt-controls input,.rpt-controls select{width:100%;height:37px;border:1px solid #d2dfda;border-radius:8px;background:#fff;padding:0 9px;margin-top:5px;font:inherit;font-size:11px;color:#2c3b41}.rpt-control-note{align-self:center;color:#6d7d77;font-size:10px;line-height:1.5;padding-left:8px}
.rpt-summary-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:10px}.rpt-summary-grid>div{background:#fff;border:1px solid #d9e2df;border-top:3px solid #1d6b52;border-radius:10px;padding:12px 12px 11px}.rpt-summary-grid>div:nth-child(2){border-top-color:#365f8a}.rpt-summary-grid>div:nth-child(3){border-top-color:#a35d5d}.rpt-summary-grid>div:nth-child(4){border-top-color:#7a7f86}.rpt-summary-grid>div:nth-child(5){border-top-color:#8a6b31}.rpt-summary-grid span{color:#748289;font-size:9px;letter-spacing:.02em}.rpt-summary-grid strong{display:block;margin-top:7px;font-size:18px;letter-spacing:-.035em;color:#223036}.rpt-summary-grid small{display:block;color:#9aa4a8;font-size:8px;margin-top:5px}.deposit{color:#365f8a}.expense{color:#a45a5a}.closing{color:#1d6b52}
.print-only{display:none}.rpt-reconciliation{display:none}
.rpt-statement{margin-top:10px;background:#fff;border:1px solid #d7e1de;border-radius:12px;overflow:hidden;box-shadow:0 10px 26px rgba(21,45,35,.035)}.rpt-statement-head{display:flex;justify-content:space-between;align-items:flex-end;padding:12px 14px 10px;border-bottom:1px solid #dce5e1;background:#fbfcfc}.rpt-statement-head strong{display:block;margin-top:3px;font-size:16px;color:#1e2d33}.rpt-statement-note{color:#7f8c92;font-size:9px}.rpt-table-wrap{overflow:auto}.rpt-statement table{width:100%;min-width:1050px;border-collapse:collapse;font-size:10px}.rpt-statement th{background:#eef3f1;border-top:1px solid #dbe5e1;border-bottom:1px solid #cfdad5;padding:9px 10px;text-align:left;color:#56676e;font-size:8px;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}.rpt-statement th.amount-head{background:#eaf0ee}.rpt-statement th.balance-head{background:#e4ece9;color:#314b41}.rpt-statement td{padding:8px 10px;border-bottom:1px solid #edf1ef;vertical-align:top;color:#536168}.rpt-statement tbody tr:nth-child(even){background:#fbfcfc}.rpt-statement tbody tr:hover{background:#f3f8f5}.rpt-statement td strong{display:block;color:#27373e;font-size:10px;font-weight:760;line-height:1.3}.rpt-statement td small{display:block;color:#98a3a7;font-size:8px;margin-top:2px;max-width:360px;overflow:hidden;text-overflow:ellipsis}.rpt-statement td.num,.rpt-statement th.num{text-align:right;white-space:nowrap}.rpt-statement td.balance{font-weight:850;color:#28483b;background:rgba(232,242,237,.42)}.rpt-statement td.deposit{font-weight:800}.rpt-statement td.expense{font-weight:800}.ledger-total-row>td:first-child span{display:block;font-size:9px;letter-spacing:.1em}.ledger-total-row>td:first-child small{display:block;margin-top:2px;color:#94a2a7;font-size:8px;font-weight:600}.empty{text-align:center!important;color:#929ea2!important;padding:45px!important}
.rpt-closing{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-top:10px;padding:11px 14px;background:#1d6b52;color:#fff;border-radius:10px}.rpt-closing span{font-size:8px;letter-spacing:.12em;color:#b9d9cc}.rpt-closing strong{display:block;margin-top:2px;font-size:10px}.rpt-closing .formula{font-size:10px;white-space:nowrap}.rpt-closing .formula b{padding:0 5px;color:#b9d9cc}
.rpt-note-box{display:flex;justify-content:space-between;gap:20px;margin-top:9px;padding:11px 14px;background:#fbfaf5;border:1px solid #e7dfc5;border-radius:10px}.rpt-note-box>div:first-child{max-width:520px}.rpt-note-box strong{display:block;margin-top:3px;font-size:10px;color:#564c34}.rpt-note-box p{margin:4px 0 0;color:#837b68;font-size:8px;line-height:1.45}.rpt-note-values{display:grid;grid-template-columns:repeat(3,minmax(130px,1fr));gap:0}.rpt-note-values>div{padding:0 14px;border-left:1px solid #e4dbc0}.rpt-note-values strong{font-size:11px;color:#55492f;margin-top:4px}.rpt-signoff{display:grid;grid-template-columns:1fr 1fr 1fr;gap:28px;margin-top:24px;padding-top:16px;border-top:1px solid #d8e1de}.rpt-signoff>div{min-height:48px}.rpt-signoff span{color:#8d999e}.rpt-signoff strong{display:block;margin-top:12px;font-size:9px;color:#3d4b51}.rpt-signoff i{display:block;margin-top:3px;font-size:8px;color:#929da1;font-style:normal}.rpt-footer{display:flex;justify-content:space-between;gap:30px;margin-top:14px;padding-top:10px;border-top:1px solid #e0e7e4;color:#8d999e;font-size:8px;line-height:1.5}.rpt-footer strong{color:#53646a}.rpt-error{margin-bottom:10px;padding:10px 12px;background:#fff0ee;color:#a4473d;border:1px solid #f1d2ce;border-radius:9px;font-size:10px}
.rpt-chooser{max-width:900px;margin:40px auto;background:#fff;border:1px solid #dfe7e5;border-radius:18px;padding:30px;box-shadow:0 18px 48px rgba(21,45,35,.06)}.rpt-kicker{font-size:10px;letter-spacing:.14em;font-weight:900;color:#1d6b52}.rpt-chooser h1{margin:10px 0 7px;font-size:34px;letter-spacing:-.04em}.rpt-chooser>p{margin:0;color:#7c898f;font-size:12px}.rpt-projects{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:22px}.rpt-projects button{text-align:left;background:#fafcfc;border:1px solid #e2e9e7;border-radius:13px;padding:15px;cursor:pointer}.rpt-projects button:hover{border-color:#74a48f;background:#fff;box-shadow:0 10px 24px rgba(29,107,82,.08)}.rpt-projects b{display:block;font-size:10px;letter-spacing:.1em;color:#1d6b52}.rpt-projects strong{display:block;margin-top:5px;font-size:16px;color:#28363d}.rpt-projects span{display:block;color:#89959a;font-size:10px;margin-top:5px}.rpt-projects em{display:block;margin-top:11px;padding-top:10px;border-top:1px solid #edf1ef;color:#35735f;font-size:10px;font-style:normal;font-weight:850}
@media(max-width:1150px){.rpt-summary-grid{grid-template-columns:repeat(3,1fr)}.rpt-letterhead{grid-template-columns:1fr 1.4fr}.rpt-ref-box{justify-self:end}.rpt-account-bar{grid-template-columns:1fr 1fr}.rpt-recon-values{grid-template-columns:repeat(3,1fr)}.rpt-note-box{flex-direction:column}}
@media(max-width:760px){.rpt-page{padding:14px 10px 45px}.rpt-screen-toolbar,.rpt-letterhead,.rpt-note-box,.rpt-closing,.rpt-footer{flex-direction:column;align-items:stretch}.rpt-screen-toolbar>div{width:100%}.rpt-screen-toolbar button{flex:1}.rpt-letterhead{display:flex}.rpt-document-title{border-left:0;border-top:1px solid #e8eeec;padding-left:0;padding-top:15px}.rpt-ref-box{text-align:left;min-width:0}.rpt-project-card{grid-template-columns:1fr 1fr}.rpt-project-card>div:nth-child(2){border-right:0}.rpt-project-card>div:nth-child(-n+2){border-bottom:1px solid #edf0f1}.rpt-account-bar{grid-template-columns:1fr 1fr}.rpt-controls{grid-template-columns:1fr}.rpt-note-values{grid-template-columns:1fr}.rpt-note-values>div{border-left:0;border-top:1px solid #e4dbc0;padding:8px 0 0;margin-top:8px}.rpt-summary-grid{grid-template-columns:1fr 1fr}.rpt-closing .formula{white-space:normal}.rpt-projects{grid-template-columns:1fr}.rpt-footer{gap:8px}}
@media print{
  @page{size:A4 portrait;margin:8mm 8mm 10mm}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  .no-print,.rpt-screen-toolbar{display:none!important}
  .rpt-page{background:#fff;padding:0}
  .rpt-shell{max-width:none}
  .rpt-letterhead{grid-template-columns:1fr 1.35fr auto;gap:14px}
  .rpt-letterhead,.rpt-project-card,.rpt-account-bar,.rpt-summary-grid>div,.rpt-reconciliation,.rpt-statement,.rpt-note-box,.rpt-signoff{box-shadow:none}
  .rpt-letterhead{border-radius:0;border:1px solid #cfd8d4;border-left:5px solid #1d6b52;padding:10px 12px}
  .rpt-mark{width:35px;height:35px;border-radius:8px;font-size:12px}
  .rpt-brand{font-size:14px}.rpt-brand-sub{font-size:7px}.rpt-brand-line{margin:4px 0}.rpt-doc-kicker{font-size:6px}.rpt-document-title{padding-left:14px}.rpt-title-label{font-size:6px}.rpt-document-title h1{font-size:20px;margin:2px 0}.rpt-document-title p{font-size:7px}.rpt-ref-box{min-width:160px;padding:7px 9px;border-radius:6px}.rpt-ref-box span{font-size:6px}.rpt-ref-box strong{font-size:11px;margin-top:3px}.rpt-ref-box small{font-size:6px;margin-top:2px}
  .rpt-project-card{margin-top:5px;border-radius:0}.rpt-project-card>div{padding:7px 9px}.rpt-project-card span{font-size:6px}.rpt-project-card strong{font-size:8px;margin-top:2px}
  .rpt-account-bar{margin-top:4px;border-radius:0}.rpt-account-bar>div{padding:6px 9px}.rpt-account-bar span{font-size:6px}.rpt-account-bar strong{font-size:7px;margin-top:2px}
  .rpt-summary-grid{grid-template-columns:repeat(2,1fr);gap:5px;margin-top:5px}.rpt-summary-grid>div{border-radius:0;padding:7px 8px;border-top-width:2px}.rpt-summary-grid span{font-size:6px}.rpt-summary-grid strong{font-size:11px;margin-top:4px}.rpt-summary-grid small{font-size:6px;margin-top:3px}
  .rpt-statement{margin-top:6px;border-radius:0}.rpt-statement-head{padding:7px 9px 6px}.rpt-statement-head span{font-size:6px}.rpt-statement-head strong{font-size:11px;margin-top:2px}.rpt-statement-note{font-size:6px}
  .rpt-table-wrap{overflow:visible}.rpt-statement table{min-width:0;font-size:7px;table-layout:fixed}.rpt-statement th{font-size:6px;padding:5px 5px}.rpt-statement td{padding:5px 5px}.rpt-statement td strong{font-size:7px}.rpt-statement td small{font-size:5.5px}.rpt-statement td.balance{background:#eef6f1}
  .rpt-statement th:nth-child(1),.rpt-statement td:nth-child(1){width:11%}.rpt-statement th:nth-child(2),.rpt-statement td:nth-child(2){width:43%}.rpt-statement th:nth-child(3),.rpt-statement td:nth-child(3){width:13%}.rpt-statement th:nth-child(4),.rpt-statement td:nth-child(4){width:11%}.rpt-statement th:nth-child(5),.rpt-statement td:nth-child(5){width:11%}.rpt-statement th:nth-child(6),.rpt-statement td:nth-child(6){width:11%}
  .rpt-statement thead{display:table-header-group}.rpt-statement tr{break-inside:avoid}.rpt-statement tfoot td{padding:6px 5px}.ledger-total-row>td:first-child span{font-size:6px}.ledger-total-row>td:first-child small{font-size:5.5px}
  .rpt-closing{margin-top:5px;border-radius:0;padding:7px 9px}.rpt-closing span{font-size:6px}.rpt-closing strong{font-size:7px}.rpt-closing .formula{font-size:7px}
  .rpt-note-box{margin-top:5px;border-radius:0;padding:7px 9px;display:flex;flex-direction:row}.rpt-note-box span{font-size:6px}.rpt-note-box strong{font-size:7px}.rpt-note-box p{font-size:5.5px}.rpt-note-values{grid-template-columns:repeat(3,minmax(100px,1fr));gap:0}.rpt-note-values>div{padding:0 9px;border-left:1px solid #e4dbc0;border-top:0;margin-top:0}.rpt-note-values strong{font-size:7px}.rpt-signoff{gap:18px;margin-top:8px;padding-top:7px}.rpt-signoff span{font-size:6px}.rpt-signoff strong{font-size:7px;margin-top:7px}.rpt-signoff i{font-size:5.5px}.rpt-footer{margin-top:6px;padding-top:5px;font-size:5.5px}
}
  @media print{
    .rpt-page{counter-reset:page}
    .rpt-letterhead,.rpt-project-card,.rpt-account-bar,.rpt-controls,.rpt-summary-grid,.rpt-closing,.rpt-note-box,.rpt-signoff,.rpt-footer,.rpt-statement-head{display:none!important}
    .rpt-page{background:#fff!important;padding:0!important}
    .rpt-shell{max-width:none!important}
    .rpt-statement{position:static!important;margin-top:3mm!important;border:0!important;border-radius:0!important;box-shadow:none!important;overflow:visible!important}
    .print-only{display:block!important}
    .print-ledger-header{border-bottom:.7mm solid #d61f26!important;padding:0 0 3.8mm!important;margin:0 0 3mm!important}
    .print-brand-row{display:grid!important;grid-template-columns:1.05fr 1.15fr .95fr!important;gap:4.5mm!important;align-items:start!important}
    .print-brand{display:flex!important;align-items:center!important;gap:2.6mm!important;min-width:0!important}
    .print-brand img{display:block!important;width:15mm!important;height:15mm!important;object-fit:contain!important;flex:0 0 15mm!important}
    .print-brand strong{display:block!important;font-size:15pt!important;line-height:.95!important;letter-spacing:-.4px!important;color:#111!important;white-space:nowrap!important}
    .print-brand strong span{color:#d61f26!important}
    .print-brand small{display:block!important;margin-top:1.2mm!important;font-size:5.8pt!important;letter-spacing:.75px!important;color:#666!important;white-space:nowrap!important}
    .print-contact{font-size:6.4pt!important;line-height:1.45!important;color:#333!important;padding-top:.8mm!important}
    .print-contact strong{display:block!important;font-size:6.7pt!important;color:#111!important;margin-bottom:.4mm!important}
    .print-title{text-align:right!important;min-width:0!important}
    .print-title small{display:block!important;font-size:5.9pt!important;color:#666!important;line-height:1.35!important}
    .print-title b{display:block!important;margin-top:1.1mm!important;font-size:10.5pt!important;color:#d61f26!important;line-height:1.05!important}
    .print-title strong{display:block!important;margin-top:1.2mm!important;font-size:12pt!important;color:#111!important;line-height:1.05!important}
    .print-project-line{display:flex!important;justify-content:space-between!important;gap:4mm!important;margin:0 0 3mm!important;padding:2.2mm 2.8mm!important;border:.3mm solid #cfd5d9!important;background:#f6f7f8!important;font-size:6.3pt!important;color:#333!important}
    .print-summary{display:grid!important;grid-template-columns:repeat(3,1fr)!important;border:.35mm solid #cfd5d9!important;margin:0 0 3.8mm!important;background:#fff!important}
    .print-summary div{min-height:14mm!important;padding:2.5mm 3mm!important;border-right:.3mm solid #cfd5d9!important;border-bottom:.3mm solid #cfd5d9!important;display:flex!important;flex-direction:column!important;justify-content:center!important;box-sizing:border-box!important}
    .print-summary div:nth-child(3n){border-right:0!important}.print-summary div:nth-last-child(-n+3){border-bottom:0!important}
    .print-summary span{display:block!important;font-size:6.5pt!important;color:#555!important;text-transform:uppercase!important;letter-spacing:.35px!important}
    .print-summary strong{display:block!important;margin-top:1.2mm!important;font-size:10.2pt!important;color:#111!important;font-variant-numeric:tabular-nums!important}
    .print-summary .closing{background:#d61f26!important}.print-summary .closing span,.print-summary .closing strong{color:#fff!important}
    .rpt-table-wrap{overflow:visible!important}
    .rpt-statement table{width:100%!important;min-width:0!important;border-collapse:collapse!important;table-layout:fixed!important}
    .rpt-statement thead{display:table-header-group!important}
    .rpt-statement tfoot{display:none!important}
    .rpt-statement tbody{background:#fff!important}
    .print-month-total{display:grid!important;grid-template-columns:1fr 1fr 1fr 1fr!important;margin-top:3mm!important;border:.3mm solid #cfd5d9!important;background:#fff!important;break-inside:avoid!important;page-break-inside:avoid!important}
    .print-month-total>*{padding:2mm 2.5mm!important;border-right:.3mm solid #cfd5d9!important;font-size:6.5pt!important;color:#111!important;box-sizing:border-box!important}
    .print-month-total>*:last-child{border-right:0!important}.print-month-total span{display:block!important;font-weight:900!important;letter-spacing:.3px!important}.print-month-total small{display:block!important;margin-top:.5mm!important;color:#666!important;font-size:5.3pt!important}.print-month-total strong{text-align:right!important;font-variant-numeric:tabular-nums!important}
    .print-page-number{display:block!important;position:fixed!important;right:0!important;bottom:-5mm!important;font-size:6pt!important;color:#666!important}
    .print-page-number:after{content:"Page " counter(page) " of " counter(pages)!important}
    .rpt-statement th{position:static!important;background:#34393d!important;color:#fff!important;font-size:6.5pt!important;padding:1.75mm 1.35mm!important;border:.25mm solid #34393d!important;line-height:1.05!important;vertical-align:middle!important}
    .rpt-statement td{font-size:6.55pt!important;color:#111!important;background:#fff!important;padding:1.55mm 1.35mm!important;border:.25mm solid #cfd5d9!important;line-height:1.18!important;vertical-align:top!important;overflow-wrap:break-word!important}
    .rpt-statement tbody tr:nth-child(even) td{background:#f7f8f9!important}
    .rpt-statement tr{break-inside:avoid!important;page-break-inside:avoid!important}
    .rpt-statement th:nth-child(1),.rpt-statement td:nth-child(1){width:13%!important}
    .rpt-statement th:nth-child(2),.rpt-statement td:nth-child(2){width:49%!important}
    .rpt-statement th:nth-child(3),.rpt-statement td:nth-child(3){width:13%!important}
    .rpt-statement th:nth-child(4),.rpt-statement td:nth-child(4){width:13%!important}
    .rpt-statement th:nth-child(5),.rpt-statement td:nth-child(5){width:12%!important}
    .rpt-statement td.num,.rpt-statement th.num{text-align:right!important;white-space:nowrap!important;font-variant-numeric:tabular-nums!important}
    .rpt-statement td strong{font-size:6.6pt!important;color:#111!important;font-weight:700!important}.rpt-statement td small{font-size:5.5pt!important;color:#555!important;margin-top:.5mm!important}
    .rpt-statement td.balance{font-weight:800!important;color:#111!important;background:#eef3f1!important}
    .ledger-total-row>td:first-child span{font-size:6.1pt!important}.ledger-total-row>td:first-child small{font-size:5.3pt!important;color:#c9d0d4!important}
    .opening-line td{background:#f1f3f4!important;font-weight:800!important}
    .opening-line td.balance{background:#eef3f1!important}
    .print-ledger-footer{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:5mm!important;margin-top:4mm!important;border-top:.45mm solid #d61f26!important;padding:1.8mm .8mm 0!important;font-size:6pt!important;line-height:1.25!important;color:#555!important;background:#fff!important;box-sizing:border-box!important;break-inside:avoid!important;page-break-inside:avoid!important}
    .print-ledger-footer strong{color:#111!important;font-weight:800!important}
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  }
`;