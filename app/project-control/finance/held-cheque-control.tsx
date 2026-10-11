"use client";

import { useEffect, useState } from "react";
import styles from "./held-cheque-control.module.css";

type HeldCheque = {
  id:string;
  serialNo:number;
  date:string;
  details:string;
  amount:number;
  direction:"in"|"out";
  party:string;
  referenceNo:string;
};

function money(value:number) {
  return new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(Number(value||0));
}

export default function HeldChequeControl() {
  const [projectCode,setProjectCode]=useState("");
  const [cheques,setCheques]=useState<HeldCheque[]>([]);
  const [readOnly,setReadOnly]=useState(true);
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");

  async function load() {
    try {
      const listRes=await fetch("/api/project-finance",{cache:"no-store"});
      const listJson=await listRes.json().catch(()=>null);
      if(!listRes.ok||!listJson?.success) return;
      const fromUrl=new URL(window.location.href).searchParams.get("project");
      const projects=listJson.data?.projects||[];
      const target=projects.find((p:any)=>p.projectCode===fromUrl)?.projectCode || projects.find((p:any)=>p.projectCode==="LV-157")?.projectCode || projects[0]?.projectCode;
      if(!target) return;
      const res=await fetch(`/api/project-finance?projectId=${encodeURIComponent(target)}`,{cache:"no-store"});
      const json=await res.json().catch(()=>null);
      if(!res.ok||!json?.success) return;
      setProjectCode(target);
      setCheques(Array.isArray(json.data?.heldCheques)?json.data.heldCheques:[]);
      setReadOnly(Boolean(json.data?.readOnly));
    } catch { /* main workspace owns load errors */ }
  }

  useEffect(()=>{ void load(); },[]);

  async function clearCheque(ledgerId:string) {
    if(!projectCode||readOnly) return;
    setBusy(ledgerId); setError("");
    try {
      const res=await fetch("/api/project-finance",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({action:"cash_held_cheque",projectId:projectCode,ledgerId}),
      });
      const json=await res.json().catch(()=>null);
      if(!res.ok||!json?.success) throw new Error(json?.error||"Cheque could not be cleared.");
      window.location.reload();
    } catch(e) {
      setError(e instanceof Error?e.message:String(e));
      setBusy("");
    }
  }

  if(!projectCode||!cheques.length) return null;
  const total=cheques.reduce((sum,row)=>sum+Number(row.amount||0),0);

  return <>
    <button className={styles.fab} onClick={()=>setOpen(true)}>
      <span>HELD CHEQUES</span><strong>{cheques.length}</strong><small>{money(total)}</small>
    </button>
    {open?<div className={styles.shell} role="dialog" aria-modal="true" aria-label="Held cheques">
      <button className={styles.backdrop} onClick={()=>setOpen(false)} aria-label="Close"/>
      <section className={styles.panel}>
        <header><div><small>PROJECT FINANCE</small><h2>Held Cheques</h2><p>{projectCode} · not included in available cash until cleared</p></div><button onClick={()=>setOpen(false)}>×</button></header>
        {error?<div className={styles.error}>{error}</div>:null}
        <div className={styles.list}>{cheques.map((row)=><article key={row.id}>
          <div><span>#{String(row.serialNo||0).padStart(4,"0")} · {row.date}</span><strong>{row.details||row.referenceNo||"Cheque"}</strong><small>{row.party||"Project funding"} · {row.direction==="in"?"Incoming":"Outgoing"}</small></div>
          <div><strong>{money(row.amount)}</strong>{!readOnly?<button disabled={Boolean(busy)} onClick={()=>void clearCheque(row.id)}>{busy===row.id?"Updating…":"Mark Cleared"}</button>:null}</div>
        </article>)}</div>
        <footer><span>When cleared, the same cheque changes cash position. Project funding/cost is not counted a second time.</span><strong>{money(total)}</strong></footer>
      </section>
    </div>:null}
  </>;
}
