"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import {
  clearStoredSession,
  getStoredToken,
  landViewApi,
  SessionUser,
} from "@/lib/api";

type PortalType = "employee" | "client";

function normalizeRole(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function routeForRole(role: string) {
  if (role === "admin" || role === "manager") return "/admin";
  if (role === "employee") return "/employee";
  if (role === "client") return "/client";
  return "/login";
}

export default function RolePortalShell({
  portal,
  children,
}: {
  portal: PortalType;
  children: ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const token = getStoredToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const session = await landViewApi.getSession(token);
        if (!session?.authenticated) throw new Error("Session expired");

        const role = normalizeRole(session.user?.role || session.user?.Role);
        if (role !== portal) {
          router.replace(routeForRole(role));
          return;
        }

        if (!cancelled) {
          setUser(session.user);
          setReady(true);
        }
      } catch (err: any) {
        clearStoredSession();
        if (!cancelled) setError(err?.message || "Unable to validate session.");
      }
    }

    verify();
    return () => {
      cancelled = true;
    };
  }, [portal, router]);

  async function logout() {
    try {
      await landViewApi.logout();
    } catch {}
    clearStoredSession();
    router.replace("/login");
  }


  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setPasswordMessage("New password must be at least 8 characters.");
      return;
    }
    setPasswordSaving(true);
    setPasswordMessage("");
    try {
      await landViewApi.changeOwnPassword(currentPassword, newPassword);
      setPasswordMessage("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      setPasswordMessage(err?.message || "Could not change password.");
    } finally {
      setPasswordSaving(false);
    }
  }

  if (error) {
    return (
      <main className="login-loading">
        <div className="loading-panel" style={{ maxWidth: 520, padding: 24 }}>
          <img className="loading-brand-image" src="/land-view-logo.png" alt="LAND VIEW" />
          <p style={{ marginBottom: 16 }}>{error}</p>
          <button className="btn btn-accent" onClick={() => router.replace("/login")}>Return to login</button>
        </div>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="login-loading">
        <div className="loading-panel">
          <img className="loading-brand-image" src="/land-view-logo.png" alt="LAND VIEW" />
          <div className="loading-spinner" />
          <p>Opening {portal} portal</p>
        </div>
      </main>
    );
  }

  const name = user?.name || user?.Name || user?.username || user?.Username || "LAND VIEW User";

  return (
    <div className="role-portal-shell">
      <header className="role-portal-header">
        <div className="role-portal-header-inner">
          <Link href={portal === "employee" ? "/employee" : "/client"} className="role-portal-brand">
            <img src="/land-view-logo.png" alt="LAND VIEW" />
            <div>
              <strong>LAND VIEW</strong>
              <span>{portal.toUpperCase()} PORTAL</span>
            </div>
          </Link>

          <div className="role-portal-user">
            <div>
              <small>Signed in as</small>
              <strong>{name}</strong>
            </div>
            <Link href="/" className="role-portal-home">Public Website</Link>
            <button type="button" onClick={() => { setPasswordOpen(true); setPasswordMessage(""); }}>Change Password</button>
            <button type="button" onClick={logout}>Sign Out</button>
          </div>
        </div>
      </header>
      <main className="role-portal-main">{children}</main>

      {passwordOpen && (
        <div className="modal-backdrop" onMouseDown={() => setPasswordOpen(false)}>
          <form className="modal card" onSubmit={changePassword} onMouseDown={(e) => e.stopPropagation()}>
            <div className="section-title">
              <div><span>ACCOUNT SECURITY</span><h2>Change password</h2></div>
              <button type="button" className="icon-button" onClick={() => setPasswordOpen(false)}>×</button>
            </div>
            {passwordMessage && <div className="notice"><strong>Password</strong><span>{passwordMessage}</span></div>}
            <div className="form-grid">
              <label className="form-field"><span>CURRENT PASSWORD</span><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label>
              <label className="form-field"><span>NEW PASSWORD</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required /></label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-light" onClick={() => setPasswordOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-dark" disabled={passwordSaving}>{passwordSaving ? "Saving..." : "Change password"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
