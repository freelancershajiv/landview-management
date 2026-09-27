"use client";

import { useEffect, useMemo, useState } from "react";

const money=(v:any)=>new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(Number(v||0));
const num=(v:any)=>{const n=Number(String(v??"").replace(/,/g,"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const dateText=(v:any)=>{const d=new Date(String(v||"").slice(0,10)+"T00:00:00");return Number.isNaN(d.getTime())?String(v||""):d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})};
const monthText=(v:string)=>{const d=new Date(v+"-01T00:00:00");return Number.isNaN(d.getTime())?v:d.toLocaleDateString("en-GB",{month:"long",year:"numeric"})};
const monthOf=(v:any)=>String(v||"").slice(0,7);

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
        <div className="rpt-screen-toolbar">
          <a href={"/projectmanagement?projectId="+encodeURIComponent(projectInfo.projectCode||project)}>← Project Management</a>
          <div>
            <button onClick={()=>void load(projectInfo.projectCode||project)}>↻ Refresh</button>
            <button className="primary" onClick={()=>window.print()}>Print / Save PDF</button>
          </div>
        </div>

        {error&&<div className="rpt-error">{error}</div>}

        <header className="rpt-header">
          <div>
            <div className="rpt-brand">LAND VIEW</div>
            <div className="rpt-brand-sub">Architects and Engineers</div>
            <h1>Project Finance Statement</h1>
            <p>Monthly bank-statement-style project ledger report</p>
          </div>
          <div className="rpt-ref">
            <span>STATEMENT PERIOD</span>
            <strong>{monthText(statement.selectedMonth)}</strong>
            <small>Generated {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</small>
          </div>
        </header>

        <section className="rpt-project-card">
          <div><span>PROJECT</span><strong>{projectInfo.projectCode||"—"}</strong></div>
          <div><span>PROJECT / CLIENT</span><strong>{projectInfo.projectName||"—"}</strong></div>
          <div><span>LOCATION</span><strong>{projectInfo.location||"Not recorded"}</strong></div>
          <div><span>STATUS</span><strong>{projectInfo.status||"Active"}</strong></div>
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
            <div><span>ACCOUNT ACTIVITY</span><strong>{monthText(statement.selectedMonth)}</strong></div>
            <div><span>{period.length.toLocaleString("en-BD")} transactions</span></div>
          </div>
          <div className="rpt-table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Details</th><th>Supplier</th><th>Category</th><th className="num">Deposit</th><th className="num">Expense</th><th className="num">Balance</th></tr></thead>
              <tbody>
                {period.map((r:any)=><tr key={r.id}><td>{dateText(r.entry_date)}</td><td><strong>{r.details||"—"}</strong>{r.memo&&<small>{r.memo}</small>}</td><td>{r.supplier||"—"}</td><td>{r.category||"—"}</td><td className="num deposit">{num(r.debit)>0?money(r.debit):"—"}</td><td className="num expense">{num(r.credit)>0?money(r.credit):"—"}</td><td className="num balance">{money(r.balance)}</td></tr>)}
                {!period.length&&<tr><td colSpan={7} className="empty">No ledger transactions were recorded in this month.</td></tr>}
              </tbody>
              <tfoot><tr><td colSpan={4}>MONTH TOTAL</td><td className="num deposit">{money(statement.deposits)}</td><td className="num expense">{money(statement.expenses)}</td><td className="num balance">{money(statement.closing)}</td></tr></tfoot>
            </table>
          </div>
        </section>

        <section className="rpt-closing">
          <div><span>Statement Reconciliation</span><strong>Opening + Deposits − Expenses = Closing</strong></div>
          <div className="formula">{money(statement.opening)} <b>+</b> {money(statement.deposits)} <b>−</b> {money(statement.expenses)} <b>=</b> <strong>{money(statement.closing)}</strong></div>
        </section>

        <footer className="rpt-footer">
          <div><strong>LAND VIEW Architects and Engineers</strong><br/>Project Finance Statement · {projectInfo.projectCode||"—"} · {monthText(statement.selectedMonth)}</div>
          <div>This report is generated from the Project Management ledger. Supplier Advance and Cheque on Hold are maintained separately as reconciliation adjustments.</div>
        </footer>
      </div>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
.rpt-page{min-height:100vh;background:#f3f6f5;color:#1c2930;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:26px 24px 60px}
.rpt-shell{max-width:1420px;margin:0 auto}
.rpt-loading{min-height:100vh;display:grid;place-items:center;background:#f3f6f5;color:#1c2930;font-family:Inter,system-ui,sans-serif}.rpt-loading>div{display:flex;flex-direction:column;align-items:center;gap:8px}.rpt-loading span{font-size:12px;color:#839097}.rpt-spinner{width:30px;height:30px;border:3px solid #dfe7e4;border-top-color:#1d6b52;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:8px}@keyframes spin{to{transform:rotate(360deg)}}
.rpt-screen-toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;gap:12px}.rpt-screen-toolbar>a{color:#44675a;text-decoration:none;font-size:12px;font-weight:800}.rpt-screen-toolbar>div{display:flex;gap:8px}.rpt-screen-toolbar button{border:1px solid #dbe4e1;background:#fff;color:#43535a;border-radius:10px;padding:10px 13px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.rpt-screen-toolbar button.primary{background:#1d6b52;color:#fff;border-color:#1d6b52}
.rpt-header{display:flex;justify-content:space-between;gap:30px;background:#fff;border:1px solid #dfe7e5;border-radius:18px;padding:28px 30px 25px;box-shadow:0 14px 36px rgba(21,45,35,.05)}.rpt-brand{color:#1d6b52;font-weight:950;letter-spacing:.15em;font-size:18px}.rpt-brand-sub{font-size:10px;color:#82918b;margin-top:3px}.rpt-header h1{margin:17px 0 4px;font-size:31px;letter-spacing:-.035em}.rpt-header p{margin:0;color:#7e8b91;font-size:12px}.rpt-ref{text-align:right;min-width:220px}.rpt-ref span,.rpt-project-card span,.rpt-controls span,.rpt-summary-grid span,.rpt-reconciliation span,.rpt-statement-head span{display:block;color:#8c989d;font-size:9px;letter-spacing:.12em;font-weight:900}.rpt-ref strong{display:block;margin-top:7px;font-size:18px}.rpt-ref small{display:block;color:#9aa5aa;margin-top:5px;font-size:10px}
.rpt-project-card{display:grid;grid-template-columns:1fr 2fr 1.2fr .7fr;gap:0;margin-top:13px;background:#fff;border:1px solid #dfe7e5;border-radius:14px;overflow:hidden}.rpt-project-card>div{padding:15px 17px;border-right:1px solid #edf0f1}.rpt-project-card>div:last-child{border-right:0}.rpt-project-card strong{display:block;margin-top:5px;font-size:12px}
.rpt-controls{display:grid;grid-template-columns:220px 250px 1fr;gap:12px;align-items:end;margin-top:13px;padding:13px 15px;background:#edf5f2;border:1px solid #d7e8e1;border-radius:13px}.rpt-controls label,.rpt-controls>div{display:block}.rpt-controls input,.rpt-controls select{width:100%;height:39px;border:1px solid #d5e1dd;border-radius:9px;background:#fff;padding:0 10px;margin-top:6px;font:inherit;font-size:12px;color:#2c3b41}.rpt-control-note{align-self:center;color:#6d7d77;font-size:11px;line-height:1.5;padding:0 4px 0 10px}
.rpt-summary-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:14px}.rpt-summary-grid>div{background:#fff;border:1px solid #dfe7e5;border-top:3px solid #1d6b52;border-radius:13px;padding:15px 15px 14px}.rpt-summary-grid>div:nth-child(2){border-top-color:#365f8a}.rpt-summary-grid>div:nth-child(3){border-top-color:#a35d5d}.rpt-summary-grid>div:nth-child(4){border-top-color:#7a7f86}.rpt-summary-grid>div:nth-child(5){border-top-color:#8a6b31}.rpt-summary-grid span{color:#7d898e;font-size:10px;letter-spacing:.02em}.rpt-summary-grid strong{display:block;margin-top:9px;font-size:21px;letter-spacing:-.035em}.rpt-summary-grid small{display:block;color:#9aa4a8;font-size:9px;margin-top:6px}.deposit{color:#365f8a}.expense{color:#a45a5a}.closing{color:#1d6b52}
.rpt-reconciliation{display:flex;justify-content:space-between;gap:20px;margin-top:14px;padding:15px 17px;background:#fffdf8;border:1px solid #ebe2c9;border-radius:13px}.rpt-reconciliation>div:first-child{max-width:620px}.rpt-reconciliation strong{display:block;margin-top:5px;font-size:13px}.rpt-reconciliation p{margin:7px 0 0;color:#8c8572;font-size:10px;line-height:1.55}.rpt-recon-values{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:18px}.rpt-recon-values>div{padding-left:18px;border-left:1px solid #e7ddc2}.rpt-recon-values strong{font-size:14px;color:#594d2f}
.rpt-statement{margin-top:14px;background:#fff;border:1px solid #dfe7e5;border-radius:16px;overflow:hidden;box-shadow:0 14px 34px rgba(21,45,35,.045)}.rpt-statement-head{display:flex;justify-content:space-between;align-items:flex-end;padding:17px 18px 13px;border-bottom:1px solid #edf0f1}.rpt-statement-head strong{display:block;margin-top:4px;font-size:19px}.rpt-statement-head>div:last-child{color:#7f8c92;font-size:10px}.rpt-table-wrap{overflow:auto}.rpt-statement table{width:100%;min-width:1050px;border-collapse:collapse;font-size:11px}.rpt-statement th{background:#f7f9f8;border-bottom:1px solid #e5ebea;padding:11px 12px;text-align:left;color:#849097;font-size:8px;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}.rpt-statement td{padding:10px 12px;border-bottom:1px solid #eef2f1;vertical-align:top;color:#536168}.rpt-statement td strong{display:block;color:#2d3c43;font-size:11px}.rpt-statement td small{display:block;color:#a0a9ac;font-size:9px;margin-top:3px;max-width:340px}.rpt-statement td.num,.rpt-statement th.num{text-align:right;white-space:nowrap}.rpt-statement td.balance{font-weight:800;color:#33464c}.rpt-statement tfoot td{background:#fafcfc;border-top:2px solid #dfe7e5;border-bottom:0;font-weight:900;color:#47575e;padding-top:12px;padding-bottom:12px}.empty{text-align:center!important;color:#929ea2!important;padding:45px!important}
.rpt-closing{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-top:13px;padding:13px 16px;background:#17242b;color:#fff;border-radius:12px}.rpt-closing span{font-size:9px;letter-spacing:.1em;color:#aab6ba}.rpt-closing strong{display:block;margin-top:3px;font-size:12px}.rpt-closing .formula{font-size:11px;white-space:nowrap}.rpt-closing .formula b{padding:0 6px;color:#a6c8b9}
.rpt-footer{display:flex;justify-content:space-between;gap:30px;margin-top:17px;color:#8d999e;font-size:9px;line-height:1.55}.rpt-footer strong{color:#55656a}.rpt-error{margin-bottom:12px;padding:11px 14px;background:#fff0ee;color:#a4473d;border:1px solid #f1d2ce;border-radius:10px;font-size:11px}
.rpt-chooser{max-width:900px;margin:40px auto;background:#fff;border:1px solid #dfe7e5;border-radius:18px;padding:30px;box-shadow:0 18px 48px rgba(21,45,35,.06)}.rpt-kicker{font-size:10px;letter-spacing:.14em;font-weight:900;color:#1d6b52}.rpt-chooser h1{margin:10px 0 7px;font-size:34px;letter-spacing:-.04em}.rpt-chooser>p{margin:0;color:#7c898f;font-size:12px}.rpt-projects{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:22px}.rpt-projects button{text-align:left;background:#fafcfc;border:1px solid #e2e9e7;border-radius:13px;padding:15px;cursor:pointer}.rpt-projects button:hover{border-color:#74a48f;background:#fff;box-shadow:0 10px 24px rgba(29,107,82,.08)}.rpt-projects b{display:block;font-size:10px;letter-spacing:.1em;color:#1d6b52}.rpt-projects strong{display:block;margin-top:5px;font-size:16px;color:#28363d}.rpt-projects span{display:block;color:#89959a;font-size:10px;margin-top:5px}.rpt-projects em{display:block;margin-top:11px;padding-top:10px;border-top:1px solid #edf1ef;color:#35735f;font-size:10px;font-style:normal;font-weight:850}
@media(max-width:1150px){.rpt-summary-grid{grid-template-columns:repeat(3,1fr)}.rpt-project-card{grid-template-columns:1fr 1.6fr 1fr 1fr}.rpt-reconciliation{flex-direction:column}.rpt-recon-values{grid-template-columns:repeat(3,1fr)}}
@media(max-width:760px){.rpt-page{padding:14px 10px 45px}.rpt-screen-toolbar,.rpt-header,.rpt-reconciliation,.rpt-closing,.rpt-footer{flex-direction:column;align-items:stretch}.rpt-screen-toolbar>div{width:100%}.rpt-screen-toolbar button{flex:1}.rpt-header{padding:20px}.rpt-ref{text-align:left;min-width:0;margin-top:5px}.rpt-project-card{grid-template-columns:1fr 1fr}.rpt-project-card>div:nth-child(2){border-right:0}.rpt-project-card>div:nth-child(-n+2){border-bottom:1px solid #edf0f1}.rpt-controls{grid-template-columns:1fr}.rpt-recon-values{grid-template-columns:1fr}.rpt-recon-values>div{border-left:0;border-top:1px solid #e7ddc2;padding:10px 0 0}.rpt-summary-grid{grid-template-columns:1fr 1fr}.rpt-closing .formula{white-space:normal}.rpt-projects{grid-template-columns:1fr}.rpt-footer{gap:8px}}
@media print{
  @page{size:A4 landscape;margin:9mm}
  .no-print,.rpt-screen-toolbar{display:none!important}
  .rpt-page{background:#fff;padding:0}
  .rpt-shell{max-width:none}
  .rpt-header,.rpt-project-card,.rpt-summary-grid>div,.rpt-reconciliation,.rpt-statement{box-shadow:none}
  .rpt-statement{break-inside:auto}
  .rpt-statement thead{display:table-header-group}
  .rpt-statement tr{break-inside:avoid}
  .rpt-table-wrap{overflow:visible}
  .rpt-statement table{min-width:0;font-size:9px}
  .rpt-statement th{font-size:7px;padding:7px 6px}
  .rpt-statement td{padding:7px 6px}
  .rpt-statement td strong{font-size:9px}
  .rpt-statement td small{font-size:7px}
  .rpt-summary-grid{gap:6px}.rpt-summary-grid>div{padding:9px}
  .rpt-summary-grid strong{font-size:14px}
  .rpt-project-card>div{padding:9px}
  .rpt-reconciliation{padding:9px}
  .rpt-footer{margin-top:8px}
}
`;
