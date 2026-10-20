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

type ModuleKey =
  | "Dashboard"
  | "CRM"
  | "Proposals"
  | "Projects"
  | "Design & Engineering"
  | "Site & Supervision"
  | "Finance"
  | "Bills & Procurement"
  | "Approvals & Documents"
  | "Team & HR"
  | "Administration";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  module: ModuleKey;
  permission?: string;
  adminOnly?: boolean;
};

type ModuleMeta = {
  key: ModuleKey;
  shortLabel: string;
  icon: string;
  description: string;
};

const MODULES: ModuleMeta[] = [
  { key: "Dashboard", shortLabel: "Dashboard", icon: "⌂", description: "Business overview, priority work and management alerts." },
  { key: "CRM", shortLabel: "CRM", icon: "◎", description: "Enquiries, website leads and client communication." },
  { key: "Proposals", shortLabel: "Proposals", icon: "✎", description: "Proposal preparation, follow-up and conversion." },
  { key: "Projects", shortLabel: "Projects", icon: "▣", description: "Project registration, lifecycle and delivery control." },
  { key: "Design & Engineering", shortLabel: "Design", icon: "◇", description: "Technical design, engineering and estimating work." },
  { key: "Site & Supervision", shortLabel: "Site", icon: "⌖", description: "Site visits, field supervision and site activity." },
  { key: "Finance", shortLabel: "Finance", icon: "৳", description: "Accounts, income, expenses and ledger control." },
  { key: "Bills & Procurement", shortLabel: "Bills", icon: "▤", description: "Bills, invoices, purchasing and payment routing." },
  { key: "Approvals & Documents", shortLabel: "Approvals", icon: "✓", description: "Municipality approvals, registers and certificates." },
  { key: "Team & HR", shortLabel: "Team", icon: "♙", description: "Employees and people administration." },
  { key: "Administration", shortLabel: "Admin", icon: "⚙", description: "Permissions, audit, system controls and account settings." },
];

const nav: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "⌂", module: "Dashboard", permission: "dashboard.view" },

  { href: "/admin/website-leads", label: "Website Enquiries", icon: "✦", module: "CRM", permission: "public.view" },
  { href: "/admin/website-analytics", label: "Website Analytics", icon: "⌁", module: "CRM", permission: "analytics.view" },
  { href: "/admin/projects/website-curation", label: "Website Curation", icon: "✦", module: "CRM", adminOnly: true },
  { href: "/admin/projects/website-readiness", label: "Website Readiness", icon: "✓", module: "CRM", adminOnly: true },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: "●", module: "CRM", adminOnly: true },

  { href: "/admin/proposals", label: "Proposals", icon: "✎", module: "Proposals", permission: "proposals.view" },

  { href: "/admin/projects", label: "Project List", icon: "▣", module: "Projects", permission: "projects.view" },
  { href: "/projectmanagement", label: "Project Management", icon: "◈", module: "Projects", permission: "project_management.view" },
  { href: "/admin/workflow", label: "Workflow", icon: "↗", module: "Projects", permission: "workflow.view" },
  { href: "/admin/lifecycle", label: "Lifecycle Center", icon: "◎", module: "Projects", permission: "workflow.view" },
  { href: "/admin/projects/new", label: "New Project", icon: "+", module: "Projects", adminOnly: true },
  { href: "/admin/projects/legacy", label: "Legacy Registration", icon: "◷", module: "Projects", adminOnly: true },
  { href: "/admin/projects/locations", label: "Project Locations", icon: "⌖", module: "Projects", adminOnly: true },

  { href: "/admin/estimate", label: "Estimates & Costing", icon: "▤", module: "Design & Engineering", permission: "estimates.view" },

  { href: "/admin/site-visits", label: "Site Visits", icon: "⌖", module: "Site & Supervision", permission: "site.view" },

  { href: "/admin/finance", label: "Billing", icon: "৳", module: "Finance", permission: "finance.view" },
  { href: "/admin/expenses", label: "Expenses", icon: "◫", module: "Finance", permission: "expenses.view_all" },
  { href: "/admin/accounts/entry", label: "Main Accounts", icon: "▥", module: "Finance", adminOnly: true },
  { href: "/admin/accounts", label: "Ledger", icon: "≡", module: "Finance", permission: "ledger.view" },
  { href: "/admin/accounts/export", label: "Ledger Export", icon: "⇩", module: "Finance", adminOnly: true },
  { href: "/admin/municipality-accounts", label: "Municipality Accounts", icon: "▦", module: "Finance", adminOnly: true },

  { href: "/admin/finance/bills", label: "Bills Editor", icon: "৳", module: "Bills & Procurement", adminOnly: true },
  { href: "/admin/finance/invoices", label: "Invoice Register", icon: "▤", module: "Bills & Procurement", adminOnly: true },
  { href: "/admin/projects/payment-routing", label: "Payment Routing", icon: "↔", module: "Bills & Procurement", adminOnly: true },

  { href: "/admin/municipality-file-pass", label: "Municipality File Pass", icon: "✓", module: "Approvals & Documents", adminOnly: true },
  { href: "/admin/registers", label: "Document Registry", icon: "▧", module: "Approvals & Documents", permission: "documents.view" },
  { href: "/admin/certificates", label: "Certificates", icon: "⌑", module: "Approvals & Documents", permission: "certificates.view" },

  { href: "/admin/employees", label: "Employees", icon: "♙", module: "Team & HR", permission: "employees.view" },

  { href: "/admin/access", label: "Access Control", icon: "⚿", module: "Administration", adminOnly: true },
  { href: "/admin/audit-log", label: "Audit Log", icon: "≣", module: "Administration", adminOnly: true },
  { href: "/admin/projects/missing-serials", label: "Missing Serials", icon: "#", module: "Administration", adminOnly: true },
  { href: "/admin/projects/reclassify", label: "Project Reclassify", icon: "⇄", module: "Administration", adminOnly: true },
  { href: "/admin/security", label: "Full Session History", icon: "◆", module: "Administration", adminOnly: true },
  { href: "/admin/account", label: "My Account", icon: "●", module: "Administration", adminOnly: true },
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
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

