"use client";

import { useEffect, useMemo, useState } from "react";

type NavItem = { id:string; code:string; label:string; hint:string; legacy?:string; route?:string };

const NAV:NavItem[] = [
  {id:"overview",code:"01",label:"Command Center",hint:"Project health & cash",legacy:"overview"},
  {id:"ledger",code:"02",label:"Transactions",hint:"Complete project ledger",legacy:"ledger"},
  {id:"income",code:"03",label:"Money In",hint:"Deposits & receipts",legacy:"income"},
  {id:"expense",code:"04",label:"Money Out",hint:"Expenses & payments",legacy:"expenses"},
  {id:"sattapur",code:"05",label:"Materials",hint:"Brick supply control",legacy:"sattapur bricks"},
  {id:"suppliers",code:"06",label:"Parties",hint:"Suppliers & contractors",legacy:"suppliers"},
  {id:"bills",code:"07",label:"Certified Bills",hint:"Contracts & earned work",route:"/projectmanagement/contractors"},
  {id:"report",code:"08",label:"Statements",hint:"Monthly project reports",route:"/projectmanagement/report"},
];

function text(el:Element|null){return String(el?.textContent||"").trim()}

export default function ProjectManagementLaunchShell({children}:{children:React.ReactNode}){
  const [active,setActive]=useState("overview");
  const [projectCode,setProjectCode]=useState("PROJECT");
  const [projectName,setProjectName]=useState("Select a project workspace");
  const [mobileOpen,setMobileOpen]=useState(false);
  const [quickOpen,setQuickOpen]=useState(false);

  const syncFromPage=()=>{
    if(typeof window==="undefined")return;
    const path=window.location.pathname;
    if(path.includes("/contractors"))setActive("bills");
    else if(path.includes("/report"))setActive("report");
    else {
      const current=document.querySelector(".pm-module-nav button.is-active");
      const label=text(current).toLowerCase();
      const match=NAV.find(item=>item.legacy&&label.includes(item.legacy));
      if(match)setActive(match.id);
    }
    const q=new URLSearchParams(window.location.search).get("projectId")||"";
    const code=text(document.querySelector(".pm-project-code"))||text(document.querySelector(".cb-project-pill strong"))||q;
    const name=text(document.querySelector(".pm-project-name"))||text(document.querySelector(".cb-project-pill span"));
    if(code)setProjectCode(code);
    if(name)setProjectName(name);
  };

  useEffect(()=>{
    syncFromPage();
    const observer=new MutationObserver(syncFromPage);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
    const timer=window.setInterval(syncFromPage,1200);
    return()=>{observer.disconnect();window.clearInterval(timer)};
  },[]);

  const projectQuery=useMemo(()=>projectCode&&projectCode!=="PROJECT"?"?projectId="+encodeURIComponent(projectCode):"",[projectCode]);

  function clickLegacy(label:string){
    const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(".pm-module-nav button"));
    const target=buttons.find(b=>String(b.textContent||"").trim().toLowerCase().includes(label.toLowerCase()));
    if(target){target.click();setMobileOpen(false);setQuickOpen(false);window.scrollTo({top:0,behavior:"smooth"});return true}
    return false;
  }

  function open(item:NavItem){
    setActive(item.id);
    if(item.route){window.location.assign(item.route+projectQuery);return}
    if(item.legacy&&!clickLegacy(item.legacy))window.location.assign("/projectmanagement"+projectQuery);
  }

  function action(label:string){
    const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(".pm-actions button"));
    const target=buttons.find(b=>String(b.textContent||"").toLowerCase().includes(label.toLowerCase()));
    if(target){target.click();setQuickOpen(false);return}
    if(label==="statement")window.location.assign("/projectmanagement/report"+projectQuery);
    if(label==="bills")window.location.assign("/projectmanagement/contractors"+projectQuery);
  }

  return <div className="pm-launch-root">
    <aside className={"pm-launch-rail "+(mobileOpen?"is-open":"")}>
      <div className="pm-launch-brand">
        <div className="pm-launch-mark">LV</div>
        <div><small>LAND VIEW</small><strong>PROJECT OPERATIONS</strong><span>Manage · Pay · Deliver</span></div>
      </div>
      <div className="pm-launch-project-mini">
        <small>ACTIVE WORKSPACE</small><strong>{projectCode}</strong><span>{projectName}</span>
      </div>
      <nav className="pm-launch-nav">
        {NAV.map(item=><button key={item.id} className={active===item.id?"is-active":""} onClick={()=>open(item)}>
          <span className="pm-launch-nav-code">{item.code}</span>
          <span className="pm-launch-nav-copy"><strong>{item.label}</strong><small>{item.hint}</small></span>
          <span className="pm-launch-nav-arrow">›</span>
        </button>)}
      </nav>
      <div className="pm-launch-rail-foot">
        <span>OPERATIONS SYSTEM</span>
        <a href="/project-control">Project Control ↗</a>
      </div>
    </aside>

    {mobileOpen&&<button className="pm-launch-scrim" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}/>} 

    <section className="pm-launch-stage">
      <header className="pm-launch-top">
        <div className="pm-launch-top-left">
          <button className="pm-launch-menu" onClick={()=>setMobileOpen(true)} aria-label="Open project navigation">☰</button>
          <div><small>LAND VIEW / PROJECT MANAGEMENT</small><strong>{NAV.find(x=>x.id===active)?.label||"Project Operations"}</strong></div>
        </div>
        <div className="pm-launch-top-project">
          <div><small>PROJECT</small><strong>{projectCode}</strong><span>{projectName}</span></div>
          <button onClick={()=>setQuickOpen(v=>!v)}>＋ QUICK ACTION</button>
        </div>
      </header>

      <div className="pm-launch-command-strip">
        <div><span className="pm-launch-live-dot"/> LIVE PROJECT OPERATIONS</div>
        <div className="pm-launch-strip-actions">
          <button onClick={()=>action("add income")}>↗ Record Money In</button>
          <button onClick={()=>action("add expense")}>↙ Record Money Out</button>
          <button onClick={()=>action("refresh")}>↻ Sync</button>
        </div>
      </div>

      <main className="pm-launch-content">{children}</main>
    </section>

    <nav className="pm-launch-mobile-dock" aria-label="Project Management mobile navigation">
      <button className={active==="overview"?"is-active":""} onClick={()=>open(NAV[0])}><span>⌂</span>Home</button>
      <button className={active==="ledger"?"is-active":""} onClick={()=>open(NAV[1])}><span>≡</span>Ledger</button>
      <button className="pm-launch-fab" onClick={()=>setQuickOpen(v=>!v)} aria-label="Quick action">＋</button>
      <button className={active==="expense"?"is-active":""} onClick={()=>open(NAV[3])}><span>↙</span>Expense</button>
      <button onClick={()=>setMobileOpen(true)}><span>•••</span>More</button>
    </nav>

    {quickOpen&&<div className="pm-launch-quick-sheet">
      <button className="pm-launch-quick-close" onClick={()=>setQuickOpen(false)}>×</button>
      <small>QUICK ACTIONS</small><h3>What do you want to record?</h3>
      <div className="pm-launch-quick-grid">
        <button onClick={()=>action("add income")}><b>↗</b><span><strong>Money In</strong><small>Deposit or receipt</small></span></button>
        <button onClick={()=>action("add expense")}><b>↙</b><span><strong>Money Out</strong><small>Expense or payment</small></span></button>
        <button onClick={()=>action("master ledger")}><b>⇩</b><span><strong>Master Ledger</strong><small>Pull linked entry</small></span></button>
        <button onClick={()=>action("bills")}><b>▥</b><span><strong>Certified Bill</strong><small>Contract work billing</small></span></button>
        <button onClick={()=>action("statement")}><b>▤</b><span><strong>Statement</strong><small>Monthly project report</small></span></button>
        <button onClick={()=>{setQuickOpen(false);open(NAV[5])}}><b>♙</b><span><strong>Parties</strong><small>Supplier / contractor</small></span></button>
      </div>
    </div>}
  </div>
}
