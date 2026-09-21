"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { clearStoredSession, landViewApi, readSessionCache, saveSessionCache, type SessionUser } from "@/lib/api";

type PermissionMap = Record<string, boolean>;
type WorkspaceAccess = {
  userId?: string;
  employeeId?: string;
  username?: string;
  name?: string;
  role?: string;
  all?: boolean;
  permissions?: PermissionMap;
};

type NavItem = { href: string; label: string; permission?: string; adminOnly?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const nav: NavItem[] = [
  { href: "/admin", label: "Dashboard", permission: "dashboard.view" },
  { href: "/admin/projects", label: "Projects", permission: "projects.view" },
  { href: "/admin/estimate", label: "Estimates", permission: "projects.view" },
  { href: "/admin/workflow", label: "Workflow", permission: "workflow.view" },
  { href: "/admin/registers", label: "Document Registry", permission: "documents.view" },
  { href: "/admin/employees", label: "Employees", permission: "employees.view" },
  { href: "/admin/certificate-requests", label: "Certificate Requests", permission: "requests.view" },
  { href: "/admin/certificates", label: "Certificates", permission: "certificates.view" },
  { href: "/admin/finance", label: "Billing", permission: "finance.view" },
  { href: "/admin/access", label: "Access Control", adminOnly: true },
  { href: "/admin/accounts/entry", label: "Accounts", permission: "accounts.view" },
  { href: "/admin/accounts", label: "Ledger", permission: "ledger.view" },
  { href: "/admin/proposals", label: "Proposals", permission: "proposals.view" },
];

const navGroups: NavGroup[] = [
  { label: "WORK", items: nav.filter((item) => ["/admin/projects", "/admin/estimate", "/admin/workflow", "/admin/proposals"].includes(item.href)) },
  { label: "DOCUMENTS", items: nav.filter((item) => ["/admin/registers", "/admin/certificate-requests", "/admin/certificates"].includes(item.href)) },
  { label: "FINANCE", items: nav.filter((item) => ["/admin/finance", "/admin/accounts/entry", "/admin/accounts"].includes(item.href)) },
  { label: "PEOPLE", items: nav.filter((item) => item.href === "/admin/employees") },
  { label: "ADMINISTRATION", items: nav.filter((item) => item.href === "/admin/access") },
];

const SESSION_WATCHDOG_MS = 8000;

function roleOf(user?: SessionUser | null) {
  return String(user?.role || user?.Role || "").trim().toLowerCase();
}
function isWorkspaceRole(role: string) {
  return ["admin", "manager", "accounts", "employee"].includes(role);
}
function currentMatches(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  if (href === "/admin/accounts") return pathname === "/admin/accounts";
  return pathname === href || pathname.startsWith(`${href}/`);
}
async function quickPost(action: string, body: Record<string, unknown> = {}) {
  const response = await fetch("/api/landview", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
    body: JSON.stringify({ action, ...body }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Request failed."));
  return json.data || {};
}
async function getWorkspaceAccess() {
  const url = new URL("/api/landview", window.location.origin);
  url.searchParams.set("action", "getErpRecords");
  url.searchParams.set("module", "workspacePermissionsV2");
  const response = await fetch(url.toString(), { credentials: "same-origin", cache: "no-store" });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Could not load workspace permissions."));
  return (json.data || {}) as WorkspaceAccess;
}

export default function ManagementShellV2({ children, initialUser = null }: { children: React.ReactNode; initialUser?: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [access, setAccess] = useState<WorkspaceAccess | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openNavGroup, setOpenNavGroup] = useState<string | null>(null);
  const [quickConfigured, setQuickConfigured] = useState(false);
  const [trustedDevice, setTrustedDevice] = useState(false);
  const [trustedUntil, setTrustedUntil] = useState<number | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = readSessionCache();
    const cachedRole = roleOf(cached?.user);
    const hasCache = Boolean(cached?.authenticated && cached?.user && isWorkspaceRole(cachedRole));
    const effectiveUser = hasCache ? cached!.user : initialUser;
    const effectiveRole = roleOf(effectiveUser);

    // The server layout has already authenticated this request. Use that identity
    // immediately instead of blocking the workspace on another Apps Script call.
    if (effectiveUser && isWorkspaceRole(effectiveRole)) {
      setUser(effectiveUser);
      saveSessionCache({ authenticated: true, user: effectiveUser });
      if (effectiveRole === "admin" || effectiveRole === "manager") setAccess({ all: true });
      setReady(true);
      setError("");

      // Permissions are supplementary for Admin/Manager and can refresh in the
      // background. Backend routes remain authoritative for protected actions.
      void getWorkspaceAccess()
        .then((permissionData) => {
          if (!cancelled) setAccess(permissionData);
        })
        .catch(() => {
          // Do not replace a valid authenticated workspace with an Apps Script
          // error screen. A later navigation/request can retry naturally.
        });

      return () => { cancelled = true; };
    }

    // Compatibility path for old browser sessions with no local cache.
    const watchdog = window.setTimeout(() => {
      if (cancelled) return;
      setError("Session validation is taking too long. Refresh once or sign in again to upgrade this session.");
    }, SESSION_WATCHDOG_MS);

    void Promise.all([landViewApi.getSession(), getWorkspaceAccess()])
      .then(([session, permissionData]) => {
        if (cancelled) return;
        const role = roleOf(session?.user);
        if (!session?.authenticated || !isWorkspaceRole(role)) {
          if (role === "client") router.replace("/client"); else router.replace("/login");
          return;
        }
        window.clearTimeout(watchdog);
        saveSessionCache(session);
        setUser(session.user);
        setAccess(permissionData);
        setReady(true);
        setError("");
      })
      .catch((err) => {
        window.clearTimeout(watchdog);
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to validate workspace access.");
      });

    return () => { cancelled = true; window.clearTimeout(watchdog); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, initialUser]);

  useEffect(() => {
    if (!ready) return;
    const role = roleOf(user);
    if (role !== "admin" && role !== "manager") return;
    void quickPost("quickPinStatus")
      .then((data) => {
        setQuickConfigured(Boolean(data?.configured));
        setTrustedDevice(Boolean(data?.trusted));
        setTrustedUntil(data?.expiresAt ? Number(data.expiresAt) : null);
      })
      .catch(() => {});
  }, [ready, user]);

  const role = roleOf(user);
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const all = Boolean(access?.all || isAdmin || isManager);
  const permissions = access?.permissions || {};

  const visibleNav = useMemo(() => nav.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (all) return true;
    return Boolean(item.permission && permissions[item.permission]);
  }), [all, isAdmin, permissions]);

  const visibleGroups = useMemo(() => navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => visibleNav.some((visible) => visible.href === item.href)) }))
    .filter((group) => group.items.length > 0), [visibleNav]);

  const activeItem = useMemo(() => {
    const sorted = [...nav].sort((a, b) => b.href.length - a.href.length);
    return sorted.find((item) => currentMatches(pathname, item.href));
  }, [pathname]);
  const routeAllowed = !activeItem || activeItem.adminOnly ? (!activeItem?.adminOnly || isAdmin) : (all || Boolean(activeItem.permission && permissions[activeItem.permission]));

  async function logout() {
    try { await landViewApi.logout(); } catch {}
    clearStoredSession();
    router.replace("/login");
  }

  async function setupOrLockQuickPin() {
    if (quickBusy || (!isAdmin && !isManager)) return;
    if (quickConfigured) {
      if (!trustedDevice) return window.alert("Trust this device first before using PIN LOCK.");
      setQuickBusy(true);
      try { await quickPost("quickLock"); clearStoredSession(); window.location.replace("/login"); }
      catch (err: any) { window.alert(err?.message || "Could not PIN-lock the workspace."); setQuickBusy(false); }
      return;
    }
    const first = window.prompt("Create your permanent 6-digit Admin PIN:", "");
    if (first === null) return;
    if (!/^\d{6}$/.test(first)) return window.alert("Admin PIN must be exactly 6 digits.");
    const second = window.prompt("Confirm the 6-digit PIN:", "");
    if (first !== second) return window.alert("PINs did not match.");
    setQuickBusy(true);
    try { await quickPost("setQuickPin", { pin: first }); setQuickConfigured(true); window.alert("PIN created. Use TRUST DEVICE to enable PIN login here."); }
    catch (err: any) { window.alert(err?.message || "Could not create PIN."); }
    finally { setQuickBusy(false); }
  }

  async function toggleTrustedDevice() {
    if (quickBusy || !quickConfigured) return;
    setQuickBusy(true);
    try {
      if (trustedDevice) {
        if (!window.confirm("Remove this browser from trusted devices?")) return;
        await quickPost("untrustDevice"); setTrustedDevice(false); setTrustedUntil(null);
      } else {
        const data = await quickPost("trustDevice"); setTrustedDevice(true); setTrustedUntil(data?.expiresAt ? Number(data.expiresAt) : Date.now() + 7 * 86400000);
      }
    } catch (err: any) { window.alert(err?.message || "Could not update trusted-device access."); }
    finally { setQuickBusy(false); }
  }

  if (error && !ready) {
    return <main className="login-loading"><div className="loading-panel" style={{maxWidth:520,padding:24}}><img className="loading-brand-image" src="/land-view-logo-full.svg" alt="LAND VIEW"/><p>{error}</p><button className="btn btn-accent" onClick={() => router.replace("/login")}>Return to sign in</button></div></main>;
  }
  if (!ready) {
    return <main className="login-loading"><div className="loading-panel"><img className="loading-brand-image" src="/land-view-logo-full.svg" alt="LAND VIEW"/><div className="loading-spinner"/><p>Loading management workspace</p></div></main>;
  }

  const name = user?.name || user?.Name || user?.username || user?.Username || "LAND VIEW User";
  const daysLeft = trustedUntil ? Math.max(1, Math.ceil((trustedUntil - Date.now()) / 86400000)) : 0;

  const navStyles = `
    .primary-nav-inner{display:flex;align-items:stretch;gap:4px;flex-wrap:wrap}
    .primary-nav-inner>a,.primary-nav-inner>.nav-group>button{min-height:42px;padding:0 15px;display:flex;align-items:center;justify-content:center;border:0;background:transparent;color:inherit;text-decoration:none;font-size:12px;font-weight:800;letter-spacing:.06em;cursor:pointer}
    .primary-nav-inner>.nav-group>button:hover,.primary-nav-inner>.nav-group>button.active{background:rgba(255,129,121,.10)}
    .primary-nav-inner>.dashboard-nav.active{background:rgba(255,129,121,.16)}
    .nav-group{position:relative}.nav-group>button{gap:7px}.nav-chevron{font-size:14px;line-height:1;opacity:.65}
    .nav-group-menu{position:absolute;z-index:50;top:calc(100% - 1px);left:0;min-width:190px;padding:7px;border:1px solid rgba(255,255,255,.10);border-radius:0 0 10px 10px;background:#101820;box-shadow:0 14px 30px rgba(0,0,0,.28)}
    .nav-group-menu a{display:block;padding:10px 12px;border-radius:7px;color:inherit;text-decoration:none;font-size:12px;font-weight:700;white-space:nowrap}.nav-group-menu a:hover,.nav-group-menu a.active{background:rgba(255,129,121,.12)}
    @media (max-width:800px){.primary-nav-inner{display:block}.primary-nav-inner>a,.primary-nav-inner>.nav-group>button{justify-content:flex-start;width:100%}.nav-group-menu{position:static;min-width:0;margin:0 8px 6px;border-radius:8px;box-shadow:none}}
  `;
  return <div className="admin-shell tmg-shell portal-admin"><style dangerouslySetInnerHTML={{__html: navStyles }} />
    <a className="portal-skip" href="#workspace-content">Skip to workspace</a>
    <header className="masthead">
      <div className="utility-bar"><div className="utility-inner">
        <Link href="/admin" className="masthead-brand"><img src="/land-view-logo.svg" alt="LAND VIEW logo"/><div><strong>LAND VIEW</strong><span>ENGINEERS &amp; ARCHITECTS</span></div></Link>
        <div className="utility-items">
          <div className="utility-item"><b>●</b><span><small>SYSTEM STATUS</small>Online</span></div>
          <div className="utility-item"><b>◆</b><span><small>WORKSPACE</small>Management System</span></div>
          <div className="utility-item user-utility"><div className="utility-avatar">{String(name).slice(0,1).toUpperCase()}</div><span><small>{role || "User"}</small>{name}</span></div>
          {(isAdmin || isManager) && quickConfigured && <button className="utility-logout" onClick={toggleTrustedDevice} disabled={quickBusy}>{trustedDevice ? `TRUSTED ${daysLeft}D` : "TRUST DEVICE"}</button>}
          {(isAdmin || isManager) && <button className="utility-logout" onClick={setupOrLockQuickPin} disabled={quickBusy}>{quickConfigured ? "PIN LOCK" : "SET PIN"}</button>}
          <button className="utility-logout" onClick={logout}>Sign out</button>
        </div>
        <button className="mobile-menu tmg-mobile-menu" aria-label={mobileOpen?"Close navigation":"Open navigation"} aria-expanded={mobileOpen} onClick={() => setMobileOpen((v)=>!v)}>☰</button>
      </div></div>
      <nav aria-label="Management" className={`primary-nav ${mobileOpen?"open":""}`}><div className="primary-nav-inner">
        <Link href="/admin" aria-current={pathname === "/admin" ? "page" : undefined} className={pathname === "/admin" ? "active dashboard-nav" : "dashboard-nav"} onClick={()=>setMobileOpen(false)}>Dashboard</Link>
        {visibleGroups.map((group) => {
          const groupActive = group.items.some((item) => currentMatches(pathname, item.href));
          const isOpen = openNavGroup === group.label;
          return <div key={group.label} className={`nav-group ${groupActive ? "group-active" : ""}`}>
            <button type="button" className={`nav-group-trigger ${isOpen || groupActive ? "active" : ""}`} aria-expanded={isOpen} onClick={() => setOpenNavGroup((current) => current === group.label ? null : group.label)}>
              {group.label}<span className="nav-chevron">{isOpen ? "⌃" : "⌄"}</span>
            </button>
            {isOpen && <div className="nav-group-menu">
              {group.items.map((item) => {
                const active = currentMatches(pathname,item.href);
                return <Link key={item.href} href={item.href} aria-current={active?"page":undefined} className={active?"active":""} onClick={()=>{setMobileOpen(false);setOpenNavGroup(null);}}>{item.label}</Link>;
              })}
            </div>}
          </div>;
        })}
      </div></nav>
    </header>

    <div className="admin-main tmg-admin-main"><main id="workspace-content" className="content-wrap tmg-content-wrap">
      {!routeAllowed ? <section style={{maxWidth:760,margin:"36px auto",padding:28,border:"1px solid #3b454e",borderRadius:14,background:"#101820",color:"#eef2f5"}}><small style={{color:"#ef6c66",fontWeight:900}}>ACCESS CONTROL</small><h1 style={{margin:"8px 0 10px"}}>This function is not enabled for your account.</h1><p style={{color:"#93a0aa",lineHeight:1.6}}>Ask the Main Admin to enable this tab from Permission. Your other assigned LAND VIEW functions remain available.</p><Link href="/admin" style={{color:"#ff8179",fontWeight:800}}>Return to Dashboard →</Link></section> : children}
    </main></div>
  </div>;
}
