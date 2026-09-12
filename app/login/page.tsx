"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clearStoredSession, landViewApi, saveSessionCache } from "@/lib/api";

type PortalType = "admin" | "employee" | "client";
const PORTAL_KEY = "land_view_portal_type";

const portals = [
  { id:"admin" as PortalType, label:"Management", short:"A", eyebrow:"ADMIN / MANAGER / ACCOUNTS", description:"Projects, finance, employees, workflow and company administration.", identifier:"USERNAME", placeholder:"Enter username" },
  { id:"employee" as PortalType, label:"Employee", short:"E", eyebrow:"EMPLOYEE WORKSPACE", description:"Assigned projects, workflow, site records, files and attendance.", identifier:"EMPLOYEE ID", placeholder:"EMP-0001" },
  { id:"client" as PortalType, label:"Client", short:"C", eyebrow:"CLIENT PORTAL", description:"Sign in with your LAND VIEW project ID and the mobile number registered with that project.", identifier:"PROJECT ID", placeholder:"LV-1" },
];

function normalizeRole(value: unknown){ return String(value || "").trim().toLowerCase(); }
function portalForRole(role:string):PortalType|null{
  if(["admin","manager","accounts"].includes(role)) return "admin";
  if(role === "employee") return "employee";
  if(role === "client") return "client";
  return null;
}
function roleMatchesPortal(role:string, portal:PortalType){ return portalForRole(role) === portal; }
function portalPath(portal:PortalType){ return portal === "admin" ? "/admin" : portal === "employee" ? "/employee" : "/client"; }

