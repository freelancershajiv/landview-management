"use client";

import { useEffect, useMemo, useState } from "react";

const CATEGORIES = ["Cash","Cheque","Bank Transfer","Scrap Selling","Bricks","Masonry","R.C.C Masonry","Finishing Masonry","Stone","Stone & Sand","Cement","Steel","Cement & Steel","Syleth Sand","Normal Sand","Filling Sand","Filling Soil","Security Salary","Security","Electric Contractor","Electrical Materials","Electrical Material","Plumbing Contractor","Plumbing Materials","Plumbing Material","Tiles","Doors & Wood","Door","SS Grills & Works","Grills","Land View","Other Expenses"];
const INCOME_CATEGORIES = ["Cash","Cheque","Bank Transfer","Scrap Selling"];

const money=(v:any)=>new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(Number(v||0));
const compactMoney=(v:any)=>new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",notation:"compact",maximumFractionDigits:1}).format(Number(v||0));
const num=(v:any)=>{const n=Number(String(v??"").replace(/,/g,"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const dateText=(v:any)=>{const d=new Date(String(v||"").slice(0,10)+"T00:00:00");return Number.isNaN(d.getTime())?String(v||""):d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})};
const blank=(type:"income"|"expense"="expense")=>({entryDate:new Date().toISOString().slice(0,10),supplier:"",details:"",sft:"",rate:"",debit:"",credit:"",category:type==="income"?"Cash":"Other Expenses",memo:""});

export default function ProjectManagementPage(){
  const [data,setData]=useState<any>(null),[project,setProject]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [ledgerView,setLedgerView]=useState("all"),[ledgerCategory,setLedgerCategory]=useState("all"),[search,setSearch]=useState(""),[masterOpen,setMasterOpen]=useState(false),[masterSearch,setMasterSearch]=useState(""),[pullCategory,setPullCategory]=useState("Other Expenses"),[pulling,setPulling]=useState("");
  const [form,setForm]=useState<any>(blank()),[editing,setEditing]=useState<any>(null),[entryType,setEntryType]=useState<"income"|"expense">("expense"),[formOpen,setFormOpen]=useState(false),[saving,setSaving]=useState(false);
  const [summaryOpen,setSummaryOpen]=useState(false),[summarySaving,setSummarySaving]=useState(false),[summaryForm,setSummaryForm]=useState({supplierAdvance:"0",chequeOnHold:"0",notes:""});

  async function load(code=project){
    setLoading(true);setError("");
    try{
      const r=await fetch(code?"/api/project-management?projectId="+encodeURIComponent(code):"/api/project-management",{credentials:"same-origin",cache:"no-store"});
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not load Project Management.");
      setData(j.data);
      if(j.data?.selectedProject?.projectCode)setProject(j.data.selectedProject.projectCode);
    }catch(e:any){setError(e?.message||"Could not load Project Management.");}
    finally{setLoading(false);}
  }

  useEffect(()=>{
    const queryProject=typeof window!=="undefined"
      ? new URLSearchParams(window.location.search).get("projectId") || ""
      : "";
    if(queryProject)setProject(queryProject);
    void load(queryProject);
  },[]);

  const admin=Boolean(data&&!data.readOnly);
  const entries=data?.entries||[];
  const categories:string[]=useMemo(()=>{
    const fromData=Array.isArray(data?.categories)
      ? data.categories.map((x:any)=>String(x?.category||"").trim()).filter(Boolean)
      : [];
    return Array.from(new Set(fromData.length?fromData:CATEGORIES));
  },[data]);

  const incomeCategories=useMemo(()=>categories.filter(c=>entries.some((r:any)=>String(r.category||"Other Expenses")===c&&num(r.debit)>0)),[entries,categories]);
  const incomeEntryCategories=INCOME_CATEGORIES;
  const expenseEntryCategories=categories.filter(c=>!INCOME_CATEGORIES.includes(c));
  const expenseCategories=useMemo(()=>categories.filter(c=>entries.some((r:any)=>String(r.category||"Other Expenses")===c&&num(r.credit)>0)),[entries,categories]);
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return entries
      .filter((r:any)=>{
        const matchesView=ledgerView==="all" || (ledgerView==="income" ? num(r.debit)>0 : num(r.credit)>0);
        const matchesCategory=ledgerCategory==="all" || String(r.category||"Other Expenses")===ledgerCategory;
        return matchesView && matchesCategory && (!q||[r.details,r.supplier,r.category,r.memo,r.entry_date].join(" ").toLowerCase().includes(q));
      })
      .slice()
      .sort((a:any,b:any)=>{
        const d=String(b.entry_date||"").localeCompare(String(a.entry_date||""));
        if(d)return d;
        return String(b.created_at||"").localeCompare(String(a.created_at||""));
      });
  },[entries,ledgerView,ledgerCategory,search]);

  const categoryTotals=useMemo(()=>{
    const x:any={};
    for(const c of categories){
      x[c]=entries
        .filter((r:any)=>String(r.category||"Other Expenses")===c)
        .reduce((s:number,r:any)=>s+num(r.credit)+num(r.debit),0);
    }
    return x;
  },[entries,categories]);

  const masterRows=useMemo(()=>{
    const q=masterSearch.trim().toLowerCase();
    return (data?.masterLedger||[]).filter((r:any)=>
      !q||[r.sourceCode,r.details,r.masterCategory,r.suggestedCategory,r.entryDate].join(" ").toLowerCase().includes(q)
    );
  },[data,masterSearch]);

  function chooseProject(code:string){
    const normalized=String(code||"").trim();
    if(!normalized)return;
    setProject(normalized);
    setLedgerView("all");
    setLedgerCategory("all");
    setSearch("");
    if(typeof window!=="undefined"){
      window.history.replaceState(null,"","/projectmanagement?projectId="+encodeURIComponent(normalized));
    }
    void load(normalized);
  }

  function openNew(type:"income"|"expense"="expense"){setEditing(null);setEntryType(type);setForm(blank(type));setFormOpen(true);}
  function openEdit(r:any){
    setEditing(r);
    setEntryType(num(r.debit)>0 ? "income" : "expense");
    setForm({
      entryDate:String(r.entry_date||"").slice(0,10),
      supplier:r.supplier||"",
      details:r.details||"",
      sft:r.sft||"",
      rate:r.rate||"",
      debit:r.debit||"",
      credit:r.credit||"",
      category:r.category||"Other Expenses",
      memo:r.memo||""
    });
    setFormOpen(true);
  }

  async function save(){
    if(!data?.selectedProject)return;
    setSaving(true);setError("");
    try{
      const body={
        projectId:data.selectedProject.projectCode,
        entryDate:form.entryDate,
        supplier:form.supplier,
        details:form.details,
        sft:num(form.sft),
        rate:num(form.rate),
        debit:num(form.debit),
        credit:num(form.credit),
        category:form.category,
        memo:form.memo
      };
      if(!form.details.trim())throw new Error("Details are required.");
      if((body.debit>0)===(body.credit>0))throw new Error("Enter either Debit or Credit.");
      const r=await fetch("/api/project-management",{
        method:editing?"PUT":"POST",
        credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(editing?{...body,id:editing.id}:body)
      });
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not save entry.");
      setFormOpen(false);setEditing(null);setMessage(editing ? (entryType==="income" ? "Income updated." : "Expense updated.") : (entryType==="income" ? "Income added." : "Expense added."));
      await load(data.selectedProject.projectCode);
    }catch(e:any){setError(e?.message||"Could not save entry.");}
    finally{setSaving(false);}
  }

  async function remove(r:any){
    if(!confirm("Delete this entry?\n\n"+r.details))return;
    try{
      const x=await fetch("/api/project-management?id="+encodeURIComponent(r.id),{method:"DELETE",credentials:"same-origin"});
      const j=await x.json();
      if(!x.ok||!j?.success)throw new Error(j?.error||"Could not delete entry.");
      setMessage("Entry deleted.");
      await load(data?.selectedProject?.projectCode||project);
    }catch(e:any){setError(e?.message||"Could not delete entry.");}
  }

  async function pull(r:any){
    const id=r.sourceType+":"+r.sourceId;
    setPulling(id);setError("");
    try{
      const x=await fetch("/api/project-management",{
        method:"POST",
        credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action:"pullMaster",
          projectId:data?.selectedProject?.projectCode,
          sourceType:r.sourceType,
          sourceId:r.sourceId,
          category:pullCategory
        })
      });
      const j=await x.json();
      if(!x.ok||!j?.success)throw new Error(j?.error||"Could not pull master ledger entry.");
      setMessage("Pulled "+r.sourceCode+" into "+pullCategory+".");
      await load(data?.selectedProject?.projectCode||project);
    }catch(e:any){setError(e?.message||"Could not pull master ledger entry.");}
    finally{setPulling("");}
  }

  function openSummaryEdit(){
    setSummaryForm({
      supplierAdvance:String(data?.summary?.supplierAdvance||0),
      chequeOnHold:String(data?.summary?.chequeOnHold||0),
      notes:String(data?.summary?.notes||"")
    });
    setSummaryOpen(true);
  }

  async function saveSummary(){
    if(!data?.selectedProject)return;
    setSummarySaving(true);setError("");
    try{
      const r=await fetch("/api/project-management",{
        method:"POST",
        credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action:"updateSummary",
          projectId:data.selectedProject.projectCode,
          supplierAdvance:num(summaryForm.supplierAdvance),
          chequeOnHold:num(summaryForm.chequeOnHold),
          notes:summaryForm.notes
        })
      });
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not update project financial summary.");
      setSummaryOpen(false);
      setMessage("Project financial summary updated.");
      await load(data.selectedProject.projectCode);
    }catch(e:any){setError(e?.message||"Could not update project financial summary.");}
    finally{setSummarySaving(false);}
  }

  if(loading&&!data){
    return (
      <main className="pm-loading">
        <div className="pm-loading-card">
          <div className="pm-spinner"/>
          <strong>Loading Project Management</strong>
          <span>Preparing the project ledger…</span>
        </div>
        <style jsx>{`
          .pm-loading{min-height:100vh;display:grid;place-items:center;background:#f4f6f8;color:#17212b;font-family:Inter,Arial,sans-serif}
          .pm-loading-card{display:flex;flex-direction:column;align-items:center;gap:8px;padding:32px 42px;border:1px solid #e5e9ee;border-radius:22px;background:#fff;box-shadow:0 18px 50px rgba(15,23,42,.08)}
          .pm-loading-card span{color:#7b8794;font-size:13px}
          .pm-spinner{width:28px;height:28px;border-radius:50%;border:3px solid #e7ebef;border-top-color:#1d6b52;animation:spin .8s linear infinite;margin-bottom:7px}
          @keyframes spin{to{transform:rotate(360deg)}}
        `}</style>
      </main>
    );
  }

  const totalDebit=num(data?.totals?.debit);
  const totalCredit=num(data?.totals?.credit);
  const balance=num(data?.totals?.balance);
  const currentTitle = ledgerView==="income" ? (ledgerCategory==="all" ? "Income" : ledgerCategory) : ledgerView==="expense" ? (ledgerCategory==="all" ? "Expenses" : ledgerCategory) : "All Ledger Entries";
  const currentCount = filtered.length;

  if(data&&!data.selectedProject){
    const availableProjects=data.projects||[];
    return (
      <main className="pm-page">
        <div className="pm-shell pm-chooser-shell">
          <div className="pm-chooser">
            <div className="pm-chooser-kicker">LAND VIEW · PROJECT MANAGEMENT</div>
            <h1>Select a Project</h1>
            <p>Choose the project you want to manage. Project Management will open only after you select a project.</p>
            <div className="pm-project-options">
              {availableProjects.map((p:any)=>(
                <button key={p.id} className="pm-project-option" onClick={()=>chooseProject(p.projectCode)}>
                  <div className="pm-option-code">{p.projectCode}</div>
                  <div className="pm-option-name">{p.projectName}</div>
                  <div className="pm-option-meta">
                    <span>{p.clientName||"Client not recorded"}</span>
                    {p.location&&<><span>•</span><span>{p.location}</span></>}
                  </div>
                  <div className="pm-option-footer">
                    <span className={"pm-status-dot "+(String(p.status||"").toLowerCase()==="active"?"active":"configured")}></span>
                    <span>{p.status||"Configured for Project Management"}</span>
                    <span className="pm-option-open">Open →</span>
                  </div>
                </button>
              ))}
            </div>
            {error&&<div className="pm-alert pm-alert-error"><span>!</span><div>{error}</div><button onClick={()=>setError("")}>×</button></div>}
            {!availableProjects.length&&<div className="pm-no-projects">No projects are currently available for Project Management.</div>}
          </div>
        </div>
        <style jsx>{`
          .pm-chooser-shell{min-height:calc(100vh - 90px);display:grid;place-items:center}
          .pm-chooser{width:min(920px,100%);background:#fff;border:1px solid #e2e8ea;border-radius:22px;padding:34px;box-shadow:0 22px 60px rgba(20,38,29,.08)}
          .pm-chooser-kicker{font-size:10px;letter-spacing:.15em;font-weight:900;color:#1d6b52}
          .pm-chooser h1{margin:10px 0 8px;font-size:clamp(30px,4vw,42px);letter-spacing:-.04em;color:#17242b}
          .pm-chooser>p{margin:0;max-width:650px;color:#77858c;font-size:13px;line-height:1.65}
          .pm-project-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:24px}
          .pm-project-option{display:block;text-align:left;padding:18px;border:1px solid #dfe6e8;border-radius:16px;background:#fafcfc;color:#24333b;cursor:pointer;transition:.18s ease}
          .pm-project-option:hover{border-color:#6da38b;background:#fff;box-shadow:0 12px 28px rgba(29,107,82,.10);transform:translateY(-2px)}
          .pm-option-code{font-size:10px;letter-spacing:.12em;font-weight:900;color:#1d6b52}
          .pm-option-name{margin-top:7px;font-size:18px;font-weight:820;letter-spacing:-.02em}
          .pm-option-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:6px;color:#87939a;font-size:11px}
          .pm-option-footer{display:flex;align-items:center;gap:7px;margin-top:15px;padding-top:12px;border-top:1px solid #ebeff0;color:#738087;font-size:10px;font-weight:700}
          .pm-status-dot{width:7px;height:7px;border-radius:50%;background:#7f8d94}
          .pm-status-dot.active{background:#1d6b52}
          .pm-status-dot.configured{background:#a36a34}
          .pm-option-open{margin-left:auto;color:#1d6b52;font-weight:850}
          .pm-no-projects{margin-top:22px;padding:28px;border:1px dashed #d7dfe2;border-radius:14px;text-align:center;color:#8a969c;font-size:12px}
          @media(max-width:650px){.pm-chooser{padding:24px 18px}.pm-project-options{grid-template-columns:1fr}}
        `}
        </style>
      </main>
    );
  }

  return (
    <main className="pm-page">
      <div className="pm-shell">
        <header className="pm-topbar">
          <div>
            <div className="pm-eyebrow"><span className="pm-brand-dot"/> LAND VIEW <span>PROJECT MANAGEMENT</span></div>
            <div className="pm-title-row">
              <div>
                <h1>Project Ledger</h1>
                <p>Track construction costs by category, review the full ledger chronologically, and manage project expenses from one place.</p>
              </div>
              {data?.readOnly&&<span className="pm-readonly">VIEW ONLY</span>}
            </div>
          </div>
          <div className="pm-actions">
            <button className="pm-btn pm-btn-secondary" onClick={()=>window.location.assign("/projectmanagement/report?projectId="+encodeURIComponent(project||data?.selectedProject?.projectCode||""))}><span>▤</span> Monthly Report</button>
            <button className="pm-btn pm-btn-secondary" onClick={()=>void load(project)}><span>↻</span> Refresh</button>
            {admin&&<button className="pm-btn pm-btn-income" onClick={()=>openNew("income")}><span>＋</span> Add Income</button>}
            {admin&&<button className="pm-btn pm-btn-primary" onClick={()=>openNew("expense")}><span>＋</span> Add Expense</button>}
            {admin&&<button className="pm-btn pm-btn-dark" onClick={()=>setMasterOpen(true)}><span>⇩</span> Master Ledger</button>}
          </div>
        </header>

        {error&&<div className="pm-alert pm-alert-error"><span>!</span><div>{error}</div><button onClick={()=>setError("")}>×</button></div>}
        {message&&<div className="pm-alert pm-alert-success"><span>✓</span><div>{message}</div><button onClick={()=>setMessage("")}>×</button></div>}

        <section className="pm-project-card">
          <div className="pm-project-select">
            <span className="pm-label">SELECT PROJECT</span>
            <select
              value={data?.selectedProject?.projectCode||project}
              onChange={e=>chooseProject(e.target.value)}
            >
              {(data?.projects||[]).map((p:any)=>
                <option key={p.id} value={p.projectCode}>{p.projectCode+" — "+(p.clientName||p.projectName)}</option>
              )}
            </select>
          </div>
          <div className="pm-project-info">
            <div className="pm-project-code">{data?.selectedProject?.projectCode||"—"}</div>
            <div className="pm-project-name">{data?.selectedProject?.projectName||"Select a project"}</div>
            <div className="pm-project-meta">
              <span>{data?.selectedProject?.location||"Location not recorded"}</span>
              <span>•</span>
              <span>{data?.selectedProject?.status||"Active"}</span>
            </div>
          </div>
          <div className="pm-project-date">
            <span>LEDGER STATUS</span>
            <strong>{entries.length.toLocaleString("en-BD")} entries</strong>
            <small>Chronological order enabled</small>
          </div>
        </section>

        <section className="pm-finance-summary">
          <div className="pm-finance-summary-head">
            <div>
              <span className="pm-label">PROJECT FINANCIAL SUMMARY</span>
              <strong>Fund position</strong>
              <small>Deposit and recognized expenses come from the ledger. Supplier advance and cheque on hold are tracked separately.</small>
            </div>
            {admin&&<button className="pm-summary-edit" onClick={openSummaryEdit}>✎ Edit Adjustments</button>}
          </div>
          <div className="pm-stats">
            <div className="pm-stat pm-stat-debit">
              <div className="pm-stat-head"><span>Total Deposit</span><b>↗</b></div>
              <strong>{money(totalDebit)}</strong>
              <small>Total project funds recorded as debit</small>
            </div>
            <div className="pm-stat pm-stat-credit">
              <div className="pm-stat-head"><span>Total Expense</span><b>↙</b></div>
              <strong>{money(totalCredit)}</strong>
              <small>Recognized / received project expense</small>
            </div>
            <div className="pm-stat pm-stat-advance">
              <div className="pm-stat-head"><span>Supplier Advance</span><b>⌁</b></div>
              <strong>{money(data?.summary?.supplierAdvance)}</strong>
              <small>Outstanding supplier prepayment</small>
            </div>
            <div className="pm-stat pm-stat-hold">
              <div className="pm-stat-head"><span>Cheque on Hold</span><b>◷</b></div>
              <strong>{money(data?.summary?.chequeOnHold)}</strong>
              <small>Committed but not treated as expense</small>
            </div>
            <div className="pm-stat pm-stat-balance pm-stat-shajiv">
              <div className="pm-stat-head"><span>Eng Shajiv Balance</span><b>＝</b></div>
              <strong>{money(data?.summary?.engShajivBalance)}</strong>
              <small>Deposit − Expense − Advance − Hold</small>
            </div>
          </div>
          <div className="pm-finance-foot">
            <span>Formula: <strong>Total Deposit − Total Expense − Supplier Advance − Cheque on Hold</strong></span>
            <span>{entries.length.toLocaleString("en-BD")} ledger entries</span>
          </div>
        </section>

        <section className="pm-workspace">
          <div className="pm-category-bar">
            <div className="pm-category-title">
              <span className="pm-label">LEDGER VIEW</span>
              <strong>Choose income or expense</strong>
            </div>
            <div className="pm-ledger-selects">
              <label className={"pm-ledger-dropdown pm-income-dropdown "+(ledgerView==="income"?"is-open":"")}>
                <span className="pm-ledger-icon">↗</span>
                <span className="pm-ledger-copy"><small>INCOME</small><strong>Income</strong></span>
                <select value={ledgerView==="income"?ledgerCategory:""} onChange={e=>{setLedgerView("income");setLedgerCategory(e.target.value)}}>
                  <option value="" disabled>Income</option>
                  <option value="all">All Income</option>
                  {incomeCategories.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className={"pm-ledger-dropdown pm-expense-dropdown "+(ledgerView==="expense"?"is-open":"")}>
                <span className="pm-ledger-icon">↙</span>
                <span className="pm-ledger-copy"><small>EXPENSE</small><strong>Expense</strong></span>
                <select value={ledgerView==="expense"?ledgerCategory:""} onChange={e=>{setLedgerView("expense");setLedgerCategory(e.target.value)}}>
                  <option value="" disabled>Expense</option>
                  <option value="all">All Expenses</option>
                  {expenseCategories.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <button className={"pm-all-ledger "+(ledgerView==="all"?"is-active":"")} onClick={()=>{setLedgerView("all");setLedgerCategory("all")}}>
                <span>All Entries</span><b>{entries.length.toLocaleString("en-BD")}</b>
              </button>
            </div>
          </div>

          <div className="pm-toolbar">
            <div>
              <div className="pm-view-title">{currentTitle}</div>
              <div className="pm-view-sub">{currentCount.toLocaleString("en-BD")} records · sorted by date ascending</div>
            </div>
            <div className="pm-toolbar-right">
              {ledgerCategory!=="all"&&<span className="pm-total-pill">Category total {money(categoryTotals[ledgerCategory]||0)}</span>}
              <div className="pm-search">
                <span>⌕</span>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search supplier, details, category…"/>
                {search&&<button onClick={()=>setSearch("")}>×</button>}
              </div>
            </div>
          </div>

          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th className="wide-col">Details</th>
                  <th>Category</th>
                  <th className="num-col">Qty / SFT</th>
                  <th className="num-col">Rate</th>
                  <th className="num-col">Debit</th>
                  <th className="num-col">Credit</th>
                  <th className="num-col">Balance</th>
                  {admin&&<th className="action-col"/>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r:any)=>{
                  const isDebit=num(r.debit)>0;
                  return (
                    <tr key={r.id}>
                      <td><span className="pm-date">{dateText(r.entry_date)}</span></td>
                      <td><span className="pm-supplier">{r.supplier||"—"}</span></td>
                      <td className="wide-col">
                        <div className="pm-detail">{r.details}</div>
                        {r.memo&&String(r.memo).startsWith("MASTER_LEDGER:")&&<span className="pm-source-tag">Master Ledger</span>}
                        {r.memo&&!String(r.memo).startsWith("MASTER_LEDGER:")&&<div className="pm-memo">{String(r.memo)}</div>}
                      </td>
                      <td><span className="pm-category-tag">{r.category||"Other Expenses"}</span></td>
                      <td className="num-col">{r.sft||"—"}</td>
                      <td className="num-col">{r.rate?money(r.rate):"—"}</td>
                      <td className={"num-col "+(isDebit?"pm-money-debit":"pm-muted")}>{r.debit?money(r.debit):"—"}</td>
                      <td className={"num-col "+(!isDebit&&num(r.credit)>0?"pm-money-credit":"pm-muted")}>{r.credit?money(r.credit):"—"}</td>
                      <td className="num-col pm-balance">{money(r.balance)}</td>
                      {admin&&<td className="action-col">
                        <div className="pm-row-actions">
                          <button className="pm-icon-btn" title="Edit" onClick={()=>openEdit(r)}>✎</button>
                          <button className="pm-icon-btn pm-danger" title="Delete" onClick={()=>void remove(r)}>⌫</button>
                        </div>
                      </td>}
                    </tr>
                  );
                })}
                {!filtered.length&&
                  <tr><td colSpan={admin?10:9} className="pm-empty">
                    <div className="pm-empty-icon">⌕</div>
                    <strong>No entries found</strong>
                    <span>Try another search or select a different category.</span>
                  </td></tr>
                }
              </tbody>
            </table>
          </div>

          <div className="pm-table-footer">
            <span>Showing <strong>{filtered.length.toLocaleString("en-BD")}</strong> of <strong>{entries.length.toLocaleString("en-BD")}</strong> ledger entries</span>
            <span>Dates are displayed in ascending serial order</span>
          </div>
        </section>
      </div>

      {formOpen&&admin&&
        <div className="pm-modal-backdrop">
          <section className="pm-modal pm-entry-modal">
            <div className="pm-modal-head">
              <div>
                <span className="pm-label">{editing?"EDIT LEDGER ENTRY":"NEW LEDGER ENTRY"}</span>
                <h2>{editing ? (entryType==="income" ? "Edit Income" : "Edit Expense") : (entryType==="income" ? "Add Income" : "Add Expense")}</h2>
                <p>{entryType==="income" ? "Record project income by payment source or scrap selling." : "Record the project expense with its category, supplier, quantity and amount."}</p>
              </div>
              <button className="pm-close" onClick={()=>setFormOpen(false)}>×</button>
            </div>
            <div className="pm-form-grid">
              <label><span>Date</span><input type="date" value={form.entryDate} onChange={e=>setForm({...form,entryDate:e.target.value})}/></label>
              <label><span>Supplier</span><input value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})} placeholder="Supplier / contractor"/></label>
              <label><span>{entryType==="income" ? "Income Category" : "Expense Category"}</span><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{(entryType==="income" ? incomeEntryCategories : expenseEntryCategories).map(c=><option key={c}>{c}</option>)}</select></label>
              <label className="full"><span>Details</span><input value={form.details} onChange={e=>setForm({...form,details:e.target.value})} placeholder={entryType==="income" ? "Describe the income / deposit" : "Describe the expense"}/></label>
              <label><span>SFT / Qty</span><input value={form.sft} onChange={e=>setForm({...form,sft:e.target.value})} inputMode="decimal" placeholder="0.000"/></label>
              <label><span>Rate</span><input value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})} inputMode="decimal" placeholder="0.00"/></label>
              <label><span>Debit</span><input value={form.debit} onChange={e=>setForm({...form,debit:e.target.value,credit:e.target.value?"":form.credit})} inputMode="decimal" placeholder="0.00"/></label>
              <label><span>Credit / Expense</span><input value={form.credit} onChange={e=>setForm({...form,credit:e.target.value,debit:e.target.value?"":form.debit})} inputMode="decimal" placeholder="0.00"/></label>
              <label className="full"><span>Memo</span><input value={form.memo} onChange={e=>setForm({...form,memo:e.target.value})} placeholder="Optional note"/></label>
            </div>
            <div className="pm-modal-foot">
              <button className="pm-btn pm-btn-secondary" onClick={()=>setFormOpen(false)}>Cancel</button>
              <button className="pm-btn pm-btn-primary" onClick={()=>void save()} disabled={saving}>{saving?"Saving…":editing?"Update Entry":"Save Entry"}</button>
            </div>
          </section>
        </div>
      }

      {summaryOpen&&admin&&
        <div className="pm-modal-backdrop">
          <section className="pm-modal pm-entry-modal">
            <div className="pm-modal-head">
              <div>
                <span className="pm-label">PROJECT FINANCIAL SUMMARY</span>
                <h2>Edit Adjustments</h2>
                <p>These values are kept separate from the transaction ledger and affect Eng Shajiv Balance only.</p>
              </div>
              <button className="pm-close" onClick={()=>setSummaryOpen(false)}>×</button>
            </div>
            <div className="pm-form-grid">
              <label><span>Supplier Advance</span><input value={summaryForm.supplierAdvance} onChange={e=>setSummaryForm({...summaryForm,supplierAdvance:e.target.value})} inputMode="decimal" placeholder="0.00"/></label>
              <label><span>Cheque on Hold</span><input value={summaryForm.chequeOnHold} onChange={e=>setSummaryForm({...summaryForm,chequeOnHold:e.target.value})} inputMode="decimal" placeholder="0.00"/></label>
              <label className="full"><span>Notes</span><input value={summaryForm.notes} onChange={e=>setSummaryForm({...summaryForm,notes:e.target.value})} placeholder="Optional reconciliation note"/></label>
            </div>
            <div className="pm-modal-foot">
              <button className="pm-btn pm-btn-secondary" onClick={()=>setSummaryOpen(false)}>Cancel</button>
              <button className="pm-btn pm-btn-primary" onClick={()=>void saveSummary()} disabled={summarySaving}>{summarySaving?"Saving…":"Save Summary"}</button>
            </div>
          </section>
        </div>
      }

      {masterOpen&&admin&&
        <div className="pm-modal-backdrop">
          <section className="pm-modal pm-master-modal">
            <div className="pm-modal-head">
              <div>
                <span className="pm-label">MASTER LEDGER</span>
                <h2>Pull project expenses</h2>
                <p>Bring an existing master-ledger entry into this project and assign its category.</p>
              </div>
              <button className="pm-close" onClick={()=>setMasterOpen(false)}>×</button>
            </div>
            <div className="pm-master-toolbar">
              <div className="pm-search pm-search-large">
                <span>⌕</span>
                <input value={masterSearch} onChange={e=>setMasterSearch(e.target.value)} placeholder="Search master ledger…"/>
                {masterSearch&&<button onClick={()=>setMasterSearch("")}>×</button>}
              </div>
              <select value={pullCategory} onChange={e=>setPullCategory(e.target.value)}>
                {CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="pm-table-wrap pm-master-table">
              <table className="pm-table">
                <thead><tr><th>Date</th><th>Master Category</th><th className="wide-col">Details</th><th className="num-col">Amount</th><th>Suggested</th><th>Action</th></tr></thead>
                <tbody>
                  {masterRows.map((r:any)=>{
                    const id=r.sourceType+":"+r.sourceId;
                    return <tr key={id}>
                      <td><span className="pm-date">{dateText(r.entryDate)}</span></td>
                      <td><span className="pm-category-tag">{r.masterCategory||"—"}</span></td>
                      <td className="wide-col"><div className="pm-detail">{r.details}</div><span className="pm-memo">{r.sourceCode}</span></td>
                      <td className="num-col pm-money-credit">{money(r.amount)}</td>
                      <td>{r.suggestedCategory}</td>
                      <td>{r.pulled?<span className="pm-pulled">✓ Pulled</span>:<button className="pm-mini-btn" disabled={pulling===id} onClick={()=>void pull(r)}>{pulling===id?"Pulling…":"Pull"}</button>}</td>
                    </tr>;
                  })}
                  {!masterRows.length&&<tr><td colSpan={6} className="pm-empty"><div className="pm-empty-icon">⌕</div><strong>No master-ledger expense records found.</strong></td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      }

      <style jsx>{`
        .pm-page{min-height:100vh;background:#f3f6f5;color:#17232b;padding:30px 28px 60px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .pm-shell{max-width:1540px;margin:0 auto}
        .pm-topbar{display:flex;justify-content:space-between;gap:28px;align-items:flex-end;margin-bottom:22px}
        .pm-eyebrow{display:flex;align-items:center;gap:8px;color:#1d6b52;font-size:11px;letter-spacing:.15em;font-weight:850}
        .pm-eyebrow span:last-child{color:#82908b}
        .pm-brand-dot{width:8px;height:8px;border-radius:50%;background:#1d6b52;display:inline-block;box-shadow:0 0 0 5px rgba(29,107,82,.10)}
        .pm-title-row{display:flex;align-items:flex-start;gap:14px}
        .pm-title-row h1{font-size:clamp(30px,3.6vw,48px);line-height:1.02;letter-spacing:-.045em;margin:9px 0 8px;color:#142027}
        .pm-title-row p{max-width:780px;margin:0;color:#68767f;font-size:14px;line-height:1.65}
        .pm-readonly{margin-top:17px;padding:8px 11px;border-radius:999px;background:#e9edf0;color:#64717a;font-size:10px;font-weight:850;letter-spacing:.12em;white-space:nowrap}
        .pm-actions{display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end}
        .pm-btn,.pm-mini-btn,.pm-icon-btn,.pm-close,.pm-category{font:inherit;border:0;cursor:pointer;transition:.18s ease}
        .pm-btn{height:42px;padding:0 15px;border-radius:11px;font-size:13px;font-weight:780;display:inline-flex;align-items:center;gap:8px}
        .pm-btn-income{background:#d8f1e5;color:#14583f;border:1px solid #a9d8bf}.pm-btn-income:hover{background:#c7e9d8}.pm-btn-primary{background:#1d6b52;color:#fff;box-shadow:0 8px 18px rgba(29,107,82,.18)}
        .pm-btn-primary:hover{background:#175a45;transform:translateY(-1px)}
        .pm-btn-secondary{background:#fff;color:#243038;border:1px solid #dfe5e8}
        .pm-btn-secondary:hover{background:#f8fafb}
        .pm-btn-dark{background:#17242b;color:#fff}
        .pm-btn-dark:hover{background:#0f191f}
        .pm-alert{display:flex;align-items:center;gap:11px;padding:12px 15px;border-radius:12px;margin-bottom:12px;font-size:13px}
        .pm-alert>span{width:24px;height:24px;display:grid;place-items:center;border-radius:50%;font-weight:900}
        .pm-alert button{margin-left:auto;border:0;background:transparent;cursor:pointer;font-size:18px;color:inherit}
        .pm-alert-error{background:#fff0ee;color:#a53c32;border:1px solid #f3d3ce}
        .pm-alert-error>span{background:#f7d6d1}
        .pm-alert-success{background:#edf8f2;color:#206449;border:1px solid #d3ebdc}
        .pm-alert-success>span{background:#d5ecde}
        .pm-project-card{background:#fff;border:1px solid #e4e9ec;border-radius:18px;padding:18px 20px;display:grid;grid-template-columns:minmax(300px,1.2fr) 1.7fr .8fr;gap:22px;align-items:center;box-shadow:0 12px 34px rgba(20,38,29,.045);margin-bottom:16px}
        .pm-label{display:block;font-size:10px;letter-spacing:.12em;font-weight:850;color:#8a969c;margin-bottom:8px}
        .pm-project-select select,.pm-form-grid input,.pm-form-grid select,.pm-master-toolbar select{width:100%;border:1px solid #dfe6e9;background:#fbfcfc;color:#1e2b31;border-radius:10px;min-height:42px;padding:0 12px;outline:none;font:inherit;font-size:13px}
        .pm-project-select select:focus,.pm-form-grid input:focus,.pm-form-grid select:focus,.pm-master-toolbar select:focus{border-color:#79ad98;box-shadow:0 0 0 3px rgba(29,107,82,.08)}
        .pm-project-code{font-size:11px;font-weight:850;color:#1d6b52;letter-spacing:.10em}
        .pm-project-name{font-size:21px;font-weight:800;letter-spacing:-.02em;margin-top:3px}
        .pm-project-meta{display:flex;gap:8px;align-items:center;color:#7c8990;font-size:12px;margin-top:5px}
        .pm-project-date{justify-self:end;text-align:right;border-left:1px solid #edf0f2;padding-left:24px}
        .pm-project-date span{display:block;font-size:9px;letter-spacing:.12em;font-weight:850;color:#9aa5aa}
        .pm-project-date strong{display:block;font-size:19px;margin-top:4px}
        .pm-project-date small{display:block;color:#8d989d;font-size:11px;margin-top:3px}
        .pm-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
        .pm-stat{position:relative;overflow:hidden;background:#fff;border:1px solid #e4e9ec;border-radius:16px;padding:18px 19px;min-height:136px;box-shadow:0 10px 28px rgba(20,38,29,.035)}
        .pm-stat:after{content:"";position:absolute;width:90px;height:90px;border-radius:50%;right:-28px;bottom:-37px;background:rgba(29,107,82,.06)}
        .pm-stat-head{display:flex;justify-content:space-between;align-items:center;color:#7a868c;font-size:12px;font-weight:760}
        .pm-stat-head b{font-size:13px;color:#8da19a}
        .pm-stat>strong{display:block;font-size:27px;letter-spacing:-.04em;margin-top:12px;color:#18262d;position:relative;z-index:1}
        .pm-stat>small{display:block;color:#919ca2;font-size:11px;margin-top:7px}
        .pm-stat-debit{border-top:3px solid #365f8a}
        .pm-stat-credit{border-top:3px solid #1d6b52}
        .pm-stat-balance{border-top:3px solid #a36a34}
        .pm-stat-count{border-top:3px solid #5f6d77}
        .pm-finance-summary{background:#fff;border:1px solid #e1e7e9;border-radius:18px;overflow:hidden;box-shadow:0 12px 34px rgba(20,38,29,.04);margin-bottom:16px}
        .pm-finance-summary-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;padding:16px 18px;border-bottom:1px solid #edf0f2}
        .pm-finance-summary-head .pm-label{margin-bottom:5px}
        .pm-finance-summary-head strong{display:block;font-size:18px;color:#17242b;letter-spacing:-.02em}
        .pm-finance-summary-head small{display:block;max-width:760px;margin-top:5px;color:#8a969c;font-size:10px;line-height:1.5}
        .pm-summary-edit{border:1px solid #dce5e3;background:#f5faf8;color:#356a58;border-radius:9px;padding:9px 12px;font:inherit;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap}
        .pm-summary-edit:hover{background:#edf6f2}
        .pm-finance-summary .pm-stats{grid-template-columns:repeat(5,1fr);padding:14px;margin:0}
        .pm-stat-advance{border-top:3px solid #8a6b31}
        .pm-stat-hold{border-top:3px solid #86606b}
        .pm-stat-shajiv{border-top:3px solid #1d6b52}
        .pm-finance-foot{display:flex;justify-content:space-between;gap:14px;padding:10px 16px;background:#fafcfc;border-top:1px solid #edf0f2;color:#8c989e;font-size:10px}
        .pm-finance-foot strong{color:#59676d}
        .pm-workspace{background:#fff;border:1px solid #e1e7e9;border-radius:18px;overflow:hidden;box-shadow:0 14px 38px rgba(20,38,29,.045)}
        .pm-category-bar{border-bottom:1px solid #edf0f2;padding:15px 17px 10px}
        .pm-category-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
        .pm-category-title .pm-label{margin:0}
        .pm-category-title strong{font-size:13px;margin-left:auto;color:#5a676e}
        .pm-ledger-selects{display:grid;grid-template-columns:minmax(260px,1fr) minmax(260px,1fr) auto;gap:10px}
        .pm-ledger-dropdown{min-height:60px;display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #e1e7e9;border-radius:12px;background:#fafcfc}
        .pm-ledger-dropdown.is-open{border-color:#75a890;box-shadow:0 0 0 3px rgba(29,107,82,.07)}
        .pm-ledger-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:#edf5f2;color:#1d6b52;font-weight:900}
        .pm-ledger-copy{display:flex;flex-direction:column;gap:2px;min-width:68px}
        .pm-ledger-copy small{font-size:9px;letter-spacing:.10em;font-weight:850;color:#8b969c}
        .pm-ledger-copy strong{font-size:12px;color:#27353c}
        .pm-ledger-dropdown select{min-width:0;flex:1;height:38px;border:1px solid #e2e8ea;background:#fff;color:#26353d;outline:0;border-radius:8px;padding:0 9px;font:inherit;font-size:12px;font-weight:680}
        .pm-expense-dropdown .pm-ledger-icon{background:#eef3f8;color:#46698d}
        .pm-all-ledger{align-self:stretch;border:1px solid #dfe6e8;border-radius:12px;background:#fff;color:#5d6a71;padding:0 18px;cursor:pointer;font:inherit;font-size:12px;font-weight:760}
        .pm-all-ledger:hover{background:#f6f9f9}
        .pm-all-ledger.is-active{background:#17242b;color:#fff;border-color:#17242b}
        .pm-category-scroller{display:flex;gap:6px;overflow-x:auto;scrollbar-width:thin;padding-bottom:2px}
        .pm-category{flex:0 0 auto;background:#f5f7f8;color:#59656c;border:1px solid #e6ebed;border-radius:10px;padding:8px 10px;display:flex;gap:8px;align-items:center}
        .pm-category span{font-size:12px;font-weight:700}
        .pm-category b{font-size:10px;color:#87939a;background:#e8edef;border-radius:7px;padding:2px 5px}
        .pm-category:hover{background:#edf3f1}
        .pm-category.is-active{background:#1d6b52;color:#fff;border-color:#1d6b52;box-shadow:0 7px 15px rgba(29,107,82,.16)}
        .pm-category.is-active b{background:rgba(255,255,255,.16);color:#fff}
        .pm-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:17px 18px;border-bottom:1px solid #eef1f2}
        .pm-view-title{font-size:17px;font-weight:820;letter-spacing:-.02em}
        .pm-view-sub{color:#909ba1;font-size:11px;margin-top:4px}
        .pm-toolbar-right{display:flex;align-items:center;gap:9px}
        .pm-total-pill{padding:9px 11px;border:1px solid #e2e9e6;background:#f5faf8;color:#356a58;border-radius:9px;font-size:11px;font-weight:750}
        .pm-search{display:flex;align-items:center;gap:8px;background:#f7f9fa;border:1px solid #dfe6e8;border-radius:10px;min-width:330px;padding:0 10px}
        .pm-search>span{font-size:20px;color:#849198;line-height:1}
        .pm-search input{border:0;outline:0;background:transparent;min-height:40px;width:100%;font:inherit;font-size:12px;color:#1d2a31}
        .pm-search button{border:0;background:transparent;color:#7e8a90;cursor:pointer;font-size:16px}
        .pm-table-wrap{overflow:auto}
        .pm-table{width:100%;min-width:1160px;border-collapse:separate;border-spacing:0;font-size:12px}
        .pm-table th{position:sticky;top:0;z-index:2;background:#f8fafb;color:#819097;border-bottom:1px solid #e7ecee;padding:11px 12px;text-align:left;font-size:9px;letter-spacing:.10em;font-weight:850;text-transform:uppercase;white-space:nowrap}
        .pm-table td{padding:11px 12px;border-bottom:1px solid #f0f3f4;color:#38464e;vertical-align:middle;white-space:nowrap}
        .pm-table tbody tr:hover{background:#fafcfb}
        .pm-table tbody tr:last-child td{border-bottom:0}
        .pm-table .wide-col{white-space:normal;min-width:300px}
        .pm-table .num-col{text-align:right}
        .pm-table .action-col{width:78px;text-align:center}
        .pm-date{font-weight:740;color:#4f5e66}
        .pm-supplier{color:#66747b;font-weight:650}
        .pm-detail{font-weight:720;color:#26353d;line-height:1.38}
        .pm-memo{display:block;color:#9ba5a9;font-size:10px;margin-top:3px;max-width:390px;overflow:hidden;text-overflow:ellipsis}
        .pm-source-tag{display:inline-flex;margin-top:5px;padding:3px 7px;border-radius:999px;background:#edf5f2;color:#37735f;font-size:9px;font-weight:800}
        .pm-category-tag{display:inline-flex;max-width:185px;padding:5px 8px;background:#f3f6f5;border:1px solid #e5ebe8;border-radius:8px;color:#5b696f;font-size:10px;font-weight:760;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .pm-money-debit{color:#3b5f86;font-weight:780}
        .pm-money-credit{color:#1d6b52;font-weight:780}
        .pm-muted{color:#c0c8cb}
        .pm-balance{font-weight:800;color:#313f46}
        .pm-row-actions{display:flex;justify-content:center;gap:5px}
        .pm-icon-btn{width:29px;height:29px;border-radius:8px;background:#f2f5f5;color:#607078;border:1px solid #e4e9ea;font-size:12px}
        .pm-icon-btn:hover{background:#e7eeeb;color:#244f40}
        .pm-icon-btn.pm-danger:hover{background:#fff0ee;color:#a4483f}
        .pm-empty{padding:70px 20px!important;text-align:center!important;color:#89959b!important}
        .pm-empty-icon{margin:0 auto 10px;width:42px;height:42px;display:grid;place-items:center;border-radius:50%;background:#f2f5f5;color:#839197;font-size:22px}
        .pm-empty strong,.pm-empty span{display:block}
        .pm-empty strong{color:#59666d;font-size:13px}
        .pm-empty span{font-size:11px;margin-top:4px}
        .pm-table-footer{display:flex;justify-content:space-between;gap:12px;padding:11px 16px;background:#fafcfc;border-top:1px solid #edf0f2;color:#929da1;font-size:10px}
        .pm-table-footer strong{color:#5b676d}
        .pm-modal-backdrop{position:fixed;inset:0;background:rgba(12,25,21,.52);backdrop-filter:blur(5px);display:grid;place-items:center;padding:20px;z-index:100}
        .pm-modal{background:#fff;border:1px solid #dfe6e7;border-radius:20px;box-shadow:0 28px 80px rgba(13,28,23,.22);max-height:92vh;overflow:hidden}
        .pm-entry-modal{width:min(780px,100%)}
        .pm-master-modal{width:min(1160px,100%)}
        .pm-modal-head{display:flex;justify-content:space-between;gap:18px;padding:20px 21px;border-bottom:1px solid #edf0f2}
        .pm-modal-head h2{margin:0;font-size:24px;letter-spacing:-.03em}
        .pm-modal-head p{margin:5px 0 0;color:#8a969b;font-size:12px}
        .pm-close{width:34px;height:34px;border-radius:9px;background:#f4f6f7;color:#65727a;font-size:21px;line-height:1}
        .pm-close:hover{background:#e9eeee}
        .pm-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px;padding:20px 21px;overflow:auto}
        .pm-form-grid label{display:block}
        .pm-form-grid label span{display:block;font-size:10px;font-weight:800;color:#758289;margin-bottom:6px;letter-spacing:.03em}
        .pm-form-grid .full{grid-column:1/-1}
        .pm-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 21px;background:#fafcfc;border-top:1px solid #edf0f2}
        .pm-master-toolbar{display:flex;gap:10px;padding:14px 18px;border-bottom:1px solid #edf0f2}
        .pm-search-large{flex:1}
        .pm-master-toolbar select{width:230px}
        .pm-master-table{max-height:66vh}
        .pm-mini-btn{background:#1d6b52;color:#fff;border-radius:8px;padding:7px 10px;font-size:10px;font-weight:800}
        .pm-mini-btn:hover{background:#175a45}
        .pm-pulled{font-size:10px;font-weight:850;color:#2f725b}
        @media (max-width:1250px){
          .pm-finance-summary .pm-stats{grid-template-columns:repeat(3,1fr)}
        }
        @media (max-width:1100px){
          .pm-stats{grid-template-columns:repeat(2,1fr)}
          .pm-project-card{grid-template-columns:1fr 1fr}
          .pm-project-date{justify-self:start;border-left:0;padding-left:0}
          .pm-toolbar{align-items:flex-start;flex-direction:column}
          .pm-toolbar-right{width:100%}
          .pm-search{min-width:0;flex:1}
        }
        @media (max-width:760px){
          .pm-page{padding:18px 12px 45px}
          .pm-topbar{align-items:flex-start;flex-direction:column}
          .pm-actions{justify-content:flex-start;width:100%}
          .pm-actions .pm-btn{flex:1;justify-content:center}
          .pm-project-card{grid-template-columns:1fr;padding:15px}
          .pm-project-date{text-align:left}
          .pm-stats,.pm-finance-summary .pm-stats{grid-template-columns:1fr}
          .pm-stat>strong{font-size:24px}
          .pm-finance-summary-head{align-items:flex-start;flex-direction:column}
          .pm-finance-foot{flex-direction:column}
          .pm-category-title strong{display:none}
          .pm-ledger-selects{grid-template-columns:1fr}
          .pm-all-ledger{min-height:48px}
          .pm-toolbar-right{flex-direction:column;align-items:stretch}
          .pm-total-pill{display:inline-flex;justify-content:center}
          .pm-search{width:100%}
          .pm-form-grid{grid-template-columns:1fr}
          .pm-form-grid .full{grid-column:auto}
          .pm-master-toolbar{flex-direction:column}
          .pm-master-toolbar select{width:100%}
          .pm-table-footer{flex-direction:column}
        }
      `}</style>
    </main>
  );
}
