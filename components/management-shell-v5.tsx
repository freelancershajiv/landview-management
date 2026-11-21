"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearStoredSession, landViewApi, type SessionUser } from "@/lib/api";
import { roleDefaultPermissions } from "@/lib/role-permissions";

type PermissionMap = Record<string, boolean>;
type WorkspaceAccess = {
  all?: boolean;
  permissions?: PermissionMap;
};

type NavItem = {
  href: string;
  label: string;
  icon: string;
  permission?: string;
  adminOnly?: boolean;
};

type SidebarEntry =
  | { kind: "link"; item: NavItem }
  | { kind: "group"; label: string; icon: string; items: NavItem[] };

const SIDEBAR: SidebarEntry[] = [
  {
    kind: "link",
    item: { href: "/admin", label: "Dashboard", icon: "⌂", permission: "dashboard.view" },
  },
  {
    kind: "link",
    item: { href: "/admin/todo", label: "To Do", icon: "✓", permission: "dashboard.view" },
  },
  {
    kind: "group",
    label: "Projects",
    icon: "▣",
    items: [
      { href: "/admin/projects", label: "Project List", icon: "▣", permission: "projects.view" },
      { href: "/projectmanagement", label: "Project Management", icon: "◈", permission: "project_management.view" },
      { href: "/admin/workflow", label: "Workflow", icon: "↗", permission: "workflow.view" },
      { href: "/admin/projects/new", label: "New Project", icon: "+", permission: "projects.edit" },
    ],
  },
  {
    kind: "link",
    item: { href: "/admin/estimate", label: "Estimate", icon: "▤", permission: "estimates.view" },
  },
  {
    kind: "group",
    label: "Billing & Accounts",
    icon: "৳",
    items: [
      { href: "/admin/billing", label: "Billing", icon: "৳", permission: "finance.view" },
      { href: "/admin/accounts", label: "Ledger", icon: "≡", permission: "ledger.view" },
      { href: "/admin/billing/invoice-center", label: "Invoice Center", icon: "▤", permission: "finance.view" },
      { href: "/admin/billing/bills", label: "Bills", icon: "▧", permission: "finance.edit" },
      { href: "/admin/billing/service-payments", label: "Receive Payment", icon: "৳", permission: "finance.edit" },
      { href: "/admin/billing/due-bills", label: "Due Bills", icon: "▤", permission: "finance.view" },
      { href: "/admin/municipality-accounts", label: "Municipality Accounts", icon: "▦", permission: "municipality.view" },
      { href: "/admin/accounts/export", label: "Ledger Export", icon: "⇩", permission: "reports.view" },
    ],
  },
  {
    kind: "link",
    item: { href: "/admin/proposals", label: "Proposals", icon: "✎", permission: "proposals.view" },
  },
  {
    kind: "group",
    label: "Registers",
    icon: "▧",
    items: [
      { href: "/admin/registers", label: "Document Registry", icon: "▧", permission: "documents.view" },
      { href: "/admin/certificates", label: "Certificates", icon: "⌑", permission: "certificates.view" },
      { href: "/admin/municipality-file-pass", label: "Municipality File Pass", icon: "✓", permission: "municipality.view" },
    ],
  },
  {
    kind: "group",
    label: "Employees",
    icon: "♙",
    items: [
      { href: "/admin/employees", label: "Employee List", icon: "♙", permission: "employees.view" },
      { href: "/admin/site-visits", label: "Site Visits", icon: "⌖", permission: "site.view" },
      { href: "/admin/expenses", label: "Expenses", icon: "◫", permission: "expenses.view_all" },
    ],
  },
  {
    kind: "group",
    label: "Website",
    icon: "⌁",
    items: [
      { href: "/admin/website-analytics", label: "Website Analytics", icon: "⌁", permission: "analytics.view" },
      { href: "/admin/website-leads", label: "Website Leads", icon: "✦", permission: "public.view" },
      { href: "/admin/projects/website-curation", label: "Website Projects", icon: "▣", permission: "public.edit" },
      { href: "/admin/public-testimonials", label: "Testimonials", icon: "❝", permission: "public.view" },
      { href: "/admin/projects/website-readiness", label: "Website Readiness", icon: "✓", permission: "public.view" },
    ],
  },
  {
    kind: "group",
    label: "Management",
    icon: "◎",
    items: [
      { href: "/admin/action-center", label: "Action Center", icon: "◎", permission: "workflow.edit" },
      { href: "/admin/audit-log", label: "Audit Log", icon: "≣", adminOnly: true },
    ],
  },
  {
    kind: "group",
    label: "Settings & Access",
    icon: "⚙",
    items: [
      { href: "/admin/access", label: "Permissions", icon: "⚿", adminOnly: true },
      { href: "/admin/security", label: "Security", icon: "◆", adminOnly: true },
      { href: "/admin/whatsapp", label: "WhatsApp", icon: "●", permission: "dashboard.view" },
    ],
  },
];

