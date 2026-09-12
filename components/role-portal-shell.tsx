"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { clearStoredSession, landViewApi, SessionUser } from "@/lib/api";

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
  { href: "/client#dashboard", label: "Dashboard" },
  { href: "/client#project", label: "Project" },
  { href: "/client#workflow", label: "Workflow" },
  { href: "/client#finance", label: "Finance" },
  { href: "/client#certificates", label: "Requests" },
  { href: "/client#certificate-center", label: "Certificates" },
];

export default function RolePortalShell({ portal, children }: { portal: PortalType; children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeHash, setActiveHash] = useState("#dashboard");

  useEffect(() => {
    const update = () => setActiveHash(window.location.hash || "#dashboard");
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    update();
    window.addEventListener("hashchange", update);
    window.addEventListener("keydown", escape);
    return () => {window.removeEventListener("hashchange", update);window.removeEventListener("keydown", escape);};
  }, []);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      try {
        const session = await landViewApi.getSession();
        if (!session?.authenticated) throw new Error("Session expired");
        const role = normalizeRole(session.user?.role || session.user?.Role);
        if (role !== portal) { router.replace(routeForRole(role)); return; }
        if (!cancelled) { setUser(session.user); setReady(true); }
      } catch (err: any) {
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

  const links = portal === "employee" ? employeeNav : clientNav;
  return <div className={`admin-shell tmg-shell portal-${portal}`}>
    <a className="portal-skip" href="#workspace-content">Skip to workspace</a>
    <header className="portal-header">
      <Link href={`/${portal}`} className="portal-brand"><img src="/land-view-logo.svg" alt=""/><span><strong>LAND VIEW</strong><small>{portal === "employee" ? "TEAM WORKSPACE" : "YOUR PROJECT SPACE"}</small></span></Link>
      <div className="portal-identity"><strong>{String(name)}</strong><small>{portal === "employee" ? String(employeeId) : "Client portal"}</small></div>
      <div className="portal-account">
        {portal === "employee" && <button onClick={() => {setPasswordOpen(true); setPasswordMessage("");}}>Password</button>}
        {portal === "client" && <a href="https://landview.com.bd">Website</a>}
        <button onClick={logout}>Sign out</button>
      </div>
      <button className="portal-menu" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="portal-navigation" onClick={() => setMobileOpen(v=>!v)}>{mobileOpen ? "Close" : "Menu"}</button>
    </header>
    <nav id="portal-navigation" aria-label={`${portal} workspace`} className={`portal-navigation ${mobileOpen ? "open" : ""}`}>
      {links.map(item=><Link key={item.href} href={item.href} aria-current={item.href.endsWith(activeHash) ? "location" : undefined} onClick={()=>{setActiveHash(item.href.slice(item.href.indexOf("#")));setMobileOpen(false);}}>{item.label}</Link>)}
    </nav>
    <div className="admin-main tmg-admin-main"><main id="workspace-content" className="content-wrap tmg-content-wrap">{children}</main></div>
    {passwordModal}
  </div>;
}
