"use client";

import { useEffect, useMemo, useState } from "react";

type SessionRow = {
  sessionId:string; userId:string; username:string; name:string; role:string;
  deviceId:string; deviceName:string; browser:string; os:string; ipAddress:string; location:string;
  createdAt:number; lastSeenAt:number; expiresAt:number; revokedAt?:number; active:boolean; current?:boolean;
};

type SessionResponse = {
  sessions:SessionRow[];
  source:string;
  activeCount:number;
  historyCount:number;
  generatedAt:string;
};

function when(value:number){
  if(!value) return "—";
  return new Date(value).toLocaleString("en-GB",{timeZone:"Asia/Dhaka",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}

export default function SecuritySessionsPage(){
  const [sessions,setSessions]=useState<SessionRow[]>([]);
  const [meta,setMeta]=useState<Pick<SessionResponse,"source"|"activeCount"|"historyCount"|"generatedAt">>({source:"Supabase Auth",activeCount:0,historyCount:0,generatedAt:""});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");
  const [showHistory,setShowHistory]=useState(false);

  async function load(){
    setLoading(true); setError("");
    try{
      const response=await fetch("/api/admin/security/sessions",{credentials:"same-origin",cache:"no-store"});
      const json=await response.json();
      if(!response.ok||!json?.success) throw new Error(json?.error||json?.message||"Could not load Supabase sessions.");
      const data=(json.data||{}) as SessionResponse;
      setSessions(Array.isArray(data.sessions)?data.sessions:[]);
      setMeta({source:data.source||"Supabase Auth",activeCount:Number(data.activeCount||0),historyCount:Number(data.historyCount||0),generatedAt:data.generatedAt||""});
    }catch(err:any){ setError(err?.message||"Could not load Supabase sessions."); }
    finally{ setLoading(false); }
  }

  useEffect(()=>{void load();},[]);

  async function terminate(sessionId:string){
    if(!sessionId||busy) return;
    if(!window.confirm("Terminate this LAND VIEW session? That device will lose its Supabase Auth session.")) return;
    setBusy(sessionId);
    try{
      const response=await fetch("/api/admin/security/sessions",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        credentials:"same-origin",
        cache:"no-store",
        body:JSON.stringify({action:"terminate",sessionId}),
      });
      const json=await response.json();
      if(!response.ok||!json?.success) throw new Error(json?.error||json?.message||"Could not terminate session.");
      await load();
    }catch(err:any){ window.alert(err?.message||"Could not terminate session."); }
    finally{ setBusy(""); }
  }

  const visible=useMemo(()=>showHistory?sessions:sessions.filter(session=>session.active),[sessions,showHistory]);

  return <main style={{padding:"28px 0 48px"}}>
    <section style={{border:"1px solid var(--theme-line-_303a43, #303a43)",background:"var(--theme-bg-_101820, #101820)",borderRadius:14,padding:22,marginBottom:18}}>
      <span style={{fontSize:11,fontWeight:900,letterSpacing:".12em",color:"#ff6963"}}>SECURITY / SUPABASE AUTH</span>
      <h1 style={{margin:"8px 0 8px",fontSize:30}}>Session Control</h1>
      <p style={{margin:0,color:"var(--theme-ink-_98a4ae, #98a4ae)",lineHeight:1.6}}>Supabase Auth is now the authoritative LAND VIEW login-session source. Active, refreshed, expired and terminated sessions are mirrored into the PostgreSQL session register automatically.</p>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:16}}>
        <div style={{border:"1px solid var(--theme-line-_303a43, #303a43)",borderRadius:8,padding:"9px 12px"}}><small style={{display:"block",color:"var(--theme-ink-_87939d, #87939d)"}}>ACTIVE</small><strong>{meta.activeCount}</strong></div>
        <div style={{border:"1px solid var(--theme-line-_303a43, #303a43)",borderRadius:8,padding:"9px 12px"}}><small style={{display:"block",color:"var(--theme-ink-_87939d, #87939d)"}}>SESSION HISTORY</small><strong>{meta.historyCount}</strong></div>
        <div style={{border:"1px solid var(--theme-line-_303a43, #303a43)",borderRadius:8,padding:"9px 12px"}}><small style={{display:"block",color:"var(--theme-ink-_87939d, #87939d)"}}>SOURCE</small><strong>{meta.source}</strong></div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:16}}>
        <button onClick={()=>void load()} disabled={loading} style={{height:38,padding:"0 14px",borderRadius:7,border:"1px solid var(--theme-line-_394650, #394650)",background:"var(--theme-bg-_17232c, #17232c)",color:"var(--theme-ink-_fff, #fff)",cursor:"pointer"}}>{loading?"Refreshing…":"Refresh sessions"}</button>
        <button onClick={()=>setShowHistory(value=>!value)} style={{height:38,padding:"0 14px",borderRadius:7,border:"1px solid var(--theme-line-_394650, #394650)",background:"var(--theme-bg-_17232c, #17232c)",color:"var(--theme-ink-_fff, #fff)",cursor:"pointer"}}>{showHistory?"Show active only":"Show session history"}</button>
      </div>
    </section>

    {error&&<div style={{padding:14,border:"1px solid var(--theme-line-_74383c, #74383c)",borderRadius:9,background:"var(--theme-bg-_2d1719, #2d1719)",color:"var(--theme-ink-_ffaaa5, #ffaaa5)",marginBottom:16}}>{error}</div>}

    <section style={{overflowX:"auto",border:"1px solid var(--theme-line-_303a43, #303a43)",borderRadius:12,background:"var(--theme-bg-_0e151c, #0e151c)"}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:1180}}>
        <thead><tr>{["User","Role","Device","IP","Created","Last activity","Auth expiry","Status / Action"].map(h=><th key={h} style={{textAlign:"left",padding:"13px 14px",fontSize:11,color:"var(--theme-ink-_8997a2, #8997a2)",borderBottom:"1px solid var(--theme-line-_2b363f, #2b363f)"}}>{h}</th>)}</tr></thead>
        <tbody>{visible.map(s=><tr key={s.sessionId} style={{borderBottom:"1px solid var(--theme-line-_202a32, #202a32)",opacity:s.active?1:.68}}>
          <td style={{padding:14}}><strong style={{display:"block"}}>{s.name||s.username||s.userId}</strong><small style={{color:"var(--theme-ink-_87939d, #87939d)"}}>{s.userId}{s.current?" · THIS DEVICE":""}</small></td>
          <td style={{padding:14,textTransform:"capitalize"}}>{s.role||"—"}</td>
          <td style={{padding:14}}><strong style={{display:"block"}}>{s.deviceName||"Unknown device"}</strong><small style={{color:"var(--theme-ink-_87939d, #87939d)"}}>{[s.browser,s.os].filter(Boolean).join(" · ")||s.deviceId||"—"}</small></td>
          <td style={{padding:14}}>{s.ipAddress||"—"}</td>
          <td style={{padding:14}}>{when(s.createdAt)}</td>
          <td style={{padding:14}}>{when(s.lastSeenAt)}</td>
          <td style={{padding:14}}>{s.expiresAt?when(s.expiresAt):"No fixed timebox"}</td>
          <td style={{padding:14}}>{s.current?<span style={{color:"var(--theme-ink-_76c992, #76c992)",fontWeight:800}}>Current</span>:!s.active?<span style={{color:"var(--theme-ink-_87939d, #87939d)",fontWeight:800}}>Ended</span>:<button disabled={busy===s.sessionId} onClick={()=>void terminate(s.sessionId)} style={{height:34,padding:"0 12px",borderRadius:7,border:"1px solid var(--theme-line-_7a3338, #7a3338)",background:"var(--theme-bg-_35191c, #35191c)",color:"var(--theme-ink-_ff8b84, #ff8b84)",cursor:"pointer"}}>{busy===s.sessionId?"Terminating…":"Terminate"}</button>}</td>
        </tr>)}{!loading&&!visible.length&&<tr><td colSpan={8} style={{padding:26,textAlign:"center",color:"var(--theme-ink-_87939d, #87939d)"}}>No {showHistory?"session history":"active sessions"} found.</td></tr>}</tbody>
      </table>
    </section>
    <p style={{marginTop:12,color:"var(--theme-ink-_78858f, #78858f)",fontSize:12}}>Session records are stored in Supabase PostgreSQL and synchronized from Supabase Auth. Google Sheets are no longer part of LAND VIEW session management.</p>
  </main>;
}