const ALL_NAV_ITEMS = SIDEBAR.flatMap((entry) => entry.kind === "link" ? [entry.item] : entry.items);

function roleOf(user?: SessionUser | null) {
  return String(user?.role || user?.Role || "").trim().toLowerCase();
}

function roleLabel(role: string) {
  if (role === "manager") return "Management";
  if (role === "admin") return "Admin";
  return "User";
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

export default function ManagementShellV5({ children, initialUser = null }: { children: React.ReactNode; initialUser?: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileFindOpen, setMobileFindOpen] = useState(false);
  const [pageQuery, setPageQuery] = useState("");
  const [recordSearch, setRecordSearch] = useState<{ query: string; hits: { kind: string; label: string; href: string }[]; partial?: boolean }>({ query: "", hits: [] });
  const [expandedSection, setExpandedSection] = useState("");
  const [access, setAccess] = useState<WorkspaceAccess>(() => {
    const role = roleOf(initialUser);
    if (role === "admin") return { all: true };
    if (role === "manager") return { all: false, permissions: roleDefaultPermissions("manager") };
    return { all: false, permissions: {} };
  });
  const [quickConfigured, setQuickConfigured] = useState(false);
  const [trustedDevice, setTrustedDevice] = useState(false);
  const [trustedUntil, setTrustedUntil] = useState<number | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const [roleSwitchBusy, setRoleSwitchBusy] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const mobileFindInputRef = useRef<HTMLInputElement>(null);
  const mobileFindButtonRef = useRef<HTMLButtonElement>(null);

  const role = roleOf(initialUser);
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const name = initialUser?.name || initialUser?.Name || initialUser?.username || initialUser?.Username || "LAND VIEW User";
  const all = Boolean(access?.all || isAdmin);
  const permissions = access?.permissions || {};

  const canSee = (item: NavItem) => {
    if (item.adminOnly) return isAdmin;
    if (all) return true;
    return Boolean(item.permission && permissions[item.permission]);
  };

  const visibleSidebar = useMemo(() => SIDEBAR.flatMap((entry): SidebarEntry[] => {
    if (entry.kind === "link") return canSee(entry.item) ? [entry] : [];
    const items = entry.items.filter(canSee);
    return items.length ? [{ ...entry, items }] : [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [all, isAdmin, permissions]);

  // Search only pages the current role can actually open.
  const searchablePages = useMemo(
    () => visibleSidebar.flatMap((entry) => entry.kind === "link" ? [entry.item] : entry.items),
    [visibleSidebar],
  );
  const pageResults = searchablePages
    .filter((item) => item.label.toLowerCase().includes(pageQuery.trim().toLowerCase()))
    .slice(0, 8);

  const searchTerm = pageQuery.trim();
  const records = recordSearch.query === searchTerm ? recordSearch.hits : [];
  const searchingRecords = searchTerm.length >= 3 && searchTerm.length <= 120 && recordSearch.query !== searchTerm;
  const firstSearchHref = records[0]?.href || pageResults[0]?.href;

  useEffect(() => {
    if (searchTerm.length < 3 || searchTerm.length > 120) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/management-search?q=${encodeURIComponent(searchTerm)}`, {
          signal: controller.signal, cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error("Record search unavailable");
        if (!controller.signal.aborted) setRecordSearch({ query: searchTerm, hits: result.data, partial: result.partial });
      } catch {
        if (!controller.signal.aborted) setRecordSearch({ query: searchTerm, hits: [], partial: true });
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [searchTerm]);

  function renderSearchResults() {
    return <>
      {records.map((item) => <Link key={item.href} href={item.href} onClick={clearSearch}>{item.kind} · {item.label}</Link>)}
      {pageResults.map((item) => <Link key={item.href} href={item.href} onClick={clearSearch}>{item.label}</Link>)}
      {searchingRecords && <p role="status">Searching records…</p>}
      {recordSearch.query === searchTerm && recordSearch.partial && <p role="status">Some records could not be searched.</p>}
      {!records.length && !pageResults.length && !searchingRecords && !(recordSearch.query === searchTerm && recordSearch.partial) && <p>No matches</p>}
    </>;
  }

  const activeItem = useMemo(() => {
    const sorted = [...ALL_NAV_ITEMS].sort((a, b) => b.href.length - a.href.length);
    return sorted.find((item) => currentMatches(pathname, item.href));
  }, [pathname]);

  const activeGroup = useMemo(() => {
    const group = SIDEBAR.find((entry) => entry.kind === "group" && entry.items.some((item) => currentMatches(pathname, item.href)));
    return group?.kind === "group" ? group.label : "";
  }, [pathname]);

  const routeAllowed = !activeItem || (activeItem.adminOnly ? isAdmin : (all || Boolean(activeItem.permission && permissions[activeItem.permission])));
  const daysLeft = trustedUntil ? Math.max(1, Math.ceil((trustedUntil - Date.now()) / 86400000)) : 0;

  useEffect(() => {
    let cancelled = false;
    if (role === "admin" || role === "manager") {
      void getWorkspaceAccess().then((data) => { if (!cancelled) setAccess(data); }).catch(() => {});
      void quickPost("quickPinStatus").then((data) => {
        if (cancelled) return;
        setQuickConfigured(Boolean(data?.configured));
        setTrustedDevice(Boolean(data?.trusted));
        setTrustedUntil(data?.expiresAt ? Number(data.expiresAt) : null);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [role]);

  useEffect(() => {
    setMobileOpen(false);
    setMobileFindOpen(false);
    setPageQuery("");
    if (activeGroup) setExpandedSection(activeGroup);
  }, [pathname, activeGroup]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => { if (desktop.matches) { setMobileOpen(false); setMobileFindOpen(false); } };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerCloseRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      } else if (event.key === "Tab" && navigationRef.current) {
        const visible = Array.from(navigationRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'
        )).filter(item => item.getClientRects().length > 0);
        if (!visible.length) return;
        const first = visible[0];
        const last = visible[visible.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (mobileFindOpen) mobileFindInputRef.current?.focus();
  }, [mobileFindOpen]);

  function clearSearch() {
    setMobileFindOpen(false);
    setPageQuery("");
  }

  function openPageFromSearch(href: string) {
    clearSearch();
    router.push(href);
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
      try {
        await quickPost("quickLock");
        clearStoredSession();
        window.location.replace("/login");
      } catch (err: any) {
        window.alert(err?.message || "Could not PIN-lock the workspace.");
        setQuickBusy(false);
      }
      return;
    }
    const first = window.prompt("Create your permanent 6-digit Admin PIN:", "");
    if (first === null) return;
    if (!/^\d{6}$/.test(first)) return window.alert("Admin PIN must be exactly 6 digits.");
    const second = window.prompt("Confirm the 6-digit PIN:", "");
    if (first !== second) return window.alert("PINs did not match.");
    setQuickBusy(true);
    try {
      await quickPost("setQuickPin", { pin: first });
      setQuickConfigured(true);
      window.alert("PIN created. Use TRUST DEVICE to enable PIN login here.");
    } catch (err: any) {
      window.alert(err?.message || "Could not create PIN.");
    } finally {
      setQuickBusy(false);
    }
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
    } catch (err: any) {
      window.alert(err?.message || "Could not update trusted-device access.");
    } finally {
      setQuickBusy(false);
    }
  }

  const navStyles = `
    .admin-mobile-account{display:none}
    .lv-nav-direct{display:grid!important;grid-template-columns:26px 1fr!important;align-items:center!important;gap:8px!important;min-height:44px!important;padding:0 12px!important;text-decoration:none!important;border-radius:8px!important;color:inherit!important;font-size:12px!important;font-weight:850!important;letter-spacing:.02em!important}
    .lv-nav-direct:hover,.lv-nav-direct.active{background:var(--lv-brand-soft)!important;color:var(--lv-brand-text)!important}
    .lv-nav-stack{display:grid;gap:5px;width:100%}
    .lv-nav-group{display:grid;gap:3px}
    .lv-nav-group-button{width:100%;min-height:44px;display:grid;grid-template-columns:26px 1fr auto;align-items:center;gap:8px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;font:inherit;font-size:12px;font-weight:850;cursor:pointer}
    .lv-nav-group-button:hover,.lv-nav-group-button.active{background:var(--lv-brand-soft);color:var(--lv-brand-text)}
    .lv-nav-group-button .nav-icon{font-size:16px}.lv-nav-chevron{font-size:11px;transition:transform .16s ease}.lv-nav-group.open .lv-nav-chevron{transform:rotate(90deg)}
    .lv-nav-children{display:grid;gap:2px;padding:2px 0 6px 22px}
    .lv-nav-children>a{min-height:38px;display:grid;grid-template-columns:24px 1fr;align-items:center;gap:7px;padding:0 10px;border-radius:7px;color:inherit;text-decoration:none;font-size:11.5px;font-weight:760}
    .lv-nav-children>a:hover,.lv-nav-children>a.active{background:var(--lv-brand-soft);color:var(--lv-brand-text)}
    .sidebar-footer-account{display:flex;align-items:center;gap:10px;padding:8px;border-radius:9px;color:inherit;text-decoration:none}.sidebar-footer-account:hover{background:var(--lv-brand-soft)}
    @media screen and (min-width:901px){.portal-admin .primary-nav{visibility:visible!important;pointer-events:auto!important}.portal-admin .mobile-nav-overlay{display:none!important}}
    /* Desktop keeps its legacy sidebar geometry. The mobile scroll region is
       owned by admin-mobile-v5.css, without contradictory overflow rules. */
    @media screen and (min-width:901px){
      .primary-nav{position:relative;z-index:90;overflow:visible!important}
      .primary-nav-inner{position:relative;z-index:91;display:grid;gap:4px;overflow:visible!important;padding:3px 0}
    }
  `;

  return <div className="admin-shell tmg-shell portal-admin">
    <style dangerouslySetInnerHTML={{ __html: navStyles }} />
    <a className="portal-skip" href="#workspace-content">Skip to workspace</a>
    <header className="masthead">
      {mobileOpen && <button type="button" tabIndex={-1} aria-label="Close navigation overlay" className="mobile-nav-overlay" onClick={() => { setMobileOpen(false); menuButtonRef.current?.focus(); }} />}
      <div className="utility-bar"><div className="utility-inner">
        <button type="button" ref={menuButtonRef} className="mobile-menu tmg-mobile-menu" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="admin-mobile-navigation" onClick={(event) => { event.stopPropagation(); setMobileFindOpen(false); setMobileOpen((value) => !value); }}>{mobileOpen ? "×" : "☰"}</button>
        <Link href="/admin" className="lv-mobile-brand" onClick={() => { setMobileFindOpen(false); setMobileOpen(false); }} aria-label="LAND VIEW Management dashboard">
          <strong>LAND VIEW</strong><small>MANAGEMENT</small>
        </Link>
        <div className="global-search" role="search">
          <span aria-hidden="true">⌕</span>
          <input type="search" aria-label="Find a page or record" placeholder="Find a page, client or ID…" value={pageQuery} onChange={(event) => setPageQuery(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && firstSearchHref) { event.preventDefault(); openPageFromSearch(firstSearchHref); }
            if (event.key === "Escape") setPageQuery("");
          }} />
          {pageQuery.trim() && <div className="lv-desktop-page-results" aria-label="Matching pages and records">
            {renderSearchResults()}
          </div>}
        </div>
        <button type="button" ref={mobileFindButtonRef} className="lv-mobile-find-toggle" aria-label={mobileFindOpen ? "Close page search" : "Find a page"} aria-expanded={mobileFindOpen} aria-controls="lv-mobile-page-finder" onClick={() => { setMobileOpen(false); setMobileFindOpen((open) => !open); }}>{mobileFindOpen ? "×" : "⌕"}</button>
        <div className="utility-items">
          {(all || permissions["dashboard.view"]) && <Link href="/admin/todo" className="notification-button" aria-label="Open To Do" title="Open To Do" onClick={() => { setMobileOpen(false); setMobileFindOpen(false); }}><span aria-hidden="true">✓</span></Link>}
          <Link href="/admin/account" className="utility-item user-utility" style={{ textDecoration: "none", color: "inherit" }}><div className="utility-avatar">{String(name).slice(0, 1).toUpperCase()}</div><span><small>{roleLabel(role)}</small>{name}</span></Link>
          {isAdmin && <button className="utility-logout" onClick={switchToEmployeeMode} disabled={roleSwitchBusy}>{roleSwitchBusy ? "SWITCHING..." : "EMP-0002 MODE"}</button>}
          {(isAdmin || isManager) && quickConfigured && <button className="utility-logout" onClick={toggleTrustedDevice} disabled={quickBusy}>{trustedDevice ? `TRUSTED ${daysLeft}D` : "TRUST DEVICE"}</button>}
          {(isAdmin || isManager) && <button className="utility-logout" onClick={setupOrLockQuickPin} disabled={quickBusy}>{quickConfigured ? "PIN LOCK" : "SET PIN"}</button>}
          <button className="utility-logout" onClick={logout}>Sign out</button>
        </div>
        {mobileFindOpen && <div className="lv-mobile-find-panel" id="lv-mobile-page-finder" role="search" aria-label="Find pages and records">
          <label htmlFor="lv-mobile-find-input">Find a page or record</label>
          <input ref={mobileFindInputRef} id="lv-mobile-find-input" type="search" autoComplete="off" value={pageQuery} placeholder="Page, client, LV file, proposal or invoice…" onChange={(event) => setPageQuery(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && firstSearchHref) { event.preventDefault(); openPageFromSearch(firstSearchHref); }
            if (event.key === "Escape") { setMobileFindOpen(false); mobileFindButtonRef.current?.focus(); }
          }} />
          <div className="lv-mobile-find-results">
            {searchTerm ? renderSearchResults() : <p>Search by page, client name or record ID.</p>}
          </div>
          <button type="button" className="lv-mobile-find-dismiss" onClick={() => { setMobileFindOpen(false); mobileFindButtonRef.current?.focus(); }}>Close search</button>
        </div>}
      </div></div>

      <nav ref={navigationRef} id="admin-mobile-navigation" aria-label="Management" className={`primary-nav ${mobileOpen ? "open" : ""}`}>
        <div className="lv-mobile-drawer-head">
          <div className="lv-mobile-drawer-heading"><strong>Navigation</strong><small>LAND VIEW · {roleLabel(role)}</small></div>
          <button type="button" ref={drawerCloseRef} className="lv-mobile-drawer-close" aria-label="Close management navigation" onClick={() => { setMobileOpen(false); menuButtonRef.current?.focus(); }}>×</button>
        </div>
        <Link href="/admin" className="sidebar-brand" onClick={() => setMobileOpen(false)}>
          <img src="/land-view-logo.svg" alt="LAND VIEW logo" />
          <span><strong>LAND VIEW</strong><small>MANAGEMENT SYSTEM</small></span>
        </Link>

        <div className="primary-nav-inner">
          <div className="lv-nav-stack">
            {visibleSidebar.map((entry) => {
              if (entry.kind === "link") {
                const active = currentMatches(pathname, entry.item.href);
                return <Link key={entry.item.href} href={entry.item.href} aria-current={active ? "page" : undefined} className={`lv-nav-direct ${active ? "active" : ""}`} onClick={() => setMobileOpen(false)}><span className="nav-icon" aria-hidden="true">{entry.item.icon}</span><span>{entry.item.label}</span></Link>;
              }

              const groupActive = entry.items.some((item) => currentMatches(pathname, item.href));
              const open = expandedSection === entry.label;
              return <section key={entry.label} className={`lv-nav-group ${open ? "open" : ""}`} aria-label={entry.label}>
                <button type="button" className={`lv-nav-group-button ${groupActive ? "active" : ""}`} aria-expanded={open} onClick={() => setExpandedSection((value) => value === entry.label ? "" : entry.label)}>
                  <span className="nav-icon" aria-hidden="true">{entry.icon}</span><span>{entry.label}</span><span className="lv-nav-chevron" aria-hidden="true">›</span>
                </button>
                {open && <div className="lv-nav-children">
                  {entry.items.map((item) => {
                    const active = currentMatches(pathname, item.href);
                    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={active ? "active" : ""} onClick={() => setMobileOpen(false)}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>;
                  })}
                </div>}
              </section>;
            })}
          </div>
          <div className="admin-mobile-account">
            <details className="lv-mobile-drawer-account">
              <summary><span>Account & security</span><span aria-hidden="true">⌄</span></summary>
              <div className="lv-mobile-drawer-account-actions">
                {(isAdmin || isManager) && <Link href="/admin/account" onClick={() => setMobileOpen(false)}>My Account</Link>}
                {isAdmin && <button type="button" onClick={switchToEmployeeMode} disabled={roleSwitchBusy}>{roleSwitchBusy ? "Switching..." : "Switch to EMP-0002 workspace"}</button>}
                {(isAdmin || isManager) && quickConfigured && <button type="button" onClick={toggleTrustedDevice} disabled={quickBusy}>{trustedDevice ? `Trusted device · ${daysLeft} days` : "Trust this device"}</button>}
                {(isAdmin || isManager) && <button type="button" onClick={setupOrLockQuickPin} disabled={quickBusy}>{quickConfigured ? "PIN lock" : "Set PIN"}</button>}
                <button type="button" onClick={logout}>Sign out</button>
              </div>
            </details>
          </div>
        </div>

        <div className="sidebar-footer">
          <Link href="/admin/account" className="sidebar-footer-account" onClick={() => setMobileOpen(false)}>
            <div className="utility-avatar">{String(name).slice(0, 1).toUpperCase()}</div>
            <div className="sidebar-user"><div><strong>{name}</strong><small>{roleLabel(role)}{isAdmin ? " · Account Control" : ""}</small></div></div>
          </Link>
        </div>
      </nav>
    </header>

    <div className="admin-main tmg-admin-main"><main id="workspace-content" className="content-wrap tmg-content-wrap">
      {!routeAllowed ? <section style={{ maxWidth: 760, margin: "36px auto", padding: 28, border: "1px solid var(--lv-border-default)", borderRadius: 14, background: "var(--lv-surface-panel)", color: "var(--lv-text-primary)" }}><small style={{ color: "var(--lv-brand-text)", fontWeight: 900 }}>ACCESS CONTROL</small><h1 style={{ margin: "8px 0 10px" }}>This function is not enabled for your account.</h1><p style={{ color: "var(--lv-text-secondary)", lineHeight: 1.6 }}>Ask the Main Admin to enable this tab from Permission. Your other assigned LAND VIEW functions remain available.</p><Link href="/admin" style={{ color: "var(--lv-brand-text)", fontWeight: 800 }}>Return to Dashboard →</Link></section> : children}
    </main></div>
  </div>;
}
