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
  {
    id: "admin",
    label: "Admin Login",
    short: "A",
    description: "Management, finance, users and full system access.",
  },
  {
    id: "employee",
    label: "Employee Login",
    short: "E",
    description: "Employee workspace and assigned project access.",
  },
  {
    id: "client",
    label: "Client Login",
    short: "C",
    description: "Client portal for project information and communication.",
  },
];

function normalizeRole(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function roleMatchesPortal(role: string, portal: PortalType) {
  if (portal === "admin") {
    return role === "admin" || role === "manager" || role === "accounts";
  }
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
  const [quickMode, setQuickMode] = useState(false);
  const [pin, setPin] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);

  useEffect(() => {
    void quickPost("quickPinStatus")
      .then((data) => {
        const configured = Boolean(data?.configured);
        setQuickConfigured(configured);
        if (configured) {
          setPortal("admin");
          setQuickMode(true);
        }
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
      if (!data?.user) throw new Error("Quick access session is unavailable.");
      saveSessionCache({ authenticated: true, user: data.user });
      localStorage.setItem(PORTAL_KEY, "admin");
      router.replace("/admin");
    } catch (err: any) {
      clearStoredSession();
      setPin("");
      setError(err?.message || "Incorrect Quick PIN.");
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

  return (
    <main className="reference-login role-login-page">
      <style>{`
        .quick-pin-card{display:grid;gap:16px}.quick-pin-field{width:100%;height:58px;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:#111920;color:#fff;text-align:center;font-size:24px;font-weight:800;letter-spacing:.5em;padding-left:.5em;outline:none}.quick-pin-field:focus{border-color:#ef493b;box-shadow:0 0 0 3px rgba(239,73,59,.12)}.quick-pin-field::placeholder{letter-spacing:.18em;font-size:11px;color:#75808a}.quick-pin-note{text-align:center;color:#8f9aa3;font-size:9px;line-height:1.6}.quick-switch{border:0;background:transparent;color:#ef766c;font-size:10px;font-weight:800;cursor:pointer;text-decoration:underline}.quick-pin-label{text-align:center;color:#fff;font-size:12px;font-weight:800;letter-spacing:.08em}.quick-badge{display:inline-flex;justify-self:center;padding:5px 8px;border-radius:999px;background:#1c3026;color:#9ed8b3;font-size:8px;font-weight:800;letter-spacing:.08em}
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
          <h1>{quickMode ? "Admin Quick Access" : "Choose Your Workspace"}</h1>
          <p>{quickMode ? "Enter your trusted-device 6-digit PIN to unlock the LAND VIEW admin panel instantly." : "One secure sign-in page for administrators, employees and clients. Select your access type and continue with your LAND VIEW account."}</p>
          <div className="role-login-explainer">
            <span className="role-login-explainer-label">SELECTED PORTAL</span>
            <strong>{quickMode ? "Quick PIN · Admin" : selected.label}</strong>
            <p>{quickMode ? "This PIN works only on this trusted browser and does not replace your normal password." : selected.description}</p>
          </div>
        </div>

        {quickMode && quickConfigured ? (
          <section className="reference-login-card role-login-card quick-pin-card">
            <div className="reference-card-title"><span>TRUSTED DEVICE</span><h2>Enter Quick PIN</h2></div>
            <span className="quick-badge">QUICK ACCESS READY</span>
            {error && <div className="login-error role-login-error"><div className="error-icon">!</div><div><strong>Unlock failed</strong><p>{error}</p></div></div>}
            <label className="quick-pin-label" htmlFor="quick-pin">6-DIGIT ADMIN PIN</label>
            <input
              id="quick-pin"
              className="quick-pin-field"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              autoComplete="off"
              autoFocus
              disabled={quickBusy}
              placeholder="ENTER PIN"
              aria-label="6-digit admin Quick PIN"
            />
            <div className="quick-pin-note">{quickBusy ? "Unlocking admin panel…" : "Enter all 6 digits to unlock automatically."}</div>
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
            <label className="form-field"><span>{identifierLabel}</span><input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={identifierPlaceholder} autoComplete="username" disabled={loading}/></label>
            <label className="form-field"><span>PASSWORD</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" disabled={loading}/></label>
            <button type="submit" className="login-submit reference-login-submit" disabled={loading}><span>{loading ? "AUTHENTICATING..." : `CONTINUE AS ${portal.toUpperCase()}`}</span><span>→</span></button>
            {quickConfigured && portal==="admin" && <button className="quick-switch" type="button" onClick={()=>{setQuickMode(true);setError("");}}>Use Quick PIN</button>}
            <div className="login-security"><span className="security-dot" />Your account role must match the selected portal</div>
          </form>
        )}
      </section>

      <footer className="reference-login-footer"><strong>LAND VIEW</strong><span>Admin • Employee • Client Access</span></footer>
    </main>
  );
}
