"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { landViewApi, type SessionUser } from "@/lib/api";

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

type Tab = "profile" | "security" | "details";

const PROFILE_EMPLOYEE_ID = "EMP-0002";
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

function pick(row: any, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
  }
  return fallback;
}

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

function stripPositionMarker(value: unknown) {
  return String(value || "")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("__POSITION__:"))
    .join("\n")
    .trim();
}

function buildPublicBio(position: string, bio: string) {
  return [position.trim() ? `__POSITION__:${position.trim()}` : "", stripPositionMarker(bio)]
    .filter(Boolean)
    .join("\n");
}

export default function AdminAccountPage() {
  const [tab, setTab] = useState<Tab>("profile");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [authAccount, setAuthAccount] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionMeta, setSessionMeta] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busySession, setBusySession] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState({
    name:"", phone:"", email:"", designation:"", department:"", joiningDate:"", publicTitle:"", position:"", bio:"", photoUrl:"", linkedinUrl:"",
  });
  const [password, setPassword] = useState({ current:"", next:"", confirm:"" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const session = await landViewApi.getSession();
      const role = String(session?.user?.role || session?.user?.Role || "").trim().toLowerCase();
      if (role !== "admin") throw new Error("Admin access is required.");
      setSessionUser(session.user);

      const [users, employees, securityResponse] = await Promise.all([
        landViewApi.getUsers(),
        landViewApi.getEmployees(),
        fetch("/api/admin/security/sessions", { credentials:"same-origin", cache:"no-store" }).then(async (response) => {
          const json = await response.json().catch(() => null);
          if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load login sessions.");
          return (json.data || {}) as SessionResponse;
        }),
      ]);

      const admin = (users || []).find((row:any) => String(row.User_ID || row.userId || row.Username || row.username || "").trim().toLowerCase() === "admin") || null;
      const emp = (employees || []).find((row:any) => String(row.Employee_ID || row.employeeId || row.employee_code || "").trim().toUpperCase() === PROFILE_EMPLOYEE_ID) || null;
      setAuthAccount(admin);
      setEmployee(emp);
      setSessions(Array.isArray(securityResponse.sessions) ? securityResponse.sessions : []);
      setSessionMeta(securityResponse);

      if (emp) {
        const publicBio = pick(emp, ["Public_Bio", "Public Bio", "Bio", "public_bio"], "");
        const positionMarker = publicBio.split(/\r?\n/).find((line:string) => line.trim().startsWith("__POSITION__:"));
        setProfile({
          name: pick(emp, ["Employee_Name", "Employee Name", "Name", "name"], ""),
          phone: pick(emp, ["Phone", "Phone_Number", "Phone Number", "Mobile", "phone_number"], ""),
          email: pick(emp, ["Email", "Email_Address", "Email Address", "email"], ""),
          designation: pick(emp, ["Designation", "designation"], ""),
          department: pick(emp, ["Department", "department"], ""),
          joiningDate: pick(emp, ["Joining_Date", "Joining Date", "joining_date"], ""),
          publicTitle: pick(emp, ["Public_Title", "Public Title", "public_title"], ""),
          position: positionMarker ? positionMarker.replace("__POSITION__:", "").trim() : pick(emp, ["Position", "Job_Title", "Job Title"], ""),
          bio: stripPositionMarker(publicBio),
          photoUrl: pick(emp, ["Photo_URL", "Photo URL", "Photo", "photo_url"], ""),
          linkedinUrl: pick(emp, ["LinkedIn_URL", "LinkedIn URL", "LinkedIn", "linkedin_url"], ""),
        });
      }
    } catch (err:any) {
      setError(err?.message || "Could not load account control.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const signedInSessions = useMemo(() => sessions.filter((item) => item.active), [sessions]);
  const activeNow = useMemo(() => signedInSessions.filter((item) => item.current || (item.lastSeenAt && Date.now() - item.lastSeenAt <= ACTIVE_WINDOW_MS)), [signedInSessions]);
  const currentSession = useMemo(() => sessions.find((item) => item.current), [sessions]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const payload = {
        Employee_Name: profile.name,
        "Employee Name": profile.name,
        Name: profile.name,
        Phone: profile.phone,
        Phone_Number: profile.phone,
        "Phone Number": profile.phone,
        Mobile: profile.phone,
        Email: profile.email,
        Email_Address: profile.email,
        "Email Address": profile.email,
        Designation: profile.designation,
        Department: profile.department,
        Joining_Date: profile.joiningDate,
        "Joining Date": profile.joiningDate,
        Public_Title: profile.publicTitle,
        "Public Title": profile.publicTitle,
        Position: profile.position,
        Job_Title: profile.position,
        "Job Title": profile.position,
        Public_Bio: buildPublicBio(profile.position, profile.bio),
        "Public Bio": buildPublicBio(profile.position, profile.bio),
        Bio: buildPublicBio(profile.position, profile.bio),
        Photo_URL: profile.photoUrl,
        "Photo URL": profile.photoUrl,
        Photo: profile.photoUrl,
        LinkedIn_URL: profile.linkedinUrl,
        "LinkedIn URL": profile.linkedinUrl,
        LinkedIn: profile.linkedinUrl,
      };
      await landViewApi.updateEmployee(PROFILE_EMPLOYEE_ID, payload);
      setNotice("Admin profile updated successfully.");
      await load();
    } catch (err:any) {
      setError(err?.message || "Could not update profile.");
    } finally { setSaving(false); }
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
    } catch (err:any) {
      setError(err?.message || "Could not change password.");
    } finally { setSaving(false); }
  }

  async function terminate(sessionId: string) {
    if (!sessionId || busySession) return;
    if (!window.confirm("Terminate this LAND VIEW login session? That device will need to sign in again.")) return;
    setBusySession(sessionId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/security/sessions", {
        method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", cache:"no-store",
        body:JSON.stringify({ action:"terminate", sessionId }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not terminate session.");
      setNotice("Session terminated.");
      await load();
    } catch (err:any) {
      setError(err?.message || "Could not terminate session.");
    } finally { setBusySession(""); }
  }

  async function terminateOthers() {
    const others = signedInSessions.filter((item) => !item.current);
    if (!others.length || busySession) return;
    if (!window.confirm(`Sign out ${others.length} other session${others.length === 1 ? "" : "s"}?`)) return;
    setBusySession("all"); setError(""); setNotice("");
    let done = 0;
    try {
      for (const item of others) {
        const response = await fetch("/api/admin/security/sessions", {
          method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", cache:"no-store",
          body:JSON.stringify({ action:"terminate", sessionId:item.sessionId }),
        });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(json?.error || `Could not terminate session ${item.sessionId}.`);
        done += 1;
      }
      setNotice(`${done} other session${done === 1 ? "" : "s"} signed out.`);
      await load();
    } catch (err:any) {
      setError(`${err?.message || "Could not sign out all sessions."} ${done ? `${done} already terminated.` : ""}`.trim());
      await load();
    } finally { setBusySession(""); }
  }

  const displayName = profile.name || String(sessionUser?.name || sessionUser?.Name || sessionUser?.username || "LAND VIEW Admin");
  const avatar = photoSrc(profile.photoUrl);

  if (loading) return <main style={{padding:"28px 0 48px"}}><div style={{padding:28,border:"1px solid var(--lv-border-default)",borderRadius:14,background:"var(--lv-surface-panel)"}}>Loading account control…</div></main>;

  return <main className="account-control" style={{padding:"28px 0 56px"}}>
    <style>{`
      .account-control *{box-sizing:border-box}
      .account-hero{display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;padding:22px;border:1px solid var(--lv-border-default);border-radius:16px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}
      .account-avatar{width:88px;height:88px;border-radius:20px;overflow:hidden;display:grid;place-items:center;background:var(--lv-brand-soft);border:1px solid var(--lv-border-default);font-size:34px;font-weight:900;color:var(--lv-brand-text)}
      .account-avatar img{width:100%;height:100%;object-fit:cover}
      .account-hero h1{margin:0 0 5px;font-size:28px}.account-hero p{margin:0;color:var(--lv-text-secondary)}
      .account-badge{display:inline-flex;margin-top:10px;padding:5px 9px;border-radius:999px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      .account-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}
      .account-tabs button{border:1px solid var(--lv-border-default);background:var(--lv-surface-panel);color:var(--lv-text-primary);padding:10px 14px;border-radius:9px;font-weight:800;cursor:pointer}
      .account-tabs button.active{background:var(--lv-brand-soft);border-color:var(--lv-brand-border);color:var(--lv-brand-text)}
      .account-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:18px}
      .account-card{border:1px solid var(--lv-border-default);border-radius:14px;background:var(--lv-surface-panel);padding:20px;box-shadow:var(--lv-shadow-sm)}
      .account-card h2{margin:0 0 5px;font-size:19px}.account-card>p{margin:0 0 18px;color:var(--lv-text-secondary);line-height:1.55}
      .account-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.account-form .full{grid-column:1/-1}
      .account-field{display:grid;gap:6px}.account-field label{font-size:12px;font-weight:900;color:var(--lv-text-secondary);text-transform:uppercase;letter-spacing:.05em}
      .account-field input,.account-field textarea{width:100%;min-height:42px;padding:10px 11px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input,var(--lv-surface-panel));color:var(--lv-text-primary);font:inherit}.account-field textarea{min-height:100px;resize:vertical}
      .account-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:16px}.account-btn{min-height:40px;border-radius:8px;border:1px solid var(--lv-border-default);background:var(--lv-surface-panel);color:var(--lv-text-primary);font-weight:800;padding:0 14px;cursor:pointer}.account-btn.primary{background:var(--lv-brand);border-color:var(--lv-brand);color:#fff}.account-btn.danger{border-color:#8d3b3b;color:#d35d5d}.account-btn:disabled{opacity:.55;cursor:not-allowed}
      .account-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px}.account-stat{padding:14px;border:1px solid var(--lv-border-default);border-radius:10px}.account-stat small{display:block;color:var(--lv-text-secondary);font-size:10px;font-weight:900;letter-spacing:.08em}.account-stat strong{display:block;margin-top:4px;font-size:23px}
      .session-list{display:grid;gap:10px}.session-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:14px;border:1px solid var(--lv-border-default);border-radius:10px}.session-row strong{display:block}.session-row small{display:block;margin-top:4px;color:var(--lv-text-secondary);line-height:1.45}.session-live{color:#2d9d63;font-weight:900}.session-idle{color:#c08935;font-weight:900}.session-ended{color:var(--lv-text-secondary);font-weight:900}
      .detail-list{display:grid;gap:0}.detail-line{display:grid;grid-template-columns:160px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--lv-border-default)}.detail-line:last-child{border-bottom:0}.detail-line span{color:var(--lv-text-secondary)}.detail-line strong{overflow-wrap:anywhere}
      .account-notice,.account-error{padding:12px 14px;border-radius:9px;margin:0 0 14px}.account-notice{background:rgba(45,157,99,.1);border:1px solid rgba(45,157,99,.3);color:#2d9d63}.account-error{background:rgba(199,67,67,.1);border:1px solid rgba(199,67,67,.3);color:#c74343}
      @media(max-width:900px){.account-hero{grid-template-columns:auto 1fr}.account-hero>a{grid-column:1/-1}.account-grid{grid-template-columns:1fr}.account-form{grid-template-columns:1fr}.account-form .full{grid-column:auto}.account-stats{grid-template-columns:1fr 1fr}.account-stat:last-child{grid-column:1/-1}.detail-line{grid-template-columns:1fr;gap:3px}}
      @media(max-width:520px){.account-hero{grid-template-columns:1fr;text-align:center}.account-avatar{margin:auto}.account-stats{grid-template-columns:1fr}.account-stat:last-child{grid-column:auto}.session-row{grid-template-columns:1fr}}
    `}</style>

    <section className="account-hero">
      <div className="account-avatar">{avatar ? <img src={avatar} alt={displayName}/> : displayName.slice(0,1).toUpperCase()}</div>
      <div><h1>{displayName}</h1><p>{profile.position || profile.designation || "Administrator"}</p><span className="account-badge">Main Admin</span></div>
      <Link href="/admin" className="account-btn" style={{display:"inline-flex",alignItems:"center",textDecoration:"none"}}>Back to Dashboard</Link>
    </section>

    <div className="account-tabs" role="tablist" aria-label="Account control sections">
      <button type="button" className={tab === "profile" ? "active" : ""} onClick={()=>setTab("profile")}>Profile</button>
      <button type="button" className={tab === "security" ? "active" : ""} onClick={()=>setTab("security")}>Login & Security</button>
      <button type="button" className={tab === "details" ? "active" : ""} onClick={()=>setTab("details")}>Account Details</button>
    </div>

    {error && <div className="account-error">{error}</div>}
    {notice && <div className="account-notice">{notice}</div>}

    {tab === "profile" && <div className="account-grid">
      <form className="account-card" onSubmit={saveProfile}>
        <h2>Admin Profile</h2><p>Controls the personal details and photo used for the main administrator identity.</p>
        <div className="account-form">
          <div className="account-field"><label>Full name</label><input value={profile.name} onChange={(e)=>setProfile(v=>({...v,name:e.target.value}))}/></div>
          <div className="account-field"><label>Position / Title</label><input value={profile.position} onChange={(e)=>setProfile(v=>({...v,position:e.target.value}))}/></div>
          <div className="account-field"><label>Phone</label><input value={profile.phone} onChange={(e)=>setProfile(v=>({...v,phone:e.target.value}))}/></div>
          <div className="account-field"><label>Email</label><input type="email" value={profile.email} onChange={(e)=>setProfile(v=>({...v,email:e.target.value}))}/></div>
          <div className="account-field"><label>Department</label><input value={profile.department} onChange={(e)=>setProfile(v=>({...v,department:e.target.value}))}/></div>
          <div className="account-field"><label>Public title prefix</label><input value={profile.publicTitle} placeholder="Arch." onChange={(e)=>setProfile(v=>({...v,publicTitle:e.target.value}))}/></div>
          <div className="account-field full"><label>Profile photo URL</label><input value={profile.photoUrl} placeholder="Google Drive share link or image URL" onChange={(e)=>setProfile(v=>({...v,photoUrl:e.target.value}))}/></div>
          <div className="account-field full"><label>LinkedIn</label><input value={profile.linkedinUrl} onChange={(e)=>setProfile(v=>({...v,linkedinUrl:e.target.value}))}/></div>
          <div className="account-field full"><label>Bio</label><textarea value={profile.bio} onChange={(e)=>setProfile(v=>({...v,bio:e.target.value}))}/></div>
        </div>
        <div className="account-actions"><button className="account-btn primary" disabled={saving}>{saving ? "Saving…" : "Save Profile"}</button></div>
      </form>
      <aside className="account-card">
        <h2>Profile Preview</h2><p>This is the identity linked to the admin workspace profile.</p>
        <div className="account-avatar" style={{width:120,height:120,marginBottom:16}}>{avatar ? <img src={avatar} alt={displayName}/> : displayName.slice(0,1).toUpperCase()}</div>
        <div className="detail-list">
          <div className="detail-line"><span>Name</span><strong>{displayName}</strong></div>
          <div className="detail-line"><span>Position</span><strong>{profile.position || "—"}</strong></div>
          <div className="detail-line"><span>Phone</span><strong>{profile.phone || "—"}</strong></div>
          <div className="detail-line"><span>Email</span><strong>{profile.email || "—"}</strong></div>
          <div className="detail-line"><span>Profile record</span><strong>{PROFILE_EMPLOYEE_ID}</strong></div>
        </div>
      </aside>
    </div>}

    {tab === "security" && <div className="account-grid">
      <section className="account-card">
        <h2>Login Sessions</h2><p>“Active now” means activity within the last 30 minutes. “Signed in” means the Supabase session is still valid and can be used again.</p>
        <div className="account-stats">
          <div className="account-stat"><small>ACTIVE NOW</small><strong>{activeNow.length}</strong></div>
          <div className="account-stat"><small>SIGNED IN</small><strong>{signedInSessions.length}</strong></div>
          <div className="account-stat"><small>SESSION HISTORY</small><strong>{sessionMeta?.historyCount ?? sessions.length}</strong></div>
        </div>
        <div className="account-actions" style={{marginTop:0,marginBottom:16}}>
          <button type="button" className="account-btn" onClick={()=>void load()}>Refresh Sessions</button>
          <button type="button" className="account-btn danger" onClick={terminateOthers} disabled={busySession === "all" || signedInSessions.filter(s=>!s.current).length === 0}>{busySession === "all" ? "Signing out…" : "Sign Out All Other Devices"}</button>
        </div>
        <div className="session-list">
          {sessions.map((item) => {
            const recent = Boolean(item.current || (item.lastSeenAt && Date.now() - item.lastSeenAt <= ACTIVE_WINDOW_MS));
            return <div className="session-row" key={item.sessionId}>
              <div>
                <strong>{item.current ? "This device" : item.deviceName || "Unknown device"} · {item.browser || item.os || item.role || "Session"}</strong>
                <small>{item.ipAddress || "IP unavailable"} · Last activity {when(item.lastSeenAt)} · Created {when(item.createdAt)}</small>
                <small>{item.active ? (recent ? <span className="session-live">Active now</span> : <span className="session-idle">Signed in · idle</span>) : <span className="session-ended">Ended</span>}{item.expiresAt ? ` · Expires ${when(item.expiresAt)}` : ""}</small>
              </div>
              {!item.current && item.active && <button type="button" className="account-btn danger" disabled={busySession === item.sessionId || busySession === "all"} onClick={()=>void terminate(item.sessionId)}>{busySession === item.sessionId ? "Terminating…" : "Terminate"}</button>}
            </div>;
          })}
          {!sessions.length && <p style={{color:"var(--lv-text-secondary)"}}>No session records found.</p>}
        </div>
      </section>

      <form className="account-card" onSubmit={changePassword}>
        <h2>Password & Current Device</h2><p>Change the password for the main admin login. The current browser remains signed in unless you sign out.</p>
        <div className="account-field"><label>Current password</label><input type="password" autoComplete="current-password" value={password.current} onChange={(e)=>setPassword(v=>({...v,current:e.target.value}))}/></div>
        <div className="account-field" style={{marginTop:12}}><label>New password</label><input type="password" autoComplete="new-password" value={password.next} onChange={(e)=>setPassword(v=>({...v,next:e.target.value}))}/></div>
        <div className="account-field" style={{marginTop:12}}><label>Confirm new password</label><input type="password" autoComplete="new-password" value={password.confirm} onChange={(e)=>setPassword(v=>({...v,confirm:e.target.value}))}/></div>
        <div className="account-actions"><button className="account-btn primary" disabled={saving}>{saving ? "Updating…" : "Change Password"}</button></div>
        <div className="detail-list" style={{marginTop:18}}>
          <div className="detail-line"><span>Current device</span><strong>{currentSession?.deviceName || "—"}</strong></div>
          <div className="detail-line"><span>Browser / OS</span><strong>{[currentSession?.browser,currentSession?.os].filter(Boolean).join(" · ") || "—"}</strong></div>
          <div className="detail-line"><span>Current IP</span><strong>{currentSession?.ipAddress || "—"}</strong></div>
          <div className="detail-line"><span>Last activity</span><strong>{when(currentSession?.lastSeenAt)}</strong></div>
        </div>
      </form>
    </div>}

    {tab === "details" && <div className="account-grid">
      <section className="account-card">
        <h2>Authentication Account</h2><p>Core login identity. Employee/manager permissions continue to be managed from Access Control.</p>
        <div className="detail-list">
          <div className="detail-line"><span>User ID</span><strong>{pick(authAccount,["User_ID","userId","user_key"],"admin")}</strong></div>
          <div className="detail-line"><span>Username</span><strong>{pick(authAccount,["Username","username"],"admin")}</strong></div>
          <div className="detail-line"><span>Role</span><strong>{pick(authAccount,["Role","role"],"Admin")}</strong></div>
          <div className="detail-line"><span>Auth email</span><strong>{pick(authAccount,["Auth_Email","authEmail","auth_email"],"—")}</strong></div>
          <div className="detail-line"><span>Status</span><strong>{String(pick(authAccount,["Active","active"],"true")).toLowerCase() === "false" ? "Disabled" : "Active"}</strong></div>
          <div className="detail-line"><span>Created</span><strong>{dateOnly(pick(authAccount,["Created_At","createdAt","created_at"],""))}</strong></div>
          <div className="detail-line"><span>Profile source</span><strong>{PROFILE_EMPLOYEE_ID}</strong></div>
          <div className="detail-line"><span>Session source</span><strong>{sessionMeta?.source || "Supabase Auth"}</strong></div>
        </div>
      </section>
      <aside className="account-card">
        <h2>Administration</h2><p>Account Control is for your own identity and security. Organization-wide access remains separate.</p>
        <div className="account-actions" style={{display:"grid"}}>
          <Link className="account-btn" href="/admin/access" style={{display:"flex",alignItems:"center",textDecoration:"none"}}>Open Access Control</Link>
          <Link className="account-btn" href="/admin/audit-log" style={{display:"flex",alignItems:"center",textDecoration:"none"}}>Open Audit Log</Link>
          <Link className="account-btn" href="/admin/security" style={{display:"flex",alignItems:"center",textDecoration:"none"}}>Open Full Session History</Link>
        </div>
      </aside>
    </div>}
  </main>;
}
