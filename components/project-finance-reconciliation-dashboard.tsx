"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  buildFinanceReconciliation,
  type ReconciliationPayment,
  type ReconciliationIssue,
  type ReconciliationStatus,
} from "@/lib/project-finance-reconciliation";

type AuditEvent={
  id:string;entryId:string;date:string;action:string;actor:string;
  details:string;category:string;changedFields:string[];debit:number;credit:number;
};
type AuditData={
  events:AuditEvent[];scanned:number;recentWindowOnly:boolean;moreMatchingEvents:boolean;
};
type ViewFilter="review"|"all"|"linked"|"matched"|"internal";
const amount=(v:unknown)=>Number(v)||0;
const money=(v:unknown)=>new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(amount(v));
const date=(v:unknown)=>{
  const value=String(v||"").slice(0,10);
  const d=new Date(value+"T00:00:00");
  return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
};
const shortTime=(v:unknown)=>{
  const d=new Date(String(v||""));
  return Number.isNaN(d.getTime())?String(v||""):d.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
};
const reviewStatuses=new Set<ReconciliationStatus>(["suggested","ambiguous","unregistered","missing","conflict"]);
const labelStatus:Record<ReconciliationStatus,string>={
  linked:"ID linked",matched:"Name matched",suggested:"Confirm match",
  ambiguous:"Ambiguous",unregistered:"Unregistered",internal:"Internal / Office",
  missing:"Missing recipient",conflict:"Invalid link"
};
const csvValue=(v:unknown)=>{
  const raw=String(v??"");
  const guarded=/^[\s\t\r\n]*[=+@-]/.test(raw)?"'"+raw:raw;
  return '"'+guarded.replace(/"/g,'""')+'"';
};
function exportPayments(projectCode:string,payments:ReconciliationPayment[]){
  const columns=["Date","Recipient","Category","Details","Amount (BDT)","Match status","Suggested party","Reason","Ledger ID"];
  const rows=payments.map(p=>[p.date,p.recipient,p.category,p.details,p.amount,p.status,p.party,p.reason,p.id]);
  const csv="\uFEFF"+[columns,...rows].map(row=>row.map(csvValue).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download=(projectCode||"project")+"-finance-reconciliation.csv";
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function ProjectFinanceReconciliationDashboard(){
  const params=useSearchParams();
  const requestedCode=String(params.get("projectId")||"").trim();
  const [snapshot,setSnapshot]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [refreshCounter,setRefreshCounter]=useState(0);
  const [audit,setAudit]=useState<AuditData|null>(null);
  const [auditLoading,setAuditLoading]=useState(false);
  const [auditError,setAuditError]=useState("");
  const [filter,setFilter]=useState<ViewFilter>("review");
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [showMoreIssues,setShowMoreIssues]=useState(false);
  const [partySearch,setPartySearch]=useState("");
  const [partyType,setPartyType]=useState<"all"|"Supplier"|"Contractor">("all");

  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setSnapshot(null);setError("");setAudit(null);setPage(1);
    const path=requestedCode?"/api/project-management?projectId="+encodeURIComponent(requestedCode):"/api/project-management";
    void fetch(path,{credentials:"same-origin",cache:"no-store",signal:controller.signal})
      .then(async response=>{
        const payload=await response.json();
        if(!response.ok||!payload?.success)throw new Error(payload?.error||"Could not load reconciliation data.");
        if(!controller.signal.aborted)setSnapshot(payload.data);
      })
      .catch((err:Error)=>{if(!controller.signal.aborted)setError(err.message||"Could not load reconciliation data.");})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[requestedCode,refreshCounter]);

  const analysis=useMemo(()=>snapshot?.selectedProject?buildFinanceReconciliation(snapshot):null,[snapshot]);
  const projectCode=analysis?.projectCode||requestedCode;
  const canManage=Boolean(snapshot&&!snapshot.readOnly);
  useEffect(()=>{
    if(!analysis||!canManage||!projectCode)return;
    const controller=new AbortController();
    setAudit(null);setAuditError("");setAuditLoading(true);
    void fetch("/api/project-management/reconciliation-audit?projectId="+encodeURIComponent(projectCode),
      {credentials:"same-origin",cache:"no-store",signal:controller.signal})
      .then(async response=>{
        const payload=await response.json();
        if(!response.ok||!payload?.success)throw new Error(payload?.error||"Could not load audit history.");
        if(!controller.signal.aborted)setAudit(payload.data);
      })
      .catch((err:Error)=>{if(!controller.signal.aborted)setAuditError(err.message||"Audit history unavailable.");})
      .finally(()=>{if(!controller.signal.aborted)setAuditLoading(false);});
    return ()=>controller.abort();
  },[projectCode,canManage,Boolean(analysis),refreshCounter]);

  useEffect(()=>setPage(1),[filter,search]);
  const withProject=(path:string)=>projectCode?path+"?projectId="+encodeURIComponent(projectCode):path;
  const openLedgerEntry=(rowId:string)=>withProject("/projectmanagement/expenses")+(projectCode?"&":"?")+"entryId="+encodeURIComponent(rowId);
  const displayed=useMemo(()=>{
    if(!analysis)return [];
    const query=search.trim().toLowerCase();
    return analysis.payments.filter(payment=>{
      const fits=filter==="all"||
        filter==="review"&&reviewStatuses.has(payment.status)||
        filter==="linked"&&payment.status==="linked"||
        filter==="matched"&&payment.status==="matched"||
        filter==="internal"&&payment.status==="internal";
      return fits&&(!query||[payment.date,payment.recipient,payment.category,payment.details,payment.party,payment.reason]
        .some(value=>value.toLowerCase().includes(query)));
    });
  },[analysis,filter,search]);
  const pageSize=20;
  const pageCount=Math.max(1,Math.ceil(displayed.length/pageSize));
  const currentPage=Math.min(page,pageCount);
  const visible=displayed.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const parties=useMemo(()=>{
    if(!analysis)return [];
    const query=partySearch.trim().toLowerCase();
    return analysis.parties.filter(p=>(partyType==="all"||p.type===partyType)&&
      (!query||p.name.toLowerCase().includes(query)));
  },[analysis,partyType,partySearch]);
  const balance=analysis?.balances;
  const balanceGap=balance?Math.abs(balance.reportedCash-balance.calculatedCash):0;
  const balanceIssues:ReconciliationIssue[]=analysis?.issues.filter(issue=>
    issue.kind==="balance"||issue.kind==="cheque")||[];
  const allBalanced=balanceIssues.length===0;
  const issues=analysis?.issues||[];
  const topIssues=showMoreIssues?issues:issues.slice(0,10);
  const statusDescription=analysis?.needsReview?analysis.needsReview+" expense payments need review":"No unresolved payment matches in this snapshot";

  return <main className="pmr-page">
    <header className="pmr-intro">
      <div>
        <span className="pmr-overline">FINANCIAL CONTROL / V3</span>
        <div className="pmr-intro-title"><h2>Finance Reconciliation</h2><span className="pmr-readonly-tag">Read-only analysis</span></div>
        <p>Review payment allocations, supplier and contractor obligations, cash differences, and actual ledger change history. Nothing here edits your accounts automatically.</p>
        <div className="pmr-project-context">{projectCode||"Select a project"}{snapshot?.selectedProject?.projectName?" · "+snapshot.selectedProject.projectName:""}</div>
      </div>
      <div className="pmr-intro-actions">
        <button type="button" className="pmr-button" disabled={loading} onClick={()=>setRefreshCounter(value=>value+1)}>
          {loading?"Refreshing…":"↻ Refresh analysis"}
        </button>
        {analysis&&<button type="button" className="pmr-button pmr-button-primary" onClick={()=>exportPayments(projectCode,displayed)}>Export current review CSV</button>}
      </div>
    </header>

    {error&&<div className="pmr-alert pmr-alert-error" role="alert">{error} <button type="button" onClick={()=>setRefreshCounter(v=>v+1)}>Retry</button></div>}
    {loading&&!snapshot&&<div className="pmr-loading" aria-live="polite">Loading ledger, contracts and reconciliation checks…</div>}
    {!loading&&!snapshot&&!error&&<div className="pmr-empty">No Project Management data returned.</div>}
    {!loading&&snapshot&&!snapshot.selectedProject&&<div className="pmr-empty">
      <h3>Select a project from the Active Project menu above.</h3>
      <p>Reconciliation is performed per project; no records are combined between projects.</p>
    </div>}

    {analysis&&balance&&<>
      <section className="pmr-metrics" aria-label="Reconciliation totals">
        <div className="pmr-metric"><span>Expense transactions</span><strong>{analysis.expensesCount.toLocaleString("en-BD")}</strong><small>{money(analysis.expenseAmount)} posted cash outflow</small></div>
        <div className="pmr-metric"><span>Explicit party links</span><strong>{analysis.linked.toLocaleString("en-BD")}</strong><small>Referenced by stored supplier or contract ID</small></div>
        <div className="pmr-metric"><span>Unconfirmed matches</span><strong>{analysis.matched.toLocaleString("en-BD")}</strong><small>Exact recipient and category; no saved link</small></div>
        <div className="pmr-metric pmr-metric-review"><span>Payments requiring review</span><strong>{analysis.needsReview.toLocaleString("en-BD")}</strong><small>{money(analysis.needsReviewAmount)} to verify</small></div>
        <div className={"pmr-metric "+(balanceGap>.01?"pmr-metric-danger":"pmr-metric-good")}><span>Available cash difference</span><strong>{money(balance.reportedCash-balance.calculatedCash)}</strong><small>{balanceGap>.01?"Reconciliation discrepancy":"Reported balance matches calculation"}</small></div>
      </section>

      <section className="pmr-panel pmr-checks" aria-labelledby="pmr-check-heading">
        <div className="pmr-panel-head"><div><span className="pmr-overline">BALANCE CONTROLS</span><h3 id="pmr-check-heading">Cash reconciliation</h3><p>Read from the current Project Management API. Figures are checked, not rewritten.</p></div>
          <span className={"pmr-chip "+(allBalanced?"pmr-chip-good":"pmr-chip-warn")}>{allBalanced?"Balances agree":"Check differences"}</span></div>
        <div className="pmr-balance-grid">
          <div className="pmr-balance-row"><span>Deposits / income</span><strong>{money(balance.depositReported)}</strong><small>Ledger rows {money(balance.incomeFromRows)}</small></div>
          <div className="pmr-balance-row"><span>Project expenses</span><strong>{money(balance.expenseReported)}</strong><small>Outgoing rows {money(balance.expenseFromRows)}{balance.extraAllocation>0?" + virtual allocation "+money(balance.extraAllocation):""}</small></div>
          <div className="pmr-balance-row"><span>Cheque on hold</span><strong>{money(balance.chequeOnHold)}</strong><small>Held entries {money(balance.chequeOnHoldFromRows)}</small></div>
          <div className="pmr-balance-row pmr-balance-emphasis"><span>Eng Shajiv balance</span><strong>{money(balance.reportedCash)}</strong><small>Calculated {money(balance.calculatedCash)}</small></div>
        </div>
        <div className="pmr-accounting-note">
          <span>Calculation: Total Deposit − Total Expense − Cheque on Hold = Available Cash.</span>
          <span>Last ledger running cash: {balance.runningCash===null?"Not available":money(balance.runningCash)}</span>
        </div>
        {balanceIssues.length>0&&<div className="pmr-difference-list">
          {balanceIssues.map(issue=><p key={issue.id}><strong>{issue.title}:</strong> {issue.description}</p>)}
        </div>}
      </section>

      <section className="pmr-panel pmr-payments" aria-labelledby="pmr-payments-heading">
        <div className="pmr-panel-head"><div><span className="pmr-overline">ALLOCATION REVIEW</span><h3 id="pmr-payments-heading">Payment matching</h3><p>{statusDescription}. Suggestions do not modify any saved party or contract references.</p></div>
          <Link href={withProject("/projectmanagement/parties")}>Registered parties →</Link></div>
        <div className="pmr-controls">
          <div className="pmr-filter-group" role="group" aria-label="Payment matching status">
            {([
              ["review","Needs review"],
              ["all","All payments"],
              ["linked","Saved ID links"],
              ["matched","Name matches"],
              ["internal","Internal / office"]
            ] as [ViewFilter,string][]).map(([value,label])=>
              <button type="button" key={value} className={filter===value?"is-active":""} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}
          </div>
          <input value={search} onChange={event=>setSearch(event.target.value)}
            aria-label="Search payments by recipient, category or details" placeholder="Search recipient, category, details…" />
        </div>
        <div className="pmr-table-scroll"><table className="pmr-table">
          <thead><tr><th>Date</th><th>Payment recipient / details</th><th>Category</th><th className="pmr-amount">Amount</th><th>Matching result</th><th>Action</th></tr></thead>
          <tbody>{visible.map(payment=><tr key={payment.id}>
            <td className="pmr-muted">{date(payment.date)}</td>
            <td className="pmr-payee-cell"><strong>{payment.recipient||"Not recorded"}</strong><small title={payment.details}>{payment.details||"No details"}</small></td>
            <td>{payment.category||"—"}</td>
            <td className="pmr-amount"><strong>{money(payment.amount)}</strong></td>
            <td><span className={"pmr-chip pmr-status-"+payment.status}>{labelStatus[payment.status]}</span>
              {payment.party&&<strong className="pmr-party-hint">{payment.party}</strong>}
              <small className="pmr-status-reason">{payment.reason}</small></td>
            <td><Link className="pmr-inline-action" href={openLedgerEntry(payment.id)}>{canManage?"Review entry":"View ledger"} →</Link></td>
          </tr>)}
          {!visible.length&&<tr><td colSpan={6} className="pmr-table-empty">{search?"No matching payment records.":"There are no payments in this status group."}</td></tr>}
          </tbody></table></div>
        <footer className="pmr-table-footer"><span>Showing {visible.length?((currentPage-1)*pageSize+1)+"–"+Math.min(currentPage*pageSize,displayed.length):"0"} of {displayed.length.toLocaleString("en-BD")} payments</span>
          <div><button disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>Previous</button><span>{currentPage} / {pageCount}</span><button disabled={currentPage>=pageCount} onClick={()=>setPage(currentPage+1)}>Next</button></div></footer>
      </section>

      <div className="pmr-columns">
        <section className="pmr-panel pmr-obligations" aria-labelledby="pmr-obligations-heading">
          <div className="pmr-panel-head"><div><span className="pmr-overline">OBLIGATIONS</span><h3 id="pmr-obligations-heading">Advances and dues</h3><p>Amounts from the existing supplier and certified bill calculations.</p></div>
            <Link href={withProject("/projectmanagement/bills")}>Contracts & bills →</Link></div>
          <div className="pmr-obligation-grid">
            <div><span>Supplier advance</span><strong>{balance.supplierAdvanceEnabled?money(balance.supplierAdvance):"Not configured"}</strong><small>{balance.supplierAdvanceEnabled?"From the project summary":"Supplier advance tracking disabled for this project"}</small></div>
            <div><span>Certified bill advance</span><strong>{money(balance.certifiedBillAdvance)}</strong><small>Paid more than certified</small></div>
            <div><span>Certified bill payable</span><strong>{money(balance.certifiedBillPayable)}</strong><small>Certified work not yet paid</small></div>
          </div>
          <div className="pmr-panel-toolbar">
            <div className="pmr-filter-group" role="group" aria-label="Party type">
              {(["all","Supplier","Contractor"] as const).map(value=><button type="button" key={value}
                aria-pressed={partyType===value} className={partyType===value?"is-active":""}
                onClick={()=>setPartyType(value)}>{value==="all"?"All parties":value+"s"}</button>)}
            </div>
            <input aria-label="Search supplier and contractor accounts" placeholder="Search parties…" value={partySearch} onChange={e=>setPartySearch(e.target.value)}/>
          </div>
          <div className="pmr-table-scroll"><table className="pmr-table pmr-party-table"><thead><tr>
            <th>Registered party</th><th className="pmr-amount">Certified</th><th className="pmr-amount">Paid</th><th className="pmr-amount">Advance</th><th className="pmr-amount">Due</th>
          </tr></thead><tbody>
            {parties.map(party=><tr key={party.id}>
              <td><strong>{party.name}</strong><small className="pmr-status-reason">{party.type} · {party.contracts} active {party.contracts===1?"contract":"contracts"}</small></td>
              <td className="pmr-amount">{money(party.certified)}</td><td className="pmr-amount">{money(party.paid)}</td>
              <td className="pmr-amount">{money(party.advance)}</td><td className="pmr-amount">{money(party.payable)}</td>
            </tr>)}
            {!parties.length&&<tr><td colSpan={5} className="pmr-table-empty">No parties in this view.</td></tr>}
          </tbody></table></div>
          <p className="pmr-panel-footnote">Certified work balances use saved contract calculations. They are not equivalent to supplier delivery advances or unbilled commitments. No new bill or payment is posted.</p>
        </section>

        <section className="pmr-panel pmr-issues" aria-labelledby="pmr-issues-heading">
          <div className="pmr-panel-head"><div><span className="pmr-overline">EXCEPTIONS</span><h3 id="pmr-issues-heading">Items to investigate</h3><p>{issues.length.toLocaleString("en-BD")} potential issues, including unregistered recipients and duplicate candidates.</p></div></div>
          <div className="pmr-issue-list">{topIssues.map(issue=><article key={issue.id} className={"pmr-issue pmr-issue-"+issue.severity}>
            <div><strong>{issue.title}</strong><span className="pmr-issue-severity">{issue.severity}</span></div>
            <p>{issue.description}</p>
            <div className="pmr-issue-bottom"><span>{money(issue.amount)}</span>
              {issue.entryId&&<Link href={openLedgerEntry(issue.entryId)}>Open entry →</Link>}</div>
          </article>)}
          {!topIssues.length&&<div className="pmr-issue-empty"><strong>No flags found by these rules</strong><p>Continue to check the underlying bills and ledger before approving accounts.</p></div>}</div>
          {issues.length>10&&<div className="pmr-show-more"><button type="button" onClick={()=>setShowMoreIssues(v=>!v)}>{showMoreIssues?"Show fewer":"Show all "+issues.length+" items"}</button></div>}
        </section>
      </div>

      <section className="pmr-panel pmr-audit" aria-labelledby="pmr-audit-heading">
        <div className="pmr-panel-head"><div><span className="pmr-overline">AUDIT HISTORY</span><h3 id="pmr-audit-heading">Recorded ledger changes</h3><p>Actual create, update, and delete records from LAND VIEW's existing audit log. Recent events only; no raw previous values are exposed.</p></div>
          <span className="pmr-chip">Read-only</span></div>
        {!canManage?<div className="pmr-empty-inline">Audit activity is available only to authorized managers and administrators.</div>:
          auditLoading?<div className="pmr-empty-inline">Loading recent audit events…</div>:
          auditError?<div className="pmr-empty-inline" role="alert">{auditError}</div>:
          audit?<><div className="pmr-table-scroll"><table className="pmr-table pmr-audit-table"><thead><tr>
              <th>When</th><th>Action</th><th>Ledger entry</th><th>Changed fields</th><th>Actor</th><th className="pmr-amount">Recorded amount</th>
            </tr></thead><tbody>
              {audit.events.map(event=><tr key={event.id}>
                <td className="pmr-muted">{shortTime(event.date)}</td>
                <td><span className={"pmr-chip pmr-action-"+event.action.toLowerCase()}>{event.action}</span></td>
                <td><strong>{event.details||"Project ledger entry"}</strong><small className="pmr-muted">{event.category||"—"}</small></td>
                <td><span className="pmr-audit-fields">{event.changedFields.slice(0,7).join(", ")||"Metadata"}</span></td>
                <td>{event.actor}</td>
                <td className="pmr-amount">{money(event.debit>0?event.debit:event.credit)}</td>
              </tr>)}
              {!audit.events.length&&<tr><td colSpan={6} className="pmr-table-empty">No matching audit events in the recent scan window.</td></tr>}
            </tbody></table></div>
            <p className="pmr-panel-footnote">Showing up to 65 matching events from the most recent {audit.scanned} ledger audit records. Older events are not included; this is not the complete historical audit export.{audit.moreMatchingEvents?" Additional older matching events exist.":""}</p>
          </>:<div className="pmr-empty-inline">Audit history is unavailable.</div>}
      </section>

      <footer className="pmr-disclaimer"><strong>Data safety:</strong> Reconciliation V3 only reads project data and calculates diagnostics. To correct a transaction, open the existing Expense Ledger, verify its original details, and save using the current management workflow. No transaction is reassigned or deleted by this screen.</footer>
    </>}
  </main>;
}
