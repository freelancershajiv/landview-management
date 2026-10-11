"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./project-finance.module.css";

type TabKey = "overview" | "cash" | "suppliers" | "contractors";
type FinanceAction =
  | "cash_in"
  | "cash_out"
  | "supplier_funding"
  | "supplier_delivery"
  | "supplier_direct_purchase"
  | "supplier_refund"
  | "contractor_payment"
  | "contractor_bill"
  | "create_supplier"
  | "create_contractor";

type Project = { id:string; projectCode:string; projectName:string; clientName:string; location:string; lifecyclePhase:string };
type Totals = {
  projectFunding:number; openingCash:number; cashInSinceCutover:number; cashOutSinceCutover:number; availableCash:number;
  recognizedProjectCost:number; supplierAdvance:number; supplierPayable:number; contractorAdvance:number; contractorPayable:number;
  chequeOnHold:number; directSupplierFunding:number; contractorCertified:number;
};
type Entry = { id:string; serialNo:number; date:string; type:string; party:string; details:string; category:string; paymentMethod:string; referenceNo:string; cashIn:number; cashOut:number; projectCost:number; source:string; supplierMovementType:string; approvalStatus:string };
type Supplier = { id:string; name:string; category:string; unit:string; funded:number; projectCashPaid:number; deliveries:number; directPurchases:number; advanceApplied:number; cost:number; advance:number; payable:number; transactionCount:number };
type Contractor = { id:string; name:string; category:string; pricingType:string; contractValue:number; certified:number; paid:number; advance:number; payable:number; remainingContract:number; billCount:number; paymentCount:number };
type Workspace = { projects:Project[]; selectedProject:Project|null; totals:Totals|null; cutover?:{at:string|null;stored:boolean;openingCash:number}; entries:Entry[]; suppliers:Supplier[]; contractors:Contractor[]; readOnly:boolean };

type FormState = Record<string,string|boolean>;

const ACTIONS: Array<{action:FinanceAction; label:string; group:string}> = [
  {action:"cash_in",label:"Cash In",group:"Cash"},
  {action:"cash_out",label:"Cash Out",group:"Cash"},
  {action:"supplier_funding",label:"Supplier Payment / Funding",group:"Supplier"},
  {action:"supplier_delivery",label:"Material Delivery",group:"Supplier"},
  {action:"supplier_direct_purchase",label:"Direct Purchase",group:"Supplier"},
  {action:"contractor_payment",label:"Contractor Payment",group:"Contractor"},
  {action:"contractor_bill",label:"Certified Bill",group:"Contractor"},
];

function money(value:number|undefined|null) {
  return new Intl.NumberFormat("en-BD", { style:"currency", currency:"BDT", maximumFractionDigits:2 }).format(Number(value || 0));
}
function shortDate(value:string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric"}).format(date);
}
function today() { return new Date().toISOString().slice(0,10); }
function titleFor(action:FinanceAction) {
  return ACTIONS.find((x)=>x.action===action)?.label || (action==="create_supplier"?"Add Supplier":"Add Contractor");
}
function blankForm(action:FinanceAction):FormState {
  const base:FormState={date:today(),amount:"",details:"",category:"",paymentMethod:"cash",referenceNo:"",bankName:"",memo:""};
  if(action==="cash_in") return {...base,receivedFrom:"Mr. Mahi Bhai",heldBy:"Eng Shajiv"};
  if(action==="cash_out") return {...base,paidTo:""};
  if(action==="supplier_funding") return {...base,supplierId:"",fundingMode:"owner_direct",receivedFrom:"Mr. Mahi Bhai"};
  if(action==="supplier_delivery") return {...base,supplierId:"",quantity:"",rate:""};
  if(action==="supplier_direct_purchase") return {...base,supplierId:"",applyAdvance:true};
  if(action==="supplier_refund") return {...base,supplierId:""};
  if(action==="contractor_payment") return {...base,contractorId:""};
  if(action==="contractor_bill") return {...base,contractorId:"",quantity:"1",rate:"",deduction:""};
  if(action==="create_supplier") return {name:"",category:"",unit:"",memo:""};
  return {name:"",category:"",unit:"SFT",pricingType:"rate",quantity:"",rate:"",contractAmount:"",scope:"",memo:""};
}

