"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearStoredSession,
  landViewApi,
  saveSessionCache,
} from "@/lib/api";

type PortalType = "admin" | "employee" | "client";

const PORTAL_KEY = "land_view_portal_type";

const portalOptions: Array<{
  id: PortalType;
  label: string;
  short: string;
  description: string;
}> = [
  { id: "admin", label: "Admin Login", short: "A", description: "Management, finance, users and full system access." },
  { id: "employee", label: "Employee Login", short: "E", description: "Employee workspace and assigned project access." },
  { id: "client", label: "Client Login", short: "C", description: "Client portal for project information and communication." },
];

function normalizeRole(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function roleMatchesPortal(role: string, portal: PortalType) {
  if (portal === "admin") return role === "admin" || role === "manager" || role === "accounts";
  if (portal === "employee") return role === "employee";
  return role === "client";
}

function portalPath(portal: PortalType) {
  if (portal === "admin") return "/admin";
  if (portal === "employee") return "/employee";
  return "/client";
}

async function quickPost(action: string, body: Record<string, unknown> = {}) {
  const response = await fetch("/api/landview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    body: JSON.stringify({ action, ...body }),
  });
  const json = await response.json();
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Quick access failed."));
  return json.data || {};
}

export default function LoginPage() {
  const router = useRouter();
  const [portal, setPortal] = useState<PortalType>("admin");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quickConfigured, setQuickConfigured] = useState(false);
  const [trustedDevice, setTrustedDevice] = useState(false);
  const [trustedUntil, setTrustedUntil] = useState<number | null>(null);
  const [quickMode, setQuickMode] = useState(false);
  const [pin, setPin] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);

  useEffect(() => {
    void quickPost("quickPinStatus")
      .then((data) => {
        setQuickConfigured(Boolean(data?.configured));
        setTrustedDevice(Boolean(data?.trusted));
        setTrustedUntil(data?.expiresAt ? Number(data.expiresAt) : null);
      })
      .catch(() => {});
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    const id = userId.trim();
    if (!id || !password) {
      setError(`Please enter ${portal === "employee" ? "Employee ID" : portal === "client" ? "phone number" : "username"} and password.`);
      return;
    }

    setLoading(true);
    setError("");
    clearStoredSession();

    try {
      const result = await landViewApi.login(id, password);
      const role = normalizeRole(result?.user?.role || result?.user?.Role);
      if (!roleMatchesPortal(role, portal)) {
        throw new Error(`This account is registered as ${role || "another role"}. Please use the correct login type.`);
      }

      saveSessionCache({ authenticated: true, user: result.user });
      localStorage.setItem(PORTAL_KEY, portal);
      router.replace(portalPath(portal));
    } catch (err: any) {
      clearStoredSession();
      setError(err?.message || "Invalid User ID or password.");
    } finally {
      setLoading(false);
    }
  }

  async function unlockQuickPin(value: string) {
    if (quickBusy || value.length !== 6) return;
    setQuickBusy(true);
    setError("");
    try {
      const data = await quickPost("quickPinLogin", { pin: value });
      if (!data?.user) throw new Error("PIN login session is unavailable.");
      saveSessionCache({ authenticated: true, user: data.user });
      localStorage.setItem(PORTAL_KEY, "admin");
      window.location.replace("/admin");
    } catch (err: any) {
      clearStoredSession();
      setPin("");
      setError(err?.message || "Incorrect Admin PIN.");
    } finally {
      setQuickBusy(false);
    }
  }

  function handlePinChange(value: string) {
    if (quickBusy) return;
    const next = value.replace(/\D/g, "").slice(0, 6);
    setPin(next);
    setError("");
    if (next.length === 6) void unlockQuickPin(next);
  }

  const selected = portalOptions.find((item) => item.id === portal)!;
  const identifierLabel = portal === "employee" ? "EMPLOYEE ID" : portal === "client" ? "PHONE NUMBER" : "USERNAME";
  const identifierPlaceholder = portal === "employee" ? "EMP-0001" : portal === "client" ? "01XXXXXXXXX" : "admin";
  const daysLeft = trustedUntil ? Math.max(1, Math.ceil((trustedUntil - Date.now()) / (24 * 60 * 60 * 1000))) : 0;

  return (
    <main className="reference-login role-login-page">
      <style>{`
        .quick-pin-card{display:grid;gap:16px}.quick-pin-field{width:100%;height:58px;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:#111920;color:#fff;text-align:center;font-size:24px;font-weight:800;letter-spacing:.5em;padding-left:.5em;outline:none}.quick-pin-field:focus{border-color:#ef493b;box-shadow:0 0 0 3px rgba(239,73,59,.12)}.quick-pin-field::placeholder{letter-spacing:.18em;font-size:11px;color:#75808a}.quick-pin-note{text-align:center;color:#8f9aa3;font-size:9px;line-height:1.6}.quick-switch{border:0;background:transparent;color:#ef766c;font-size:10px;font-weight:800;cursor:pointer;text-decoration:underline}.quick-pin-label{text-align:center;color:#fff;font-size:12px;font-weight:800;letter-spacing:.08em}.quick-badge{display:inline-flex;justify-self:center;padding:5px 8px;border-radius:999px;background:#1c3026;color:#9ed8b3;font-size:8px;font-weight:800;letter-spacing:.08em}.pin-login-button{width:100%;min-height:48px;border:1px solid rgba(158,216,179,.35);border-radius:8px;background:#17251d;color:#a9dfba;font-size:11px;font-weight:900;letter-spacing:.08em;cursor:pointer}.pin-login-button:hover{background:#1d3024;border-color:#73c28d}.trusted-note{text-align:center;color:#9ed8b3;font-size:9px}
      `}</style>

      <header className="reference-login-header">
        <div className="reference-login-inner">
          <button type="button" className="reference-login-brand login-brand-button" onClick={() => router.push("/")}>
            <img src="/land-view-logo.png" alt="LAND VIEW" />
            <div><strong>LAND VIEW</strong><span>ARCHITECTS & ENGINEERS</span></div>
          </button>
          <div className="reference-login-meta"><span><b>●</b> SECURE ACCESS</span><span><b>◆</b> ROLE BASED PORTAL</span></div>
        </div>
      </header>

      <section className="reference-login-hero role-login-hero">
        <div className="reference-login-blueprint" />
        <div className="reference-login-copy">
          <span className="showcase-tag">ONE LAND VIEW</span>
          <h1>{quickMode ? "Trusted Device PIN Login" : "Choose Your Workspace"}</h1>
          <p>{quickMode ? "This device is trusted for 7 days. Enter your permanent 6-digit Admin PIN to create a fresh secure session." : "One secure sign-in page for administrators, employees and clients. Select your access type and continue with your LAND VIEW account."}</p>
          <div className="role-login-explainer">
            <span className="role-login-explainer-label">SELECTED PORTAL</span>
            <strong>{quickMode ? "PIN Login · Trusted Device" : selected.label}</strong>
            <p>{quickMode ? `Trusted access is available on this browser${daysLeft ? ` for about ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : ""}.` : selected.description}</p>
          </div>
        </div>

        {quickMode && trustedDevice && quickConfigured ? (
          <section className="reference-login-card role-login-card quick-pin-card">
            <div className="reference-card-title"><span>TRUSTED DEVICE</span><h2>PIN Login</h2></div>
            <span className="quick-badge">7-DAY TRUST ACTIVE</span>
            {error && <div className="login-error role-login-error"><div className="error-icon">!</div><div><strong>PIN login failed</strong><p>{error}</p></div></div>}
            <label className="quick-pin-label" htmlFor="quick-pin">6-DIGIT ADMIN PIN</label>
            <input id="quick-pin" className="quick-pin-field" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={pin} onChange={(e) => handlePinChange(e.target.value)} autoComplete="off" autoFocus disabled={quickBusy} placeholder="ENTER PIN" aria-label="6-digit permanent Admin PIN" />
            <div className="quick-pin-note">{quickBusy ? "Creating secure Admin session…" : "Enter all 6 digits to sign in automatically."}</div>
            <button className="quick-switch" type="button" onClick={()=>{setQuickMode(false);setError("");setPin("");}}>Use username & password instead</button>
          </section>
        ) : (
          <form className="reference-login-card role-login-card" onSubmit={submit}>
            <div className="reference-card-title"><span>SECURE LOGIN</span><h2>Sign in to LAND VIEW</h2></div>
            <div className="portal-selector" role="tablist" aria-label="Choose login type">
              {portalOptions.map((item) => (
                <button key={item.id} type="button" role="tab" aria-selected={portal === item.id} className={`portal-option ${portal === item.id ? "active" : ""}`} onClick={() => { setPortal(item.id); setError(""); }}>
                  <span className="portal-option-icon">{item.short}</span><span>{item.label.replace(" Login", "")}</span>
                </button>
              ))}
            </div>
            {error && <div className="login-error role-login-error"><div className="error-icon">!</div><div><strong>Sign in failed</strong><p>{error}</p></div></div>}
            {trustedDevice && quickConfigured && portal === "admin" && (
              <>
                <button className="pin-login-button" type="button" onClick={()=>{setQuickMode(true);setError("");setPin("");}}>PIN LOGIN</button>
                <div className="trusted-note">Trusted device · {daysLeft || 1} day{daysLeft === 1 ? "" : "s"} remaining</div>
              </>
            )}
            <label className="form-field"><span>{identifierLabel}</span><input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={identifierPlaceholder} autoComplete="username" disabled={loading}/></label>
            <label className="form-field"><span>PASSWORD</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" disabled={loading}/></label>
            <button type="submit" className="login-submit reference-login-submit" disabled={loading}><span>{loading ? "AUTHENTICATING..." : `CONTINUE AS ${portal.toUpperCase()}`}</span><span>→</span></button>
            <div className="login-security"><span className="security-dot" />Your account role must match the selected portal</div>
          </form>
        )}
      </section>

      <footer className="reference-login-footer"><strong>LAND VIEW</strong><span>Admin • Employee • Client Access</span></footer>
    </main>
  );
}
