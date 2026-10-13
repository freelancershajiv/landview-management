"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type SessionRow = {
  sessionId:string; deviceId:string; deviceName:string; browser:string; os:string; ipAddress:string;
  createdAt:number; lastSeenAt:number; expiresAt:number; revokedAt?:number; active:boolean; current?:boolean;
};

type AccountData = {
  role:string;
  account:{ userId:string; username:string; fullName:string; role:string; employeeCode:string; authEmail:string; active:boolean; createdAt:string; updatedAt:string };
  profile:{ employeeCode:string; name:string; phone:string; email:string; designation:string; department:string; joiningDate:string; status:string; publicDisplay:boolean; publicTitle:string; position:string; bio:string; photoUrl:string; linkedinUrl:string };
  capabilities:{ canEditWorkProfile:boolean };
  sessions:SessionRow[];
  sessionMeta:{ source:string; signedInCount:number; historyCount:number; generatedAt:string };
};

type Tab = "profile" | "security" | "details";
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

function when(value: number | string | undefined) {
  if (!value) return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(String(value));
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { timeZone:"Asia/Dhaka", day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

function dateOnly(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return raw;
  return date.toLocaleDateString("en-GB", { timeZone:"Asia/Dhaka", day:"2-digit", month:"short", year:"numeric" });
}

function photoSrc(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const drive = raw.match(/drive\.google\.com\/file\/d\/([^/]+)/i) || raw.match(/[?&]id=([^&]+)/i);
  if (drive?.[1]) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(drive[1])}&sz=w600`;
  return raw;
}

function roleTitle(role:string) {
  if (role === "admin") return "Main Admin";
  if (role === "manager") return "Manager";
  if (role === "employee") return "Employee";
  return "Account";
}

export default function AccountMaintenance() {
  const [tab, setTab] = useState<Tab>("profile");
  const [data, setData] = useState<AccountData | null>(null);
  const [profile, setProfile] = useState<AccountData["profile"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busySession, setBusySession] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState({ current:"", next:"", confirm:"" });

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/account", { credentials:"same-origin", cache:"no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load account maintenance."));
      const next = json.data as AccountData;
      setData(next);
      setProfile(next.profile);
    } catch (err:any) {
      setError(err?.message || "Could not load account maintenance.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const signedInSessions = useMemo(() => (data?.sessions || []).filter((item) => item.active), [data?.sessions]);
  const activeNow = useMemo(() => signedInSessions.filter((item) => item.current || (item.lastSeenAt && Date.now() - item.lastSeenAt <= ACTIVE_WINDOW_MS)), [signedInSessions]);
  const currentSession = useMemo(() => (data?.sessions || []).find((item) => item.current), [data?.sessions]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!profile || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/account", {
        method:"PATCH", headers:{"Content-Type":"application/json"}, credentials:"same-origin", cache:"no-store",
        body:JSON.stringify(profile),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not update profile."));
      setNotice("Account profile updated successfully.");
      await load();
    } catch (err:any) { setError(err?.message || "Could not update profile."); }
    finally { setSaving(false); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (password.next.length < 8) return setError("New password must be at least 8 characters.");
    if (password.next !== password.confirm) return setError("New passwords do not match.");
    setSaving(true); setError(""); setNotice("");
    try {
      await landViewApi.changeOwnPassword(password.current, password.next);
      setPassword({ current:"", next:"", confirm:"" });
      setNotice("Password changed successfully.");
    } catch (err:any) { setError(err?.message || "Could not change password."); }
    finally { setSaving(false); }
  }

  async function terminate(sessionId:string) {
    if (!sessionId || busySession) return;
    if (!window.confirm("Terminate this LAND VIEW login session? That device will need to sign in again.")) return;
    setBusySession(sessionId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/account", {
        method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", cache:"no-store",
        body:JSON.stringify({ action:"terminate", sessionId }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not terminate session."));
      setNotice("Session terminated.");
      await load();
    } catch (err:any) { setError(err?.message || "Could not terminate session."); }
    finally { setBusySession(""); }
  }

  async function terminateOthers() {
    const others = signedInSessions.filter((item) => !item.current);
    if (!others.length || busySession) return;
    if (!window.confirm(`Sign out ${others.length} other session${others.length === 1 ? "" : "s"}?`)) return;
    setBusySession("all"); setError(""); setNotice("");
    let done = 0;
    try {
      for (const item of others) {
        const response = await fetch("/api/account", {
          method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", cache:"no-store",
          body:JSON.stringify({ action:"terminate", sessionId:item.sessionId }),
        });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not terminate one of the sessions."));
        done += 1;
      }
      setNotice(`${done} other session${done === 1 ? "" : "s"} signed out.`);
      await load();
    } catch (err:any) {
      setError(`${err?.message || "Could not sign out all sessions."}${done ? ` ${done} already terminated.` : ""}`);
      await load();
    } finally { setBusySession(""); }
  }

  if (loading) return <main style={{padding:"28px 0 48px"}}><div className="acct-card" style={{padding:28}}>Loading account maintenance…</div></main>;
  if (!data || !profile) return <main style={{padding:"28px 0 48px"}}><div className="acct-error">{error || "Account information is unavailable."}</div></main>;

  const role = data.role;
  const admin = role === "admin";
  const displayName = profile.name || data.account.fullName || data.account.username || "LAND VIEW User";
  const avatar = photoSrc(profile.photoUrl);
  const backHref = role === "employee" ? "/employee" : "/admin";
  const backLabel = role === "employee" ? "Back to Employee Dashboard" : "Back to Dashboard";

  return <main className="acct-page">
    <style>{`
      .acct-page{padding:28px 0 56px;max-width:1240px;margin:0 auto}.acct-page *{box-sizing:border-box}
      .acct-hero,.acct-card{border:1px solid var(--lv-border-default,rgba(255,255,255,.12));background:var(--lv-surface-panel,var(--theme-bg-_111a22,#111a22));color:var(--lv-text-primary,var(--theme-ink-_eef2f5,#eef2f5));box-shadow:var(--lv-shadow-sm,0 8px 26px rgba(0,0,0,.12))}
      .acct-hero{display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;padding:22px;border-radius:16px}.acct-avatar{width:88px;height:88px;border-radius:20px;overflow:hidden;display:grid;place-items:center;background:var(--lv-brand-soft,rgba(214,31,38,.12));border:1px solid var(--lv-border-default,rgba(255,255,255,.12));font-size:34px;font-weight:900;color:var(--lv-brand-text,#ff7b80)}.acct-avatar img{width:100%;height:100%;object-fit:cover}.acct-hero h1{margin:0 0 5px;font-size:28px}.acct-hero p{margin:0;color:var(--lv-text-secondary,#8f9ba5)}.acct-badge{display:inline-flex;margin-top:10px;padding:5px 9px;border-radius:999px;background:var(--lv-brand-soft,rgba(214,31,38,.12));color:var(--lv-brand-text,#ff7b80);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      .acct-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.acct-tabs button,.acct-btn{border:1px solid var(--lv-border-default,rgba(255,255,255,.12));background:var(--lv-surface-panel,var(--theme-bg-_111a22,#111a22));color:var(--lv-text-primary,var(--theme-ink-_eef2f5,#eef2f5));min-height:40px;padding:0 14px;border-radius:9px;font-weight:800;cursor:pointer}.acct-tabs button.active,.acct-btn.primary{background:var(--lv-brand,#d61f26);border-color:var(--lv-brand,#d61f26);color:#fff}.acct-btn.danger{border-color:#8d3b3b;color:#e36d6d}.acct-btn:disabled{opacity:.5;cursor:not-allowed}.acct-link{display:inline-flex;align-items:center;text-decoration:none}
      .acct-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:18px}.acct-card{border-radius:14px;padding:20px}.acct-card h2{margin:0 0 5px;font-size:19px}.acct-card>p{margin:0 0 18px;color:var(--lv-text-secondary,#8f9ba5);line-height:1.55}.acct-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.acct-form .full{grid-column:1/-1}.acct-field{display:grid;gap:6px}.acct-field label{font-size:11px;font-weight:900;color:var(--lv-text-secondary,#8f9ba5);text-transform:uppercase;letter-spacing:.05em}.acct-field input,.acct-field textarea{width:100%;min-height:42px;padding:10px 11px;border:1px solid var(--lv-border-default,rgba(255,255,255,.12));border-radius:8px;background:var(--lv-surface-input,var(--theme-bg-_0d151c,#0d151c));color:var(--lv-text-primary,var(--theme-ink-_eef2f5,#eef2f5));font:inherit}.acct-field textarea{min-height:100px;resize:vertical}.acct-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:16px}.acct-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px}.acct-stat{padding:14px;border:1px solid var(--lv-border-default,rgba(255,255,255,.12));border-radius:10px}.acct-stat small{display:block;color:var(--lv-text-secondary,#8f9ba5);font-size:10px;font-weight:900;letter-spacing:.08em}.acct-stat strong{display:block;margin-top:4px;font-size:23px}.acct-sessions{display:grid;gap:10px}.acct-session{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:14px;border:1px solid var(--lv-border-default,rgba(255,255,255,.12));border-radius:10px}.acct-session strong{display:block}.acct-session small{display:block;margin-top:4px;color:var(--lv-text-secondary,#8f9ba5);line-height:1.45}.acct-live{color:#42bb78;font-weight:900}.acct-idle{color:#d7a14c;font-weight:900}.acct-ended{color:var(--lv-text-secondary,#8f9ba5);font-weight:900}.acct-details{display:grid}.acct-line{display:grid;grid-template-columns:160px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--lv-border-default,rgba(255,255,255,.1))}.acct-line:last-child{border-bottom:0}.acct-line span{color:var(--lv-text-secondary,#8f9ba5)}.acct-line strong{overflow-wrap:anywhere}.acct-notice,.acct-error{padding:12px 14px;border-radius:9px;margin:0 0 14px}.acct-notice{background:rgba(45,157,99,.1);border:1px solid rgba(45,157,99,.3);color:#42bb78}.acct-error{background:rgba(199,67,67,.1);border:1px solid rgba(199,67,67,.3);color:#e36d6d}.acct-readonly{padding:11px 12px;border-radius:8px;background:rgba(255,255,255,.035);border:1px solid var(--lv-border-default,rgba(255,255,255,.1));color:var(--lv-text-secondary,#8f9ba5);font-size:11px;line-height:1.55}
      @media(max-width:900px){.acct-page{padding:20px 14px 48px}.acct-hero{grid-template-columns:auto 1fr}.acct-hero>a{grid-column:1/-1}.acct-grid{grid-template-columns:1fr}.acct-form{grid-template-columns:1fr}.acct-form .full{grid-column:auto}.acct-stats{grid-template-columns:1fr 1fr}.acct-stat:last-child{grid-column:1/-1}.acct-line{grid-template-columns:1fr;gap:3px}}
      @media(max-width:520px){.acct-hero{grid-template-columns:1fr;text-align:center}.acct-avatar{margin:auto}.acct-stats{grid-template-columns:1fr}.acct-stat:last-child{grid-column:auto}.acct-session{grid-template-columns:1fr}}
    `}</style>

    <section className="acct-hero">
      <div className="acct-avatar">{avatar ? <img src={avatar} alt={displayName}/> : displayName.slice(0,1).toUpperCase()}</div>
      <div><h1>{displayName}</h1><p>{profile.position || profile.designation || roleTitle(role)}</p><span className="acct-badge">{roleTitle(role)}</span></div>
      <Link href={backHref} className="acct-btn acct-link">{backLabel}</Link>
    </section>

    <div className="acct-tabs" role="tablist" aria-label="Account maintenance sections">
      <button type="button" className={tab === "profile" ? "active" : ""} onClick={()=>setTab("profile")}>Profile</button>
      <button type="button" className={tab === "security" ? "active" : ""} onClick={()=>setTab("security")}>Login & Security</button>
      <button type="button" className={tab === "details" ? "active" : ""} onClick={()=>setTab("details")}>Account Details</button>
    </div>

    {error && <div className="acct-error">{error}</div>}
    {notice && <div className="acct-notice">{notice}</div>}

    {tab === "profile" && <div className="acct-grid">
      <form className="acct-card" onSubmit={saveProfile}>
        <h2>{roleTitle(role)} Profile</h2><p>Maintain your own LAND VIEW identity, contact details, profile photo and public profile information.</p>
        {!admin && <div className="acct-readonly" style={{marginBottom:14}}>Employment role, designation, department, joining date and account status are controlled by Admin. Your personal contact/profile details below are self-service.</div>}
        <div className="acct-form">
          <div className="acct-field"><label>Full name</label><input value={profile.name} onChange={(e)=>setProfile(v=>v?({...v,name:e.target.value}):v)}/></div>
          <div className="acct-field"><label>Phone</label><input value={profile.phone} onChange={(e)=>setProfile(v=>v?({...v,phone:e.target.value}):v)}/></div>
          <div className="acct-field"><label>Email</label><input type="email" value={profile.email} onChange={(e)=>setProfile(v=>v?({...v,email:e.target.value}):v)}/></div>
          <div className="acct-field"><label>Public title prefix</label><input value={profile.publicTitle} placeholder="Arch. / Engr." onChange={(e)=>setProfile(v=>v?({...v,publicTitle:e.target.value}):v)}/></div>
          {data.capabilities.canEditWorkProfile && <><div className="acct-field"><label>Position / Title</label><input value={profile.position} onChange={(e)=>setProfile(v=>v?({...v,position:e.target.value}):v)}/></div><div className="acct-field"><label>Department</label><input value={profile.department} onChange={(e)=>setProfile(v=>v?({...v,department:e.target.value}):v)}/></div></>}
          <div className="acct-field full"><label>Profile photo URL</label><input value={profile.photoUrl} placeholder="Google Drive share link or image URL" onChange={(e)=>setProfile(v=>v?({...v,photoUrl:e.target.value}):v)}/></div>
          <div className="acct-field full"><label>LinkedIn</label><input value={profile.linkedinUrl} onChange={(e)=>setProfile(v=>v?({...v,linkedinUrl:e.target.value}):v)}/></div>
          <div className="acct-field full"><label>Bio</label><textarea value={profile.bio} onChange={(e)=>setProfile(v=>v?({...v,bio:e.target.value}):v)}/></div>
        </div>
        <div className="acct-actions"><button className="acct-btn primary" disabled={saving}>{saving ? "Saving…" : "Save Profile"}</button></div>
      </form>

      <aside className="acct-card">
        <h2>Profile & Work Details</h2><p>Your current employee/profile record linked to this login.</p>
        <div className="acct-avatar" style={{width:120,height:120,marginBottom:16}}>{avatar ? <img src={avatar} alt={displayName}/> : displayName.slice(0,1).toUpperCase()}</div>
        <div className="acct-details">
          <div className="acct-line"><span>Employee ID</span><strong>{profile.employeeCode || "—"}</strong></div>
          <div className="acct-line"><span>Designation</span><strong>{profile.designation || "—"}</strong></div>
          <div className="acct-line"><span>Department</span><strong>{profile.department || "—"}</strong></div>
          <div className="acct-line"><span>Joining date</span><strong>{dateOnly(profile.joiningDate)}</strong></div>
          <div className="acct-line"><span>Employment status</span><strong>{profile.status || "—"}</strong></div>
        </div>
      </aside>
    </div>}

    {tab === "security" && <div className="acct-grid">
      <section className="acct-card">
        <h2>My Login Sessions</h2><p>Only sessions belonging to this account are shown. “Active now” means activity within the last 30 minutes; “Signed in” means the session is still valid.</p>
        <div className="acct-stats">
          <div className="acct-stat"><small>ACTIVE NOW</small><strong>{activeNow.length}</strong></div>
          <div className="acct-stat"><small>SIGNED IN</small><strong>{signedInSessions.length}</strong></div>
          <div className="acct-stat"><small>SESSION HISTORY</small><strong>{data.sessionMeta?.historyCount ?? data.sessions.length}</strong></div>
        </div>
        <div className="acct-actions" style={{marginTop:0,marginBottom:16}}>
          <button type="button" className="acct-btn" onClick={()=>void load()}>Refresh Sessions</button>
          <button type="button" className="acct-btn danger" onClick={terminateOthers} disabled={busySession === "all" || signedInSessions.filter(s=>!s.current).length === 0}>{busySession === "all" ? "Signing out…" : "Sign Out All Other Devices"}</button>
        </div>
        <div className="acct-sessions">
          {data.sessions.map((item) => {
            const recent = Boolean(item.current || (item.lastSeenAt && Date.now() - item.lastSeenAt <= ACTIVE_WINDOW_MS));
            return <div className="acct-session" key={item.sessionId}>
              <div>
                <strong>{item.current ? "This device" : item.deviceName || "Unknown device"} · {item.browser || item.os || "Session"}</strong>
                <small>{item.ipAddress || "IP unavailable"} · Last activity {when(item.lastSeenAt)} · Created {when(item.createdAt)}</small>
                <small>{item.active ? (recent ? <span className="acct-live">Active now</span> : <span className="acct-idle">Signed in · idle</span>) : <span className="acct-ended">Ended</span>}{item.expiresAt ? ` · Expires ${when(item.expiresAt)}` : ""}</small>
              </div>
              {!item.current && item.active && <button type="button" className="acct-btn danger" disabled={busySession === item.sessionId || busySession === "all"} onClick={()=>void terminate(item.sessionId)}>{busySession === item.sessionId ? "Terminating…" : "Terminate"}</button>}
            </div>;
          })}
          {!data.sessions.length && <p style={{color:"var(--lv-text-secondary,#8f9ba5)"}}>No session records found.</p>}
        </div>
      </section>

      <form className="acct-card" onSubmit={changePassword}>
        <h2>Password & Current Device</h2><p>Change your own LAND VIEW login password. Your current browser stays signed in unless you sign out.</p>
        <div className="acct-field"><label>Current password</label><input type="password" autoComplete="current-password" value={password.current} onChange={(e)=>setPassword(v=>({...v,current:e.target.value}))} required/></div>
        <div className="acct-field" style={{marginTop:12}}><label>New password</label><input type="password" autoComplete="new-password" minLength={8} value={password.next} onChange={(e)=>setPassword(v=>({...v,next:e.target.value}))} required/></div>
        <div className="acct-field" style={{marginTop:12}}><label>Confirm new password</label><input type="password" autoComplete="new-password" minLength={8} value={password.confirm} onChange={(e)=>setPassword(v=>({...v,confirm:e.target.value}))} required/></div>
        <div className="acct-actions"><button className="acct-btn primary" disabled={saving}>{saving ? "Updating…" : "Change Password"}</button></div>
        <div className="acct-details" style={{marginTop:18}}>
          <div className="acct-line"><span>Current device</span><strong>{currentSession?.deviceName || "—"}</strong></div>
          <div className="acct-line"><span>Browser / OS</span><strong>{[currentSession?.browser,currentSession?.os].filter(Boolean).join(" · ") || "—"}</strong></div>
          <div className="acct-line"><span>Current IP</span><strong>{currentSession?.ipAddress || "—"}</strong></div>
          <div className="acct-line"><span>Last activity</span><strong>{when(currentSession?.lastSeenAt)}</strong></div>
        </div>
      </form>
    </div>}

    {tab === "details" && <div className="acct-grid">
      <section className="acct-card">
        <h2>Authentication Account</h2><p>Core login identity for this LAND VIEW account.</p>
        <div className="acct-details">
          <div className="acct-line"><span>User ID</span><strong>{data.account.userId || "—"}</strong></div>
          <div className="acct-line"><span>Username</span><strong>{data.account.username || "—"}</strong></div>
          <div className="acct-line"><span>Role</span><strong>{roleTitle(data.account.role || role)}</strong></div>
          <div className="acct-line"><span>Auth email</span><strong>{data.account.authEmail || "—"}</strong></div>
          <div className="acct-line"><span>Account status</span><strong>{data.account.active ? "Active" : "Disabled"}</strong></div>
          <div className="acct-line"><span>Created</span><strong>{dateOnly(data.account.createdAt)}</strong></div>
          <div className="acct-line"><span>Profile record</span><strong>{profile.employeeCode || "—"}</strong></div>
          <div className="acct-line"><span>Session source</span><strong>{data.sessionMeta?.source || "Supabase Auth"}</strong></div>
        </div>
      </section>
      <aside className="acct-card">
        <h2>{admin ? "Administration" : "Account Boundaries"}</h2>
        {admin ? <><p>Your personal account stays separate from organization-wide access administration.</p><div className="acct-actions" style={{display:"grid"}}><Link className="acct-btn acct-link" href="/admin/access">Open Access Control</Link><Link className="acct-btn acct-link" href="/admin/audit-log">Open Audit Log</Link><Link className="acct-btn acct-link" href="/admin/security">Open Full Session History</Link></div></> : <><p>You can maintain your own profile, password and signed-in devices here.</p><div className="acct-readonly">Role, permissions, designation, department, employment status and other organization-controlled settings can only be changed by Admin.</div></>}
      </aside>
    </div>}
  </main>;
}
