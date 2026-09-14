"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getProposal, getProposalPermissions, saveProposal, updateProposalAction, type ProposalBundle, type ProposalItem, type ProposalRecord } from "@/lib/proposal-api";

const SERVICES=[
  ["Architectural Design","Engineering"],["Structural Design","Engineering"],["3D Design Exterior","Engineering"],
  ["Electrical Design","Engineering"],["Plumbing Design","Engineering"],["Estimate & Costing","Engineering"],
  ["Plan Approval Design","Engineering"],["Soil Test","Others"],["Digital Survey","Others"],
  ["Municipality File Pass","Others"],["Site Supervision","Supervision"],["Custom Service","Others"],
] as const;

function money(v:number){return new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(Number(v)||0)}
function safeTitle(v:string){return String(v||"").replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,90)}
function dateText(v?:string){if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
function blankItem(service="Architectural Design",category="Engineering"):ProposalItem{return{Service:service,Description:"",Quantity:1,Unit:"Job",Rate:0,Amount:0,Category:category}}
function emptyProposal():ProposalRecord{return{Client_Name:"",Phone:"",Email:"",Address:"",Source:"",Project_Title:"",Project_Location:"",Project_Type:"Residential",Plot_Area:"",Floors:"",Discount:0,Validity_Days:30,Status:"Draft",Assigned_To:"",Notes:""}}

export default function ProposalWorkspace({proposalId}:{proposalId?:string}){
  const [record,setRecord]=useState<ProposalRecord>(emptyProposal());
  const [items,setItems]=useState<ProposalItem[]>([blankItem()]);
  const [bundle,setBundle]=useState<ProposalBundle|null>(null);
  const [permissions,setPermissions]=useState<Record<string,boolean>>({});
  const [role,setRole]=useState("");
  const [stage,setStage]=useState<1|2|3>(proposalId?2:1);
  const [editing,setEditing]=useState(!proposalId);
  const [loading,setLoading]=useState(Boolean(proposalId));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  useEffect(()=>{let live=true;void getProposalPermissions().then(data=>{if(!live)return;setPermissions(data?.permissions||{});setRole(String(data?.role||"").toLowerCase())}).catch(()=>{});return()=>{live=false}},[]);
  useEffect(()=>{if(!proposalId)return;let live=true;setLoading(true);void getProposal(proposalId).then(data=>{if(!live)return;setBundle(data);setRecord(data.proposal);setItems(data.items?.length?data.items:[blankItem()]);setStage(2);setEditing(false)}).catch(e=>live&&setError(e instanceof Error?e.message:"Could not load proposal.")).finally(()=>live&&setLoading(false));return()=>{live=false}},[proposalId]);

  const full=role==="admin"||role==="manager";
  const can=(key:string)=>full||Boolean(permissions[key]);
  const canEdit=record.Proposal_ID?can("proposals.edit"):can("proposals.create");
  const canPrint=can("proposals.print");
  const gross=useMemo(()=>items.reduce((sum,item)=>sum+(Number(item.Quantity)||0)*(Number(item.Rate)||0),0),[items]);
  const discount=Math.max(0,Number(record.Discount)||0);
  const net=Math.max(0,gross-discount);
  const issueDate=record.Created_At||new Date().toISOString();
  const validUntil=record.Valid_Until||(()=>{const d=new Date(issueDate);d.setDate(d.getDate()+Math.max(1,Number(record.Validity_Days)||30));return d.toISOString()})();

  function patchItem(index:number,patch:Partial<ProposalItem>){setItems(prev=>prev.map((item,i)=>i===index?{...item,...patch,Amount:(patch.Quantity??item.Quantity)*(patch.Rate??item.Rate)}:item))}
  function addItem(){setItems(prev=>[...prev,blankItem("Custom Service","Others")])}
  function removeItem(index:number){setItems(prev=>prev.length===1?[blankItem()]:prev.filter((_,i)=>i!==index))}

  async function save(){
    setError("");setMessage("");
    if(!record.Client_Name.trim())return setError("Client name is required.");
    if(!record.Phone.trim())return setError("Phone number is required.");
    const usable=items.filter(item=>item.Service.trim()&&Number(item.Rate)>=0&&Number(item.Quantity)>0);
    if(!usable.length)return setError("Add at least one proposal service.");
    if(!canEdit)return setError("Your account does not have permission to save this proposal.");
    setSaving(true);
    try{
      const data=await saveProposal({...record,Gross_Amount:gross,Net_Amount:net},usable);
      setBundle(data);setRecord(data.proposal);setItems(data.items);setEditing(false);setStage(2);
      setMessage(`${data.proposal.Proposal_ID} saved. The proposal bill is ready for review.`);
      if(!record.Proposal_ID&&window.confirm("Client and billing information saved. Generate and review the proposal bill now?")){setStage(2);setTimeout(()=>document.getElementById("proposal-preview")?.scrollIntoView({behavior:"smooth",block:"start"}),50)}
      if(!proposalId&&data.proposal.Proposal_ID)window.history.replaceState(null,"",`/admin/proposals/${encodeURIComponent(data.proposal.Proposal_ID)}`);
    }catch(e){setError(e instanceof Error?e.message:"Could not save proposal.")}finally{setSaving(false)}
  }

  async function printProposal(){
    if(!record.Proposal_ID)return setError("Save the proposal before printing.");
    if(!canPrint)return setError("Your account does not have Print / Save PDF permission.");
    setError("");
    try{const data=await updateProposalAction(record.Proposal_ID,"print");setBundle(data);setRecord(data.proposal)}catch(e){return setError(e instanceof Error?e.message:"Could not record print activity.")}
    setStage(3);
    const old=document.title;document.title=safeTitle(`${record.Proposal_ID}-${record.Client_Name}-Proposal`)||"LAND-VIEW-Proposal";
    const restore=()=>{document.title=old;window.removeEventListener("afterprint",restore)};window.addEventListener("afterprint",restore);
    window.print();window.setTimeout(restore,60000);
  }

  if(loading)return <div style={{padding:28,color:"#aab5be"}}>Loading proposal…</div>;

  return <div className="proposal-workspace"><style>{`
    .proposal-workspace{color:#eef2f5}.pw-top{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:16px}.pw-top h1{margin:5px 0 0;font-size:34px}.pw-top p{margin:6px 0 0;color:#93a0aa;font-size:11px}.pw-actions{display:flex;gap:8px;flex-wrap:wrap}.pw-btn{border:1px solid #3b4852;background:#17222b;color:#eef2f5;border-radius:8px;padding:10px 13px;font-size:10px;font-weight:900;cursor:pointer;text-decoration:none}.pw-btn.primary{background:#d61f26;border-color:#d61f26}.pw-btn:disabled{opacity:.45;cursor:not-allowed}.pw-stage{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}.pw-stage div{padding:11px 13px;border:1px solid #303b44;border-radius:9px;background:#101820;color:#7f8d97}.pw-stage div.active{border-color:#72262b;background:#241416;color:#fff}.pw-stage b{display:block;font-size:10px}.pw-stage small{display:block;margin-top:3px;font-size:8px}.pw-msg{margin-bottom:12px;padding:11px 13px;border-radius:8px;font-size:10px}.pw-msg.error{border:1px solid #73363a;background:#351b1d;color:#ffaaa5}.pw-msg.ok{border:1px solid #315e45;background:#163023;color:#a8e6bb}.pw-form{display:grid;gap:14px}.pw-panel{border:1px solid #2f3b44;border-radius:12px;background:#101820;padding:16px}.pw-panel h2{margin:0 0 13px;font-size:16px}.pw-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.pw-grid label{display:grid;gap:5px;color:#8d9aa4;font-size:9px}.pw-grid label.wide{grid-column:span 2}.pw-grid label.full{grid-column:1/-1}.pw-grid input,.pw-grid select,.pw-grid textarea{width:100%;border:1px solid #36434d;border-radius:7px;background:#0a1117;color:#eef2f5;padding:10px;font-size:10px}.pw-grid textarea{min-height:75px;resize:vertical}.pw-items{display:grid;gap:8px}.pw-item{display:grid;grid-template-columns:1.35fr 1.4fr 80px 85px 110px 36px;gap:7px;align-items:end;padding:9px;border:1px solid #2d3841;border-radius:9px;background:#0c141a}.pw-item label{display:grid;gap:4px;color:#7f8c96;font-size:8px}.pw-item input,.pw-item select{width:100%;min-width:0;border:1px solid #34414a;border-radius:6px;background:#081016;color:#eef2f5;padding:8px;font-size:9px}.pw-remove{height:34px;border:1px solid #5d3134;border-radius:6px;background:#2a1618;color:#ff8e89;cursor:pointer}.pw-summary{display:flex;justify-content:flex-end}.pw-summary-box{min-width:330px;display:grid;grid-template-columns:1fr auto;border:1px solid #35414a;border-radius:9px;overflow:hidden}.pw-summary-box span,.pw-summary-box strong{padding:9px 11px;border-bottom:1px solid #2f3941}.pw-summary-box strong{text-align:right}.pw-summary-box .net{background:#3a1719;color:#fff;border-bottom:0}.proposal-print-root{margin-top:18px}.proposal-sheet{width:100%;max-width:210mm;margin:0 auto;background:#fff;color:#15191d;min-height:270mm;border:1px solid #d5d7da;box-shadow:0 18px 50px rgba(0,0,0,.25);padding:12mm 12mm 16mm;font-family:Arial,sans-serif}.ps-head{display:grid;grid-template-columns:1fr 1.1fr;align-items:start;gap:10mm;border-bottom:1.4mm solid #d61f26;padding-bottom:5mm}.ps-brand{display:flex;align-items:center;gap:4mm;padding-left:4mm}.ps-brand img{width:32mm;height:auto}.ps-brand strong{display:block;font-size:17pt;letter-spacing:.04em}.ps-brand span{display:block;margin-top:1mm;font-size:7pt;color:#59616a}.ps-title{text-align:right}.ps-title small{display:block;color:#d61f26;font-size:7pt;font-weight:800;letter-spacing:.12em}.ps-title h2{margin:2mm 0 1mm;font-size:18pt}.ps-title p{margin:0;font-size:8pt;color:#5e6670}.ps-idbar{display:grid;grid-template-columns:repeat(4,1fr);margin-top:5mm;border:1px solid #343a40}.ps-idbar div{padding:2.4mm;border-right:1px solid #c9cdd1}.ps-idbar div:last-child{border-right:0}.ps-idbar small{display:block;color:#747b83;font-size:6.5pt;text-transform:uppercase}.ps-idbar strong{display:block;margin-top:1mm;font-size:8pt}.ps-board{display:grid;grid-template-columns:1fr 1fr;margin-top:5mm;border:1px solid #343a40}.ps-board section{padding:3mm 4mm}.ps-board section+section{border-left:1px solid #c8ccd0}.ps-board h3{margin:0 0 2mm;padding-bottom:1.5mm;border-bottom:.45mm solid #d61f26;font-size:8.5pt;text-transform:uppercase}.ps-board p{margin:1.2mm 0;font-size:8pt;line-height:1.35}.ps-table{width:100%;border-collapse:collapse;margin-top:5mm;font-size:8pt}.ps-table th{background:#171b20;color:#fff;padding:2.4mm 2mm;text-align:left;border-bottom:.6mm solid #d61f26}.ps-table td{padding:2.5mm 2mm;border-bottom:1px solid #d7dadd;vertical-align:top}.ps-table th:nth-last-child(-n+3),.ps-table td:nth-last-child(-n+3){text-align:right}.ps-total{margin:5mm 0 0 auto;width:78mm;border:1px solid #343a40}.ps-total div{display:grid;grid-template-columns:1fr auto;padding:2mm 3mm;border-bottom:1px solid #d2d5d8;font-size:8pt}.ps-total div:last-child{border-bottom:0;background:#171b20;color:#fff;border-left:1.2mm solid #d61f26;font-size:9pt}.ps-notes{margin-top:6mm;padding:3mm 4mm;border-left:1mm solid #d61f26;background:#f4f5f6;font-size:7.5pt;line-height:1.5}.ps-footer{margin-top:10mm;padding-top:3mm;border-top:.5mm solid #d61f26;display:flex;justify-content:space-between;gap:8mm;color:#5c646c;font-size:6.8pt;line-height:1.45}.ps-footer strong{color:#20252a}.ps-disclaimer{margin-top:3mm;text-align:center;color:#737a81;font-size:6.5pt}.pw-history{margin-top:12px;color:#88959e;font-size:9px}@media(max-width:950px){.pw-grid{grid-template-columns:1fr 1fr}.pw-item{grid-template-columns:1fr 1fr 80px 90px}.pw-item .pw-desc{grid-column:span 2}.pw-item .pw-remove{grid-column:span 1}.ps-head{grid-template-columns:1fr}.ps-title{text-align:left}}@media(max-width:650px){.pw-top{align-items:flex-start;flex-direction:column}.pw-stage,.pw-grid{grid-template-columns:1fr}.pw-grid label.wide,.pw-grid label.full{grid-column:auto}.pw-item{grid-template-columns:1fr}.pw-item .pw-desc,.pw-item .pw-remove{grid-column:auto}.pw-summary-box{min-width:100%}.proposal-sheet{padding:7mm}.ps-idbar{grid-template-columns:1fr 1fr}.ps-board{grid-template-columns:1fr}.ps-board section+section{border-left:0;border-top:1px solid #c8ccd0}}
    @media print{@page{size:A4 portrait;margin:0}body *{visibility:hidden!important}.proposal-print-root,.proposal-print-root *{visibility:visible!important}.proposal-print-root{position:absolute!important;left:0!important;top:0!important;width:210mm!important;margin:0!important}.proposal-sheet{width:210mm!important;min-height:297mm!important;max-width:none!important;margin:0!important;padding:12mm 12mm 15mm!important;border:0!important;box-shadow:none!important;print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important}.pw-history{display:none!important}}
  `}</style>

  <header className="pw-top"><div><small style={{color:"#ef6c66",fontWeight:900,letterSpacing:".14em"}}>LAND VIEW / PROPOSALS</small><h1>{record.Proposal_ID||"Add prospective client"}</h1><p>{record.Proposal_ID?`${record.Client_Name} · ${record.Status||"Draft"}`:"Save client and service pricing first, review the generated bill, then print or save PDF."}</p></div><div className="pw-actions"><Link className="pw-btn" href="/admin/proposals">← Proposals</Link>{record.Proposal_ID&&!editing&&canEdit&&<button className="pw-btn" onClick={()=>{setEditing(true);setStage(1)}}>Edit proposal</button>}{record.Proposal_ID&&canPrint&&<button className="pw-btn primary" onClick={()=>void printProposal()}>Print / Save PDF</button>}</div></header>
  <div className="pw-stage"><div className={stage===1?"active":""}><b>1 · Input & Save</b><small>Client, project and pricing</small></div><div className={stage===2?"active":""}><b>2 · Generate & Review</b><small>Check the official proposal bill</small></div><div className={stage===3?"active":""}><b>3 · Print / PDF</b><small>Final client copy</small></div></div>
  {error&&<div className="pw-msg error">{error}</div>}{message&&<div className="pw-msg ok">{message}</div>}

  {(editing||!record.Proposal_ID)&&<div className="pw-form">
    <section className="pw-panel"><h2>Prospective client</h2><div className="pw-grid">
      <label>Client name *<input value={record.Client_Name} onChange={e=>setRecord({...record,Client_Name:e.target.value})}/></label>
      <label>Phone *<input value={record.Phone} onChange={e=>setRecord({...record,Phone:e.target.value})}/></label>
      <label>Email<input type="email" value={record.Email||""} onChange={e=>setRecord({...record,Email:e.target.value})}/></label>
      <label className="wide">Address<input value={record.Address||""} onChange={e=>setRecord({...record,Address:e.target.value})}/></label>
      <label>Lead source<input value={record.Source||""} onChange={e=>setRecord({...record,Source:e.target.value})} placeholder="Walk-in / Referral / Facebook…"/></label>
      <label>Assigned employee<input value={record.Assigned_To||""} onChange={e=>setRecord({...record,Assigned_To:e.target.value})} placeholder="EMP-xxxx (optional)"/></label>
    </div></section>
    <section className="pw-panel"><h2>Proposed project</h2><div className="pw-grid">
      <label className="wide">Project title<input value={record.Project_Title||""} onChange={e=>setRecord({...record,Project_Title:e.target.value})} placeholder="e.g. Proposed G+5 Residential Building"/></label>
      <label>Location<input value={record.Project_Location||""} onChange={e=>setRecord({...record,Project_Location:e.target.value})}/></label>
      <label>Project type<select value={record.Project_Type||""} onChange={e=>setRecord({...record,Project_Type:e.target.value})}><option>Residential</option><option>Commercial</option><option>Mixed Use</option><option>Industrial</option><option>Renovation</option><option>Other</option></select></label>
      <label>Plot / land area<input value={record.Plot_Area||""} onChange={e=>setRecord({...record,Plot_Area:e.target.value})} placeholder="e.g. 5 Decimal"/></label>
      <label>Floor / story<input value={record.Floors||""} onChange={e=>setRecord({...record,Floors:e.target.value})} placeholder="e.g. G+5"/></label>
      <label>Validity (days)<input type="number" min="1" value={record.Validity_Days||30} onChange={e=>setRecord({...record,Validity_Days:Number(e.target.value)||30})}/></label>
      <label>Discount (BDT)<input inputMode="decimal" value={record.Discount||0} onChange={e=>setRecord({...record,Discount:Number(e.target.value.replace(/[^0-9.]/g,""))||0})}/></label>
      <label className="full">Proposal notes<textarea value={record.Notes||""} onChange={e=>setRecord({...record,Notes:e.target.value})} placeholder="Scope notes, exclusions, payment terms or special conditions."/></label>
    </div></section>
    <section className="pw-panel"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:12}}><h2 style={{margin:0}}>Proposed services & billing</h2><button className="pw-btn" type="button" onClick={addItem}>+ Add service</button></div><div className="pw-items">{items.map((item,index)=><div className="pw-item" key={index}>
      <label>Service<select value={SERVICES.some(([s])=>s===item.Service)?item.Service:"Custom Service"} onChange={e=>{const service=e.target.value;const found=SERVICES.find(([s])=>s===service);patchItem(index,{Service:service,Category:found?.[1]||"Others"})}}>{SERVICES.map(([service])=><option key={service}>{service}</option>)}</select></label>
      <label className="pw-desc">Description<input value={item.Description||""} onChange={e=>patchItem(index,{Description:e.target.value})} placeholder={item.Service==="Custom Service"?"Describe service":"Optional scope detail"}/></label>
      <label>Qty<input inputMode="decimal" value={item.Quantity} onChange={e=>patchItem(index,{Quantity:Number(e.target.value)||0})}/></label>
      <label>Unit<input value={item.Unit} onChange={e=>patchItem(index,{Unit:e.target.value})}/></label>
      <label>Rate<input inputMode="decimal" value={item.Rate} onChange={e=>patchItem(index,{Rate:Number(e.target.value.replace(/[^0-9.]/g,""))||0})}/></label>
      <button type="button" className="pw-remove" onClick={()=>removeItem(index)} aria-label="Remove service">×</button>
    </div>)}</div>
    <div className="pw-summary"><div className="pw-summary-box"><span>Gross proposal</span><strong>{money(gross)}</strong><span>Discount</span><strong>{money(discount)}</strong><span className="net">Net proposal</span><strong className="net">{money(net)}</strong></div></div>
    <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:13}}>{record.Proposal_ID&&<button className="pw-btn" onClick={()=>{setEditing(false);setStage(2)}}>Cancel edit</button>}<button className="pw-btn primary" disabled={saving||!canEdit} onClick={()=>void save()}>{saving?"Saving…":record.Proposal_ID?"Save changes & review":"Save client & generate bill"}</button></div>
    </section>
  </div>}

  {record.Proposal_ID&&<div className="proposal-print-root" id="proposal-preview"><article className="proposal-sheet">
    <header className="ps-head"><div className="ps-brand"><img src="/land-view-logo.svg" alt="LAND VIEW"/><div><strong>LAND VIEW</strong><span>ENGINEERS &amp; ARCHITECTS<br/>Building a safer tomorrow</span></div></div><div className="ps-title"><small>PROFESSIONAL SERVICE PROPOSAL</small><h2>Proposal Bill</h2><p>Prepared for {record.Client_Name}</p></div></header>
    <div className="ps-idbar"><div><small>Proposal ID</small><strong>{record.Proposal_ID}</strong></div><div><small>Issue date</small><strong>{dateText(issueDate)}</strong></div><div><small>Valid until</small><strong>{dateText(validUntil)}</strong></div><div><small>Status</small><strong>{record.Status||"Draft"}</strong></div></div>
    <div className="ps-board"><section><h3>Client Details</h3><p><strong>{record.Client_Name}</strong></p><p>{record.Address||"Address not provided"}</p><p>{record.Phone}{record.Email?` · ${record.Email}`:""}</p></section><section><h3>Proposed Project</h3><p><strong>{record.Project_Title||record.Project_Type||"LAND VIEW Engineering Services"}</strong></p><p>{record.Project_Location||"Project location to be confirmed"}</p><p>{[record.Project_Type,record.Plot_Area,record.Floors].filter(Boolean).join(" · ")||"Project details to be confirmed"}</p></section></div>
    <table className="ps-table"><thead><tr><th style={{width:"8%"}}>SL</th><th>Service / Scope</th><th style={{width:"12%"}}>Qty</th><th style={{width:"17%"}}>Rate</th><th style={{width:"19%"}}>Amount</th></tr></thead><tbody>{items.filter(i=>i.Service).map((item,index)=><tr key={index}><td>{String(index+1).padStart(2,"0")}</td><td><strong>{item.Service}</strong>{item.Description&&<div style={{marginTop:"1mm",color:"#666",fontSize:"7pt"}}>{item.Description}</div>}</td><td>{item.Quantity} {item.Unit}</td><td>{money(Number(item.Rate)||0)}</td><td>{money((Number(item.Quantity)||0)*(Number(item.Rate)||0))}</td></tr>)}</tbody></table>
    <div className="ps-total"><div><span>Gross Amount</span><strong>{money(gross)}</strong></div><div><span>Discount</span><strong>{money(discount)}</strong></div><div><span>Net Proposal Amount</span><strong>{money(net)}</strong></div></div>
    <div className="ps-notes"><strong>Proposal terms</strong><br/>{record.Notes||`This proposal remains valid for ${record.Validity_Days||30} days from the issue date. Scope or price changes requested after approval may require a revised proposal.`}</div>
    <footer className="ps-footer"><div><strong>LAND VIEW Engineers & Architects</strong><br/>F.Rahman AC Market (2nd Floor), S.S.K Road<br/>Feni Sadar, Feni-3900, Bangladesh</div><div style={{textAlign:"right"}}>+88 01902 500 400<br/>landviewcivil@gmail.com<br/>www.landview.com.bd</div></footer>
    <div className="ps-disclaimer">Electronically generated proposal · No signature required · This proposal is not a payment receipt.</div>
  </article></div>}
  {bundle?.activity?.length?<div className="pw-history">Last activity: {String(bundle.activity[0]?.Action||"")} · {dateText(String(bundle.activity[0]?.Performed_At||""))}</div>:null}
  </div>
}