export default function ManagementShellV4({ children, initialUser = null }: { children: React.ReactNode; initialUser?: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [access, setAccess] = useState<WorkspaceAccess | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState<ModuleKey>("Dashboard");
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
      void getWorkspaceAccess().then((permissionData) => { if (!cancelled) setAccess(permissionData); }).catch(() => {});
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

  const visibleModules = useMemo(() => MODULES
    .map((module) => ({ ...module, items: visibleNav.filter((item) => item.module === module.key) }))
    .filter((module) => module.items.length > 0), [visibleNav]);

  const activeItem = useMemo(() => {
    const sorted = [...nav].sort((a, b) => b.href.length - a.href.length);
    return sorted.find((item) => currentMatches(pathname, item.href));
  }, [pathname]);

  const activeModule = activeItem?.module;

  useEffect(() => {
    setMobileOpen(false);
    if (activeModule) setSelectedModule(activeModule);
  }, [pathname, activeModule]);

  useEffect(() => {
    if (!visibleModules.some((module) => module.key === selectedModule)) {
      setSelectedModule(visibleModules[0]?.key || "Dashboard");
    }
  }, [selectedModule, visibleModules]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
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
        if (!event.shiftKey && document.activeElement === first && firstLink) { event.preventDefault(); firstLink.focus(); }
        else if (event.shiftKey && document.activeElement === firstLink && first) { event.preventDefault(); first.focus(); }
        else if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
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

  const selected = visibleModules.find((module) => module.key === selectedModule) || visibleModules[0];
  const routeAllowed = !activeItem || activeItem.adminOnly
    ? (!activeItem?.adminOnly || isAdmin)
    : (all || Boolean(activeItem.permission && permissions[activeItem.permission]));

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
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "Could not switch to EMP-0002.");
      setRoleSwitchBusy(false);
    }
  }

  async function setupOrLockQuickPin() {
    if (quickBusy || (!isAdmin && !isManager)) return;
    if (quickConfigured) {
      if (!trustedDevice) return window.alert("Trust this device first before using PIN LOCK.");
      setQuickBusy(true);
      try { await quickPost("quickLock"); clearStoredSession(); window.location.replace("/login"); }
      catch (err: unknown) { window.alert(err instanceof Error ? err.message : "Could not PIN-lock the workspace."); setQuickBusy(false); }
      return;
    }
    const first = window.prompt("Create your permanent 6-digit Admin PIN:", "");
    if (first === null) return;
    if (!/^\d{6}$/.test(first)) return window.alert("Admin PIN must be exactly 6 digits.");
    const second = window.prompt("Confirm the 6-digit PIN:", "");
    if (first !== second) return window.alert("PINs did not match.");
    setQuickBusy(true);
    try { await quickPost("setQuickPin", { pin: first }); setQuickConfigured(true); window.alert("PIN created. Use TRUST DEVICE to enable PIN login here."); }
    catch (err: unknown) { window.alert(err instanceof Error ? err.message : "Could not create PIN."); }
    finally { setQuickBusy(false); }
  }

  async function toggleTrustedDevice() {
    if (quickBusy || !quickConfigured) return;
    setQuickBusy(true);
    try {
      if (trustedDevice) {
        if (!window.confirm("Remove this browser from trusted devices?")) return;
        await quickPost("untrustDevice");
        setTrustedDevice(false);
        setTrustedUntil(null);
      } else {
        const data = await quickPost("trustDevice");
        setTrustedDevice(true);
        setTrustedUntil(data?.expiresAt ? Number(data.expiresAt) : Date.now() + 7 * 86400000);
      }
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "Could not update trusted-device access.");
    } finally {
      setQuickBusy(false);
    }
  }

  if (error && !ready) {
    return <main className="login-loading"><div className="loading-panel" style={{maxWidth:520,padding:24}}><img className="loading-brand-image" src="/land-view-logo-full.svg" alt="LAND VIEW"/><p>{error}</p><button className="btn btn-accent" onClick={() => router.replace("/login")}>Return to sign in</button></div></main>;
  }
  if (!ready) {
    return <main className="login-loading"><div className="loading-panel"><img className="loading-brand-image" src="/land-view-logo-full.svg" alt="LAND VIEW"/><div className="loading-spinner"/><p>Loading management workspace</p></div></main>;
  }

  const name = user?.name || user?.Name || user?.username || user?.Username || "LAND VIEW User";
  const daysLeft = trustedUntil ? Math.max(1, Math.ceil((trustedUntil - Date.now()) / 86400000)) : 0;

  function chooseModule(key: ModuleKey) {
    setSelectedModule(key);
    if (key === "Dashboard") {
      setMobileOpen(false);
      router.push("/admin");
    }
  }

  return <div className="admin-shell tmg-shell portal-admin">
    <a className="portal-skip" href="#workspace-content">Skip to workspace</a>
    <header className="masthead">
      {mobileOpen && <button type="button" tabIndex={-1} aria-label="Close navigation overlay" className="mobile-nav-overlay" onClick={() => setMobileOpen(false)} />}
      <div className="utility-bar"><div className="utility-inner">
        <button type="button" ref={menuButtonRef} className="mobile-menu tmg-mobile-menu" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="admin-mobile-navigation" onClick={(event) => { event.stopPropagation(); setMobileOpen((value) => !value); }}>{mobileOpen ? "×" : "☰"}</button>
        <div className="global-search" role="search"><span aria-hidden="true">⌕</span><input aria-label="Search LAND VIEW" placeholder="Search projects, clients, bills..." /></div>
        <div className="utility-items">
          <button type="button" className="notification-button" aria-label="Notifications"><span aria-hidden="true">♧</span><b>3</b></button>
          <Link href={isAdmin ? "/admin/account" : "#"} className="utility-item user-utility" style={{textDecoration:"none",color:"inherit"}}><div className="utility-avatar">{String(name).slice(0,1).toUpperCase()}</div><span><small>{roleLabel(role)}</small>{name}</span></Link>
          {isAdmin && <button className="utility-logout" onClick={switchToEmployeeMode} disabled={roleSwitchBusy}>{roleSwitchBusy ? "SWITCHING..." : "EMP-0002 MODE"}</button>}
          {(isAdmin || isManager) && quickConfigured && <button className="utility-logout" onClick={toggleTrustedDevice} disabled={quickBusy}>{trustedDevice ? `TRUSTED ${daysLeft}D` : "TRUST DEVICE"}</button>}
          {(isAdmin || isManager) && <button className="utility-logout" onClick={setupOrLockQuickPin} disabled={quickBusy}>{quickConfigured ? "PIN LOCK" : "SET PIN"}</button>}
          <button className="utility-logout" onClick={logout}>Sign out</button>
        </div>
      </div></div>

      <nav ref={navigationRef} id="admin-mobile-navigation" aria-label="Management" className={`primary-nav lv-module-nav ${mobileOpen ? "open" : ""}`}>
        <Link href="/admin" className="sidebar-brand" onClick={() => { setSelectedModule("Dashboard"); setMobileOpen(false); }}>
          <img src="/land-view-logo.svg" alt="LAND VIEW logo" />
          <span><strong>LAND VIEW</strong><small>MANAGEMENT SYSTEM</small></span>
        </Link>

        <div className="lv-module-layout">
          <div className="lv-module-rail" aria-label="Modules">
            {visibleModules.map((module) => {
              const selectedNow = selected?.key === module.key;
              const currentNow = activeModule === module.key;
              return <button
                type="button"
                key={module.key}
                className={`lv-module-button ${selectedNow ? "selected" : ""} ${currentNow ? "current" : ""}`}
                aria-pressed={selectedNow}
                onClick={() => chooseModule(module.key)}
                title={module.key}
              >
                <span className="lv-module-icon" aria-hidden="true">{module.icon}</span>
                <span>{module.shortLabel}</span>
                {currentNow && <i aria-hidden="true" />}
              </button>;
            })}
          </div>

          <section className="lv-module-context" aria-live="polite">
            {selected ? <>
              <header className="lv-module-context-head">
                <span className="lv-module-context-icon" aria-hidden="true">{selected.icon}</span>
                <div><strong>{selected.key}</strong><small>{selected.description}</small></div>
              </header>
              <div className="lv-module-links">
                {selected.items.map((item) => {
                  const active = currentMatches(pathname, item.href);
                  return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={active ? "active" : ""} onClick={() => setMobileOpen(false)}>
                    <span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
                  </Link>;
                })}
              </div>
            </> : null}

            <div className="admin-mobile-account">
              {isAdmin && <Link href="/admin/account" onClick={() => setMobileOpen(false)}>My Account</Link>}
              {isAdmin && <button type="button" onClick={switchToEmployeeMode} disabled={roleSwitchBusy}>{roleSwitchBusy ? "Switching..." : "Switch to EMP-0002 workspace"}</button>}
              {(isAdmin || isManager) && quickConfigured && <button type="button" onClick={toggleTrustedDevice} disabled={quickBusy}>{trustedDevice ? `Trusted device · ${daysLeft} days` : "Trust this device"}</button>}
              {(isAdmin || isManager) && <button type="button" onClick={setupOrLockQuickPin} disabled={quickBusy}>{quickConfigured ? "PIN lock" : "Set PIN"}</button>}
              <button type="button" onClick={logout}>Sign out</button>
            </div>
          </section>
        </div>

        <div className="sidebar-footer">
          <Link href={isAdmin ? "/admin/account" : "#"} className="sidebar-footer-account" onClick={() => setMobileOpen(false)}>
            <div className="utility-avatar">{String(name).slice(0,1).toUpperCase()}</div>
            <div className="sidebar-user"><div><strong>{name}</strong><small>{roleLabel(role)}{isAdmin ? " · Account Control" : ""}</small></div></div>
          </Link>
        </div>
      </nav>
    </header>

    <div className="admin-main tmg-admin-main"><main id="workspace-content" className="content-wrap tmg-content-wrap">
      {!routeAllowed ? <section style={{maxWidth:760,margin:"36px auto",padding:28,border:"1px solid var(--lv-border-default)",borderRadius:14,background:"var(--lv-surface-panel)",color:"var(--lv-text-primary)"}}><small style={{color:"var(--lv-brand-text)",fontWeight:900}}>ACCESS CONTROL</small><h1 style={{margin:"8px 0 10px"}}>This function is not enabled for your account.</h1><p style={{color:"var(--lv-text-secondary)",lineHeight:1.6}}>Ask the Main Admin to enable this tab from Permission. Your other assigned LAND VIEW functions remain available.</p><Link href="/admin" style={{color:"var(--lv-brand-text)",fontWeight:800}}>Return to Dashboard →</Link></section> : children}
    </main></div>
  </div>;
}
