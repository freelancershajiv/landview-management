"use client";

import Link from "next/link";
import ProposalFinanceBillingDocument, { toFinanceInvoice } from "@/components/proposal-finance-billing-document";
import { printBillingPdf } from "@/components/project-billing-document";
import { saveBillingJpg } from "@/lib/save-document-jpg";
import { useEffect, useMemo, useState } from "react";
import { getProposal, getProposalPermissions, saveProposal, updateProposalAction, type ProposalBundle, type ProposalItem, type ProposalRecord } from "@/lib/proposal-api";
import { sortServicesByStandardOrder, standardServiceLabel } from "@/lib/service-order";

const SERVICES=[
  ["Architectural Design","Engineering"],["Structural Design","Engineering"],["3D Design - Exterior","Engineering"],["3D Design - Interior","Engineering"],
  ["Electrical Design","Engineering"],["Fire Safety Design","Engineering"],["Plumbing Design","Engineering"],["Plan Approval Design","Engineering"],
  ["Estimate & Costing","Engineering"],["Design Books","Engineering"],["Re-Design Fees","Engineering"],
  ["Soil Test","Others"],["Digital Survey","Others"],["Site Visit - Soil Test Day","Others"],["Municipality Land NOC","Others"],
  ["Fire Service Approval","Others"],["Municipality Approval","Others"],["District Vetting Committee Approval","Others"],
  ["Consultancy Fees","Others"],["Submission Fees","Others"],["Municipality File Pass","Others"],
  ["Site Supervision","Supervision"],["Custom Service","Others"],
] as const;

