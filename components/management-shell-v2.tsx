"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearStoredSession, landViewApi, readSessionCache, saveSessionCache, type SessionUser } from "@/lib/api";
import { roleDefaultPermissions } from "@/lib/role-permissions";

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

type NavItem = {
  href: string;
  label: string;
  icon: string;
  permission?: string;
  adminOnly?: boolean;
  menu?: "main" | "tools" | "hidden";
};

// Keep all protected routes in this registry so route-level permission checks remain intact.
// Only daily modules stay visible; occasional maintenance pages are deliberately hidden from
// the permanent sidebar and remain reachable from their related screens / admin controls.
const nav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "⌂", permission: "dashboard.view", menu: "main" },
  { href: "/admin/projects", label: "Projects", icon: "▣", permission: "projects.view", menu: "main" },
  { href: "/projectmanagement", label: "Project Management", icon: "◈", permission: "project_management.view", menu: "main" },
  { href: "/admin/site-visits", label: "Site Visits", icon: "⌖", permission: "site.view", menu: "main" },
  { href: "/admin/employees", label: "Employees", icon: "♙", permission: "employees.view", menu: "main" },
  { href: "/admin/proposals", label: "Proposals", icon: "✎", permission: "proposals.view", menu: "main" },
  { href: "/admin/finance", label: "Finance", icon: "৳", permission: "finance.view", menu: "main" },
  { href: "/admin/website-analytics", label: "Website Analytics", icon: "⌁", permission: "analytics.view", menu: "main" },

  { href: "/admin/estimate", label: "Estimates", icon: "▤", permission: "estimates.view", menu: "tools" },
  { href: "/admin/registers", label: "Document Registry", icon: "▧", permission: "documents.view", menu: "tools" },
  { href: "/admin/expenses", label: "Expenses", icon: "◫", permission: "expenses.view_all", menu: "tools" },
  { href: "/admin/accounts", label: "Accounts Ledger", icon: "≡", permission: "ledger.view", menu: "tools" },
  { href: "/admin/certificates", label: "Certificates", icon: "⌑", permission: "certificates.view", menu: "tools" },
  { href: "/admin/access", label: "Access Control", icon: "⚿", adminOnly: true, menu: "tools" },

  // Hidden from the sidebar: specialised / legacy / editing utilities.
  { href: "/admin/workflow", label: "Workflow", icon: "↗", permission: "workflow.view", menu: "hidden" },
  { href: "/admin/website-leads", label: "Website Enquiries", icon: "✦", permission: "public.view", menu: "hidden" },
  { href: "/admin/accounts/entry", label: "Main Accounts", icon: "▥", adminOnly: true, menu: "hidden" },
  { href: "/admin/projects/new", label: "New Project", icon: "+", adminOnly: true, menu: "hidden" },
  { href: "/admin/projects/legacy", label: "Legacy Registration", icon: "◷", adminOnly: true, menu: "hidden" },
  { href: "/admin/projects/locations", label: "Project Locations", icon: "⌖", adminOnly: true, menu: "hidden" },
  { href: "/admin/projects/missing-serials", label: "Missing Serials", icon: "#", adminOnly: true, menu: "hidden" },
  { href: "/admin/projects/payment-routing", label: "Payment Routing", icon: "↔", adminOnly: true, menu: "hidden" },
  { href: "/admin/projects/reclassify", label: "Project Reclassify", icon: "⇄", adminOnly: true, menu: "hidden" },
  { href: "/admin/projects/website-curation", label: "Website Curation", icon: "✦", adminOnly: true, menu: "hidden" },
  { href: "/admin/projects/website-readiness", label: "Website Readiness", icon: "✓", adminOnly: true, menu: "hidden" },
  { href: "/admin/finance/bills", label: "Bills Editor", icon: "৳", adminOnly: true, menu: "hidden" },
  { href: "/admin/finance/invoices", label: "Invoice Register", icon: "▤", adminOnly: true, menu: "hidden" },
  { href: "/admin/accounts/export", label: "Ledger Export", icon: "⇩", adminOnly: true, menu: "hidden" },
  { href: "/admin/municipality-accounts", label: "Municipality Accounts", icon: "▦", adminOnly: true, menu: "hidden" },
  { href: "/admin/municipality-file-pass", label: "Municipality File Pass", icon: "✓", adminOnly: true, menu: "hidden" },
  { href: "/admin/security", label: "Security", icon: "◆", adminOnly: true, menu: "hidden" },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: "●", adminOnly: true, menu: "hidden" },
];
const SESSION_WATCHDOG_MS = 8000;

