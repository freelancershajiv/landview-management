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

const nav: NavItem[] = [
  { href: "/admin", label: "Dashboard", permission: "dashboard.view" },
  { href: "/admin/projects", label: "Projects", permission: "projects.view" },
  { href: "/admin/estimate", label: "Estimates", permission: "projects.view" },
  { href: "/admin/workflow", label: "Workflow", permission: "workflow.view" },
  { href: "/admin/registers", label: "Document Registry", permission: "documents.view" },
  { href: "/admin/employees", label: "Employees", permission: "employees.view" },
  { href: "/admin/certificates", label: "Certificates", permission: "certificates.view" },
  { href: "/admin/finance", label: "Billing", permission: "finance.view" },
  { href: "/admin/access", label: "Access Control", adminOnly: true },
  { href: "/admin/accounts/entry", label: "Accounts", permission: "accounts.view" },
  { href: "/admin/accounts", label: "Ledger", permission: "ledger.view" },
  { href: "/admin/proposals", label: "Proposals", permission: "proposals.view" },
];

const navOrder = [
  "/admin/projects", "/admin/estimate", "/admin/workflow", "/admin/proposals",
  "/admin/registers", "/admin/certificates",
  "/admin/finance", "/admin/accounts/entry", "/admin/accounts",
  "/admin/employees", "/admin/access",
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
  const [quickConfigured, setQuickConfigured] = useState(false);
  const [trustedDevice, setTrustedDevice] = useState(false);
  const [trustedUntil, setTrustedUntil] = useState<number | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const [estimateOpen, setEstimateOpen] = useState(false);

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

  const orderedVisibleNav = useMemo(
    () => navOrder.map((href) => nav.find((item) => item.href === href)).filter((item): item is NavItem => Boolean(item) && visibleNav.some((v) => v.href === item!.href)),
    [visibleNav]
  );

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
    .portal-admin{min-height:100vh;background:#0d1318;color:#eef2f5}
    .portal-admin .utility-bar{position:fixed;left:252px;right:0;top:0;height:72px;background:#11181f;border-bottom:1px solid #27323a;z-index:120}
    .portal-admin .utility-inner{height:72px;padding:0 24px;display:flex;align-items:center;gap:14px}
    .portal-admin .masthead-brand{position:fixed;left:0;top:0;width:252px;height:72px;padding:14px 25px;display:flex;align-items:center;background:#0a0f14;border-right:1px solid #27323a;z-index:130}
    .portal-admin .masthead-brand img{width:184px;height:auto;max-height:48px;object-fit:contain}
    .portal-admin .utility-items{margin-left:auto;display:flex;align-items:center;gap:8px}
    .portal-admin .utility-item:not(.user-utility){display:none}
    .portal-admin .user-utility{display:flex;align-items:center;gap:9px;padding:0 3px;color:#edf2f5}
    .portal-admin .user-utility span{font-size:10px;font-weight:800}
    .portal-admin .user-utility small{display:block;color:#6e7a84;font-size:8px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px}
    .portal-admin .utility-avatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#29343d;border:1px solid #3a4650;color:#fff;font-weight:900;font-size:11px}
    .portal-admin .utility-logout{height:34px;padding:0 10px;border:1px solid #313d46;border-radius:8px;background:#151c22;color:#c7d0d6;font-size:9px;font-weight:800;cursor:pointer}
    .portal-admin .utility-logout:hover{border-color:#56636d;color:#fff}
    .portal-admin .utility-bar:after{content:"Search…";position:absolute;left:140px;top:16px;width:395px;height:38px;box-sizing:border-box;border:1px solid #303c45;border-radius:8px;background:#0c1217;color:#65737e;font-size:10px;font-weight:600;padding:12px 14px;pointer-events:none}
    .portal-admin .primary-nav{position:fixed;left:0;top:72px;bottom:0;width:252px;padding:18px 11px 14px;background:linear-gradient(180deg,#0a0f14,#0d141a);border-right:1px solid #27323a;z-index:110;overflow:auto}
    .portal-admin .primary-nav:before{content:"WORKSPACE";display:block;padding:0 13px 9px;color:#66737e;font-size:8px;font-weight:900;letter-spacing:.16em}
    .portal-admin .primary-nav-inner{display:flex;flex-direction:column;align-items:stretch;gap:2px;padding:0}
    .portal-admin .primary-nav-inner>a,.portal-admin .estimate-nav-trigger{position:relative;min-height:44px;width:100%;justify-content:flex-start;padding:0 12px;border:1px solid transparent;border-radius:8px;background:transparent;color:#dce4e9;text-decoration:none;font-size:11px;font-weight:800;letter-spacing:.01em;cursor:pointer}
    .portal-admin .primary-nav-inner>a:hover,.portal-admin .estimate-nav-trigger:hover{background:#151c22;border-color:#202b33}
    .portal-admin .primary-nav-inner>a.active,.portal-admin .estimate-nav-trigger.active{background:linear-gradient(135deg,#e31f26,#b70f14);border-color:#ef3a40;color:#fff;box-shadow:0 8px 20px rgba(214,31,38,.18)}
    .portal-admin .primary-nav-inner>a.active:before,.portal-admin .estimate-nav-trigger.active:before{content:"";position:absolute;left:0;top:7px;bottom:7px;width:3px;border-radius:3px;background:#fff}
    .portal-admin .primary-nav-inner>a:before,.portal-admin .estimate-nav-trigger:before{font-size:14px;width:28px;text-align:center;margin-right:8px;color:#aeb9c0}
    .portal-admin .primary-nav-inner>a.active:before,.portal-admin .estimate-nav-trigger.active:before{color:#fff}
    .portal-admin .primary-nav-inner>a[href="/admin"]:before{content:"⌂"}
    .portal-admin .primary-nav-inner>a[href="/admin/projects"]:before{content:"▣"}
    .portal-admin .primary-nav-inner>a[href*="/admin/estimate"]:before{content:"▤"}
    .portal-admin .primary-nav-inner>a[href="/admin/workflow"]:before{content:"↗"}
    .portal-admin .primary-nav-inner>a[href="/admin/registers"]:before{content:"▱"}
    .portal-admin .primary-nav-inner>a[href="/admin/employees"]:before{content:"♙"}
    .portal-admin .primary-nav-inner>a[href="/admin/certificates"]:before{content:"▧"}
    .portal-admin .primary-nav-inner>a[href="/admin/finance"]:before{content:"৳"}
    .portal-admin .primary-nav-inner>a[href="/admin/access"]:before{content:"⚙"}
    .portal-admin .primary-nav-inner>a[href="/admin/accounts/entry"]:before{content:"＋"}
    .portal-admin .primary-nav-inner>a[href="/admin/accounts"]:before{content:"≡"}
    .portal-admin .primary-nav-inner>a[href="/admin/proposals"]:before{content:"◇"}
    .portal-admin .primary-nav-inner>a[href="/admin/website-analytics"]:before{content:"◫"}
    .portal-admin .estimate-nav-wrap{width:100%;display:block;position:relative}
    .portal-admin .estimate-nav-trigger{display:flex;align-items:center;gap:0}
    .portal-admin .estimate-nav-trigger span{margin-left:auto}
    .portal-admin .estimate-nav-menu{position:relative;top:auto;left:auto;margin:2px 0 3px 20px;min-width:0;padding:3px;border:1px solid #2d3942;border-radius:8px;background:#11181e;box-shadow:none}
    .portal-admin .estimate-nav-menu a{display:block;padding:9px 10px;border-radius:6px;color:#bfc8ce;text-decoration:none;font-size:9px;font-weight:800}
    .portal-admin .estimate-nav-menu a:hover{background:#192229;color:#fff}
    .portal-admin .admin-main{margin-left:252px!important;margin-top:72px!important;min-height:calc(100vh - 72px);background:radial-gradient(circle at top right,rgba(214,31,38,.08),transparent 28%),#0e1419}
    .portal-admin .tmg-content-wrap{max-width:none!important;width:100%!important;padding:28px 30px 40px!important}
    .portal-admin .mobile-menu{display:none}
    @media(max-width:1100px){
      .portal-admin .utility-bar{left:220px}
      .portal-admin .masthead-brand{width:220px}
      .portal-admin .primary-nav{width:220px}
      .portal-admin .admin-main{margin-left:220px!important}
      .portal-admin .utility-bar:after{left:110px;width:310px}
      .portal-admin .masthead-brand img{width:164px}
    }
    @media(max-width:820px){
      .portal-admin .utility-bar{left:0;height:66px}
      .portal-admin .utility-inner{height:66px;padding:0 14px 0 56px}
      .portal-admin .masthead-brand{position:absolute;left:0;top:0;width:auto;height:66px;padding:10px 14px;background:transparent;border:0}
      .portal-admin .masthead-brand img{width:122px}
      .portal-admin .utility-bar:after{left:178px;top:14px;width:min(42vw,220px);height:38px;padding:12px 10px}
      .portal-admin .primary-nav{top:66px;width:252px;transform:translateX(-100%);transition:transform .22s ease;box-shadow:20px 0 45px rgba(0,0,0,.35)}
      .portal-admin .primary-nav.open{transform:translateX(0)}
      .portal-admin .admin-main{margin-left:0!important;margin-top:66px!important}
      .portal-admin .tmg-content-wrap{padding:18px 14px 30px!important}
      .portal-admin .mobile-menu{display:grid;place-items:center;position:fixed;left:10px;top:15px;width:34px;height:34px;border:1px solid #36414a;border-radius:8px;background:#151c22;color:#fff;z-index:160}
      .portal-admin .utility-items{gap:4px}
      .portal-admin .utility-logout{font-size:0;width:32px;padding:0}
      .portal-admin .utility-logout:after{content:"↗";font-size:12px}
      .portal-admin .utility-logout:has(+ .utility-logout){display:none}
      .portal-admin .user-utility>span{display:none}
    }
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
        {orderedVisibleNav.map((item) => {
          const active = currentMatches(pathname, item.href);
          if(item.href !== "/admin/estimate") return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={active ? "active" : ""} onClick={() => setMobileOpen(false)}>{item.label}</Link>;
          return <div key={item.href} className={`estimate-nav-wrap ${active ? "active-wrap" : ""}`}>
            <button type="button" className={`estimate-nav-trigger ${active ? "active" : ""}`} aria-haspopup="menu" aria-expanded={estimateOpen} onClick={()=>setEstimateOpen(v=>!v)}>Estimates <span aria-hidden="true">▾</span></button>
            {estimateOpen && <div className="estimate-nav-menu" role="menu">
              <Link href="/admin/estimate?view=pile" role="menuitem" onClick={()=>{setEstimateOpen(false);setMobileOpen(false)}}>Pile Estimate</Link>
              <Link href="/admin/estimate?view=summary" role="menuitem" onClick={()=>{setEstimateOpen(false);setMobileOpen(false)}}>Summary Estimate</Link>
              <Link href="/admin/estimate?view=detailed" role="menuitem" onClick={()=>{setEstimateOpen(false);setMobileOpen(false)}}>Detailed Estimate</Link>
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
