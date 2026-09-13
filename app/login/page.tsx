"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { clearStoredSession, landViewApi, saveSessionCache } from "@/lib/api";

type PortalType = "employee" | "client";
type RolePortal = "admin" | PortalType | null;
const PORTAL_KEY = "land_view_portal_type";

const portals = [
  {
    id: "employee" as PortalType,
    label: "Employee",
    short: "01",
    eyebrow: "TEAM ACCESS",
    title: "Employee workspace",
    description: "Employees use their Employee ID. LAND VIEW administrators use the same access point with valid Admin credentials.",
    identifier: "EMPLOYEE / ADMIN ID",
    placeholder: "EMP-0001 or admin username",
  },
  {
    id: "client" as PortalType,
    label: "Client",
    short: "02",
    eyebrow: "PROJECT ACCESS",
    title: "Client workspace",
    description: "Clients use the LAND VIEW Project ID and the mobile number registered with that project.",
    identifier: "PROJECT ID",
    placeholder: "LV-1",
  },
];

function normalizeRole(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function portalForRole(role: string): RolePortal {
  if (["admin", "manager", "accounts"].includes(role)) return "admin";
  if (role === "employee") return "employee";
  if (role === "client") return "client";
  return null;
}

async function clientLogin(projectId: string, mobile: string) {
  const response = await fetch("/api/client-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    body: JSON.stringify({ action: "login", projectId, mobile }),
  });
  let json: any;
  try {
    json = await response.json();
  } catch {
    throw new Error("The client login service returned an invalid response.");
  }
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || "Project ID or mobile number did not match our records."));
  }
  return json.data || {};
}