export default function ProjectFinanceWorkspace() {
  const [workspace,setWorkspace]=useState<Workspace>({projects:[],selectedProject:null,totals:null,entries:[],suppliers:[],contractors:[],readOnly:true});
  const [projectCode,setProjectCode]=useState("");
  const [tab,setTab]=useState<TabKey>("overview");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [modal,setModal]=useState<FinanceAction|null>(null);
  const [form,setForm]=useState<FormState>({});
  const [saving,setSaving]=useState(false);
  const [success,setSuccess]=useState("");

  async function load(requested?:string) {
    setLoading(true); setError("");
    try {
      const query=requested?`?projectId=${encodeURIComponent(requested)}`:"";
      const response=await fetch(`/api/project-finance${query}`,{cache:"no-store"});
      const json=await response.json().catch(()=>null);
      if(!response.ok||!json?.success) throw new Error(json?.error||"Project Finance could not be loaded.");
      const data=json.data as Workspace;
      setWorkspace(data);
      if(!requested && data.projects.length) {
        const urlCode=new URL(window.location.href).searchParams.get("project");
        const preferred=data.projects.find((p)=>p.projectCode===urlCode)?.projectCode || data.projects.find((p)=>p.projectCode==="LV-157")?.projectCode || data.projects[0].projectCode;
        setProjectCode(preferred);
        await load(preferred);
        return;
      }
      if(requested) {
        setProjectCode(requested);
        const url=new URL(window.location.href); url.searchParams.set("project",requested); window.history.replaceState({},"",url.toString());
      }
    } catch(e) { setError(e instanceof Error?e.message:String(e)); }
    finally { setLoading(false); }
  }

  useEffect(()=>{ void load(); },[]);

  const totals=workspace.totals;
  const recent=workspace.entries.slice(0,12);
  const project=workspace.selectedProject;
  const costComposition=useMemo(()=>({
    suppliers:workspace.suppliers.reduce((s,x)=>s+x.cost,0),
    certified:workspace.contractors.reduce((s,x)=>s+x.certified,0),
  }),[workspace.suppliers,workspace.contractors]);

  function open(action:FinanceAction) { setSuccess(""); setError(""); setModal(action); setForm(blankForm(action)); }
  function close() { if(!saving) setModal(null); }
  function setField(name:string,value:string|boolean) { setForm((old)=>({...old,[name]:value})); }

  async function submit(event:FormEvent) {
    event.preventDefault(); if(!modal||!projectCode) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const response=await fetch("/api/project-finance",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:modal,projectId:projectCode,...form})});
      const json=await response.json().catch(()=>null);
      if(!response.ok||!json?.success) throw new Error(json?.error||"Transaction could not be saved.");
      setModal(null); setSuccess(`${titleFor(modal)} saved.`); await load(projectCode);
    } catch(e) { setError(e instanceof Error?e.message:String(e)); }
    finally { setSaving(false); }
  }

  return <div className={`pc-root ${styles.root}`}>
    <aside className={styles.sidebar}>
      <a className={styles.brand} href="/project-control"><span>LV</span><div><strong>PROJECT FINANCE</strong><small>LAND VIEW</small></div></a>
      <div className={styles.sideProject}><small>ACTIVE PROJECT</small><strong>{project?.projectCode || projectCode || "—"}</strong><span>{project?.projectName || "Select a project"}</span></div>
      <nav className={styles.nav}>
        {(["overview","cash","suppliers","contractors"] as TabKey[]).map((key,i)=><button key={key} className={tab===key?styles.active:""} onClick={()=>setTab(key)}><span>0{i+1}</span><strong>{key[0].toUpperCase()+key.slice(1)}</strong></button>)}
      </nav>
      <div className={styles.ruleCard}><small>CORE RULE</small><strong>Cash ≠ Cost</strong><p>A delivery or certified bill changes project cost and party balance without deducting cash twice.</p></div>
      <a className={styles.backLink} href="/project-control">← Project Control</a>
    </aside>

    <main className={styles.main}>
      <header className={styles.topbar}>
        <div><small>LAND VIEW / PROJECT CONTROL</small><strong>Project Finance</strong></div>
        <label className={styles.projectSelect}><span>PROJECT</span><select value={projectCode} onChange={(e)=>void load(e.target.value)} disabled={loading}>{workspace.projects.map((p)=><option key={p.id} value={p.projectCode}>{p.projectCode} · {p.projectName}</option>)}</select></label>
      </header>

      <section className={styles.hero}>
        <div><small>COMMERCIAL CONTROL</small><h1>{project?.projectCode || "Project Finance"}</h1><p>{project?.projectName || "Loading project workspace…"}</p></div>
        <div className={styles.heroMeta}><div><small>STAGE</small><strong>{project?.lifecyclePhase || "—"}</strong></div><div><small>CASH POSITION</small><strong className={(totals?.availableCash||0)<0?styles.negative:styles.positive}>{money(totals?.availableCash)}</strong></div></div>
      </section>

      <div className={styles.content}>
        {error?<div className={styles.error}>{error}</div>:null}
        {success?<div className={styles.success}>{success}</div>:null}
        {loading?<div className={styles.loading}>Loading Project Finance…</div>:null}
        {!loading && project && totals ? <>
          {!workspace.cutover?.stored?<div className={styles.bridge}><strong>Legacy bridge mode</strong><span>Historical data is preserved. Current cash is reconstructed from the verified legacy ledger until the Finance V2 opening balance is frozen.</span></div>:null}

          {tab==="overview"?<>
            <div className={styles.actionBar}>
              <div><small>ONE ENTRY → ALL EFFECTS</small><strong>Record the real-world event once</strong></div>
              {!workspace.readOnly?<div className={styles.actionButtons}>{ACTIONS.slice(0,4).map((x)=><button key={x.action} onClick={()=>open(x.action)}>+ {x.label}</button>)}</div>:null}
            </div>

            <section className={styles.metrics}>
              <Metric label="Available Cash" value={money(totals.availableCash)} hint={`Opening ${money(totals.openingCash)}`} tone={totals.availableCash<0?"warn":"good"}/>
              <Metric label="Project Funding" value={money(totals.projectFunding)} hint={`${money(totals.directSupplierFunding)} direct to suppliers`} />
              <Metric label="Recognized Project Cost" value={money(totals.recognizedProjectCost)} hint="Materials + certified work + general cost" tone="gold" />
              <Metric label="Cheques On Hold" value={money(totals.chequeOnHold)} hint="Excluded from available cash" tone={totals.chequeOnHold>0?"warn":"neutral"}/>
            </section>
            <section className={styles.metrics}>
              <Metric label="Supplier Advance" value={money(totals.supplierAdvance)} hint="Money/value still held by suppliers" tone="good"/>
              <Metric label="Supplier Payable" value={money(totals.supplierPayable)} hint="Supplier cost not yet funded" tone={totals.supplierPayable>0?"warn":"neutral"}/>
              <Metric label="Contractor Advance" value={money(totals.contractorAdvance)} hint="Payments above certified bills" tone="good"/>
              <Metric label="Contractor Payable" value={money(totals.contractorPayable)} hint="Certified work still unpaid" tone={totals.contractorPayable>0?"warn":"neutral"}/>
            </section>

            <section className={styles.twoCol}>
              <article className={styles.panel}><Head eyebrow="CASH FLOW" title="How cash moves"/><div className={styles.flow}><div><span>Opening Cash</span><strong>{money(totals.openingCash)}</strong></div><b>+</b><div><span>Cash In</span><strong>{money(totals.cashInSinceCutover)}</strong></div><b>−</b><div><span>Cash Out</span><strong>{money(totals.cashOutSinceCutover)}</strong></div><b>=</b><div className={styles.flowResult}><span>Available</span><strong>{money(totals.availableCash)}</strong></div></div></article>
              <article className={styles.panel}><Head eyebrow="COST CONTROL" title="Recognized value"/><div className={styles.costList}><div><span>Supplier materials / purchases</span><strong>{money(costComposition.suppliers)}</strong></div><div><span>Certified contractor work</span><strong>{money(costComposition.certified)}</strong></div><div><span>Other project costs</span><strong>{money(Math.max(0,totals.recognizedProjectCost-costComposition.suppliers-costComposition.certified))}</strong></div></div></article>
            </section>

            <article className={styles.panel}><Head eyebrow="RECENT ACTIVITY" title="Transaction effects" action={<button className={styles.textButton} onClick={()=>setTab("cash")}>View full ledger</button>}/><Ledger rows={recent}/></article>
          </>:null}

          {tab==="cash"?<>
            <div className={styles.pageHead}><Head eyebrow="CASH CONTROL" title="Cash In & Cash Out"/><div className={styles.actionButtons}>{!workspace.readOnly?<><button onClick={()=>open("cash_in")}>+ Cash In</button><button onClick={()=>open("cash_out")}>+ Cash Out</button></>:null}</div></div>
            <section className={styles.metrics}><Metric label="Opening Cash" value={money(totals.openingCash)} hint="Frozen migration position"/><Metric label="New Cash In" value={money(totals.cashInSinceCutover)} hint="After Finance V2 cutover" tone="good"/><Metric label="New Cash Out" value={money(totals.cashOutSinceCutover)} hint="After Finance V2 cutover" tone="warn"/><Metric label="Available Cash" value={money(totals.availableCash)} hint="Only actual cash events affect this" tone="gold"/></section>
            <article className={styles.panel}><Head eyebrow="LEDGER" title="Semantic transaction register"/><Ledger rows={workspace.entries}/></article>
          </>:null}

          {tab==="suppliers"?<>
            <div className={styles.pageHead}><Head eyebrow="SUPPLIER CONTROL" title="Supplier accounts"/><div className={styles.actionButtons}>{!workspace.readOnly?<><button onClick={()=>open("create_supplier")}>+ Supplier</button><button onClick={()=>open("supplier_funding")}>+ Payment / Funding</button><button onClick={()=>open("supplier_delivery")}>+ Delivery</button><button onClick={()=>open("supplier_direct_purchase")}>+ Purchase</button></>:null}</div></div>
            <section className={styles.metrics}><Metric label="Supplier Advances" value={money(totals.supplierAdvance)} hint="Unconsumed supplier funding" tone="good"/><Metric label="Supplier Payables" value={money(totals.supplierPayable)} hint="Cost beyond funding" tone="warn"/><Metric label="Supplier Cost" value={money(costComposition.suppliers)} hint="Delivered + direct purchase value"/><Metric label="Direct Supplier Funding" value={money(totals.directSupplierFunding)} hint="Owner funded supplier directly"/></section>
            <article className={styles.panel}><Head eyebrow="PARTY ACCOUNTS" title="Commercial position by supplier"/><div className={styles.tableWrap}><table><thead><tr><th>Supplier</th><th>Category</th><th className={styles.num}>Funded</th><th className={styles.num}>Cost Received</th><th className={styles.num}>Advance</th><th className={styles.num}>Payable</th></tr></thead><tbody>{workspace.suppliers.map((s)=><tr key={s.id}><td><strong>{s.name}</strong><small>{s.transactionCount} linked transactions</small></td><td>{s.category||"—"}</td><td className={styles.num}>{money(s.funded)}</td><td className={styles.num}>{money(s.cost)}</td><td className={`${styles.num} ${styles.goodText}`}>{money(s.advance)}</td><td className={`${styles.num} ${s.payable>0?styles.warnText:""}`}>{money(s.payable)}</td></tr>)}</tbody></table></div></article>
          </>:null}

          {tab==="contractors"?<>
            <div className={styles.pageHead}><Head eyebrow="CONTRACTOR CONTROL" title="Bills, payments & position"/><div className={styles.actionButtons}>{!workspace.readOnly?<><button onClick={()=>open("create_contractor")}>+ Contractor</button><button onClick={()=>open("contractor_bill")}>+ Certified Bill</button><button onClick={()=>open("contractor_payment")}>+ Payment</button></>:null}</div></div>
            <section className={styles.metrics}><Metric label="Certified Work" value={money(totals.contractorCertified)} hint="Recognized contractor cost"/><Metric label="Contractor Advances" value={money(totals.contractorAdvance)} hint="Paid above certified work" tone="good"/><Metric label="Contractor Payables" value={money(totals.contractorPayable)} hint="Certified but unpaid" tone="warn"/><Metric label="Active Contractors" value={String(workspace.contractors.length).padStart(2,"0")} hint="Linked contractor accounts"/></section>
            <article className={styles.panel}><Head eyebrow="CONTRACT ACCOUNTS" title="Certified vs paid"/><div className={styles.tableWrap}><table><thead><tr><th>Contractor</th><th>Category</th><th className={styles.num}>Contract Value</th><th className={styles.num}>Certified</th><th className={styles.num}>Paid</th><th className={styles.num}>Advance</th><th className={styles.num}>Payable</th></tr></thead><tbody>{workspace.contractors.map((c)=><tr key={c.id}><td><strong>{c.name}</strong><small>{c.billCount} bills · {c.paymentCount} payments</small></td><td>{c.category||"—"}</td><td className={styles.num}>{money(c.contractValue)}</td><td className={styles.num}>{money(c.certified)}</td><td className={styles.num}>{money(c.paid)}</td><td className={`${styles.num} ${styles.goodText}`}>{money(c.advance)}</td><td className={`${styles.num} ${c.payable>0?styles.warnText:""}`}>{money(c.payable)}</td></tr>)}</tbody></table></div></article>
          </>:null}
        </>:null}
      </div>
    </main>

    {modal?<div className={styles.modalShell}><button className={styles.backdrop} onClick={close} aria-label="Close"/><form className={styles.modal} onSubmit={submit}><div className={styles.modalHead}><div><small>PROJECT FINANCE</small><h2>{titleFor(modal)}</h2></div><button type="button" onClick={close}>×</button></div><div className={styles.formBody}>{renderFields(modal,form,setField,workspace)}</div><div className={styles.modalFoot}><button type="button" onClick={close} disabled={saving}>Cancel</button><button className={styles.saveButton} disabled={saving}>{saving?"Saving…":"Save Transaction"}</button></div></form></div>:null}
  </div>;
}

