"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearStoredSession, landViewApi, readSessionCache, saveSessionCache, type SessionUser } from "@/lib/api";
import { roleDefaultPermissions } from "@/lib/role-permissions";

type PermissionMap = Record<string, boolean>;
type WorkspaceAccess = {
  all?: boolean;
  permissions?: PermissionMap;
};

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: IconName;
  group: string;
  permission?: string;
  adminOnly?: boolean;
};

type IconName =
  | "dashboard" | "projects" | "management" | "estimate" | "workflow" | "site"
  | "proposal" | "billing" | "expense" | "accounts" | "ledger" | "documents"
  | "people" | "certificate" | "leads" | "analytics" | "access" | "tools"
  | "location" | "serial" | "routing" | "curation" | "invoice" | "municipality"
  | "security" | "whatsapp" | "search" | "menu" | "chevron" | "logout" | "lock"
  | "device" | "user";

const NAV: NavItem[] = [
  { href: "/admin", label: "Command Center", description: "Organization health and priority overview", icon: "dashboard", group: "Overview", permission: "dashboard.view" },

  { href: "/admin/projects", label: "Projects", description: "Project records, stages and delivery", icon: "projects", group: "Projects & Sites", permission: "projects.view" },
  { href: "/projectmanagement", label: "Project Management", description: "Construction finance and supervision", icon: "management", group: "Projects & Sites", permission: "project_management.view" },
  { href: "/admin/estimate", label: "Estimates", description: "Pile, summary and detailed estimates", icon: "estimate", group: "Projects & Sites", permission: "estimates.view" },
  { href: "/admin/workflow", label: "Workflow", description: "Assignments, progress and delivery flow", icon: "workflow", group: "Projects & Sites", permission: "workflow.view" },
  { href: "/admin/site-visits", label: "Site Visits", description: "Field reports, photos and verification", icon: "site", group: "Projects & Sites", permission: "site.view" },

  { href: "/admin/proposals", label: "Proposals", description: "Commercial offers and conversions", icon: "proposal", group: "Commercial & Finance", permission: "proposals.view" },
  { href: "/admin/finance", label: "Billing", description: "Bills, collection and project dues", icon: "billing", group: "Commercial & Finance", permission: "finance.view" },
  { href: "/admin/expenses", label: "Expenses", description: "Expense submission and approvals", icon: "expense", group: "Commercial & Finance", permission: "expenses.view_all" },
  { href: "/admin/accounts/entry", label: "Main Accounts", description: "Post company account entries", icon: "accounts", group: "Commercial & Finance", adminOnly: true },
  { href: "/admin/accounts", label: "Accounts Ledger", description: "Reconcile company transaction history", icon: "ledger", group: "Commercial & Finance", permission: "ledger.view" },

  { href: "/admin/registers", label: "Document Registry", description: "Design books and document registers", icon: "documents", group: "People & Records", permission: "documents.view" },
  { href: "/admin/employees", label: "Employees", description: "People, roles and employment status", icon: "people", group: "People & Records", permission: "employees.view" },
  { href: "/admin/certificates", label: "Certificates", description: "Requests, processing and issuing", icon: "certificate", group: "People & Records", permission: "certificates.view" },

  { href: "/admin/website-leads", label: "Website Enquiries", description: "Leads and client follow-up", icon: "leads", group: "Website & Insights", permission: "public.view" },
  { href: "/admin/website-analytics", label: "Website Analytics", description: "Traffic, visitors and conversion signals", icon: "analytics", group: "Website & Insights", permission: "analytics.view" },

  { href: "/admin/access", label: "Access Control", description: "Roles, permissions and authority", icon: "access", group: "System", adminOnly: true },
];