export default function LoginPage() {
  const [portal, setPortal] = useState<PortalType>("employee");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [clientMobile, setClientMobile] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PORTAL_KEY);
      if (stored === "employee" || stored === "client") setPortal(stored);
    } catch {}
  }, []);

  const selected = useMemo(() => portals.find((item) => item.id === portal) || portals[0], [portal]);

  function choosePortal(next: PortalType) {
    if (loading) return;
    setPortal(next);
    setUserId("");
    setPassword("");
    setClientMobile("");
    setError("");
    setCapsLock(false);
    try { localStorage.setItem(PORTAL_KEY, next); } catch {}
  }

  function keyState(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(Boolean(event.getModifierState?.("CapsLock")));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    let id = userId.trim();
    if (portal === "client") id = id.toUpperCase();

    if (portal === "client") {
      if (!id || !clientMobile.trim()) {
        setError("Enter your Project ID and registered mobile number to continue.");
        return;
      }
    } else if (!id || !password) {
      setError("Enter your Employee/Admin ID and password to continue.");
      return;
    }

    setLoading(true);
    setError("");
    clearStoredSession();

    try {
      const result = portal === "client"
        ? await clientLogin(id, clientMobile.trim())
        : await landViewApi.login(id, password);

      const role = normalizeRole(result?.user?.role || result?.user?.Role);
      const rolePortal = portalForRole(role);

      if (portal === "employee" && rolePortal === "admin") {
        saveSessionCache({ authenticated: true, user: result.user });
        try { localStorage.setItem(PORTAL_KEY, "employee"); } catch {}
        window.location.replace("/admin");
        return;
      }

      if (portal === "employee" && rolePortal !== "employee") {
        throw new Error(rolePortal === "client" ? "This account belongs to the Client portal." : "This account cannot access the Employee portal.");
      }

      if (portal === "client" && rolePortal !== "client") {
        throw new Error("This account cannot access the Client portal.");
      }

      saveSessionCache({ authenticated: true, user: result.user });
      try { localStorage.setItem(PORTAL_KEY, portal); } catch {}
      window.location.replace(portal === "employee" ? "/employee" : "/client");
    } catch (err: any) {
      clearStoredSession();
      setError(err?.message || "Sign in failed. Check your credentials and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="lv-auth" data-portal={portal}>
      <style>{`
        *{box-sizing:border-box}
        .lv-auth{--red:#ed3f35;--red2:#ff6c61;--ink:#f4f5f6;--muted:#8c949b;--line:#2b3035;--panel:#121517;min-height:100vh;background:#090b0d;color:var(--ink);font-family:Arial,Helvetica,sans-serif;position:relative;overflow:hidden}
        .lv-auth:before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:48px 48px;mask-image:linear-gradient(to bottom,black,transparent 88%)}
        .lv-auth:after{content:"";position:fixed;width:620px;height:620px;border-radius:50%;right:-250px;top:-260px;background:radial-gradient(circle,rgba(237,63,53,.16),rgba(237,63,53,0) 68%);pointer-events:none}
        .frame{width:min(1240px,calc(100% - 48px));margin:0 auto;min-height:100vh;display:grid;grid-template-rows:auto 1fr auto;position:relative;z-index:1}
        .topbar{height:84px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}
        .brand{display:flex;align-items:center;gap:13px}.brand img{width:46px;height:46px;object-fit:contain}.brand strong{display:block;font-size:14px;letter-spacing:.16em}.brand small{display:block;margin-top:4px;color:#707980;font-size:8px;letter-spacing:.18em;font-weight:800}
        .secure{display:flex;align-items:center;gap:10px;color:#818990;font-size:9px;font-weight:800;letter-spacing:.11em}.secure i{width:8px;height:8px;border-radius:50%;background:#6bc487;box-shadow:0 0 0 5px rgba(107,196,135,.08)}
        .stage{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(390px,.72fr);gap:72px;align-items:center;padding:54px 0 64px}
        .hero{max-width:700px}.index{display:flex;align-items:center;gap:12px;color:var(--red2);font-size:9px;font-weight:900;letter-spacing:.2em}.index:before{content:"";width:34px;height:1px;background:var(--red)}
        .hero h1{margin:19px 0 22px;font-size:clamp(48px,6.4vw,82px);line-height:.94;letter-spacing:-.055em;font-weight:700}.hero h1 span{color:var(--red)}
        .hero>p{max-width:610px;margin:0;color:#929aa1;font-size:14px;line-height:1.8}
        .architecture{display:grid;grid-template-columns:1.15fr .85fr;gap:12px;margin-top:36px;max-width:680px}
        .arch-card{min-height:116px;border:1px solid var(--line);background:linear-gradient(145deg,rgba(22,25,28,.96),rgba(12,14,16,.96));border-radius:12px;padding:18px;position:relative;overflow:hidden}.arch-card:after{content:"";position:absolute;width:76px;height:76px;border:1px solid rgba(255,255,255,.05);right:-18px;bottom:-20px;transform:rotate(45deg)}
        .arch-card small{display:block;color:#6f777e;font-size:8px;font-weight:900;letter-spacing:.14em}.arch-card strong{display:block;margin-top:10px;font-size:14px;line-height:1.35}.arch-card p{margin:8px 0 0;color:#7f878e;font-size:10px;line-height:1.5}
        .access-card{border:1px solid #30353a;background:rgba(17,20,22,.96);border-radius:18px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.42)}
        .card-head{padding:23px 24px 18px;border-bottom:1px solid var(--line);display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.card-head small{display:block;color:#737c83;font-size:8px;font-weight:900;letter-spacing:.15em}.card-head h2{margin:7px 0 0;font-size:21px;letter-spacing:-.02em}.step{font-size:9px;color:#717980;font-weight:900;letter-spacing:.1em;padding-top:2px}
        .portal-switch{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:14px 14px 0}.portal-button{min-height:78px;border:1px solid #2c3135;background:#0c0f11;border-radius:10px;color:#8b9399;cursor:pointer;text-align:left;padding:14px 15px;transition:.18s ease}.portal-button:hover{border-color:#464d53;transform:translateY(-1px)}.portal-button.active{border-color:rgba(237,63,53,.75);background:linear-gradient(145deg,rgba(237,63,53,.13),rgba(237,63,53,.03));color:white}.portal-button b{display:block;color:var(--red2);font-size:8px;letter-spacing:.12em}.portal-button strong{display:block;margin-top:8px;font-size:12px}.portal-button span{display:block;margin-top:5px;color:#737b82;font-size:8px;line-height:1.35}
        .form{padding:20px 24px 25px}.mode-title{padding-bottom:15px;border-bottom:1px solid #252a2e}.mode-title small{display:block;color:var(--red2);font-size:8px;font-weight:900;letter-spacing:.15em}.mode-title strong{display:block;margin-top:7px;font-size:14px}.mode-title p{margin:6px 0 0;color:#7f878e;font-size:9px;line-height:1.5}
        .error{display:grid;grid-template-columns:29px 1fr;gap:10px;margin-top:15px;padding:11px;border:1px solid rgba(237,63,53,.32);border-radius:9px;background:rgba(237,63,53,.08)}.error i{width:29px;height:29px;border-radius:8px;background:var(--red);display:grid;place-items:center;font-style:normal;font-weight:900}.error strong{display:block;font-size:9px}.error p{margin:3px 0 0;color:#d4a19d;font-size:9px;line-height:1.45}
        .field{display:block;margin-top:15px}.field-row{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px}.field-row span{font-size:8px;font-weight:900;letter-spacing:.12em;color:#8a9298}.caps{color:#d6ad70!important}.input-wrap{position:relative}.field input{width:100%;height:51px;border:1px solid #30363a;border-radius:9px;background:#0a0d0f;color:white;padding:0 14px;outline:none;font-size:13px;transition:.18s}.field input:focus{border-color:var(--red);box-shadow:0 0 0 4px rgba(237,63,53,.08)}.password{padding-right:68px!important}.show{position:absolute;right:8px;top:50%;transform:translateY(-50%);height:34px;padding:0 10px;border:0;border-radius:7px;background:#181c1f;color:#a0a7ac;font-size:8px;font-weight:900;cursor:pointer}
        .submit{width:100%;height:54px;margin-top:19px;border:0;border-radius:9px;background:linear-gradient(135deg,var(--red),#d52c25);color:white;display:flex;align-items:center;justify-content:space-between;padding:0 17px;font-size:9px;font-weight:900;letter-spacing:.12em;cursor:pointer;box-shadow:0 12px 26px rgba(237,63,53,.16)}.submit:hover{filter:brightness(1.06)}.submit:disabled{opacity:.55;cursor:wait}.submit b{font-size:18px;font-weight:400}.hint{text-align:center;margin:13px 0 0;color:#687078;font-size:8px;line-height:1.5}
        .bottom{height:60px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:20px;color:#626a70;font-size:8px;letter-spacing:.09em}.bottom a{color:#8a9298;text-decoration:none}.bottom a:hover{color:white}
        @media(max-width:920px){.stage{grid-template-columns:1fr;gap:38px;padding-top:36px}.hero{max-width:760px}.hero h1{font-size:clamp(44px,9vw,72px)}.access-card{max-width:590px}.architecture{max-width:590px}}
        @media(max-width:620px){.frame{width:calc(100% - 28px)}.topbar{height:72px}.brand img{width:40px;height:40px}.secure{display:none}.stage{padding:28px 0 38px;gap:28px}.hero h1{font-size:42px}.hero>p{font-size:12px;line-height:1.65}.architecture{grid-template-columns:1fr;margin-top:26px}.arch-card{min-height:auto}.portal-switch{gap:6px;padding:11px 11px 0}.portal-button{min-height:72px;padding:12px}.card-head{padding:19px 18px 16px}.form{padding:17px 18px 21px}.bottom{height:auto;min-height:62px;flex-direction:column;align-items:flex-start;justify-content:center;padding:14px 0;gap:7px}}
      `}</style>

      <div className="frame">
        <header className="topbar">
          <div className="brand">
            <img src="/land-view-logo.svg" alt="LAND VIEW" />
            <div><strong>LAND VIEW</strong><small>ENGINEERS & ARCHITECTS</small></div>
          </div>
          <div className="secure"><i /> SECURE PROJECT & TEAM ACCESS</div>
        </header>

        <section className="stage">
          <div className="hero">
            <span className="index">LAND VIEW DIGITAL WORKSPACE</span>
            <h1>Built for the people<br />behind every <span>project.</span></h1>
            <p>One secure gateway for LAND VIEW team members and clients. Access project delivery, finance, documents and services from a workspace designed around how our practice operates.</p>
            <div className="architecture">
              <div className="arch-card"><small>TEAM / ADMIN</small><strong>One Employee gateway</strong><p>Employee credentials open the team workspace. Valid Admin credentials automatically open Management.</p></div>
              <div className="arch-card"><small>CLIENT</small><strong>Project-based access</strong><p>Clients enter with their project identity and registered mobile number.</p></div>
            </div>
          </div>

          <div className="access-card">
            <div className="card-head">
              <div><small>ACCESS CONTROL</small><h2>Enter your workspace</h2></div>
              <span className="step">01 / AUTH</span>
            </div>

            <div className="portal-switch">
              {portals.map((item) => (
                <button key={item.id} type="button" className={`portal-button ${portal === item.id ? "active" : ""}`} onClick={() => choosePortal(item.id)}>
                  <b>{item.short} · {item.eyebrow}</b>
                  <strong>{item.label}</strong>
                  <span>{item.id === "employee" ? "Employee + Admin" : "Project client"}</span>
                </button>
              ))}
            </div>

            <form className="form" onSubmit={submit}>
              <div className="mode-title">
                <small>{selected.eyebrow}</small>
                <strong>{selected.title}</strong>
                <p>{selected.description}</p>
              </div>

              {error && <div className="error" role="alert"><i>!</i><div><strong>SIGN IN FAILED</strong><p>{error}</p></div></div>}

              <label className="field">
                <div className="field-row"><span>{selected.identifier}</span></div>
                <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={selected.placeholder} autoComplete="username" autoCapitalize="none" spellCheck={false} />
              </label>

              {portal === "client" ? (
                <label className="field">
                  <div className="field-row"><span>REGISTERED MOBILE NUMBER</span></div>
                  <input value={clientMobile} onChange={(e) => setClientMobile(e.target.value)} placeholder="01XXXXXXXXX" inputMode="tel" autoComplete="tel" />
                </label>
              ) : (
                <label className="field">
                  <div className="field-row"><span>PASSWORD</span>{capsLock && <span className="caps">CAPS LOCK IS ON</span>}</div>
                  <div className="input-wrap">
                    <input className="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={keyState} onKeyUp={keyState} placeholder="Enter password" autoComplete="current-password" />
                    <button className="show" type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "HIDE" : "SHOW"}</button>
                  </div>
                </label>
              )}

              <button className="submit" type="submit" disabled={loading}>
                <span>{loading ? "VERIFYING ACCESS…" : portal === "employee" ? "ENTER TEAM WORKSPACE" : "ENTER CLIENT WORKSPACE"}</span><b>→</b>
              </button>
              <p className="hint">Protected LAND VIEW workspace · Access is limited to authorized users.</p>
            </form>
          </div>
        </section>

        <footer className="bottom"><span>© 2026 LAND VIEW Engineers & Architects</span><a href="https://landview.com.bd">landview.com.bd ↗</a></footer>
      </div>
    </main>
  );
}
