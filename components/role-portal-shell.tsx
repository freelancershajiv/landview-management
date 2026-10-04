"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { clearStoredSession, landViewApi, readSessionCache, SessionUser } from "@/lib/api";

type PortalType = "employee" | "client";

function normalizeRole(value: unknown) { return String(value || "").trim().toLowerCase(); }
function routeForRole(role: string) {
  if (role === "admin" || role === "manager" || role === "accounts") return "/admin";
  if (role === "employee") return "/employee";
  if (role === "client") return "/client";
  return "/login";
}

const employeeNav = [
  { href: "/employee#dashboard", label: "Dashboard", icon: "⌂" },
  { href: "/employee#projects", label: "My Projects", icon: "▣" },
  { href: "/employee#workflow", label: "Workflow", icon: "↗" },
  { href: "/employee#visits", label: "Site Visits", icon: "⌖" },
  { href: "/employee#documents", label: "Documents", icon: "□" },
  { href: "/employee#attendance", label: "Attendance", icon: "◷" },
  { href: "/employee#expenses", label: "Expenses", icon: "৳" },
  { href: "/employee#certificates", label: "Certificates", icon: "◫" },
];

const clientNav = [
  { href: "/client#dashboard", label: "Dashboard", icon: "⌂" },
  { href: "/client#project", label: "My Project", icon: "▱" },
  { href: "/projectmanagement", label: "Project Management", icon: "▤" },
  { href: "/client#finance", label: "Invoices & Payments", icon: "▣" },
  { href: "/client#certificates", label: "Certificates", icon: "◫" },
  { href: "/client#workflow", label: "Project Updates", icon: "↗" },
  { href: "/client#documents", label: "Documents", icon: "□" },
];

function isChairmanEmployee(u: any) {
  const id = String(u?.employeeId || u?.Employee_ID || u?.userId || u?.User_ID || "").trim().toUpperCase();
  const n = String(u?.name || u?.Name || u?.username || u?.Username || "").trim().toLowerCase();
  return id === "EMP-0001" || n.includes("jamal rony") || n.includes("jamal ahmed bhuiyan");
}