const SYSTEM_TOOLS: NavItem[] = [
  { href: "/admin/projects/new", label: "New Project", description: "Create a complete project record", icon: "projects", group: "System Tools", adminOnly: true },
  { href: "/admin/projects/legacy", label: "Legacy Registration", description: "Register or repair older records", icon: "tools", group: "System Tools", adminOnly: true },
  { href: "/admin/projects/locations", label: "Project Locations", description: "Manage map and geolocation records", icon: "location", group: "System Tools", adminOnly: true },
  { href: "/admin/projects/missing-serials", label: "Missing Serials", description: "Audit missing project serials", icon: "serial", group: "System Tools", adminOnly: true },
  { href: "/admin/projects/payment-routing", label: "Payment Routing", description: "Repair project-payment relationships", icon: "routing", group: "System Tools", adminOnly: true },
  { href: "/admin/projects/reclassify", label: "Project Reclassify", description: "Correct project classification", icon: "routing", group: "System Tools", adminOnly: true },
  { href: "/admin/projects/website-curation", label: "Website Curation", description: "Control public project presentation", icon: "curation", group: "System Tools", adminOnly: true },
  { href: "/admin/projects/website-readiness", label: "Website Readiness", description: "Audit publish-ready projects", icon: "curation", group: "System Tools", adminOnly: true },
  { href: "/admin/finance/bills", label: "Bills Editor", description: "Administrative billing editor", icon: "billing", group: "System Tools", adminOnly: true },
  { href: "/admin/finance/invoices", label: "Invoice Register", description: "Administrative invoice register", icon: "invoice", group: "System Tools", adminOnly: true },
  { href: "/admin/accounts/export", label: "Ledger Export", description: "Generate ledger reports", icon: "ledger", group: "System Tools", adminOnly: true },
  { href: "/admin/municipality-accounts", label: "Municipality Accounts", description: "Municipality financial records", icon: "municipality", group: "System Tools", adminOnly: true },
  { href: "/admin/municipality-file-pass", label: "Municipality File Pass", description: "Municipality approval workflow", icon: "certificate", group: "System Tools", adminOnly: true },
  { href: "/admin/security", label: "Security", description: "Security controls and sessions", icon: "security", group: "System Tools", adminOnly: true },
  { href: "/admin/whatsapp", label: "WhatsApp", description: "WhatsApp integration and pairing", icon: "whatsapp", group: "System Tools", adminOnly: true },
];

const ALL_NAV = [...NAV, ...SYSTEM_TOOLS];
const SESSION_WATCHDOG_MS = 8000;

function roleOf(user?: SessionUser | null) {
  return String(user?.role || user?.Role || "").trim().toLowerCase();
}

function roleLabel(role: string) {
  if (role === "manager") return "Management";
  if (role === "employee") return "Employee";
  if (role === "admin") return "Main Admin";
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

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "dashboard": return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="14" y="11" width="7" height="10" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>;
    case "projects": return <svg {...common}><path d="M3 7.5h7l2 2H21v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7.5V5a2 2 0 0 1 2-2h4l2 2h6"/></svg>;
    case "management": return <svg {...common}><path d="M4 19V9l8-5 8 5v10"/><path d="M8 19v-6h8v6M2 21h20"/></svg>;
    case "estimate": return <svg {...common}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h3M15 11h1M8 15h3M15 15h1M8 18h8"/></svg>;
    case "workflow": return <svg {...common}><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M8 6h8M17 8l-4 8M7 8l4 8"/></svg>;
    case "site": case "location": return <svg {...common}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></svg>;
    case "proposal": return <svg {...common}><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h5M8 12h8M8 16h6"/></svg>;
    case "billing": return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.8-.7-1.8-1-3-1-1.7 0-3 .8-3 2s1.1 1.8 3 2.2 3 .9 3 2.2-1.3 2.2-3.1 2.2c-1.3 0-2.4-.4-3.2-1.1M12 5.5v13"/></svg>;
    case "expense": return <svg {...common}><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>;
    case "accounts": return <svg {...common}><path d="M3 9h18M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18M12 3l9 4H3z"/></svg>;
    case "ledger": return <svg {...common}><path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/></svg>;
    case "documents": return <svg {...common}><path d="M7 3h10v4H7zM5 7h14v14H5zM8 11h8M8 15h8M8 18h5"/></svg>;
    case "people": return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3.4 2.4-5 5.5-5s4.9 1.6 5.5 5M16 6.5a2.5 2.5 0 0 1 0 5M16.5 14c2.3.4 3.6 2 4 5"/></svg>;
    case "certificate": return <svg {...common}><path d="M6 3h12v13H6z"/><path d="M9 7h6M9 10h6M9 13h4M9 16l-1 5 4-2 4 2-1-5"/></svg>;
    case "leads": return <svg {...common}><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>;
    case "analytics": return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
    case "access": case "security": return <svg {...common}><path d="M12 3l8 3v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-5"/></svg>;
    case "serial": return <svg {...common}><path d="M9 3L7 21M17 3l-2 18M4 9h16M3 15h16"/></svg>;
    case "routing": return <svg {...common}><path d="M4 7h12M13 4l3 3-3 3M20 17H8M11 14l-3 3 3 3"/></svg>;
    case "curation": return <svg {...common}><path d="M12 3l2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8z"/></svg>;
    case "invoice": return <svg {...common}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>;
    case "municipality": return <svg {...common}><path d="M3 9h18M5 9v10M9 9v10M15 9v10M19 9v10M2 21h20M12 3l9 4H3z"/></svg>;
    case "whatsapp": return <svg {...common}><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5z"/><path d="M8.5 8.5c.7 3 3 5.2 6 6l1.2-1.5"/></svg>;
    case "search": return <svg {...common}><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/></svg>;
    case "menu": return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case "chevron": return <svg {...common}><path d="M9 6l6 6-6 6"/></svg>;
    case "logout": return <svg {...common}><path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9"/></svg>;
    case "lock": return <svg {...common}><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>;
    case "device": return <svg {...common}><rect x="4" y="3" width="16" height="14" rx="2"/><path d="M9 21h6M12 17v4"/></svg>;
    case "user": return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 3.5-6.5 8-6.5s7.2 2.3 8 6.5"/></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="8"/></svg>;
  }
}

