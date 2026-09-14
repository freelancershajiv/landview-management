"use client";

import { useEffect, useState } from "react";

type SessionRow = {
  sessionId:string; userId:string; username:string; name:string; role:string;
  deviceId:string; deviceName:string; browser:string; os:string; ipAddress:string; location:string;
  createdAt:number; lastSeenAt:number; expiresAt:number; current?:boolean;
};

type Policy = { idleMinutes?:number; absoluteHours?:number };

function when(value:number){
  if(!value) return "—";
  return new Date(value).toLocaleString("en-GB",{timeZone:"Asia/Dhaka",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}

export default function SecuritySessionsPage(){
  const [sessions,setSessions]=useState<SessionRow[]>([]);
  const [policy,setPolicy]=useState<Policy>({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState("");

  async function load(){
    setLoading(true); setError("");
    try{
      const url=new URL("/api/landview",window.location.origin);
      url.searchParams.set("action","getSession");
      url.searchParams.set("sessionMode","list");
      const response=await fetch(url.toString(),{credentials:"same-origin",cache:"no-store"});
      const json=await response.json();
      if(!response.ok||!json?.success) throw new Error(json?.error||json?.message||"Could not load active sessions.");
      setSessions(Array.isArray(json?.data?.sessions)?json.data.sessions:[]);
      setPolicy(json?.data?.policy||{});
    }catch(err:any){ setError(err?.message||"Could not load active sessions."); }
    finally{ setLoading(false); }
  }

  useEffect(()=>{void load();},[]);

  async function terminate(sessionId:string){
    if(!sessionId||busy) return;
    if(!window.confirm("Terminate this LAND VIEW session? The device will be signed out on its next request.")) return;
    setBusy(sessionId);
    try{
      const response=await fetch("/api/landview",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify({action:"logout",sessionMode:"terminate",sessionId})});
      const json=await response.json();
      if(!response.ok||!json?.success) throw new Error(json?.error||json?.message||"Could not terminate session.");
      await load();
    }catch(err:any){ window.alert(err?.message||"Could not terminate session."); }
    finally{ setBusy(""); }
  }

  return <main style={{padding:"28px 0 48px"}}>
    <section style={{border:"1px solid #303a43",background:"#101820",borderRadius:14,padding:22,marginBottom:18}}>
      <span style={{fontSize:11,fontWeight:900,letterSpacing:".12em",color:"#ff6963"}}>SECURITY</span>
      <h1 style={{margin:"8px 0 8px",fontSize:30}}>Active Sessions</h1>
      <p style={{margin:0,color:"#98a4ae",lineHeight:1.6}}>LAND VIEW automatically expires sessions after {policy.idleMinutes||30} minutes of inactivity and after {policy.absoluteHours||8} hours maximum.</p>
      <button onClick={()=>void load()} disabled={loading} style={{marginTop:16,height:38,padding:"0 14px",borderRadius:7,border:"1px solid #394650",background:"#17232c",color:"#fff",cursor:"pointer"}}>{loading?"Refreshing…":"Refresh sessions"}</button>
    </section>

    {error&&<div style={{padding:14,border:"1px solid #74383c",borderRadius:9,background:"#2d1719",color:"#ffaaa5",marginBottom:16}}>{error}</div>}

    <section style={{overflowX:"auto",border:"1px solid #303a43",borderRadius:12,background:"#0e151c"}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:1100}}>
        <thead><tr>{["User","Role","Device","IP / Location","Created","Last activity","Expires","Action"].map(h=><th key={h} style={{textAlign:"left",padding:"13px 14px",fontSize:11,color:"#8997a2",borderBottom:"1px solid #2b363f"}}>{h}</th>)}</tr></thead>
        <tbody>{sessions.map(s=><tr key={s.sessionId} style={{borderBottom:"1px solid #202a32"}}>
          <td style={{padding:14}}><strong style={{display:"block"}}>{s.name||s.username||s.userId}</strong><small style={{color:"#87939d"}}>{s.userId}{s.current?" · THIS DEVICE":""}</small></td>
          <td style={{padding:14,textTransform:"capitalize"}}>{s.role||"—"}</td>
          <td style={{padding:14}}><strong style={{display:"block"}}>{s.deviceName||"Unknown device"}</strong><small style={{color:"#87939d"}}>{[s.browser,s.os].filter(Boolean).join(" · ")||s.deviceId||"—"}</small></td>
          <td style={{padding:14}}><strong style={{display:"block"}}>{s.ipAddress||"—"}</strong><small style={{color:"#87939d"}}>{s.location||"Location unavailable"}</small></td>
          <td style={{padding:14}}>{when(s.createdAt)}</td>
          <td style={{padding:14}}>{when(s.lastSeenAt)}</td>
          <td style={{padding:14}}>{when(s.expiresAt)}</td>
          <td style={{padding:14}}>{s.current?<span style={{color:"#76c992",fontWeight:800}}>Current</span>:<button disabled={busy===s.sessionId} onClick={()=>void terminate(s.sessionId)} style={{height:34,padding:"0 12px",borderRadius:7,border:"1px solid #7a3338",background:"#35191c",color:"#ff8b84",cursor:"pointer"}}>{busy===s.sessionId?"Terminating…":"Terminate"}</button>}</td>
        </tr>)}{!loading&&!sessions.length&&<tr><td colSpan={8} style={{padding:26,textAlign:"center",color:"#87939d"}}>No active sessions found.</td></tr>}</tbody>
      </table>
    </section>
    <p style={{marginTop:12,color:"#78858f",fontSize:12}}>Login history is also recorded in the Google Sheet tab <strong>Login Sessions</strong>. Browsers cannot expose MAC addresses, so LAND VIEW uses a persistent random Device ID instead.</p>
  </main>;
}
