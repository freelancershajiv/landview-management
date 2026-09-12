"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  clearStoredSession,
  landViewApi,
  readSessionCache,
  saveSessionCache,
  SessionUser,
} from "@/lib/api";

const nav = [
  { href: "/admin", label: "Dashboard", accounts: true },
  { href: "/admin/projects", label: "Projects", accounts: true },
  { href: "/admin/workflow", label: "Workflow" },
  { href: "/admin/employees", label: "Employees" },
  { href: "/admin/certificate-requests", label: "Requests" },
  { href: "/admin/certificates", label: "Certificates" },
  { href: "/admin/finance", label: "Finance", accounts: true },
];

const SESSION_WATCHDOG_MS = 15000;

function roleOf(user?: SessionUser | null) {
  return String(user?.role || user?.Role || "").trim().toLowerCase();
}

function isAdminWorkspaceRole(role: string) {
  return role === "admin" || role === "manager" || role === "accounts";
}

async function quickPost(action: string, body: Record<string, unknown> = {}) {
  const response = await fetch("/api/landview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ action, ...body }),
  });
  const json = await response.json();
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Quick access request failed."));
  return json.data || {};
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickConfigured, setQuickConfigured] = useState(false);
  const [trustedDevice, setTrustedDevice] = useState(false);
  const [trustedUntil, setTrustedUntil] = useState<number | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = readSessionCache();
    const cachedRole = roleOf(cached?.user);
    const hasUsableCache = Boolean(cached?.authenticated && cached?.user && isAdminWorkspaceRole(cachedRole));

    if (hasUsableCache) {
      setUser(cached!.user);
      setReady(true);
    }

    const watchdog = window.setTimeout(() => {
      if (cancelled || hasUsableCache) return;
      clearStoredSession();
      setSessionError("The backend did not validate the session. Check your Apps Script /exec deployment URL.");
    }, SESSION_WATCHDOG_MS);

    async function verify() {
      try {
        const session = await landViewApi.getSession();
        if (!session?.authenticated) throw new Error("Session expired");

        const sessionRole = roleOf(session.user);
        if (sessionRole === "employee") {
          window.clearTimeout(watchdog);
          router.replace("/employee");
          return;
        }
        if (sessionRole === "client") {
          window.clearTimeout(watchdog);
          router.replace("/client");
          return;
        }
        if (!isAdminWorkspaceRole(sessionRole)) throw new Error("This account does not have administrator access.");

        if (!cancelled) {
          window.clearTimeout(watchdog);
          saveSessionCache(session);
          setUser(session.user);
          setReady(true);
          setSessionError("");
        }
      } catch (err: any) {
        window.clearTimeout(watchdog);
        clearStoredSession();
        console.error("LAND VIEW workspace session check failed:", err);
        if (!cancelled) {
          if (hasUsableCache) {
            router.replace("/login");
            return;
          }
          setSessionError(err?.message || "Unable to validate the LAND VIEW session.");
        }
      }
    }

    void verify();
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
    };
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    void quickPost("quickPinStatus")
      .then((data) => {
        setQuickConfigured(Boolean(data?.configured));
        setTrustedDevice(Boolean(data?.trusted));
        setTrustedUntil(data?.expiresAt ? Number(data.expiresAt) : null);
      })
      .catch(() => {});
  }, [ready]);

  async function setupOrLockQuickPin() {
    if (quickBusy) return;
    const role = roleOf(user);
    if (role !== "admin" && role !== "manager") {
      window.alert("Permanent PIN is available only to Admin or Manager accounts.");
      return;
    }

    if (quickConfigured) {
      if (!trustedDevice) {
        window.alert("Trust this device for 7 days before using PIN LOCK.");
        return;
      }
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

    const first = window.prompt("Create your permanent 6-digit Admin PIN. You will use this same PIN on trusted devices:", "");
    if (first === null) return;
    if (!/^\d{6}$/.test(first)) {
      window.alert("Admin PIN must be exactly 6 digits.");
      return;
    }
    const second = window.prompt("Confirm your permanent 6-digit Admin PIN:", "");
    if (second !== first) {
      window.alert("PINs did not match.");
      return;
    }

    setQuickBusy(true);
    try {
      await quickPost("setQuickPin", { pin: first });
      setQuickConfigured(true);
      window.alert("Permanent Admin PIN created. Now click TRUST DEVICE to enable PIN login on this browser for 7 days.");
    } catch (err: any) {
      window.alert(err?.message || "Could not create the permanent Admin PIN.");
    } finally {
      setQuickBusy(false);
    }
  }

  async function toggleTrustedDevice() {
    if (quickBusy) return;
    if (!quickConfigured) {
      window.alert("Create your permanent Admin PIN first.");
      return;
    }

    setQuickBusy(true);
    try {
      if (trustedDevice) {
        const confirmed = window.confirm("Remove this browser from trusted devices? PIN Login will stop working here until you trust it again.");
        if (!confirmed) return;
        await quickPost("untrustDevice");
        setTrustedDevice(false);
        setTrustedUntil(null);
        window.alert("This browser is no longer trusted.");
      } else {
        const data = await quickPost("trustDevice");
        setTrustedDevice(true);
        setTrustedUntil(data?.expiresAt ? Number(data.expiresAt) : Date.now() + 7 * 24 * 60 * 60 * 1000);
        window.alert("This device is trusted for 7 days. You can now use PIN LOGIN from the login screen without your password.");
      }
    } catch (err: any) {
      window.alert(err?.message || "Could not update trusted-device access.");
    } finally {
      setQuickBusy(false);
    }
  }

  async function logout() {
    try {
      await landViewApi.logout();
    } catch {}
    clearStoredSession();
    router.replace("/login");
  }

  if (sessionError) {
    return (
      <main className="login-loading">
        <div className="loading-panel" style={{ maxWidth: 520, padding: 24 }}>
          <img className="loading-brand-image" src="/land-view-logo.svg" alt="LAND VIEW" />
          <p style={{ marginBottom: 16 }}>{sessionError}</p>
          <button className="btn btn-accent" onClick={() => { clearStoredSession(); router.replace("/login"); }}>
            Return to sign in
          </button>
        </div>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="login-loading">
        <div className="loading-panel">
          <img className="loading-brand-image" src="/land-view-logo.svg" alt="LAND VIEW" />
          <div className="loading-spinner" />
          <p>Verifying workspace</p>
        </div>
      </main>
    );
  }

  const name = user?.name || user?.Name || user?.username || user?.Username || "LAND VIEW User";
  const role = user?.role || user?.Role || "User";
  const visibleNav = String(role).toLowerCase() === "accounts" ? nav.filter((item) => item.accounts) : nav;
  const daysLeft = trustedUntil ? Math.max(1, Math.ceil((trustedUntil - Date.now()) / (24 * 60 * 60 * 1000))) : 0;

  return (
    <div className="admin-shell tmg-shell portal-admin">
      <a className="portal-skip" href="#workspace-content">Skip to workspace</a>
      <header className="masthead">
        <div className="utility-bar">
          <div className="utility-inner">
            <Link href="/admin" className="masthead-brand">
              <img src="/land-view-logo.svg" alt="LAND VIEW logo" />
              <div><strong>LAND VIEW</strong><span>ENGINEERS &amp; ARCHITECTS</span></div>
            </Link>

            <div className="utility-items">
              <div className="utility-item"><b>●</b><span><small>SYSTEM STATUS</small>Online</span></div>
              <div className="utility-item"><b>◆</b><span><small>WORKSPACE</small>Management System</span></div>
              <div className="utility-item user-utility">
                <div className="utility-avatar">{String(name).slice(0, 1).toUpperCase()}</div>
                <span><small>{role}</small>{name}</span>
              </div>
              {(roleOf(user)==="admin"||roleOf(user)==="manager") && quickConfigured && (
                <button className="utility-logout" onClick={toggleTrustedDevice} disabled={quickBusy} title={trustedDevice ? `Trusted for about ${daysLeft} more day${daysLeft===1?"":"s"}. Click to remove trust.` : "Trust this browser for 7-day PIN login"}>
                  {quickBusy ? "PLEASE WAIT" : trustedDevice ? `TRUSTED ${daysLeft}D` : "TRUST DEVICE"}
                </button>
              )}
              {(roleOf(user)==="admin"||roleOf(user)==="manager") && (
                <button className="utility-logout" onClick={setupOrLockQuickPin} disabled={quickBusy} title={quickConfigured?"Unload and lock the workspace with your permanent PIN":"Create your permanent Admin PIN"}>
                  {quickBusy ? "PLEASE WAIT" : quickConfigured ? "PIN LOCK" : "SET PIN"}
                </button>
              )}
              <button className="utility-logout" onClick={logout}>Sign out</button>
            </div>

            <button className="mobile-menu tmg-mobile-menu" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="management-navigation" onClick={() => setMobileOpen((v) => !v)}>☰</button>
          </div>
        </div>

        <nav id="management-navigation" aria-label="Management" className={`primary-nav ${mobileOpen ? "open" : ""}`}>
          <div className="primary-nav-inner">
            {visibleNav.map((item) => {
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={active ? "active" : ""} onClick={() => setMobileOpen(false)}>{item.label}</Link>;
            })}
          </div>
        </nav>
      </header>

      <div className="admin-main tmg-admin-main"><main id="workspace-content" className="content-wrap tmg-content-wrap">{children}</main></div>
    </div>
  );
}
