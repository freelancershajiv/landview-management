"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearStoredSession, landViewApi, SessionUser } from "@/lib/api";

const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/projects", label: "Projects" },
  { href: "/admin/employees", label: "Employees" },
  { href: "/admin/documents", label: "Documents" },
  { href: "/admin/site-supervision", label: "Site Supervision" },
  { href: "/admin/finance", label: "Finance" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/users", label: "Users & Access" },
];

const SESSION_WATCHDOG_MS = 15000;

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const watchdog = window.setTimeout(() => {
      if (cancelled) return;
      clearStoredSession();
      setSessionError(
        "The backend did not validate the session. Check your Apps Script /exec deployment URL."
      );
    }, SESSION_WATCHDOG_MS);

    async function verify() {
      try {
        const session = await landViewApi.getSession();

        if (!session?.authenticated) {
          throw new Error("Session expired");
        }

        const sessionRole = String(
          session.user?.role || session.user?.Role || ""
        ).trim().toLowerCase();

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

        if (sessionRole !== "admin" && sessionRole !== "manager") {
          throw new Error("This account does not have administrator access.");
        }

        if (!cancelled) {
          window.clearTimeout(watchdog);
          setUser(session.user);
          setReady(true);
        }
      } catch (err: any) {
        window.clearTimeout(watchdog);
        clearStoredSession();
        console.error("LAND VIEW workspace session check failed:", err);

        if (!cancelled) {
          setSessionError(
            err?.message || "Unable to validate the LAND VIEW session."
          );
        }
      }
    }

    verify();

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
    };
  }, [router]);

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
          <img
            className="loading-brand-image"
            src="/land-view-logo.png"
            alt="LAND VIEW"
          />
          <p style={{ marginBottom: 16 }}>{sessionError}</p>
          <button
            className="btn btn-accent"
            onClick={() => {
              clearStoredSession();
              router.replace("/login");
            }}
          >
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
          <img
            className="loading-brand-image"
            src="/land-view-logo.png"
            alt="LAND VIEW"
          />
          <div className="loading-spinner" />
          <p>Verifying workspace</p>
        </div>
      </main>
    );
  }

  const name =
    user?.name ||
    user?.Name ||
    user?.username ||
    user?.Username ||
    "LAND VIEW User";

  const role = user?.role || user?.Role || "User";

  return (
    <div className="admin-shell tmg-shell">
      <header className="masthead">
        <div className="utility-bar">
          <div className="utility-inner">
            <Link href="/admin" className="masthead-brand">
              <img src="/land-view-logo.png" alt="LAND VIEW logo" />
              <div>
                <strong>LAND VIEW</strong>
                <span>ARCHITECTS & ENGINEERS</span>
              </div>
            </Link>

            <div className="utility-items">
              <div className="utility-item">
                <b>●</b>
                <span><small>SYSTEM STATUS</small>Online</span>
              </div>
              <div className="utility-item">
                <b>◆</b>
                <span><small>WORKSPACE</small>Management System</span>
              </div>
              <div className="utility-item user-utility">
                <div className="utility-avatar">
                  {String(name).slice(0, 1).toUpperCase()}
                </div>
                <span><small>{role}</small>{name}</span>
              </div>
              <button className="utility-logout" onClick={logout}>
                Sign out
              </button>
            </div>

            <button
              className="mobile-menu tmg-mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileOpen((v) => !v)}
            >
              ☰
            </button>
          </div>
        </div>

        <nav className={`primary-nav ${mobileOpen ? "open" : ""}`}>
          <div className="primary-nav-inner">
            {nav.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "active" : ""}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <div className="admin-main tmg-admin-main">
        <main className="content-wrap tmg-content-wrap">{children}</main>
      </div>
    </div>
  );
}
