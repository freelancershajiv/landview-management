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
];

const clientNav = [
  { href: "/client#dashboard", label: "Dashboard" },
  { href: "/client#project", label: "Project" },
  { href: "/client#workflow", label: "Workflow" },
  { href: "/client#finance", label: "Finance" },
  { href: "/client#certificates", label: "Certificates" },
];

export default function RolePortalShell({ portal, children }: { portal: PortalType; children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
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

  if (portal === "employee") {
    return <div className="admin-shell tmg-shell">
      <header className="masthead">
        <div className="utility-bar"><div className="utility-inner">
          <Link href="/employee" className="masthead-brand"><img src="/land-view-logo.svg" alt="LAND VIEW logo" /><div><strong>LAND VIEW</strong><span>ENGINEERS &amp; ARCHITECTS</span></div></Link>
          <div className="utility-items">
            <div className="utility-item"><b>●</b><span><small>SYSTEM STATUS</small>Online</span></div>
            <div className="utility-item"><b>◆</b><span><small>WORKSPACE</small>Employee System</span></div>
            <div className="utility-item user-utility"><div className="utility-avatar">{String(name).slice(0,1).toUpperCase()}</div><span><small>{String(employeeId)}</small>{name}</span></div>
            <button className="utility-logout" onClick={() => { setPasswordOpen(true); setPasswordMessage(""); }}>Password</button>
            <button className="utility-logout" onClick={logout}>Sign out</button>
          </div>
          <button className="mobile-menu tmg-mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(v => !v)}>☰</button>
        </div></div>
        <nav className={`primary-nav ${mobileOpen ? "open" : ""}`}><div className="primary-nav-inner">{employeeNav.map(item => <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>{item.label}</Link>)}</div></nav>
      </header>
      <div className="admin-main tmg-admin-main"><main className="content-wrap tmg-content-wrap">{children}</main></div>
      {passwordModal}
    </div>;
  }

  return <div className="admin-shell tmg-shell">
    <header className="masthead">
      <div className="utility-bar"><div className="utility-inner">
        <Link href="/client" className="masthead-brand"><img src="/land-view-logo.svg" alt="LAND VIEW logo" /><div><strong>LAND VIEW</strong><span>ENGINEERS &amp; ARCHITECTS</span></div></Link>
        <div className="utility-items">
          <div className="utility-item"><b>●</b><span><small>SYSTEM STATUS</small>Online</span></div>
          <div className="utility-item"><b>◆</b><span><small>WORKSPACE</small>Client System</span></div>
          <div className="utility-item user-utility"><div className="utility-avatar">{String(name).slice(0,1).toUpperCase()}</div><span><small>CLIENT ACCESS</small>{name}</span></div>
          <Link href="/" className="utility-logout">Website</Link>
          <button className="utility-logout" onClick={logout}>Sign out</button>
        </div>
        <button className="mobile-menu tmg-mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(v => !v)}>☰</button>
      </div></div>
      <nav className={`primary-nav ${mobileOpen ? "open" : ""}`}><div className="primary-nav-inner">{clientNav.map(item => <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}>{item.label}</Link>)}</div></nav>
    </header>
    <div className="admin-main tmg-admin-main"><main className="content-wrap tmg-content-wrap">{children}</main></div>
  </div>;
}
