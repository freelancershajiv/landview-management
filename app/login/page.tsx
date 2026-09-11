"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
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
  eyebrow: string;
  description: string;
  identifierLabel: string;
  identifierPlaceholder: string;
}> = [
  {
    id: "admin",
    label: "Management",
    short: "A",
    eyebrow: "ADMIN / MANAGER / ACCOUNTS",
    description: "Projects, finance, employees, workflow and company administration.",
    identifierLabel: "USERNAME",
    identifierPlaceholder: "Enter username",
  },
  {
    id: "employee",
    label: "Employee",
    short: "E",
    eyebrow: "EMPLOYEE WORKSPACE",
    description: "Assigned projects, workflow, site records, files and attendance.",
    identifierLabel: "EMPLOYEE ID",
    identifierPlaceholder: "EMP-0001",
  },
  {
    id: "client",
    label: "Client",
    short: "C",
    eyebrow: "CLIENT PORTAL",
    description: "Project information, documents, billing visibility and communication.",
    identifierLabel: "PHONE NUMBER",
    identifierPlaceholder: "01XXXXXXXXX",
  },
];

function normalizeRole(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function roleMatchesPortal(role: string, portal: PortalType) {
  if (portal === "admin") return role === "admin" || role === "manager" || role === "accounts";
  if (portal === "employee") return role === "employee";
  return role === "client";
}

function portalForRole(role: string): PortalType | null {
  if (role === "admin" || role === "manager" || role === "accounts") return "admin";
  if (role === "employee") return "employee";
  if (role === "client") return "client";
  return null;
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

  let json: any = null;
  try {
    json = await response.json();
  } catch {
    throw new Error("The login service returned an invalid response. Please try again.");
  }

  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || json?.message || "Quick access failed."));
  }
  return json.data || {};
}