function Metric({label,value,hint,tone="neutral"}:{label:string;value:string;hint:string;tone?:"neutral"|"good"|"warn"|"gold"}) { return <article className={`${styles.metric} ${styles[`metric_${tone}`]}`}><small>{label}</small><strong>{value}</strong><span>{hint}</span></article>; }
function Head({eyebrow,title,action}:{eyebrow:string;title:string;action?:React.ReactNode}) { return <div className={styles.head}><div><small>{eyebrow}</small><h2>{title}</h2></div>{action}</div>; }
function Ledger({rows}:{rows:Entry[]}) { return <div className={styles.tableWrap}><table><thead><tr><th>SL</th><th>Date</th><th>Type</th><th>Party</th><th>Details</th><th className={styles.num}>Cash In</th><th className={styles.num}>Cash Out</th><th className={styles.num}>Cost</th></tr></thead><tbody>{rows.length?rows.map((r)=><tr key={r.id}><td>#{String(r.serialNo||0).padStart(4,"0")}</td><td>{shortDate(r.date)}</td><td><span className={styles.typeTag}>{r.type}</span></td><td>{r.party||"—"}</td><td><strong>{r.details}</strong><small>{r.category||r.paymentMethod||""}</small></td><td className={`${styles.num} ${styles.goodText}`}>{r.cashIn?money(r.cashIn):"—"}</td><td className={`${styles.num} ${styles.warnText}`}>{r.cashOut?money(r.cashOut):"—"}</td><td className={styles.num}>{r.projectCost?money(r.projectCost):"—"}</td></tr>):<tr><td colSpan={8} className={styles.empty}>No transactions yet.</td></tr>}</tbody></table></div>; }

function renderFields(action:FinanceAction,form:FormState,setField:(n:string,v:string|boolean)=>void,workspace:Workspace) {
  const input=(name:string,label:string,type="text",required=false)=><label><span>{label}</span><input name={name} type={type} value={String(form[name]??"")} required={required} onChange={(e)=>setField(name,e.target.value)}/></label>;
  const select=(name:string,label:string,options:Array<[string,string]>,required=false)=><label><span>{label}</span><select value={String(form[name]??"")} required={required} onChange={(e)=>setField(name,e.target.value)}><option value="">Select…</option>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;
  const common=<>{input("date","Date","date",true)}{select("paymentMethod","Payment Method",[["cash","Cash"],["bank_transfer","Bank Transfer"],["cheque","Cheque"],["mobile_banking","Mobile Banking"],["other","Other"]])}{input("referenceNo","Reference / Cheque No.")}{input("details","Details","text",true)}{input("category","Category")}{input("memo","Memo / Notes")}</>;
  if(action==="cash_in") return <>{input("date","Date","date",true)}{input("amount","Amount","number",true)}{select("receivedFrom","Received From",[["Mr. Mahi Bhai","Mr. Mahi Bhai"],["Scrap Selling","Scrap Selling"],["Mr. Jamaluddin","Mr. Jamaluddin"],["Other","Other"]],true)}{input("heldBy","Held / Paid To")}{select("paymentMethod","Payment Method",[["cash","Cash"],["bank_transfer","Bank Transfer"],["cheque","Cheque"],["mobile_banking","Mobile Banking"]],true)}{form.paymentMethod==="cheque"?select("chequeStatus","Cheque Status",[["cashed","Cashed"],["on_hold","On Hold"]],true):null}{input("referenceNo","Reference / Cheque No.")}{input("details","Details","text",true)}{input("memo","Memo / Notes")}</>;
  if(action==="cash_out") return <>{input("date","Date","date",true)}{input("amount","Amount","number",true)}{input("paidTo","Paid To","text",true)}{select("paymentMethod","Payment Method",[["cash","Cash"],["bank_transfer","Bank Transfer"],["cheque","Cheque"],["mobile_banking","Mobile Banking"]],true)}{input("referenceNo","Reference No.")}{input("category","Cost Category")}{input("details","Details","text",true)}{input("memo","Memo / Notes")}</>;
  if(action==="supplier_funding") return <>{input("date","Date","date",true)}{select("supplierId","Supplier",workspace.suppliers.map((s)=>[s.id,s.name]),true)}{input("amount","Amount","number",true)}{select("fundingMode","Funding Source",[["owner_direct","Owner paid supplier directly"],["project_cash","Paid from project cash"]],true)}{form.fundingMode==="owner_direct"?select("receivedFrom","Received From",[["Mr. Mahi Bhai","Mr. Mahi Bhai"],["Mr. Jamaluddin","Mr. Jamaluddin"],["Other","Other"]],true):null}{select("paymentMethod","Payment Method",[["cash","Cash"],["bank_transfer","Bank Transfer"],["cheque","Cheque"],["mobile_banking","Mobile Banking"]],true)}{input("referenceNo","Reference No.")}{input("details","Details")}{input("memo","Memo / Notes")}</>;
  if(action==="supplier_delivery") return <>{input("date","Delivery Date","date",true)}{select("supplierId","Supplier",workspace.suppliers.map((s)=>[s.id,s.name]),true)}{input("quantity","Quantity","number")}{input("rate","Rate","number")}{input("amount","Delivery Value (if quantity × rate not used)","number")}{input("category","Material Category")}{input("details","Delivery Details","text",true)}{input("referenceNo","Challan / Invoice No.")}{input("memo","Memo / Notes")}</>;
  if(action==="supplier_direct_purchase") return <>{input("date","Purchase Date","date",true)}{select("supplierId","Supplier",workspace.suppliers.map((s)=>[s.id,s.name]),true)}{input("amount","Purchase Value","number",true)}<label className={styles.check}><input type="checkbox" checked={Boolean(form.applyAdvance)} onChange={(e)=>setField("applyAdvance",e.target.checked)}/><span>Automatically use available supplier advance first</span></label>{select("paymentMethod","Cash Portion Method",[["cash","Cash"],["bank_transfer","Bank Transfer"],["cheque","Cheque"],["mobile_banking","Mobile Banking"]])}{input("referenceNo","Invoice / Reference No.")}{input("category","Material Category")}{input("details","Purchase Details","text",true)}{input("memo","Memo / Notes")}</>;
  if(action==="supplier_refund") return <>{input("date","Refund Date","date",true)}{select("supplierId","Supplier",workspace.suppliers.map((s)=>[s.id,s.name]),true)}{input("amount","Refund Amount","number",true)}{select("paymentMethod","Received Method",[["cash","Cash"],["bank_transfer","Bank Transfer"],["cheque","Cheque"],["mobile_banking","Mobile Banking"]])}{input("referenceNo","Reference No.")}{input("details","Details")}{input("memo","Memo / Notes")}</>;
  if(action==="contractor_payment") return <>{input("date","Payment Date","date",true)}{select("contractorId","Contractor",workspace.contractors.map((c)=>[c.id,c.name]),true)}{input("amount","Payment Amount","number",true)}{select("paymentMethod","Payment Method",[["cash","Cash"],["bank_transfer","Bank Transfer"],["cheque","Cheque"],["mobile_banking","Mobile Banking"]],true)}{input("referenceNo","Reference No.")}{input("details","Payment Details")}{input("memo","Memo / Notes")}</>;
  if(action==="contractor_bill") return <>{input("date","Bill / Certification Date","date",true)}{select("contractorId","Contractor",workspace.contractors.map((c)=>[c.id,c.name]),true)}{input("quantity","Certified Quantity","number")}{input("rate","Rate","number")}{input("amount","Certified Gross Amount","number",true)}{input("deduction","Deduction","number")}{input("details","Certified Work Details","text",true)}{input("memo","Memo / Notes")}</>;
  if(action==="create_supplier") return <>{input("name","Supplier Name","text",true)}{input("category","Primary Category")}{input("unit","Billing Unit")}{input("memo","Notes")}</>;
  if(action==="create_contractor") return <>{input("name","Contractor Name","text",true)}{input("category","Work Category","text",true)}{select("pricingType","Pricing Type",[["rate","Rate based"],["lump_sum","Lump sum"]],true)}{input("unit","Billing Unit")}{form.pricingType==="lump_sum"?input("contractAmount","Contract Amount","number"):<>{input("quantity","Contract Quantity","number")}{input("rate","Agreed Rate","number")}</>}{input("scope","Scope Description")}{input("memo","Notes")}</>;
  return common;
}
