"use client";

import { useEffect, useMemo, useState } from "react";
import { getProposal, type ProposalBundle, type ProposalItem } from "@/lib/proposal-api";
import styles from "@/app/admin/finance/invoices/invoice.module.css";

const money=(value:number)=>new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:0}).format(Number(value||0));
const engineeringServices=new Set(["architectural design","structural design","3d design exterior","3d design","electrical design","plumbing design","estimate & costing","plan approval design"]);

function dateText(value?:string){
  const date=value?new Date(value):new Date();
  if(Number.isNaN(date.getTime()))return String(value||"—");
  return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",day:"2-digit",month:"short",year:"numeric"}).format(date);
}

function isEngineering(item:ProposalItem){
  const category=String(item.Category||"").trim().toLowerCase();
  const service=String(item.Service||"").trim().toLowerCase();
  return category==="engineering"||engineeringServices.has(service);
}

export default function ProposalFinanceBillingDocument({proposalId}:{proposalId:string}){
  const [bundle,setBundle]=useState<ProposalBundle|null>(null);
  const [error,setError]=useState("");

  useEffect(()=>{let live=true;void getProposal(proposalId).then(data=>{if(live)setBundle(data)}).catch(e=>live&&setError(e instanceof Error?e.message:"Could not load proposal billing."));return()=>{live=false}},[proposalId]);

  const pages=useMemo(()=>{
    if(!bundle)return [];
    const engineering=bundle.items.filter(isEngineering);
    const others=bundle.items.filter(item=>!isEngineering(item));
    const groups=[
      {key:"engineering",name:"Engineering",title:"Engineering Bill",items:engineering},
      {key:"others",name:"Other Services",title:"Other Services Bill",items:others},
    ].filter(group=>group.items.length>0);
    const grossAll=groups.reduce((sum,group)=>sum+group.items.reduce((s,item)=>s+(Number(item.Quantity)||0)*(Number(item.Rate)||0),0),0);
    const discountAll=Math.max(0,Number(bundle.proposal.Discount)||0);
    let discountUsed=0;
    return groups.map((group,index)=>{
      const gross=group.items.reduce((sum,item)=>sum+(Number(item.Quantity)||0)*(Number(item.Rate)||0),0);
      const discount=index===groups.length-1?Math.max(0,discountAll-discountUsed):(grossAll>0?Math.round(discountAll*(gross/grossAll)):0);
      discountUsed+=discount;
      return {...group,gross,discount,net:Math.max(0,gross-discount)};
    });
  },[bundle]);

  if(error)return <div style={{marginTop:16,padding:12,border:"1px solid #73363a",borderRadius:8,color:"#ffaaa5",background:"#351b1d"}}>{error}</div>;
  if(!bundle||!pages.length)return null;

  const proposal=bundle.proposal;
  const issueDate=dateText(proposal.Created_At);
  const totalPages=pages.length;
  const grandGross=pages.reduce((sum,page)=>sum+page.gross,0);
  const grandDiscount=pages.reduce((sum,page)=>sum+page.discount,0);
  const grandNet=pages.reduce((sum,page)=>sum+page.net,0);

  const Header=({page,title}:{page:number;title:string})=><>
    <header className={styles.sheetHeader}>
      <div className={styles.sheetBrand}><div className={styles.sheetBrandLockup}><img className={styles.sheetBrandLogo} src="/land-view-logo.svg" alt="LAND VIEW logo"/><div className={styles.sheetBrandWords}><strong>LAND <span>VIEW</span></strong><small>ENGINEERS AND ARCHITECTS</small></div></div><em>Building a safer tomorrow</em></div>
      <div className={styles.sheetTitle}><small>Page {page} of {totalPages}</small><b>PROJECT BILLING STATEMENT</b><strong>{title}</strong></div>
      <div className={styles.sheetHeaderQr}><div className={styles.sheetHeaderQrPlaceholder} aria-label="Reserved project QR space"></div><small>Project QR</small></div>
    </header>
    <section className={styles.sheetInfoBoard}>
      <div className={styles.sheetMetaRow}><div className={styles.sheetMetaPair}><span>Invoice ID</span><strong>{`${proposal.Proposal_ID||proposalId}-${page.toString().padStart(2,"0")}`}</strong></div><div className={styles.sheetMetaPair}><span>Issue Date</span><strong>{issueDate}</strong></div></div>
      <div className={styles.sheetPanelTitles}><strong>Owner Details</strong><strong>Building Details</strong></div>
      <div className={styles.sheetInfoRow}><span>File ID</span><strong>{proposal.Proposal_ID||proposalId}</strong><span>Project Type</span><strong>{proposal.Project_Type||"—"}</strong></div>
      <div className={styles.sheetInfoRow}><span>Name</span><strong>{proposal.Client_Name||"—"}</strong><span>Floor/Story</span><strong>{proposal.Floors||"—"}</strong></div>
      <div className={styles.sheetInfoRow}><span>Address</span><strong>{proposal.Address||"—"}</strong><span>Land Area</span><strong>{proposal.Plot_Area||"—"}</strong></div>
      <div className={styles.sheetInfoRow}><span>Contact</span><strong>{proposal.Phone||"—"}</strong><span>Status</span><strong>{proposal.Converted_Project_ID?"Converted to Project":proposal.Status||"Proposal"}</strong></div>
      <div className={styles.sheetInfoRow}><span>Location</span><strong>{proposal.Project_Location||"—"}</strong><span>Project ID</span><strong>{proposal.Converted_Project_ID||"Not assigned yet"}</strong></div>
    </section>
  </>;

  return <div className="proposal-finance-billing">
    <style>{`
      .proposal-workspace .proposal-print-root{display:none!important}
      .proposal-finance-billing{margin-top:18px}
      .proposal-finance-billing .proposal-preview-note{margin:0 0 10px;color:#8f9ba4;font-size:10px}
      @media print{
        body *{visibility:hidden!important}
        .proposal-finance-billing,.proposal-finance-billing *{visibility:visible!important}
        .proposal-finance-billing{position:absolute!important;left:0!important;top:0!important;width:100%!important;margin:0!important}
        .proposal-preview-note{display:none!important}
      }
    `}</style>
    <p className="proposal-preview-note">Proposal billing uses the Finance invoice layout. The QR area is intentionally reserved and remains blank until this prospect becomes a real project.</p>
    <section className={styles.printSheets} style={{display:"block"}}>
      {pages.map((page,index)=><article className={styles.printPage} key={page.key} style={{display:"block"}}>
        <Header page={index+1} title={page.title}/>
        <section className={styles.portraitSection}>
          <div className={styles.sheetMain}>
            <h2>{page.name.toUpperCase()} <span>BILL</span></h2>
            <div className={styles.tableWrap}><table className={styles.billTable}><thead><tr><th>SL.</th><th>Description</th><th>Rate</th><th>Qty.</th><th>Amount</th></tr></thead><tbody>{page.items.map((item,itemIndex)=><tr key={item.Item_ID||`${page.key}-${itemIndex}`}><td>{itemIndex+1}</td><td><strong>{item.Service||"—"}</strong>{item.Description?<small style={{display:"block",marginTop:3}}>{item.Description}</small>:null}</td><td>{money(Number(item.Rate)||0)}</td><td>{Number(item.Quantity)||0} {item.Unit||""}</td><td className={styles.moneyCell}>{money((Number(item.Quantity)||0)*(Number(item.Rate)||0))}</td></tr>)}</tbody></table></div>
          </div>
          <aside className={styles.sheetSummary}><h3>{page.name.toUpperCase()} SUMMARY</h3><div><span>Total Bill</span><strong>{money(page.gross)}</strong></div><div><span>Discount</span><strong>{money(page.discount)}</strong></div><div><span>Deposit</span><strong>{money(0)}</strong></div><div className={styles.sheetDue}><span>Proposal Total</span><strong>{money(page.net)}</strong></div></aside>
        </section>
        <section className={styles.verificationBlock}><div><span className={styles.verificationLabel}>PROJECT QR</span><strong>Reserved for real project</strong><p>No QR code is issued at proposal stage. When this proposal becomes a real LAND VIEW project, the normal project billing invoice will carry its verification QR in this space.</p></div><div className={styles.qrCode} style={{display:"grid",placeItems:"center",border:"1px solid #c9cdd1",background:"#fff",color:"#a0a6ac",fontSize:10}}>QR SPACE</div></section>
        {proposal.Notes?<section style={{margin:"5mm 0 0",fontSize:"8pt"}}><strong>Notes:</strong> {proposal.Notes}</section>:null}
        <footer className={styles.sheetFooter}><strong>LAND VIEW</strong><span>{index===pages.length-1?`Total Proposal: ${money(grandGross)} − Discount ${money(grandDiscount)} = ${money(grandNet)} · `:""}Feni Sadar, Feni · +88 01902 500 400 · landviewcivil@gmail.com · www.landview.com.bd</span></footer>
      </article>)}
    </section>
  </div>;
}