export default function RolePortalShell({ portal, children }: { portal: PortalType; children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeHash, setActiveHash] = useState("#dashboard");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    const update = () => setActiveHash(window.location.hash || "#dashboard");
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    update();
    window.addEventListener("hashchange", update);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("hashchange", update); window.removeEventListener("keydown", escape); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      const cached = readSessionCache();
      const cachedRole = normalizeRole(cached?.user?.role || cached?.user?.Role);
      if (portal === "employee" && cached?.authenticated && cached?.user && cachedRole === "employee") {
        if (!cancelled) { setUser(cached.user); setReady(true); }
        return;
      }
      try {
        const session = await landViewApi.getSession();
        if (!session?.authenticated) throw new Error("Session expired");
        const role = normalizeRole(session.user?.role || session.user?.Role);
        if (role !== portal) { router.replace(routeForRole(role)); return; }
        if (!cancelled) { setUser(session.user); setReady(true); }
      } catch (err: any) {
        if (portal === "employee") {
          if (!cancelled) { setUser(cached?.user || { role: "employee", Role: "Employee" }); setReady(true); setError(""); }
          return;
        }
        clearStoredSession();
        if (!cancelled) setError(err?.message || "Unable to validate session.");
      }
    }
    void verify();
    return () => { cancelled = true; };
  }, [portal, router]);

  function goEmployeeSection(hash: string) {
    if (portal !== "employee") return;
    setMobileOpen(false);
    const next = hash.startsWith("#") ? hash : `#${hash}`;
    window.history.replaceState(null, "", `/employee${next}`);
    setActiveHash(next);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  async function logout() {
    try { await landViewApi.logout(); } catch {}
    clearStoredSession();
    router.replace("/login");
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newPassword.length < 8) { setPasswordMessage("New password must be at least 8 characters."); return; }
    setPasswordSaving(true); setPasswordMessage("");
    try {
      await landViewApi.changeOwnPassword(currentPassword, newPassword);
      setPasswordMessage("Password changed successfully.");
      setCurrentPassword(""); setNewPassword("");
    } catch (err: any) { setPasswordMessage(err?.message || "Could not change password."); }
    finally { setPasswordSaving(false); }
  }

  if (error) return <main className="login-loading"><div className="loading-panel" style={{ maxWidth: 520, padding: 24 }}><img className="loading-brand-image" src="/land-view-logo.svg" alt="LAND VIEW" /><p style={{ marginBottom: 16 }}>{error}</p><button className="btn btn-accent" onClick={() => router.replace("/login")}>Return to login</button></div></main>;
  if (!ready) return <main className="login-loading"><div className="loading-panel"><img className="loading-brand-image" src="/land-view-logo.svg" alt="LAND VIEW" /><div className="loading-spinner" /><p>Opening {portal} portal</p></div></main>;

  const name = user?.name || user?.Name || user?.username || user?.Username || "LAND VIEW User";
  const employeeId = user?.employeeId || user?.Employee_ID || user?.userId || user?.User_ID || "Employee";
  const initials = String(name).split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase() || "LV";

  if (portal === "client") {
    return <div className="lv-client-shell">
      <style>{`
        .lv-client-shell{min-height:100vh;background:#091017;color:#eef2f5;display:grid;grid-template-columns:278px minmax(0,1fr);font-family:Inter,Arial,Helvetica,sans-serif}.lv-client-shell *{box-sizing:border-box}.lv-client-side{position:sticky;top:0;height:100vh;padding:22px 22px 24px;background:linear-gradient(180deg,#0b1219 0%,#0a1117 100%);border-right:1px solid #202b34;display:flex;flex-direction:column;z-index:30}.lv-client-brand{display:flex;align-items:center;gap:12px;color:#fff;text-decoration:none;padding:4px 2px 22px}.lv-client-brand img{width:52px;height:52px;object-fit:contain}.lv-client-brand strong{display:block;font-size:22px;letter-spacing:.08em;line-height:1}.lv-client-brand small{display:block;margin-top:6px;color:#9da8b2;font-size:11px}.lv-client-nav{display:grid;gap:8px;margin-top:8px}.lv-client-nav a{height:50px;display:flex;align-items:center;gap:13px;padding:0 15px;border-radius:9px;color:#d6dde3;text-decoration:none;font-size:14px;border:1px solid transparent;transition:.18s ease}.lv-client-nav a:hover{background:#121b23;border-color:#25323d;color:#fff}.lv-client-nav a[aria-current="location"]{background:linear-gradient(135deg,#ed302f,#c91f2e);color:#fff;border-color:#f03b3a;box-shadow:0 10px 28px rgba(216,31,39,.18)}.lv-client-nav .navIcon{width:22px;height:22px;display:grid;place-items:center;font-size:19px}.lv-client-help{margin-top:auto;padding:16px;border:1px solid #25313b;border-radius:12px;background:#0d161e}.lv-client-help strong{font-size:13px}.lv-client-help p{margin:4px 0 12px;color:#8f9ba5;font-size:11px;line-height:1.45}.lv-client-help a{height:40px;border-radius:8px;background:#273543;color:#fff;text-decoration:none;display:grid;place-items:center;font-size:12px;font-weight:700}.lv-client-foot{padding-top:22px;color:#7d8993;font-size:10px;line-height:1.5}.lv-client-stage{min-width:0}.lv-client-top{height:76px;position:sticky;top:0;z-index:25;background:rgba(10,17,24,.94);backdrop-filter:blur(16px);border-bottom:1px solid #202b34;display:flex;align-items:center;justify-content:space-between;padding:0 30px}.lv-client-top h1{font-size:22px;margin:0}.lv-client-user{display:flex;align-items:center;gap:12px}.lv-client-avatar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#d92532,#9d1725);font-weight:800}.lv-client-user div{display:grid}.lv-client-user strong{font-size:13px}.lv-client-user small{font-size:11px;color:#95a0aa;margin-top:3px}.lv-client-signout{border:1px solid #31404c;background:#111a22;color:#dfe5e9;height:36px;padding:0 12px;border-radius:8px;cursor:pointer}.lv-client-menu{display:none;border:1px solid #31404c;background:#111a22;color:#fff;border-radius:8px;height:38px;padding:0 12px}.lv-client-content{width:min(1260px,calc(100% - 48px));margin:0 auto;padding:0 0 42px}.lv-client-overlay{display:none}
        @media(max-width:980px){.lv-client-shell{grid-template-columns:1fr}.lv-client-side{position:fixed;left:0;top:0;width:280px;transform:translateX(-105%);transition:.22s ease;box-shadow:30px 0 60px rgba(0,0,0,.45)}.lv-client-side.open{transform:translateX(0)}.lv-client-overlay{display:block;position:fixed;inset:0;background:rgba(0,0,0,.52);z-index:29;border:0}.lv-client-top{padding:0 18px}.lv-client-menu{display:inline-flex;align-items:center}.lv-client-content{width:min(100% - 28px,1260px)}.lv-client-user div{display:none}}
        @media(max-width:560px){.lv-client-top h1{font-size:18px}.lv-client-avatar{width:38px;height:38px}.lv-client-signout{display:none}.lv-client-content{width:calc(100% - 20px)}}
      `}</style>
      {mobileOpen && <button aria-label="Close menu" className="lv-client-overlay" onClick={()=>setMobileOpen(false)} />}
      <aside className={`lv-client-side ${mobileOpen?"open":""}`}>
        <Link href="/client" className="lv-client-brand"><img src="/land-view-logo-light.svg" alt="LAND VIEW"/><span><strong>LAND VIEW</strong><small>Engineers and Architects</small></span></Link>
        <nav className="lv-client-nav" aria-label="Client portal navigation">{clientNav.map(item=><Link key={item.href} href={item.href} aria-current={item.href.endsWith(activeHash)?"location":undefined} onClick={()=>{setActiveHash(item.href.slice(item.href.indexOf("#")));setMobileOpen(false);}}><span className="navIcon">{item.icon}</span><span>{item.label}</span></Link>)}</nav>
        <div className="lv-client-help"><strong>Need Help?</strong><p>Contact our support team for project, invoice or certificate assistance.</p><a href="mailto:landviewcivil@gmail.com">Contact Us</a></div>
        <div className="lv-client-foot">© 2026 LAND VIEW<br/>Engineers and Architects<br/>Your Vision. Our Expertise.</div>
      </aside>
      <div className="lv-client-stage">
        <header className="lv-client-top"><div style={{display:"flex",alignItems:"center",gap:12}}><button className="lv-client-menu" onClick={()=>setMobileOpen(v=>!v)}>Menu</button><h1>Client Portal</h1></div><div className="lv-client-user"><div className="lv-client-avatar">{initials}</div><div><strong>{String(name)}</strong><small>LAND VIEW Client</small></div><button className="lv-client-signout" onClick={logout}>Sign out</button></div></header>
        <main id="workspace-content" className="lv-client-content">{children}</main>
      </div>
    </div>;
  }

  const passwordModal = passwordOpen && (
    <div className="modal-backdrop" onMouseDown={() => setPasswordOpen(false)}>
      <form className="modal card" onSubmit={changePassword} onMouseDown={(e) => e.stopPropagation()}>
        <div className="section-title"><div><span>ACCOUNT SECURITY</span><h2>Change password</h2></div><button type="button" className="icon-button" onClick={() => setPasswordOpen(false)}>×</button></div>
        {passwordMessage && <div className="notice"><strong>Password</strong><span>{passwordMessage}</span></div>}
        <div className="form-grid"><label className="form-field"><span>CURRENT PASSWORD</span><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label><label className="form-field"><span>NEW PASSWORD</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required /></label></div>
        <div className="form-actions"><button type="button" className="btn btn-light" onClick={() => setPasswordOpen(false)}>Cancel</button><button type="submit" className="btn btn-dark" disabled={passwordSaving}>{passwordSaving ? "Saving..." : "Change password"}</button></div>
      </form>
    </div>
  );

  const employeeApprovals = isChairmanEmployee(user);

  return <div className="admin-shell tmg-shell portal-employee employee-reference-shell">
    <style>{`
      .portal-employee{--lv-sidebar-width:238px;--lv-topbar-height:74px;min-height:100vh;background:#090b0e;color:#f5f7fa}
      .portal-employee *{box-sizing:border-box}
      .portal-employee .portal-skip{position:absolute;left:-9999px}
      .portal-employee .employee-topbar{position:fixed;z-index:100;top:0;left:var(--lv-sidebar-width);right:0;height:var(--lv-topbar-height);display:flex;align-items:center;border-bottom:1px solid #272e36;background:rgba(9,11,14,.95);backdrop-filter:blur(16px)}
      .portal-employee .employee-topbar-inner{width:100%;height:100%;padding:0 28px;display:flex;align-items:center;gap:18px}
      .portal-employee .employee-menu{width:38px;height:38px;display:grid;place-items:center;flex:0 0 38px;border:0;background:transparent;color:#dce1e5;font-size:22px;cursor:pointer}
      .portal-employee .employee-menu:hover{color:#ff6369}
      .portal-employee .employee-search{width:min(430px,38vw);height:40px;display:flex;align-items:center;gap:9px;padding:0 12px;border:1px solid #2f3943;border-radius:7px;background:#0d1217}
      .portal-employee .employee-search span{color:#88939d;font-size:18px}
      .portal-employee .employee-search input{width:100%;height:100%;border:0;outline:0;background:transparent;color:#eef2f5;font-size:11px}
      .portal-employee .employee-tools{margin-left:auto;display:flex;align-items:center;gap:10px}
      .portal-employee .employee-user{display:flex;align-items:center;gap:10px;padding-right:5px}
      .portal-employee .employee-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#151a20;border:1px solid rgba(214,31,38,.48);color:#ff777b;font-weight:900}
      .portal-employee .employee-user-copy{display:grid;min-width:0}
      .portal-employee .employee-user-copy strong{font-size:11px;color:#eef2f5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px}
      .portal-employee .employee-user-copy small{margin-top:3px;color:#777f89;font-size:8px;text-transform:uppercase;letter-spacing:.08em}
      .portal-employee .employee-action{height:34px;padding:0 11px;border:1px solid #353b44;border-radius:7px;background:#14181e;color:#f3f5f7;font-size:9px;font-weight:900;cursor:pointer}
      .portal-employee .employee-action:hover{border-color:#d61f26;background:rgba(214,31,38,.10)}
      .portal-employee .employee-sidebar{position:fixed;z-index:110;top:0;left:0;bottom:0;width:var(--lv-sidebar-width);display:flex;flex-direction:column;overflow:hidden;border-right:1px solid #272e36;background:radial-gradient(circle at 30% 0%,rgba(214,31,38,.12),transparent 30%),linear-gradient(180deg,#0c0f13,#090b0e 72%);box-shadow:12px 0 35px rgba(0,0,0,.22)}
      .portal-employee .employee-brand{height:78px;width:100%;border:0;cursor:pointer;text-align:left;flex:0 0 auto;padding:16px 19px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #252c34;color:#fff;text-decoration:none}
      .portal-employee .employee-brand img{width:43px;height:43px;object-fit:contain;flex:0 0 43px}
      .portal-employee .employee-brand strong{display:block;font-size:17px;line-height:1;font-weight:900;letter-spacing:.025em}
      .portal-employee .employee-brand small{display:block;margin-top:6px;color:#8d98a3;font-size:6.5px;letter-spacing:.18em;font-weight:800}
      .portal-employee .employee-nav{flex:1;overflow-y:auto;padding:17px 12px 10px;display:flex;flex-direction:column;gap:4px}
      .portal-employee .employee-nav-label{padding:0 12px 10px;color:#59636e;font-size:8px;font-weight:900;letter-spacing:.2em}
      .portal-employee .employee-nav a,.portal-employee .employee-nav-button{min-height:42px;display:flex;align-items:center;gap:11px;padding:0 13px;border:1px solid transparent;border-radius:9px;color:#8f99a3;text-decoration:none;font-size:10.5px;font-weight:800;letter-spacing:.025em;background:transparent;font-family:inherit;cursor:pointer;text-align:left;width:100%}
      .portal-employee .employee-nav a:hover,.portal-employee .employee-nav-button:hover{color:#fff;border-color:#2b343d;background:rgba(255,255,255,.035)}
      .portal-employee .employee-nav a[aria-current="location"],.portal-employee .employee-nav-button[aria-current="location"]{color:#fff;border-color:rgba(214,31,38,.34);background:linear-gradient(90deg,rgba(214,31,38,.20),rgba(214,31,38,.06));box-shadow:inset 3px 0 #d61f26}
      .portal-employee .employee-nav .nav-icon{width:20px;height:20px;display:inline-grid;place-items:center;flex:0 0 20px;color:#7f8994;font-size:15px}
      .portal-employee .employee-nav a[aria-current="location"] .nav-icon,.portal-employee .employee-nav-button[aria-current="location"] .nav-icon,.portal-employee .employee-nav a:hover .nav-icon,.portal-employee .employee-nav-button:hover .nav-icon{color:#ff666c}
      .portal-employee .employee-sidebar-footer{flex:0 0 auto;padding:13px 12px 15px;border-top:1px solid #252c34}
      .portal-employee .employee-profile{min-width:0;padding:10px 9px;display:flex;align-items:center;gap:10px;border-radius:10px;background:rgba(255,255,255,.025)}
      .portal-employee .employee-profile .employee-avatar{width:34px;height:34px;flex:0 0 34px}
      .portal-employee .employee-profile-copy{min-width:0}
      .portal-employee .employee-profile-copy strong,.portal-employee .employee-profile-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .portal-employee .employee-profile-copy strong{font-size:10px;color:#eef2f5}
      .portal-employee .employee-profile-copy small{margin-top:4px;font-size:8px;color:#77818b}
      .portal-employee .employee-main{width:100%;min-height:calc(100vh - var(--lv-topbar-height));margin:var(--lv-topbar-height) 0 0;padding-left:var(--lv-sidebar-width)}
      .portal-employee .employee-content{width:min(1500px,calc(100% - 56px));max-width:1500px;margin:0 28px;padding:28px 0 48px}
      .portal-employee .employee-workspace-root{width:100%;min-height:auto;padding:0;background:transparent}
      .portal-employee .employee-workspace-nav-wrap{display:none}
      .portal-employee .employee-workspace-body{padding:0}
      .portal-employee .portal-header,.portal-employee .portal-navigation{display:none!important}
      @media(max-width:900px){
        .portal-employee{--lv-topbar-height:64px}
        .portal-employee .employee-sidebar{display:none}
        .portal-employee .employee-sidebar.open{display:flex;position:fixed;top:64px;left:0;right:auto;bottom:0;width:280px;box-shadow:25px 0 55px rgba(0,0,0,.45)}
        .portal-employee .employee-topbar{left:0;height:64px}
        .portal-employee .employee-topbar-inner{padding:0 14px;gap:8px}
        .portal-employee .employee-search{flex:1;width:auto;max-width:none}
        .portal-employee .employee-tools{gap:4px}
        .portal-employee .employee-user-copy{display:none}
        .portal-employee .employee-content{width:calc(100% - 28px);margin:0 14px;padding:20px 0 34px}
        .portal-employee .employee-action.password-action{display:none}
      }
      @media(max-width:520px){.portal-employee .employee-action.signout-action{display:none}}
    `}</style>
    <a className="portal-skip" href="#workspace-content">Skip to workspace</a>
    <aside className={mobileOpen ? "employee-sidebar open" : "employee-sidebar"}>
      <button type="button" className="employee-brand" onClick={()=>goEmployeeSection("#dashboard")} aria-label="Open Employee Dashboard">
        <img src="/land-view-logo.svg" alt="LAND VIEW"/>
        <span><strong>LAND VIEW</strong><small>EMPLOYEE WORKSPACE</small></span>
      </button>
      <nav className="employee-nav" aria-label="Employee workspace">
        <div className="employee-nav-label">WORKSPACE</div>
        {employeeNav.map(item=>{const hash=item.href.slice(item.href.indexOf("#"));return <button key={item.href} type="button" className="employee-nav-button" aria-current={hash===activeHash?"location":undefined} onClick={()=>goEmployeeSection(hash)}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></button>;})}
        {employeeApprovals&&<button type="button" className="employee-nav-button" aria-current={activeHash==="#approvals"?"location":undefined} onClick={()=>goEmployeeSection("#approvals")}><span className="nav-icon" aria-hidden="true">✓</span><span>Approvals</span></button>}
      </nav>
      <div className="employee-sidebar-footer">
        <div className="employee-profile">
          <div className="employee-avatar">{initials}</div>
          <div className="employee-profile-copy"><strong>{String(name)}</strong><small>{String(employeeId)}</small></div>
        </div>
      </div>
    </aside>
    <header className="employee-topbar">
      <div className="employee-topbar-inner">
        <button className="employee-menu" aria-label={mobileOpen?"Close navigation":"Open navigation"} aria-expanded={mobileOpen} onClick={()=>setMobileOpen(v=>!v)}>☰</button>
        <div className="employee-search" role="search"><span aria-hidden="true">⌕</span><input aria-label="Search employee workspace" placeholder="Search..." /></div>
        <div className="employee-tools">
          <div className="employee-user"><div className="employee-avatar">{initials}</div><div className="employee-user-copy"><strong>{String(name)}</strong><small>Employee · {String(employeeId)}</small></div></div>
          <button className="employee-action password-action" onClick={()=>{setPasswordOpen(true);setPasswordMessage("")}}>Password</button>
          <button className="employee-action signout-action" onClick={logout}>Sign out</button>
        </div>
      </div>
    </header>
    <div className="employee-main">
      <main id="workspace-content" className="employee-content">{children}</main>
    </div>
    {passwordModal}
  </div>;
}