function roleOf(user?: SessionUser | null) {
  return String(user?.role || user?.Role || "").trim().toLowerCase();
}
function roleLabel(role: string) {
  if (role === "manager") return "Management";
  if (role === "employee") return "Employees";
  if (role === "client") return "Clients";
  if (role === "admin") return "Admin";
  return "User";
}
function isWorkspaceRole(role: string) {
  return ["admin", "manager", "employee"].includes(role);
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const [quickConfigured, setQuickConfigured] = useState(false);
  const [trustedDevice, setTrustedDevice] = useState(false);
  const [trustedUntil, setTrustedUntil] = useState<number | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const [roleSwitchBusy, setRoleSwitchBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = readSessionCache();
    const cachedRole = roleOf(cached?.user);
    const hasCache = Boolean(cached?.authenticated && cached?.user && isWorkspaceRole(cachedRole));
    const effectiveUser = initialUser || (hasCache ? cached!.user : null);
    const effectiveRole = roleOf(effectiveUser);

    if (effectiveUser && isWorkspaceRole(effectiveRole)) {
      setUser(effectiveUser);
      saveSessionCache({ authenticated: true, user: effectiveUser });
      if (effectiveRole === "admin") setAccess({ all: true });
      else if (effectiveRole === "manager") setAccess({ all: false, permissions: roleDefaultPermissions("manager") });
      setReady(true);
      setError("");

      void getWorkspaceAccess()
        .then((permissionData) => {
          if (!cancelled) setAccess(permissionData);
        })
        .catch(() => {});

      return () => { cancelled = true; };
    }

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
  const all = Boolean(access?.all || isAdmin);
  const permissions = access?.permissions || {};

  const visibleNav = useMemo(() => nav.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (all) return true;
    return Boolean(item.permission && permissions[item.permission]);
  }), [all, isAdmin, permissions]);

  const mainNav = useMemo(() => visibleNav.filter((item) => item.menu === "main"), [visibleNav]);
  const toolsNav = useMemo(() => visibleNav.filter((item) => item.menu === "tools"), [visibleNav]);

  useEffect(() => {
    setMobileOpen(false);
    if (toolsNav.some((item) => currentMatches(pathname, item.href))) setToolsOpen(true);
  }, [pathname, toolsNav]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
      if (event.key === "Tab") {
        const links = Array.from(navigationRef.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)") || [])
          .filter((element) => element.getClientRects().length > 0);
        const first = menuButtonRef.current;
        const firstLink = links[0];
        const last = links.at(-1);
        if (!event.shiftKey && document.activeElement === first && firstLink) {
          event.preventDefault(); firstLink.focus();
        } else if (event.shiftKey && document.activeElement === firstLink && first) {
          event.preventDefault(); first.focus();
        } else if (event.shiftKey && document.activeElement === first && last) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last && first) {
          event.preventDefault(); first.focus();
        }
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

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

  async function switchToEmployeeMode() {
    if (!isAdmin || roleSwitchBusy) return;
    setRoleSwitchBusy(true);
    try {
      const response = await fetch("/api/admin/role-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ action: "employee" }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not switch to EMP-0002."));
      clearStoredSession();
      window.location.assign("/employee");
    } catch (err: any) {
      window.alert(err?.message || "Could not switch to EMP-0002.");
      setRoleSwitchBusy(false);
    }
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
    .admin-mobile-account{display:none}
    .sidebar-simple-list{display:grid;gap:4px;margin:0;padding:0}
    .sidebar-tools{margin-top:8px;padding-top:8px;border-top:1px solid var(--theme-line-_252d34, #252d34)}
    .sidebar-tools-toggle{width:100%;min-height:42px;display:flex;align-items:center;gap:11px;padding:0 13px;border:0;border-radius:9px;background:transparent;color:var(--theme-ink-_aeb6bf, #aeb6bf);font:inherit;font-size:12px;font-weight:800;cursor:pointer;text-align:left}
    .sidebar-tools-toggle:hover,.sidebar-tools-toggle.open{background:var(--theme-bg-_171d23, #171d23);color:var(--theme-ink-_fff, #fff)}
    .sidebar-tools-toggle .tools-chevron{margin-left:auto;font-size:11px;opacity:.7;transition:transform .16s ease}
    .sidebar-tools-toggle.open .tools-chevron{transform:rotate(180deg)}
    .sidebar-tools-list{display:grid;gap:3px;margin:5px 0 0;padding:0 0 0 9px}
    .sidebar-tools-list>a{min-height:39px!important;font-size:11px!important;opacity:.92}
    @media screen and (min-width:901px){
      .portal-admin{--lv-sidebar-width:252px!important}
      .portal-admin .primary-nav{visibility:visible!important;pointer-events:auto!important}
      .portal-admin .mobile-nav-overlay{display:none!important}
      .portal-admin .sidebar-brand{height:74px!important;padding:13px 16px!important}
      .portal-admin .sidebar-brand img{width:42px!important;height:42px!important;flex-basis:42px!important}
      .portal-admin .primary-nav-inner{padding:10px 10px 18px!important;overflow-y:auto!important}
      .portal-admin .primary-nav-inner>a,.portal-admin .sidebar-simple-list>a{min-height:42px!important;padding:0 13px!important;gap:11px!important;border-radius:9px!important;font-size:11.5px!important}
      .portal-admin .nav-icon{width:22px!important;height:22px!important;flex:0 0 22px!important;font-size:15px!important}
    }
    @media screen and (max-width:900px){
      .portal-admin .masthead{position:sticky!important;top:0!important;z-index:300!important}
      .portal-admin .utility-bar{position:relative!important;z-index:220!important;min-height:64px!important;height:64px!important}
      .portal-admin .utility-inner{min-height:64px!important;height:64px!important}
      .portal-admin .primary-nav:not(.open){display:none!important}
      .portal-admin .primary-nav.open{overscroll-behavior:contain}
      .portal-admin .admin-mobile-account{display:grid;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid var(--theme-line-_394650, #394650)}
      .portal-admin .admin-mobile-account button{min-height:44px;padding:10px 14px;text-align:left;border:1px solid var(--theme-line-_394650, #394650);border-radius:6px;background:var(--theme-bg-_161a1f, #161a1f);color:var(--theme-ink-_f5f7fa, #f5f7fa);font-size:14px;cursor:pointer}
      .portal-admin .mobile-nav-overlay{position:fixed!important;inset:64px 0 0 0!important;z-index:199!important;border:0!important;padding:0!important;background:var(--theme-bg-rgba_0_0_0__48_, rgba(0,0,0,.48))!important;cursor:pointer!important}
      .portal-admin .tmg-mobile-menu{position:relative!important;z-index:220!important;pointer-events:auto!important;touch-action:manipulation!important}
      .portal-admin .primary-nav.open{display:block!important;position:fixed!important;z-index:210!important;top:64px!important;right:0!important;bottom:0!important;left:0!important;width:100%!important;height:calc(100dvh - 64px)!important;max-height:calc(100dvh - 64px)!important;overflow-y:auto!important;overflow-x:hidden!important;padding:14px 14px max(24px,env(safe-area-inset-bottom))!important;box-sizing:border-box!important;visibility:visible!important;opacity:1!important;transform:none!important}
      .portal-admin .primary-nav.open .primary-nav-inner{display:block!important;width:100%!important;height:auto!important;max-height:none!important;overflow:visible!important;padding:0!important;margin:0!important}
      .portal-admin .primary-nav.open .sidebar-simple-list>a,.portal-admin .primary-nav.open .sidebar-tools-list>a{display:flex!important;width:100%!important;min-height:44px!important;padding:0 14px!important;box-sizing:border-box!important;pointer-events:auto!important;touch-action:manipulation!important}
      .portal-admin .sidebar-tools-toggle{min-height:44px;padding:0 14px}
      .portal-admin .primary-nav:not(.open){visibility:hidden!important;pointer-events:none!important}
    }
    .primary-nav{position:relative;z-index:90;overflow:visible!important}
    .primary-nav-inner{position:relative;z-index:91}
    .sidebar-simple-list>a,.sidebar-tools-list>a{display:flex;align-items:center;text-decoration:none;color:inherit;white-space:nowrap}
    .sidebar-simple-list>a:hover,.sidebar-tools-list>a:hover{background:var(--theme-bg-rgba_255_129_121__10_, rgba(255,129,121,.10))}
    .sidebar-simple-list>a.active,.sidebar-tools-list>a.active{background:var(--theme-bg-rgba_255_129_121__16_, rgba(255,129,121,.16))}
  `;

  const renderItem = (item: NavItem) => {
    const active = currentMatches(pathname, item.href);
    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={active ? "active" : ""} onClick={() => setMobileOpen(false)}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>;
  };

  return <div className="admin-shell tmg-shell portal-admin"><style dangerouslySetInnerHTML={{__html: navStyles }} />
    <a className="portal-skip" href="#workspace-content">Skip to workspace</a>
    <header className="masthead">
      {mobileOpen && <button type="button" tabIndex={-1} aria-label="Close navigation overlay" className="mobile-nav-overlay" onClick={() => setMobileOpen(false)} />}
      <div className="utility-bar"><div className="utility-inner">
        <button type="button" ref={menuButtonRef} className="mobile-menu tmg-mobile-menu" aria-label={mobileOpen?"Close navigation":"Open navigation"} aria-expanded={mobileOpen} aria-controls="admin-mobile-navigation" onClick={(event)=>{event.stopPropagation();setMobileOpen((v)=>!v)}}>{mobileOpen ? "×" : "☰"}</button>
        <div className="global-search" role="search">
          <span aria-hidden="true">⌕</span>
          <input aria-label="Search LAND VIEW" placeholder="Search..." />
        </div>
        <div className="utility-items">
          <button type="button" className="notification-button" aria-label="Notifications"><span aria-hidden="true">♧</span><b>3</b></button>
          <div className="utility-item user-utility"><div className="utility-avatar">{String(name).slice(0,1).toUpperCase()}</div><span><small>{roleLabel(role)}</small>{name}</span></div>
          {isAdmin && <button className="utility-logout" onClick={switchToEmployeeMode} disabled={roleSwitchBusy}>{roleSwitchBusy ? "SWITCHING..." : "EMP-0002 MODE"}</button>}
          {(isAdmin || isManager) && quickConfigured && <button className="utility-logout" onClick={toggleTrustedDevice} disabled={quickBusy}>{trustedDevice ? `TRUSTED ${daysLeft}D` : "TRUST DEVICE"}</button>}
          {(isAdmin || isManager) && <button className="utility-logout" onClick={setupOrLockQuickPin} disabled={quickBusy}>{quickConfigured ? "PIN LOCK" : "SET PIN"}</button>}
          <button className="utility-logout" onClick={logout}>Sign out</button>
        </div>
      </div></div>
      <nav ref={navigationRef} id="admin-mobile-navigation" aria-label="Management" className={`primary-nav ${mobileOpen?"open":""}`}>
        <Link href="/admin" className="sidebar-brand" onClick={()=>setMobileOpen(false)}>
          <img src="/land-view-logo.svg" alt="LAND VIEW logo" />
          <span><strong>LAND VIEW</strong><small>MANAGEMENT SYSTEM</small></span>
        </Link>
        <div className="primary-nav-inner">
          <div className="sidebar-simple-list">{mainNav.map(renderItem)}</div>
          {toolsNav.length > 0 && <div className="sidebar-tools">
            <button type="button" className={`sidebar-tools-toggle ${toolsOpen ? "open" : ""}`} aria-expanded={toolsOpen} onClick={() => setToolsOpen((value) => !value)}>
              <span className="nav-icon" aria-hidden="true">⋯</span><span>Tools</span><span className="tools-chevron" aria-hidden="true">⌄</span>
            </button>
            {toolsOpen && <div className="sidebar-tools-list">{toolsNav.map(renderItem)}</div>}
          </div>}
        </div>
        <div className="admin-mobile-account">
          <strong>{name}</strong>
          {isAdmin && <button type="button" onClick={switchToEmployeeMode} disabled={roleSwitchBusy}>{roleSwitchBusy ? "Switching..." : "Switch to EMP-0002 workspace"}</button>}
          {(isAdmin || isManager) && quickConfigured && <button type="button" onClick={toggleTrustedDevice} disabled={quickBusy}>{trustedDevice ? `Trusted device · ${daysLeft} days` : "Trust this device"}</button>}
          {(isAdmin || isManager) && <button type="button" onClick={setupOrLockQuickPin} disabled={quickBusy}>{quickConfigured ? "PIN lock" : "Set PIN"}</button>}
          <button type="button" onClick={logout}>Sign out</button>
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-user"><div className="utility-avatar">{String(name).slice(0,1).toUpperCase()}</div><div><strong>{name}</strong><small>{roleLabel(role)}</small></div></div>
        </div>
      </nav>
    </header>
    <div className="admin-main tmg-admin-main"><main id="workspace-content" className="content-wrap tmg-content-wrap">
      {!routeAllowed ? <section style={{maxWidth:760,margin:"36px auto",padding:28,border:"1px solid var(--theme-line-_3b454e, #3b454e)",borderRadius:14,background:"var(--theme-bg-_101820, #101820)",color:"var(--theme-ink-_eef2f5, #eef2f5)"}}><small style={{color:"#ef6c66",fontWeight:900}}>ACCESS CONTROL</small><h1 style={{margin:"8px 0 10px"}}>This function is not enabled for your account.</h1><p style={{color:"var(--theme-ink-_93a0aa, #93a0aa)",lineHeight:1.6}}>Ask the Main Admin to enable this function from Access Control. Your other assigned LAND VIEW functions remain available.</p><Link href="/admin" style={{color:"var(--theme-ink-_ff8179, #ff8179)",fontWeight:800}}>Return to Dashboard →</Link></section> : children}
    </main></div>
  </div>;
}