function money(v:number){return new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(Number(v)||0)}
function dateText(v?:string){if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
function lineAmount(item:ProposalItem){return Math.max(0,(Number(item.Quantity)||0)*(Number(item.Rate)||0))}
function normalizeItem(item:ProposalItem):ProposalItem{const amount=lineAmount(item);const discount=Math.min(amount,Math.max(0,Number(item.Discount)||0));return{...item,Amount:amount,Discount:discount,Net_Amount:Math.max(0,amount-discount)}}
function blankItem(service="Architectural Design",category="Engineering"):ProposalItem{return normalizeItem({Service:service,Description:"",Quantity:1,Unit:"Job",Rate:0,Amount:0,Discount:0,Net_Amount:0,Category:category})}
function defaultProposalItems():ProposalItem[]{return SERVICES.filter(([service])=>service!=="Custom Service").map(([service,category])=>blankItem(service,category))}
function normalizeAndOrderItems(items:ProposalItem[]){const normalized=items.map(item=>normalizeItem({...item,Service:standardServiceLabel(item.Service)||item.Service}));return sortServicesByStandardOrder(normalized).map((item,index)=>({...normalizeItem(item),Sort_Order:index+1}))}
function serviceDiscountTotal(items:ProposalItem[]){return items.reduce((sum,item)=>sum+Math.min(lineAmount(item),Math.max(0,Number(item.Discount)||0)),0)}
function additionalDiscountFromBundle(bundle:ProposalBundle){return Math.max(0,(Number(bundle.proposal.Discount)||0)-serviceDiscountTotal(bundle.items||[]))}
function emptyProposal():ProposalRecord{return{Client_Name:"",Phone:"",Email:"",Address:"",Source:"",Referred_By:"",Ref_Contact:"",Project_Title:"",Project_Location:"",Project_Type:"Residential",Plot_Area:"",Floors:"",Discount:0,Validity_Days:30,Status:"Draft",Assigned_To:"",Notes:""}}

export default function ProposalWorkspace({proposalId}:{proposalId?:string}){
  const [record,setRecord]=useState<ProposalRecord>(emptyProposal());
  const [items,setItems]=useState<ProposalItem[]>(()=>defaultProposalItems());
  const [bundle,setBundle]=useState<ProposalBundle|null>(null);
  const [permissions,setPermissions]=useState<Record<string,boolean>>({});
  const [role,setRole]=useState("");
  const [stage,setStage]=useState<1|2|3>(proposalId?2:1);
  const [editing,setEditing]=useState(!proposalId);
  const [loading,setLoading]=useState(Boolean(proposalId));
  const [saving,setSaving]=useState(false);
  const [printing,setPrinting]=useState(false);
  const [exportingJpg,setExportingJpg]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  useEffect(()=>{let live=true;void getProposalPermissions().then(data=>{if(!live)return;setPermissions(data?.permissions||{});setRole(String(data?.role||"").toLowerCase())}).catch(()=>{});return()=>{live=false}},[]);
  useEffect(()=>{if(!proposalId)return;let live=true;setLoading(true);void getProposal(proposalId).then(data=>{if(!live)return;const normalizedItems=data.items?.length?normalizeAndOrderItems(data.items):[blankItem()];const normalizedBundle={...data,items:normalizedItems};setBundle(normalizedBundle);setRecord({...data.proposal,Discount:additionalDiscountFromBundle(normalizedBundle)});setItems(normalizedItems);setStage(2);setEditing(false)}).catch(e=>live&&setError(e instanceof Error?e.message:"Could not load proposal.")).finally(()=>live&&setLoading(false));return()=>{live=false}},[proposalId]);

  const full=role==="admin"||role==="manager";
  const can=(key:string)=>full||Boolean(permissions[key]);
  const canEdit=record.Proposal_ID?can("proposals.edit"):can("proposals.create");
  const canPrint=can("proposals.print");
  const gross=useMemo(()=>items.reduce((sum,item)=>sum+lineAmount(item),0),[items]);
  const serviceDiscount=useMemo(()=>serviceDiscountTotal(items),[items]);
  const subtotal=Math.max(0,gross-serviceDiscount);
  const additionalDiscount=Math.min(subtotal,Math.max(0,Number(record.Discount)||0));
  const totalDiscount=serviceDiscount+additionalDiscount;
  const net=Math.max(0,subtotal-additionalDiscount);

  function patchItem(index:number,patch:Partial<ProposalItem>){setItems(prev=>normalizeAndOrderItems(prev.map((item,i)=>{if(i!==index)return item;return normalizeItem({...item,...patch,Service:standardServiceLabel(patch.Service??item.Service)||item.Service})})))}
  function addItem(){setItems(prev=>normalizeAndOrderItems([...prev,blankItem("Custom Service","Others")]))}
  function removeItem(index:number){setItems(prev=>prev.length===1?[blankItem()]:prev.filter((_,i)=>i!==index))}

  async function save(){
    setError("");setMessage("");
    if(!record.Client_Name.trim())return setError("Client name is required.");
    if(!record.Phone.trim())return setError("Phone number is required.");
    const usable=normalizeAndOrderItems(items.filter(item=>item.Service.trim()&&Number(item.Rate)>=0&&Number(item.Quantity)>0));
    if(!usable.length)return setError("Add at least one proposal service.");
    if(!canEdit)return setError("Your account does not have permission to save this proposal.");
    setSaving(true);
    try{
      const usableServiceDiscount=serviceDiscountTotal(usable);
      const usableGross=usable.reduce((sum,item)=>sum+lineAmount(item),0);
      const usableSubtotal=Math.max(0,usableGross-usableServiceDiscount);
      const usableAdditional=Math.min(usableSubtotal,Math.max(0,Number(record.Discount)||0));
      const data=await saveProposal({...record,Gross_Amount:usableGross,Discount:usableServiceDiscount+usableAdditional,Net_Amount:Math.max(0,usableSubtotal-usableAdditional)},usable);
      const normalizedItems=normalizeAndOrderItems(data.items||[]);
      const normalizedBundle={...data,items:normalizedItems};
      setBundle(normalizedBundle);setRecord({...data.proposal,Discount:additionalDiscountFromBundle(normalizedBundle)});setItems(normalizedItems);setEditing(false);setStage(2);
      setMessage(`${data.proposal.Proposal_ID} saved. Service discounts and proposal totals are updated.`);
      if(!record.Proposal_ID&&window.confirm("Client and billing information saved. Generate and review the proposal bill now?")){setStage(2);setTimeout(()=>document.getElementById("proposal-preview")?.scrollIntoView({behavior:"smooth",block:"start"}),50)}
      if(!proposalId&&data.proposal.Proposal_ID)window.history.replaceState(null,"",`/admin/proposals/${encodeURIComponent(data.proposal.Proposal_ID)}`);
    }catch(e){setError(e instanceof Error?e.message:"Could not save proposal.")}finally{setSaving(false)}
  }

  async function printProposal(){
    if(printing||saving)return;
    if(!record.Proposal_ID||!bundle)return setError("Save the proposal before printing.");
    if(editing)return setError("Save your changes before printing.");
    if(!canPrint)return setError("Your account does not have Print / Save PDF permission.");
    setError("");setPrinting(true);
    try{const printed=await printBillingPdf(toFinanceInvoice(bundle,record.Proposal_ID));if(!printed)return;setStage(3);void updateProposalAction(record.Proposal_ID,"print").catch(()=>setMessage("Print activity could not be recorded. The saved proposal is unchanged."))}
    catch(e){setError(e instanceof Error?e.message:"Could not print proposal.")}finally{setPrinting(false)}
  }

  async function saveProposalJpg(){
    if(exportingJpg||printing||saving)return;
    if(!record.Proposal_ID||!bundle)return setError("Save the proposal before exporting JPG.");
    if(editing)return setError("Save your changes before exporting JPG.");
    if(!canPrint)return setError("Your account does not have proposal export permission.");
    setError("");setExportingJpg(true);
    try{const pages=await saveBillingJpg(toFinanceInvoice(bundle,record.Proposal_ID),"Proposal");if(!pages)return;setStage(3);setMessage(`${record.Proposal_ID} saved as ${pages===1?"a JPG":"JPG pages"}.`)}
    catch(e){setError(e instanceof Error?e.message:"Could not save proposal JPG.")}finally{setExportingJpg(false)}
  }

  if(loading)return <div style={{padding:28,color:"var(--theme-ink-_aab5be, #aab5be)"}}>Loading proposal…</div>;

  return <div className="proposal-workspace"><style>{`
    .proposal-workspace{color:var(--theme-ink-_eef2f5,#eef2f5)}.pw-top{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:16px}.pw-top h1{margin:5px 0 0;font-size:34px}.pw-top p{margin:6px 0 0;color:var(--theme-ink-_93a0aa,#93a0aa);font-size:11px}.pw-actions{display:flex;gap:8px;flex-wrap:wrap}.pw-btn{border:1px solid var(--theme-line-_3b4852,#3b4852);background:var(--theme-bg-_17222b,#17222b);color:var(--theme-ink-_eef2f5,#eef2f5);border-radius:8px;padding:10px 13px;font-size:10px;font-weight:900;cursor:pointer;text-decoration:none}.pw-btn.primary{background:#d61f26;border-color:#d61f26}.pw-btn:disabled{opacity:.45;cursor:not-allowed}.pw-stage{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}.pw-stage div{padding:11px 13px;border:1px solid var(--theme-line-_303b44,#303b44);border-radius:9px;background:var(--theme-bg-_101820,#101820);color:var(--theme-ink-_7f8d97,#7f8d97)}.pw-stage div.active{border-color:#72262b;background:#241416;color:#fff}.pw-stage b{display:block;font-size:10px}.pw-stage small{display:block;margin-top:3px;font-size:8px}.pw-msg{margin-bottom:12px;padding:11px 13px;border-radius:8px;font-size:10px}.pw-msg.error{border:1px solid #73363a;background:#351b1d;color:#ffaaa5}.pw-msg.ok{border:1px solid #315e45;background:#163023;color:#a8e6bb}.pw-form{display:grid;gap:14px}.pw-panel{border:1px solid var(--theme-line-_2f3b44,#2f3b44);border-radius:12px;background:var(--theme-bg-_101820,#101820);padding:16px}.pw-panel h2{margin:0 0 13px;font-size:16px}.pw-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.pw-grid label{display:grid;gap:5px;color:#8d9aa4;font-size:9px}.pw-grid label.wide{grid-column:span 2}.pw-grid label.full{grid-column:1/-1}.pw-grid input,.pw-grid select,.pw-grid textarea{width:100%;border:1px solid #36434d;border-radius:7px;background:#0a1117;color:#eef2f5;padding:10px;font-size:10px}.pw-grid textarea{min-height:75px;resize:vertical}.pw-items{display:grid;gap:8px}.pw-item{display:grid;grid-template-columns:minmax(150px,1.25fr) minmax(170px,1.35fr) 64px 72px 86px 94px 86px 94px 36px;gap:7px;align-items:end;padding:9px;border:1px solid #2d3841;border-radius:9px;background:#0c141a}.pw-item label{display:grid;gap:4px;color:#7f8c96;font-size:8px}.pw-item input,.pw-item select{width:100%;min-width:0;border:1px solid #34414a;border-radius:6px;background:#081016;color:#eef2f5;padding:8px;font-size:9px}.pw-readonly{height:34px;display:flex;align-items:center;justify-content:flex-end;padding:0 8px;border:1px solid #2d3a43;border-radius:6px;background:#111b22;color:#c9d2d8;font-size:9px;font-weight:800;white-space:nowrap}.pw-readonly.net{border-color:#315e45;color:#a8e6bb;background:#10251a}.pw-remove{height:34px;border:1px solid #5d3134;border-radius:6px;background:#2a1618;color:#ff8e89;cursor:pointer}.pw-move{grid-column:1/-1;height:30px;border:1px solid #405766;border-radius:6px;background:#15232c;color:#b9d7e8;cursor:pointer;font-size:8px;font-weight:900;text-align:left;padding:0 9px}.pw-summary{display:flex;justify-content:flex-end;margin-top:12px}.pw-summary-box{min-width:350px;display:grid;grid-template-columns:1fr auto;border:1px solid #35414a;border-radius:9px;overflow:hidden}.pw-summary-box span,.pw-summary-box strong{padding:9px 11px;border-bottom:1px solid #2f3941}.pw-summary-box strong{text-align:right}.pw-summary-box .net{background:#3a1719;color:#fff;border-bottom:0}.pw-history{margin-top:12px;color:#88959e;font-size:9px}@media(max-width:1120px){.pw-item{grid-template-columns:1.3fr 1.4fr 70px 80px 90px}.pw-item .pw-desc{grid-column:span 1}.pw-item .pw-remove{grid-column:auto}.pw-item .pw-move{grid-column:1/-1}}@media(max-width:760px){.pw-top{align-items:flex-start;flex-direction:column}.pw-stage,.pw-grid{grid-template-columns:1fr}.pw-grid label.wide,.pw-grid label.full{grid-column:auto}.pw-item{grid-template-columns:1fr 1fr}.pw-item .pw-desc{grid-column:1/-1}.pw-item .pw-remove{grid-column:auto}.pw-summary-box{min-width:100%}}@media(max-width:520px){.pw-item{grid-template-columns:1fr}.pw-item .pw-desc{grid-column:auto}}@media print{.pw-top,.pw-stage,.pw-msg,.pw-form,.pw-history{display:none!important}}
  `}</style>

  <header className="pw-top"><div><small style={{color:"#ef6c66",fontWeight:900,letterSpacing:".14em"}}>LAND VIEW / PROPOSALS</small><h1>{record.Proposal_ID||"Add prospective client"}</h1><p>{record.Proposal_ID?`${record.Client_Name} · ${record.Status||"Draft"}`:"Save client and service pricing first, review the generated bill, then print or save PDF."}</p></div><div className="pw-actions"><Link className="pw-btn" href="/admin/proposals">← Proposals</Link>{record.Proposal_ID&&!editing&&canEdit&&<button className="pw-btn" onClick={()=>{setEditing(true);setStage(1)}}>Edit proposal</button>}{record.Proposal_ID&&canPrint&&<button className="pw-btn primary" disabled={printing||saving||editing||!bundle} onClick={()=>void printProposal()}>{printing?"Preparing PDF…":"Print / Save PDF"}</button>}{record.Proposal_ID&&canPrint&&<button className="pw-btn" disabled={exportingJpg||printing||saving||editing||!bundle} onClick={()=>void saveProposalJpg()}>{exportingJpg?"Preparing JPG…":"Save JPG"}</button>}</div></header>
  <div className="pw-stage"><div className={stage===1?"active":""}><b>1 · Input & Save</b><small>Client, project and pricing</small></div><div className={stage===2?"active":""}><b>2 · Generate & Review</b><small>Check the official proposal bill</small></div><div className={stage===3?"active":""}><b>3 · Print / PDF / JPG</b><small>Final client copy</small></div></div>
  {error&&<div className="pw-msg error">{error}</div>}{message&&<div className="pw-msg ok">{message}</div>}

  {(editing||!record.Proposal_ID)&&<div className="pw-form">
    <section className="pw-panel"><h2>Prospective client</h2><div className="pw-grid">
      <label>Client name *<input value={record.Client_Name} onChange={e=>setRecord({...record,Client_Name:e.target.value})}/></label>
      <label>Phone *<input value={record.Phone} onChange={e=>setRecord({...record,Phone:e.target.value})}/></label>
      <label>Email<input type="email" value={record.Email||""} onChange={e=>setRecord({...record,Email:e.target.value})}/></label>
      <label className="wide">Address<input value={record.Address||""} onChange={e=>setRecord({...record,Address:e.target.value})}/></label>
      <label>Lead source<input value={record.Source||""} onChange={e=>setRecord({...record,Source:e.target.value})} placeholder="Walk-in / Referral / Facebook…"/></label>
      <label>Referred By<input value={record.Referred_By||""} onChange={e=>setRecord({...record,Referred_By:e.target.value})} placeholder="Referrer name"/></label>
      <label>Ref. Contact<input value={record.Ref_Contact||""} onChange={e=>setRecord({...record,Ref_Contact:e.target.value})} placeholder="Referrer phone / contact"/></label>
      <label>Assigned employee<input value={record.Assigned_To||""} onChange={e=>setRecord({...record,Assigned_To:e.target.value})} placeholder="EMP-xxxx (optional)"/></label>
    </div></section>

    <section className="pw-panel"><h2>Proposed project</h2><div className="pw-grid">
      <label className="wide">Project title<input value={record.Project_Title||""} onChange={e=>setRecord({...record,Project_Title:e.target.value})} placeholder="e.g. Proposed G+5 Residential Building"/></label>
      <label>Location<input value={record.Project_Location||""} onChange={e=>setRecord({...record,Project_Location:e.target.value})}/></label>
      <label>Project type<select value={record.Project_Type||""} onChange={e=>setRecord({...record,Project_Type:e.target.value})}><option>Residential</option><option>Commercial</option><option>Mixed Use</option><option>Industrial</option><option>Renovation</option><option>Other</option></select></label>
      <label>Plot / land area<input value={record.Plot_Area||""} onChange={e=>setRecord({...record,Plot_Area:e.target.value})} placeholder="e.g. 5 Decimal"/></label>
      <label>Floor / story<input value={record.Floors||""} onChange={e=>setRecord({...record,Floors:e.target.value})} placeholder="e.g. G+5"/></label>
      <label>Validity (days)<input type="number" min="1" value={record.Validity_Days||30} onChange={e=>setRecord({...record,Validity_Days:Number(e.target.value)||30})}/></label>
      <label>Additional proposal discount (BDT)<input inputMode="decimal" value={record.Discount||0} onChange={e=>setRecord({...record,Discount:Number(e.target.value.replace(/[^0-9.]/g,""))||0})}/></label>
      <label className="full">Proposal notes<textarea value={record.Notes||""} onChange={e=>setRecord({...record,Notes:e.target.value})} placeholder="Scope notes, exclusions, payment terms or special conditions."/></label>
    </div></section>

    <section className="pw-panel"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:12}}><div><h2 style={{margin:0}}>Proposed services & billing</h2><div style={{marginTop:4,color:"#7f8c96",fontSize:9}}>Apply a separate BDT discount to any service. Net is calculated automatically.</div></div><button className="pw-btn" type="button" onClick={addItem}>+ Add service</button></div>
      <div className="pw-items">{items.map((item,index)=>{
        const normalizedService=standardServiceLabel(item.Service)||item.Service;
        const movableService=normalizedService==="Soil Test"||normalizedService==="Digital Survey"||normalizedService==="Site Visit - Soil Test Day";
        const inEngineering=String(item.Category||"").trim().toLowerCase()==="engineering";
        const amount=lineAmount(item);const itemDiscount=Math.min(amount,Math.max(0,Number(item.Discount)||0));const itemNet=Math.max(0,amount-itemDiscount);
        return <div className="pw-item" key={`${item.Item_ID||normalizedService}-${index}`}>
          <label>Service<select value={SERVICES.some(([s])=>s===normalizedService)?normalizedService:"Custom Service"} onChange={e=>{const service=e.target.value;const found=SERVICES.find(([s])=>s===service);patchItem(index,{Service:service,Category:found?.[1]||"Others"})}}>{SERVICES.map(([service])=><option key={service}>{service}</option>)}</select></label>
          <label className="pw-desc">Description<input value={item.Description||""} onChange={e=>patchItem(index,{Description:e.target.value})} placeholder={item.Service==="Custom Service"?"Describe service":"Optional scope detail"}/></label>
          <label>Qty<input inputMode="decimal" value={item.Quantity} onChange={e=>patchItem(index,{Quantity:Number(e.target.value)||0})}/></label>
          <label>Unit<input value={item.Unit} onChange={e=>patchItem(index,{Unit:e.target.value})}/></label>
          <label>Rate<input inputMode="decimal" value={item.Rate} onChange={e=>patchItem(index,{Rate:Number(e.target.value.replace(/[^0-9.]/g,""))||0})}/></label>
          <label>Amount<span className="pw-readonly">{money(amount)}</span></label>
          <label>Discount<input inputMode="decimal" value={item.Discount||0} onChange={e=>patchItem(index,{Discount:Number(e.target.value.replace(/[^0-9.]/g,""))||0})}/></label>
          <label>Net<span className="pw-readonly net">{money(itemNet)}</span></label>
          <button type="button" className="pw-remove" onClick={()=>removeItem(index)} aria-label="Remove service">×</button>
          {movableService&&<button type="button" className="pw-move" onClick={()=>patchItem(index,{Category:inEngineering?"Others":"Engineering"})}>{inEngineering?"↩ Move to Others":"→ Move to Engineering Bill"}</button>}
        </div>})}</div>
      <div className="pw-summary"><div className="pw-summary-box">
        <span>Gross proposal</span><strong>{money(gross)}</strong>
        <span>Service discounts</span><strong>- {money(serviceDiscount)}</strong>
        <span>Subtotal</span><strong>{money(subtotal)}</strong>
        <span>Additional proposal discount</span><strong>- {money(additionalDiscount)}</strong>
        <span>Total discount</span><strong>{money(totalDiscount)}</strong>
        <span className="net">Net proposal</span><strong className="net">{money(net)}</strong>
      </div></div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:13}}>{record.Proposal_ID&&<button className="pw-btn" onClick={()=>{setEditing(false);setStage(2)}}>Cancel edit</button>}<button className="pw-btn primary" disabled={saving||!canEdit} onClick={()=>void save()}>{saving?"Saving…":record.Proposal_ID?"Save changes & review":"Save client & generate bill"}</button></div>
    </section>
  </div>}

  {record.Proposal_ID&&bundle&&<ProposalFinanceBillingDocument bundle={bundle}/>}
  {bundle?.activity?.length?<div className="pw-history">Last activity: {String(bundle.activity[0]?.Action||"")} · {dateText(String(bundle.activity[0]?.Performed_At||""))}</div>:null}
  </div>
}