export default function LoginPage() {
  const router = useRouter();
  const [portal, setPortal] = useState<PortalType>("admin");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quickConfigured, setQuickConfigured] = useState(false);
  const [trustedDevice, setTrustedDevice] = useState(false);
  const [trustedUntil, setTrustedUntil] = useState<number | null>(null);
  const [quickMode, setQuickMode] = useState(false);
  const [pin, setPin] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PORTAL_KEY) as PortalType | null;
      if (stored && portalOptions.some((item) => item.id === stored)) setPortal(stored);
    } catch {}

    void Promise.allSettled([
      quickPost("quickPinStatus").then((data) => {
        setQuickConfigured(Boolean(data?.configured));
        setTrustedDevice(Boolean(data?.trusted));
        setTrustedUntil(data?.expiresAt ? Number(data.expiresAt) : null);
      }),
      landViewApi
        .getSession()
        .then((session) => {
          const role = normalizeRole(session?.user?.role || session?.user?.Role);
          const matchedPortal = portalForRole(role);
          if (session?.authenticated && session?.user && matchedPortal) {
            saveSessionCache({ authenticated: true, user: session.user });
            try { localStorage.setItem(PORTAL_KEY, matchedPortal); } catch {}
            router.replace(portalPath(matchedPortal));
          }
        })
        .catch(() => null),
    ]).finally(() => setCheckingSession(false));
  }, [router]);

  const selected = useMemo(
    () => portalOptions.find((item) => item.id === portal) || portalOptions[0],
    [portal]
  );

  const daysLeft = trustedUntil
    ? Math.max(0, Math.ceil((trustedUntil - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  function choosePortal(next: PortalType) {
    if (loading || quickBusy) return;
    setPortal(next);
    setError("");
    setPassword("");
    setCapsLock(false);
    try { localStorage.setItem(PORTAL_KEY, next); } catch {}
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading || checkingSession) return;

    let id = userId.trim();
    if (portal === "employee") id = id.toUpperCase();

    if (!id || !password) {
      setError(`Enter your ${selected.identifierLabel.toLowerCase()} and password to continue.`);
      return;
    }

    setLoading(true);
    setError("");
    clearStoredSession();

    try {
      const result = await landViewApi.login(id, password);
      const role = normalizeRole(result?.user?.role || result?.user?.Role);

      if (!roleMatchesPortal(role, portal)) {
        const correctPortal = portalForRole(role);
        throw new Error(
          correctPortal
            ? `This account belongs to the ${portalOptions.find((item) => item.id === correctPortal)?.label || correctPortal} portal.`
            : "This account does not have access to this portal."
        );
      }

      saveSessionCache({ authenticated: true, user: result.user });
      try { localStorage.setItem(PORTAL_KEY, portal); } catch {}
      router.replace(portalPath(portal));
    } catch (err: any) {
      clearStoredSession();
      setError(err?.message || "Sign in failed. Check your credentials and try again.");
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
      try { localStorage.setItem(PORTAL_KEY, "admin"); } catch {}
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

  function passwordKeyState(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(Boolean(e.getModifierState?.("CapsLock")));
  }

  return (
    <main className="lv-login-shell">
      <style>{`
        *{box-sizing:border-box}.lv-login-shell{min-height:100vh;background:#0c0d0f;color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;display:grid;grid-template-rows:auto 1fr auto;overflow:hidden}.lv-login-header{height:78px;border-bottom:1px solid #25272a;background:rgba(13,14,16,.94);backdrop-filter:blur(14px);display:flex;align-items:center;position:relative;z-index:10}.lv-login-header-inner{width:min(1240px,calc(100% - 48px));margin:auto;display:flex;align-items:center;justify-content:space-between;gap:24px}.lv-brand{display:flex;align-items:center;gap:13px;background:transparent;border:0;color:#fff;cursor:pointer;text-align:left;padding:0}.lv-brand img{width:44px;height:44px;object-fit:contain}.lv-brand strong{display:block;font-size:15px;letter-spacing:.13em}.lv-brand span{display:block;margin-top:3px;color:#838990;font-size:8px;letter-spacing:.16em;font-weight:700}.lv-header-meta{display:flex;align-items:center;gap:18px;color:#828890;font-size:8px;font-weight:800;letter-spacing:.1em}.lv-header-meta span{display:flex;align-items:center;gap:7px}.lv-live{width:7px;height:7px;border-radius:50%;background:#58bd7b;box-shadow:0 0 0 4px rgba(88,189,123,.09)}.lv-login-main{width:min(1240px,calc(100% - 48px));margin:auto;padding:52px 0 58px;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(390px,.78fr);gap:72px;align-items:center}.lv-left{position:relative}.lv-kicker{display:inline-flex;align-items:center;gap:8px;color:#f17067;font-size:9px;font-weight:900;letter-spacing:.18em}.lv-kicker:before{content:"";width:26px;height:1px;background:#ef493b}.lv-left h1{font-size:clamp(42px,5.3vw,72px);line-height:.94;letter-spacing:-.055em;margin:18px 0 22px;max-width:760px}.lv-left h1 span{color:#ef493b}.lv-sub{max-width:650px;color:#979ca3;font-size:14px;line-height:1.8}.lv-system-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:34px;max-width:720px}.lv-system-card{padding:16px;border:1px solid #292c30;background:#121416;border-radius:12px}.lv-system-card small{display:block;color:#6f757c;font-size:8px;font-weight:900;letter-spacing:.12em}.lv-system-card strong{display:block;margin-top:8px;font-size:11px;color:#e9eaec}.lv-role-summary{margin-top:28px;padding:18px 20px;border-left:2px solid #ef493b;background:linear-gradient(90deg,rgba(239,73,59,.08),transparent);max-width:700px}.lv-role-summary small{display:block;color:#ef776e;font-size:8px;font-weight:900;letter-spacing:.13em}.lv-role-summary strong{display:block;margin-top:7px;font-size:15px}.lv-role-summary p{margin:7px 0 0;color:#868c93;font-size:11px;line-height:1.55}.lv-card{border:1px solid #2b2e32;background:#151719;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.35);overflow:hidden}.lv-card-head{padding:23px 24px 18px;border-bottom:1px solid #282b2f;display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.lv-card-head small{display:block;color:#727980;font-size:8px;font-weight:900;letter-spacing:.14em}.lv-card-head h2{margin:7px 0 0;font-size:20px;letter-spacing:-.025em}.lv-secure-badge{display:inline-flex;align-items:center;gap:7px;padding:7px 9px;border:1px solid #294533;border-radius:999px;background:#142019;color:#8fd0a4;font-size:7px;font-weight:900;letter-spacing:.09em;white-space:nowrap}.lv-role-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:16px 16px 0}.lv-role-tab{min-height:72px;border:1px solid #2d3034;border-radius:10px;background:#111315;color:#9ba0a5;display:grid;place-items:center;align-content:center;gap:7px;cursor:pointer;transition:.18s ease;padding:8px}.lv-role-tab:hover{border-color:#45494e;color:#fff}.lv-role-tab.active{border-color:#ef493b;background:rgba(239,73,59,.09);color:#fff;box-shadow:inset 0 0 0 1px rgba(239,73,59,.16)}.lv-role-icon{width:27px;height:27px;border-radius:7px;display:grid;place-items:center;background:#24272a;color:#c7cbcf;font-size:9px;font-weight:900}.lv-role-tab.active .lv-role-icon{background:#ef493b;color:#fff}.lv-role-tab span:last-child{font-size:9px;font-weight:900;letter-spacing:.04em}.lv-form{padding:18px 24px 24px}.lv-error{display:grid;grid-template-columns:30px 1fr;gap:10px;padding:12px;margin-bottom:15px;border:1px solid rgba(239,73,59,.28);border-radius:9px;background:rgba(239,73,59,.08)}.lv-error-icon{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#ef493b;color:#fff;font-size:12px;font-weight:900}.lv-error strong{display:block;font-size:10px}.lv-error p{margin:4px 0 0;color:#d6a29d;font-size:9px;line-height:1.45}.lv-pin-button{width:100%;height:44px;margin-bottom:8px;border:1px solid #34513e;border-radius:9px;background:#15211a;color:#a9ddb9;font-size:9px;font-weight:900;letter-spacing:.1em;cursor:pointer}.lv-pin-button:hover{background:#1a2a20}.lv-trust-note{text-align:center;color:#7fac8c;font-size:8px;margin-bottom:16px}.lv-field{display:block;margin-top:14px}.lv-field-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}.lv-field-row span{color:#8e949a;font-size:8px;font-weight:900;letter-spacing:.12em}.lv-caps{color:#d9ad67!important;letter-spacing:.04em!important}.lv-input-wrap{position:relative}.lv-field input{width:100%;height:50px;border:1px solid #303338;border-radius:9px;background:#0e1012;color:#fff;outline:none;padding:0 14px;font-size:12px;transition:.18s ease}.lv-field input:focus{border-color:#ef493b;box-shadow:0 0 0 3px rgba(239,73,59,.1)}.lv-field input::placeholder{color:#555c63}.lv-field input:disabled{opacity:.55}.lv-password-input{padding-right:66px!important}.lv-show-password{position:absolute;right:8px;top:50%;transform:translateY(-50%);height:34px;padding:0 9px;border:0;border-radius:7px;background:#1a1d20;color:#9da3a9;font-size:8px;font-weight:900;cursor:pointer}.lv-show-password:hover{color:#fff;background:#23272b}.lv-submit{width:100%;height:52px;margin-top:18px;border:0;border-radius:9px;background:#ef493b;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 17px;font-size:9px;font-weight:900;letter-spacing:.1em;cursor:pointer;transition:.18s ease}.lv-submit:hover:not(:disabled){background:#ff594a;transform:translateY(-1px)}.lv-submit:disabled{opacity:.55;cursor:not-allowed}.lv-submit-arrow{font-size:18px;font-weight:400}.lv-login-note{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:14px;color:#666d74;font-size:8px;text-align:center}.lv-login-note i{width:6px;height:6px;border-radius:50%;background:#58bd7b}.lv-pin-panel{padding:24px}.lv-pin-panel .lv-error{margin:0 0 18px}.lv-pin-title{text-align:center}.lv-pin-title small{display:block;color:#727980;font-size:8px;font-weight:900;letter-spacing:.14em}.lv-pin-title h2{margin:7px 0 0;font-size:21px}.lv-pin-badge{display:flex;width:max-content;margin:15px auto 20px;padding:6px 9px;border-radius:999px;background:#142019;color:#8fd0a4;font-size:7px;font-weight:900;letter-spacing:.1em}.lv-pin-field{width:100%;height:62px;border:1px solid #383c40;border-radius:10px;background:#0d0f11;color:#fff;text-align:center;font-size:25px;font-weight:900;letter-spacing:.45em;padding-left:.45em;outline:none}.lv-pin-field:focus{border-color:#ef493b;box-shadow:0 0 0 3px rgba(239,73,59,.1)}.lv-pin-help{text-align:center;margin:11px 0 16px;color:#777e85;font-size:8px;line-height:1.5}.lv-switch{width:100%;height:42px;border:1px solid #303338;border-radius:9px;background:#111315;color:#c6c9cc;font-size:8px;font-weight:900;letter-spacing:.08em;cursor:pointer}.lv-switch:hover{border-color:#4b4f54;color:#fff}.lv-footer{height:56px;border-top:1px solid #222529;display:flex;align-items:center;justify-content:center;gap:10px;color:#62686f;font-size:8px;letter-spacing:.09em}.lv-footer strong{color:#8b9197}.lv-checking{position:fixed;inset:0;background:#0c0d0f;display:grid;place-items:center;z-index:50}.lv-checking div{display:grid;place-items:center;gap:13px;color:#848a90;font-size:9px;font-weight:800;letter-spacing:.1em}.lv-spinner{width:28px;height:28px;border:2px solid #2e3135;border-top-color:#ef493b;border-radius:50%;animation:lvspin .8s linear infinite}@keyframes lvspin{to{transform:rotate(360deg)}}@media(max-width:900px){.lv-login-main{grid-template-columns:1fr;gap:35px;padding:34px 0 42px}.lv-left h1{font-size:46px;max-width:620px}.lv-card{max-width:560px;width:100%}.lv-system-grid{max-width:560px}.lv-header-meta{display:none}}@media(max-width:600px){.lv-login-header{height:68px}.lv-login-header-inner,.lv-login-main{width:min(100% - 28px,1240px)}.lv-login-main{padding-top:28px}.lv-left h1{font-size:38px}.lv-sub{font-size:12px}.lv-system-grid{grid-template-columns:1fr}.lv-system-card{padding:12px 14px}.lv-card-head{padding:20px 18px 16px}.lv-role-tabs{padding:12px 12px 0;gap:6px}.lv-role-tab{min-height:65px}.lv-form,.lv-pin-panel{padding:16px 18px 20px}.lv-secure-badge{display:none}.lv-footer{font-size:7px}.lv-brand img{width:38px;height:38px}}
      `}</style>

      {checkingSession && (
        <div className="lv-checking" aria-live="polite">
          <div><span className="lv-spinner" />CHECKING SECURE SESSION</div>
        </div>
      )}

      <header className="lv-login-header">
        <div className="lv-login-header-inner">
          <button type="button" className="lv-brand" onClick={() => router.push("/")} aria-label="Return to LAND VIEW home">
            <img src="/land-view-logo.png" alt="LAND VIEW" />
            <div><strong>LAND VIEW</strong><span>ARCHITECTS & ENGINEERS</span></div>
          </button>
          <div className="lv-header-meta" aria-label="Security status">
            <span><i className="lv-live" /> SYSTEM ONLINE</span>
            <span>SECURE ROLE-BASED ACCESS</span>
          </div>
        </div>
      </header>

      <section className="lv-login-main">
        <div className="lv-left">
          <span className="lv-kicker">LAND VIEW ERP</span>
          <h1>{quickMode ? <>Trusted device<br/><span>PIN access.</span></> : <>One system.<br/><span>Three workspaces.</span></>}</h1>
          <p className="lv-sub">
            {quickMode
              ? "Use your permanent six-digit Admin PIN on this trusted browser to create a fresh authenticated session."
              : "A single controlled gateway for management, employees and clients. Choose the workspace that matches your LAND VIEW account."}
          </p>

          <div className="lv-system-grid">
            <div className="lv-system-card"><small>ACCESS CONTROL</small><strong>Role verified after sign-in</strong></div>
            <div className="lv-system-card"><small>SESSION SECURITY</small><strong>Protected server-side session</strong></div>
            <div className="lv-system-card"><small>TRUSTED DEVICE</small><strong>{trustedDevice && quickConfigured ? `${daysLeft || 1} day${daysLeft === 1 ? "" : "s"} remaining` : "Available to Admin"}</strong></div>
          </div>

          <div className="lv-role-summary">
            <small>{quickMode ? "TRUSTED ADMIN ACCESS" : selected.eyebrow}</small>
            <strong>{quickMode ? "PIN Login" : selected.label}</strong>
            <p>{quickMode ? "PIN access is available only while this browser remains trusted." : selected.description}</p>
          </div>
        </div>

        <section className="lv-card" aria-label="LAND VIEW secure login">
          {quickMode && trustedDevice && quickConfigured ? (
            <div className="lv-pin-panel">
              <div className="lv-pin-title"><small>TRUSTED DEVICE</small><h2>Admin PIN Login</h2></div>
              <div className="lv-pin-badge">7-DAY DEVICE TRUST ACTIVE</div>

              {error && (
                <div className="lv-error" role="alert">
                  <div className="lv-error-icon">!</div>
                  <div><strong>PIN login failed</strong><p>{error}</p></div>
                </div>
              )}

              <input
                className="lv-pin-field"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={(e) => handlePinChange(e.target.value)}
                autoComplete="off"
                autoFocus
                disabled={quickBusy}
                placeholder="••••••"
                aria-label="6-digit Admin PIN"
              />
              <div className="lv-pin-help">{quickBusy ? "Creating a fresh secure session…" : "Sign-in starts automatically after all 6 digits are entered."}</div>
              <button type="button" className="lv-switch" onClick={() => { setQuickMode(false); setPin(""); setError(""); }} disabled={quickBusy}>USE USERNAME & PASSWORD</button>
            </div>
          ) : (
            <>
              <div className="lv-card-head">
                <div><small>SECURE LOGIN</small><h2>Sign in to LAND VIEW</h2></div>
                <span className="lv-secure-badge"><i className="lv-live" /> PROTECTED</span>
              </div>

              <div className="lv-role-tabs" role="tablist" aria-label="Choose login workspace">
                {portalOptions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={portal === item.id}
                    className={`lv-role-tab ${portal === item.id ? "active" : ""}`}
                    onClick={() => choosePortal(item.id)}
                    disabled={loading}
                  >
                    <span className="lv-role-icon">{item.short}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              <form className="lv-form" onSubmit={submit}>
                {error && (
                  <div className="lv-error" role="alert">
                    <div className="lv-error-icon">!</div>
                    <div><strong>Sign in failed</strong><p>{error}</p></div>
                  </div>
                )}

                {trustedDevice && quickConfigured && portal === "admin" && (
                  <>
                    <button className="lv-pin-button" type="button" onClick={() => { setQuickMode(true); setError(""); setPin(""); }}>PIN LOGIN ON THIS TRUSTED DEVICE</button>
                    <div className="lv-trust-note">Trusted access expires in about {daysLeft || 1} day{daysLeft === 1 ? "" : "s"}</div>
                  </>
                )}

                <label className="lv-field">
                  <span className="lv-field-row"><span>{selected.identifierLabel}</span></span>
                  <span className="lv-input-wrap">
                    <input
                      value={userId}
                      onChange={(e) => { setUserId(portal === "employee" ? e.target.value.toUpperCase() : e.target.value); setError(""); }}
                      placeholder={selected.identifierPlaceholder}
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      disabled={loading}
                      autoFocus
                    />
                  </span>
                </label>

                <label className="lv-field">
                  <span className="lv-field-row"><span>PASSWORD</span>{capsLock && <span className="lv-caps">CAPS LOCK IS ON</span>}</span>
                  <span className="lv-input-wrap">
                    <input
                      className="lv-password-input"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(""); }}
                      onKeyDown={passwordKeyState}
                      onKeyUp={passwordKeyState}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      disabled={loading}
                    />
                    <button type="button" className="lv-show-password" onClick={() => setShowPassword((value) => !value)} tabIndex={-1}>{showPassword ? "HIDE" : "SHOW"}</button>
                  </span>
                </label>

                <button type="submit" className="lv-submit" disabled={loading || checkingSession}>
                  <span>{loading ? "AUTHENTICATING…" : `CONTINUE TO ${selected.label.toUpperCase()}`}</span>
                  <span className="lv-submit-arrow">→</span>
                </button>

                <div className="lv-login-note"><i />Your account role is verified before workspace access is granted.</div>
              </form>
            </>
          )}
        </section>
      </section>

      <footer className="lv-footer"><strong>LAND VIEW</strong><span>ENGINEERS & ARCHITECTS · SECURE ERP ACCESS</span></footer>
    </main>
  );
}