async function quickPost(action:string, body:Record<string,unknown> = {}){
  const response = await fetch("/api/landview", {
    method:"POST", headers:{"Content-Type":"application/json"}, cache:"no-store", credentials:"same-origin",
    body:JSON.stringify({action,...body}),
  });
  let json:any;
  try { json = await response.json(); } catch { throw new Error("The login service returned an invalid response."); }
  if(!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Quick access failed."));
  return json.data || {};
}

async function clientLogin(projectId:string,mobile:string){
  const response = await fetch("/api/client-access", {
    method:"POST", headers:{"Content-Type":"application/json"}, cache:"no-store", credentials:"same-origin",
    body:JSON.stringify({action:"login",projectId,mobile}),
  });
  let json:any;
  try { json=await response.json(); } catch { throw new Error("The client login service returned an invalid response."); }
  if(!response.ok || !json?.success) throw new Error(String(json?.error || "Project ID or mobile number did not match our records."));
  return json.data || {};
}

export default function LoginPage(){
  const router = useRouter();
  const [portal,setPortal] = useState<PortalType>("admin");
  const [userId,setUserId] = useState("");
  const [password,setPassword] = useState("");
  const [clientMobile,setClientMobile] = useState("");
  const [showPassword,setShowPassword] = useState(false);
  const [capsLock,setCapsLock] = useState(false);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [trustedDevice,setTrustedDevice] = useState(false);
  const [quickConfigured,setQuickConfigured] = useState(false);
  const [trustedUntil,setTrustedUntil] = useState<number|null>(null);
  const [quickMode,setQuickMode] = useState(false);
  const [pin,setPin] = useState("");
  const [quickBusy,setQuickBusy] = useState(false);

  useEffect(()=>{
    try{
      const stored = localStorage.getItem(PORTAL_KEY) as PortalType | null;
      if(stored && portals.some(p=>p.id===stored)) setPortal(stored);
    }catch{}
    void quickPost("quickPinStatus").then(data=>{
      setQuickConfigured(Boolean(data?.configured)); setTrustedDevice(Boolean(data?.trusted)); setTrustedUntil(data?.expiresAt ? Number(data.expiresAt) : null);
    }).catch(()=>{});
  },[]);

  const selected = useMemo(()=>portals.find(p=>p.id===portal) || portals[0],[portal]);
  const daysLeft = trustedUntil ? Math.max(0,Math.ceil((trustedUntil-Date.now())/86400000)) : 0;

  function choosePortal(next:PortalType){
    if(loading || quickBusy) return;
    setPortal(next); setUserId(""); setPassword(""); setClientMobile(""); setError(""); setCapsLock(false);
    try{ localStorage.setItem(PORTAL_KEY,next); }catch{}
  }

  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); if(loading) return;
    let id = userId.trim();
    if(portal === "employee" || portal === "client") id = id.toUpperCase();
    if(portal === "client"){
      if(!id || !clientMobile.trim()){ setError("Enter your Project ID and registered mobile number to continue."); return; }
    } else if(!id || !password){ setError(`Enter your ${selected.identifier.toLowerCase()} and password to continue.`); return; }

    setLoading(true); setError(""); clearStoredSession();
    try{
      const result = portal === "client" ? await clientLogin(id,clientMobile.trim()) : await landViewApi.login(id,password);
      const role = normalizeRole(result?.user?.role || result?.user?.Role);
      if(!roleMatchesPortal(role,portal)){
        const correct = portalForRole(role);
        throw new Error(correct ? `This account belongs to the ${portals.find(p=>p.id===correct)?.label || correct} portal.` : "This account cannot access this portal.");
      }
      saveSessionCache({authenticated:true,user:result.user});
      try{ localStorage.setItem(PORTAL_KEY,portal); }catch{}
      router.replace(portalPath(portal));
    }catch(err:any){ clearStoredSession(); setError(err?.message || "Sign in failed. Check your credentials and try again."); }
    finally{ setLoading(false); }
  }

  async function unlockPin(value:string){
    if(quickBusy || value.length!==6) return;
    setQuickBusy(true); setError("");
    try{
      const data = await quickPost("quickPinLogin",{pin:value});
      if(!data?.user) throw new Error("PIN login session is unavailable.");
      saveSessionCache({authenticated:true,user:data.user});
      try{localStorage.setItem(PORTAL_KEY,"admin");}catch{}
      window.location.replace("/admin");
    }catch(err:any){ clearStoredSession(); setPin(""); setError(err?.message || "Incorrect Admin PIN."); }
    finally{ setQuickBusy(false); }
  }

  function handlePin(value:string){ const next=value.replace(/\D/g,"").slice(0,6); setPin(next); setError(""); if(next.length===6) void unlockPin(next); }
  function keyState(e:KeyboardEvent<HTMLInputElement>){ setCapsLock(Boolean(e.getModifierState?.("CapsLock"))); }

  return <main className="lv-login" data-portal={quickMode ? "admin" : portal}>
    <style>{`
      *{box-sizing:border-box}.lv-login{min-height:100vh;background:#0c0d0f;color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;display:grid;grid-template-rows:auto 1fr auto}.lv-login .lv-head{height:76px;border-bottom:1px solid #26282b;background:#0e1012;display:flex;align-items:center}.lv-login .lv-headin,.lv-login .lv-main{width:min(1220px,calc(100% - 44px));margin:auto}.lv-login .lv-headin{display:flex;justify-content:space-between;align-items:center}.lv-login .brand{display:flex;gap:12px;align-items:center;background:none;border:0;color:#fff;cursor:pointer;text-align:left}.lv-login .brand img{width:43px;height:43px;object-fit:contain}.lv-login .brand strong{display:block;font-size:14px;letter-spacing:.12em}.lv-login .brand span{display:block;color:#7e858c;font-size:8px;letter-spacing:.15em;margin-top:3px}.lv-login .meta{display:flex;gap:18px;color:#777f86;font-size:8px;font-weight:900;letter-spacing:.1em}.lv-login .green{display:inline-block;width:7px;height:7px;border-radius:50%;background:#57bd7b;margin-right:6px}.lv-login .lv-main{padding:50px 0 58px;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(390px,.78fr);gap:68px;align-items:center}.lv-login .kicker{display:inline-flex;align-items:center;gap:8px;color:#ef766c;font-size:9px;font-weight:900;letter-spacing:.18em}.lv-login .kicker:before{content:"";width:24px;height:1px;background:#ef493b}.lv-login .copy h1{font-size:clamp(42px,5vw,70px);line-height:.95;letter-spacing:-.055em;margin:17px 0 20px}.lv-login .copy h1 span{color:#ef493b}.lv-login .copy>p{max-width:640px;color:#92989f;font-size:14px;line-height:1.75}.lv-login .info{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:30px;max-width:700px}.lv-login .info div{border:1px solid #292d31;background:#121416;border-radius:11px;padding:15px}.lv-login .info small{display:block;color:#687078;font-size:8px;font-weight:900;letter-spacing:.1em}.lv-login .info strong{display:block;margin-top:8px;font-size:10px}.lv-login .summary{margin-top:25px;border-left:2px solid #ef493b;padding:16px 18px;background:linear-gradient(90deg,rgba(239,73,59,.08),transparent);max-width:700px}.lv-login .summary small{color:#ef776e;font-size:8px;font-weight:900;letter-spacing:.12em}.lv-login .summary strong{display:block;margin-top:6px;font-size:14px}.lv-login .summary p{margin:6px 0 0;color:#828990;font-size:10px;line-height:1.5}.lv-login .card{border:1px solid #2c3034;background:#151719;border-radius:15px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.35)}.lv-login .cardhead{padding:21px 22px 17px;border-bottom:1px solid #292d31;display:flex;justify-content:space-between;align-items:center}.lv-login .cardhead small{display:block;color:#727a81;font-size:8px;font-weight:900;letter-spacing:.13em}.lv-login .cardhead h2{font-size:19px;margin:6px 0 0}.lv-login .session{font-size:7px;color:#7e858c}.lv-login .session.active{color:#a0d7b0}.lv-login .tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;padding:14px 14px 0}.lv-login .tab{min-height:68px;border:1px solid #2d3135;border-radius:9px;background:#101214;color:#92999f;display:grid;place-items:center;align-content:center;gap:6px;cursor:pointer}.lv-login .tab.active{border-color:#ef493b;background:rgba(239,73,59,.09);color:#fff}.lv-login .tab b{display:grid;place-items:center;width:26px;height:26px;border-radius:7px;background:#25292d;font-size:9px}.lv-login .tab.active b{background:#ef493b}.lv-login .tab span{font-size:9px;font-weight:900}.lv-login .form{padding:18px 22px 23px}.lv-login .error{display:grid;grid-template-columns:28px 1fr;gap:9px;padding:11px;margin-bottom:13px;border:1px solid rgba(239,73,59,.28);border-radius:8px;background:rgba(239,73,59,.08)}.lv-login .error i{width:27px;height:27px;display:grid;place-items:center;border-radius:50%;background:#ef493b;font-style:normal;font-weight:900}.lv-login .error strong{font-size:10px}.lv-login .error p{margin:3px 0 0;color:#d3a19c;font-size:9px;line-height:1.4}.lv-login .pinbtn{width:100%;height:43px;border:1px solid #33513d;border-radius:8px;background:#15211a;color:#a8dbb7;font-size:8px;font-weight:900;letter-spacing:.09em;cursor:pointer}.lv-login .trust{text-align:center;color:#7da98a;font-size:8px;margin:7px 0 12px}.lv-login .field{display:block;margin-top:13px}.lv-login .fieldrow{display:flex;justify-content:space-between;margin-bottom:7px}.lv-login .fieldrow span{color:#899097;font-size:8px;font-weight:900;letter-spacing:.11em}.lv-login .caps{color:#d8ad68!important}.lv-login .wrap{position:relative}.lv-login .field input{width:100%;height:49px;border:1px solid #303438;border-radius:8px;background:#0d0f11;color:#fff;padding:0 13px;outline:none}.lv-login .field input:focus{border-color:#ef493b;box-shadow:0 0 0 3px rgba(239,73,59,.1)}.lv-login .password{padding-right:62px!important}.lv-login .show{position:absolute;right:7px;top:50%;transform:translateY(-50%);height:33px;border:0;border-radius:6px;background:#1b1e21;color:#9ba1a7;font-size:8px;font-weight:900;cursor:pointer}.lv-login .submit{width:100%;height:51px;margin-top:17px;border:0;border-radius:8px;background:#ef493b;color:white;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-size:9px;font-weight:900;letter-spacing:.09em;cursor:pointer}.lv-login .submit:disabled{opacity:.55}.lv-login .note{text-align:center;color:#687078;font-size:8px;margin-top:12px}.lv-login .pinpanel{padding:23px}.lv-login .pintitle{text-align:center}.lv-login .pintitle small{color:#747c83;font-size:8px;font-weight:900;letter-spacing:.12em}.lv-login .pintitle h2{margin:7px 0 14px}.lv-login .pinfield{width:100%;height:61px;border:1px solid #34383c;border-radius:9px;background:#0c0e10;color:#fff;text-align:center;font-size:24px;font-weight:900;letter-spacing:.45em;padding-left:.45em;outline:none}.lv-login .pinfield:focus{border-color:#ef493b}.lv-login .pinhelp{text-align:center;color:#777e85;font-size:8px;margin:10px 0 14px}.lv-login .switch{width:100%;height:41px;border:1px solid #303438;border-radius:8px;background:#111315;color:#c5c9cc;font-size:8px;font-weight:900;cursor:pointer}.lv-login .footer{height:54px;border-top:1px solid #24272a;display:flex;align-items:center;justify-content:center;color:#626970;font-size:8px;letter-spacing:.08em}@media(max-width:900px){.lv-login .lv-main{grid-template-columns:1fr;gap:34px}.lv-login .meta{display:none}.lv-login .card{max-width:560px}.lv-login .info{max-width:560px}}@media(max-width:600px){.lv-login .lv-headin,.lv-login .lv-main{width:calc(100% - 28px)}.lv-login .lv-main{padding:28px 0 40px}.lv-login .copy h1{font-size:38px}.lv-login .copy>p{font-size:12px}.lv-login .info{grid-template-columns:1fr}.lv-login .tabs{gap:5px;padding:11px 11px 0}.lv-login .form,.lv-login .pinpanel{padding:16px 17px 20px}.lv-login .cardhead{padding:18px 17px 15px}}
    `}</style>

    <header className="lv-head"><div className="lv-headin">
      <button className="brand" type="button" onClick={()=>window.location.assign("https://landview.com.bd")}><img src="/land-view-logo.png" alt="LAND VIEW"/><div><strong>LAND VIEW</strong><span>ARCHITECTS & ENGINEERS</span></div></button>
      <div className="meta"><span><i className="green"/>SYSTEM ONLINE</span><span>SECURE ROLE-BASED ACCESS</span></div>
    </div></header>

    <section className="lv-main">
      <div className="copy"><span className="kicker">LAND VIEW ERP</span><h1>{quickMode ? <>Trusted device<br/><span>PIN access.</span></> : <>One system.<br/><span>Three workspaces.</span></>}</h1><p>{quickMode ? "Use your permanent six-digit Admin PIN on this trusted browser to create a fresh secure session." : "A single controlled gateway for management, employees and clients. Clients now enter with their Project ID and registered mobile number."}</p>
        <div className="info"><div><small>CLIENT ACCESS</small><strong>Project ID + mobile</strong></div><div><small>PROJECT STATUS</small><strong>Workflow progress live</strong></div><div><small>FINANCE</small><strong>Bill, paid and due</strong></div></div>
        <div className="summary"><small>{quickMode?"TRUSTED ADMIN ACCESS":selected.eyebrow}</small><strong>{quickMode?"PIN Login":selected.label}</strong><p>{quickMode?"PIN access is available only while this browser remains trusted.":selected.description}</p></div>
      </div>

      <section className="card">
        {quickMode&&trustedDevice&&quickConfigured ? <div className="pinpanel"><div className="pintitle"><small>TRUSTED DEVICE</small><h2>Admin PIN Login</h2></div>{error&&<div className="error"><i>!</i><div><strong>PIN login failed</strong><p>{error}</p></div></div>}<input className="pinfield" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e=>handlePin(e.target.value)} autoFocus disabled={quickBusy} placeholder="••••••"/><div className="pinhelp">{quickBusy?"Creating secure Admin session…":"Enter all 6 digits to sign in automatically."}</div><button className="switch" type="button" onClick={()=>{setQuickMode(false);setPin("");setError("");}}>USE USERNAME & PASSWORD</button></div> : <>
          <div className="cardhead"><div><small>SECURE LOGIN</small><h2>Sign in to LAND VIEW</h2></div><span className="session">READY</span></div>
          <div className="tabs">{portals.map(p=><button key={p.id} aria-pressed={portal===p.id} className={`tab ${portal===p.id?"active":""}`} type="button" onClick={()=>choosePortal(p.id)} disabled={loading}><b>{p.short}</b><span>{p.label}</span></button>)}</div>
          <form className="form" onSubmit={submit}>{error&&<div className="error"><i>!</i><div><strong>Sign in failed</strong><p>{error}</p></div></div>}{trustedDevice&&quickConfigured&&portal==="admin"&&<><button className="pinbtn" type="button" onClick={()=>{setQuickMode(true);setError("");setPin("");}}>PIN LOGIN ON THIS TRUSTED DEVICE</button><div className="trust">Trusted access expires in about {daysLeft||1} day{daysLeft===1?"":"s"}</div></>}
            <label className="field"><span className="fieldrow"><span>{selected.identifier}</span></span><span className="wrap"><input value={userId} onChange={e=>{setUserId((portal==="employee"||portal==="client")?e.target.value.toUpperCase():e.target.value);setError("");}} placeholder={selected.placeholder} autoComplete="username" disabled={loading} autoFocus/></span></label>
            {portal === "client" ? <label className="field"><span className="fieldrow"><span>REGISTERED MOBILE NUMBER</span></span><span className="wrap"><input value={clientMobile} onChange={e=>{setClientMobile(e.target.value);setError("");}} placeholder="01XXXXXXXXX" inputMode="tel" autoComplete="tel" disabled={loading}/></span></label> : <label className="field"><span className="fieldrow"><span>PASSWORD</span>{capsLock&&<span className="caps">CAPS LOCK IS ON</span>}</span><span className="wrap"><input className="password" type={showPassword?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}} onKeyDown={keyState} onKeyUp={keyState} placeholder="Enter your password" autoComplete="current-password" disabled={loading}/><button className="show" type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword?"HIDE":"SHOW"}</button></span></label>}
            <button className="submit" type="submit" disabled={loading}><span>{loading?"AUTHENTICATING…":`CONTINUE TO ${selected.label.toUpperCase()}`}</span><span>→</span></button><div className="note">{portal==="client"?"Access is limited to the project that matches both details.":"Your account role is verified before workspace access is granted."}</div>
          </form>
        </>}
      </section>
    </section>

    <footer className="footer">LAND VIEW · ENGINEERS & ARCHITECTS · SECURE ERP ACCESS</footer>
  </main>;
}