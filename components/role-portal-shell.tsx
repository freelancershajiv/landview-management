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
  { href: "/employee#dashboard", label: "Dashboard" },
  { href: "/employee#projects", label: "Projects" },
  { href: "/employee#workflow", label: "Workflow" },
  { href: "/employee#visits", label: "Site Visits" },
  { href: "/employee#documents", label: "Documents" },
  { href: "/employee#attendance", label: "Attendance" },
  { href: "/employee#certificates", label: "Certificates" },
];

const clientNav = [
  { href: "/client#dashboard", label: "Dashboard", icon: "⌂" },
  { href: "/client#project", label: "My Project", icon: "▱" },
  { href: "/client#finance", label: "Invoices & Payments", icon: "▣" },
  { href: "/client#certificates", label: "Certificates", icon: "◫" },
  { href: "/client#workflow", label: "Project Updates", icon: "↗" },
  { href: "/client#documents", label: "Documents", icon: "□" },
];

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

  return <div className="admin-shell tmg-shell portal-employee">
    <a className="portal-skip" href="#workspace-content">Skip to workspace</a>
    <header className="portal-header">
      <Link href="/employee" className="portal-brand"><img src="/land-view-logo.svg" alt=""/><span><strong>LAND VIEW</strong><small>TEAM WORKSPACE</small></span></Link>
      <div className="portal-identity"><strong>{String(name)}</strong><small>{String(employeeId)}</small></div>
      <div className="portal-account"><button onClick={() => {setPasswordOpen(true); setPasswordMessage("");}}>Password</button><button onClick={logout}>Sign out</button></div>
      <button className="portal-menu" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="portal-navigation" onClick={() => setMobileOpen(v=>!v)}>{mobileOpen ? "Close" : "Menu"}</button>
    </header>
    <nav id="portal-navigation" aria-label="employee workspace" className={`portal-navigation ${mobileOpen ? "open" : ""}`}>{employeeNav.map(item=><Link key={item.href} href={item.href} aria-current={item.href.endsWith(activeHash)?"location":undefined} onClick={()=>{setActiveHash(item.href.slice(item.href.indexOf("#")));setMobileOpen(false);}}>{item.label}</Link>)}</nav>
    <div className="admin-main tmg-admin-main"><main id="workspace-content" className="content-wrap tmg-content-wrap">{children}</main></div>
    {passwordModal}
  </div>;
}