export default function AdminShellV3({ children, initialUser = null }: { children: React.ReactNode; initialUser?: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [access, setAccess] = useState<WorkspaceAccess | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [quickConfigured, setQuickConfigured] = useState(false);
  const [trustedDevice, setTrustedDevice] = useState(false);
  const [trustedUntil, setTrustedUntil] = useState<number | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const [roleSwitchBusy, setRoleSwitchBusy] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

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
      void getWorkspaceAccess().then((permissionData) => {
        if (!cancelled) setAccess(permissionData);
      }).catch(() => {});
      return () => { cancelled = true; };
    }

    const watchdog = window.setTimeout(() => {
      if (!cancelled) setError("Session validation is taking too long. Refresh once or sign in again.");
    }, SESSION_WATCHDOG_MS);

    void Promise.all([landViewApi.getSession(), getWorkspaceAccess()]).then(([session, permissionData]) => {
      if (cancelled) return;
      const role = roleOf(session?.user);
      if (!session?.authenticated || !isWorkspaceRole(role)) {
        router.replace(role === "client" ? "/client" : "/login");
        return;
      }
      window.clearTimeout(watchdog);
      saveSessionCache(session);
      setUser(session.user);
      setAccess(permissionData);
      setReady(true);
      setError("");
    }).catch((err) => {
      window.clearTimeout(watchdog);
      if (!cancelled) setError(err instanceof Error ? err.message : "Unable to validate workspace access.");
    });

    return () => { cancelled = true; window.clearTimeout(watchdog); };
  }, [initialUser, router]);

  useEffect(() => {
    if (!ready) return;
    const role = roleOf(user);
    if (role !== "admin" && role !== "manager") return;
    void quickPost("quickPinStatus").then((data) => {
      setQuickConfigured(Boolean(data?.configured));
      setTrustedDevice(Boolean(data?.trusted));
      setTrustedUntil(data?.expiresAt ? Number(data.expiresAt) : null);
    }).catch(() => {});
  }, [ready, user]);

  useEffect(() => {
    const saved = window.localStorage.getItem("lv-admin-sidebar-collapsed");
    setCollapsed(saved === "1");
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
    setQuery("");
    if (SYSTEM_TOOLS.some((item) => currentMatches(pathname, item.href))) setSystemOpen(true);
  }, [pathname]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setAccountOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", key); };
  }, []);

  const role = roleOf(user);
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const all = Boolean(access?.all || isAdmin);
  const permissions = access?.permissions || {};
  const allowed = (item: NavItem) => item.adminOnly ? isAdmin : all || Boolean(item.permission && permissions[item.permission]);
  const visibleNav = useMemo(() => NAV.filter(allowed), [all, isAdmin, permissions]);
  const visibleSystemTools = useMemo(() => SYSTEM_TOOLS.filter(allowed), [all, isAdmin, permissions]);

  const groups = useMemo(() => {
    const result: Array<{ group: string; items: NavItem[] }> = [];
    for (const item of visibleNav) {
      const found = result.find((entry) => entry.group === item.group);
      if (found) found.items.push(item); else result.push({ group: item.group, items: [item] });
    }
    return result;
  }, [visibleNav]);

  const activeItem = useMemo(() => {
    return [...ALL_NAV].sort((a, b) => b.href.length - a.href.length).find((item) => currentMatches(pathname, item.href));
  }, [pathname]);

  const routeAllowed = !activeItem || allowed(activeItem);
  const searchable = [...visibleNav, ...visibleSystemTools];
  const searchResults = query.trim().length > 0
    ? searchable.filter((item) => `${item.label} ${item.description} ${item.group}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 7)
    : [];

  const name = String(user?.name || user?.Name || user?.username || user?.Username || "LAND VIEW User");
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "LV";
  const daysLeft = trustedUntil ? Math.max(1, Math.ceil((trustedUntil - Date.now()) / 86400000)) : 0;

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem("lv-admin-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

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
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
        body: JSON.stringify({ action: "employee" }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not switch to EMP-0002."));
      clearStoredSession();
      window.location.assign("/employee");
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "Could not switch employee workspace.");
      setRoleSwitchBusy(false);
    }
  }

  async function setupOrLockQuickPin() {
    if (quickBusy || (!isAdmin && !isManager)) return;
    if (quickConfigured) {
      if (!trustedDevice) return window.alert("Trust this device first before using PIN lock.");
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
    try { await quickPost("setQuickPin", { pin: first }); setQuickConfigured(true); window.alert("PIN created. Trust this device to enable PIN login here."); }
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
    return <main className="login-loading"><div className="loading-panel" style={{ maxWidth: 520, padding: 24 }}><img className="loading-brand-image" src="/land-view-logo-full.svg" alt="LAND VIEW"/><p>{error}</p><button className="btn btn-accent" onClick={() => router.replace("/login")}>Return to sign in</button></div></main>;
  }

  if (!ready) {
    return <main className="login-loading"><div className="loading-panel"><img className="loading-brand-image" src="/land-view-logo-full.svg" alt="LAND VIEW"/><div className="loading-spinner"/><p>Loading management workspace</p></div></main>;
  }

  return (
    <div className={`lv3-admin portal-admin ${collapsed ? "lv3-sidebar-collapsed" : ""}`}>
      <a className="lv3-skip" href="#admin-workspace">Skip to workspace</a>
      {mobileOpen && <button type="button" className="lv3-mobile-overlay" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}

      <aside className={`lv3-sidebar ${mobileOpen ? "is-mobile-open" : ""}`} aria-label="Admin navigation">
        <div className="lv3-brand-row">
          <Link href="/admin" className="lv3-brand" onClick={() => setMobileOpen(false)}>
            <span className="lv3-brand-mark"><img src="/land-view-logo.svg" alt="" /></span>
            <span className="lv3-brand-copy"><strong>LAND VIEW</strong><small>ADMINISTRATION</small></span>
          </Link>
          <button type="button" className="lv3-collapse" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggleCollapsed}><Icon name="chevron" size={16}/></button>
        </div>

        <div className="lv3-sidebar-scroll">
          <nav className="lv3-nav">
            {groups.map((group) => (
              <section className="lv3-nav-group" key={group.group} aria-label={group.group}>
                <div className="lv3-nav-label">{group.group}</div>
                {group.items.map((item) => {
                  const active = currentMatches(pathname, item.href);
                  return <Link key={item.href} href={item.href} className={`lv3-nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined} onClick={() => setMobileOpen(false)}>
                    <span className="lv3-nav-icon"><Icon name={item.icon}/></span>
                    <span className="lv3-nav-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
                    {active && <span className="lv3-active-dot" />}
                  </Link>;
                })}
              </section>
            ))}

            {visibleSystemTools.length > 0 && <section className="lv3-nav-group lv3-system-group" aria-label="System tools">
              <button type="button" className={`lv3-system-toggle ${systemOpen ? "open" : ""}`} onClick={() => setSystemOpen((value) => !value)} title={collapsed ? "System Tools" : undefined}>
                <span className="lv3-nav-icon"><Icon name="tools"/></span>
                <span className="lv3-nav-copy"><strong>System Tools</strong><small>Corrections, integrations & advanced controls</small></span>
                <span className="lv3-system-chevron"><Icon name="chevron" size={14}/></span>
              </button>
              {systemOpen && <div className="lv3-system-list">
                {visibleSystemTools.map((item) => {
                  const active = currentMatches(pathname, item.href);
                  return <Link key={item.href} href={item.href} className={`lv3-nav-link lv3-system-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} title={collapsed ? item.label : undefined} onClick={() => setMobileOpen(false)}>
                    <span className="lv3-nav-icon"><Icon name={item.icon}/></span>
                    <span className="lv3-nav-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
                    {active && <span className="lv3-active-dot" />}
                  </Link>;
                })}
              </div>}
            </section>}
          </nav>
        </div>

        <div className="lv3-sidebar-user">
          <span className="lv3-avatar">{initials}</span>
          <span className="lv3-user-copy"><strong>{name}</strong><small>{roleLabel(role)}</small></span>
          <button type="button" className="lv3-user-menu-button" aria-label="Open account menu" onClick={() => setAccountOpen((value) => !value)}>•••</button>
        </div>
      </aside>

      <div className="lv3-stage">
        <header className="lv3-topbar">
          <div className="lv3-topbar-left">
            <button type="button" className="lv3-mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Icon name="menu" size={20}/></button>
            <div className="lv3-page-title">
              <span>{activeItem?.group || "Administration"}</span>
              <h1>{activeItem?.label || "LAND VIEW Admin"}</h1>
            </div>
          </div>

          <div className="lv3-topbar-right">
            <div className="lv3-search-wrap">
              <Icon name="search" size={17}/>
              <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && searchResults[0]) router.push(searchResults[0].href); }} placeholder="Search admin modules…" aria-label="Search admin modules" />
              <kbd>⌘ K</kbd>
              {searchResults.length > 0 && <div className="lv3-search-results">
                {searchResults.map((item) => <button key={item.href} type="button" onClick={() => { router.push(item.href); setQuery(""); }}>
                  <span className="lv3-nav-icon"><Icon name={item.icon}/></span>
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  <Icon name="chevron" size={14}/>
                </button>)}
              </div>}
            </div>

            <div className="lv3-account" ref={accountRef}>
              <button type="button" className="lv3-account-trigger" aria-expanded={accountOpen} onClick={() => setAccountOpen((value) => !value)}>
                <span className="lv3-avatar">{initials}</span>
                <span className="lv3-account-name"><strong>{name}</strong><small>{roleLabel(role)}</small></span>
                <span className="lv3-account-chevron">⌄</span>
              </button>
              {accountOpen && <div className="lv3-account-menu">
                <div className="lv3-account-menu-head"><span className="lv3-avatar large">{initials}</span><div><strong>{name}</strong><small>{roleLabel(role)} workspace</small></div></div>
                {isAdmin && <button type="button" onClick={switchToEmployeeMode} disabled={roleSwitchBusy}><Icon name="user" size={17}/><span><strong>{roleSwitchBusy ? "Switching…" : "Employee mode"}</strong><small>Open EMP-0002 workspace</small></span></button>}
                {(isAdmin || isManager) && quickConfigured && <button type="button" onClick={toggleTrustedDevice} disabled={quickBusy}><Icon name="device" size={17}/><span><strong>{trustedDevice ? `Trusted device · ${daysLeft}d` : "Trust this device"}</strong><small>{trustedDevice ? "Remove trusted access" : "Enable faster secure sign-in"}</small></span></button>}
                {(isAdmin || isManager) && <button type="button" onClick={setupOrLockQuickPin} disabled={quickBusy}><Icon name="lock" size={17}/><span><strong>{quickConfigured ? "PIN lock" : "Set quick PIN"}</strong><small>{quickConfigured ? "Lock this workspace now" : "Create a permanent 6-digit PIN"}</small></span></button>}
                <button type="button" className="danger" onClick={logout}><Icon name="logout" size={17}/><span><strong>Sign out</strong><small>End this admin session</small></span></button>
              </div>}
            </div>
          </div>
        </header>

        <main id="admin-workspace" className="lv3-workspace">
          {!routeAllowed ? <section className="lv3-access-denied"><span><Icon name="lock" size={18}/></span><small>ACCESS CONTROL</small><h2>This function is not enabled for your account.</h2><p>Ask the Main Admin to enable this function from Access Control. Your other assigned LAND VIEW modules remain available.</p><Link href="/admin">Return to Command Center →</Link></section> : children}
        </main>
      </div>
    </div>
  );
}
