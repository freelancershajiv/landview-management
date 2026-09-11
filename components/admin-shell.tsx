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
      .then((data) => setQuickConfigured(Boolean(data?.configured)))
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
      setQuickBusy(true);
      try {
        await quickPost("quickLock");
        clearStoredSession();
        // Hard navigation unloads the entire admin application from memory.
        window.location.replace("/login");
      } catch (err: any) {
        window.alert(err?.message || "Could not PIN-lock the workspace.");
        setQuickBusy(false);
      }
      return;
    }

    const first = window.prompt("Create your permanent 6-digit Admin PIN. You will use this same PIN every time you PIN Lock LAND VIEW:", "");
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
      window.alert("Permanent Admin PIN created. From now on, PIN LOCK will unload the admin panel and the same PIN will unlock it.");
    } catch (err: any) {
      window.alert(err?.message || "Could not create the permanent Admin PIN.");
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

  return (
    <div className="admin-shell tmg-shell">
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
              {(roleOf(user)==="admin"||roleOf(user)==="manager") && (
                <button className="utility-logout" onClick={setupOrLockQuickPin} disabled={quickBusy} title={quickConfigured?"Unload and lock the workspace with your permanent PIN":"Create your permanent Admin PIN"}>
                  {quickBusy ? "PLEASE WAIT" : quickConfigured ? "PIN LOCK" : "SET PIN"}
                </button>
              )}
              <button className="utility-logout" onClick={logout}>Sign out</button>
            </div>

            <button className="mobile-menu tmg-mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen((v) => !v)}>☰</button>
          </div>
        </div>

        <nav className={`primary-nav ${mobileOpen ? "open" : ""}`}>
          <div className="primary-nav-inner">
            {visibleNav.map((item) => {
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return <Link key={item.href} href={item.href} className={active ? "active" : ""} onClick={() => setMobileOpen(false)}>{item.label}</Link>;
            })}
          </div>
        </nav>
      </header>

      <div className="admin-main tmg-admin-main"><main className="content-wrap tmg-content-wrap">{children}</main></div>
    </div>
  );
}
