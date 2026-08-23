"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { clearStoredSession, landViewApi } from "@/lib/api";

type PortalType = "admin" | "employee" | "client";

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
    return role === "admin" || role === "manager";
  }
  if (portal === "employee") {
    return role === "employee";
  }
  return role === "client";
}

function portalPath(portal: PortalType) {
  if (portal === "admin") return "/admin";
  if (portal === "employee") return "/employee";
  return "/client";
}

export default function LoginPage() {
  const router = useRouter();
  const [portal, setPortal] = useState<PortalType>("admin");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

      const role = normalizeRole(
        result?.user?.role || result?.user?.Role
      );

      if (!roleMatchesPortal(role, portal)) {
        throw new Error(
          `This account is registered as ${role || "another role"}. Please use the correct login type.`
        );
      }

      router.replace(portalPath(portal));
    } catch (err: any) {
      clearStoredSession();
      setError(err?.message || "Invalid User ID or password.");
    } finally {
      setLoading(false);
    }
  }

  const selected = portalOptions.find((item) => item.id === portal)!;
  const identifierLabel = portal === "employee" ? "EMPLOYEE ID" : portal === "client" ? "PHONE NUMBER" : "USERNAME";
  const identifierPlaceholder = portal === "employee" ? "EMP-0001" : portal === "client" ? "01XXXXXXXXX" : "admin";

  return (
    <main className="reference-login role-login-page">
      <header className="reference-login-header">
        <div className="reference-login-inner">
          <button
            type="button"
            className="reference-login-brand login-brand-button"
            onClick={() => { window.location.href = "https://www.landview.com.bd"; }}
          >
            <img src="/land-view-logo.png" alt="LAND VIEW" />
            <div>
              <strong>LAND VIEW</strong>
              <span>ARCHITECTS & ENGINEERS</span>
            </div>
          </button>

          <div className="reference-login-meta">
            <span><b>●</b> SECURE ACCESS</span>
            <span><b>◆</b> ROLE BASED PORTAL</span>
          </div>
        </div>
      </header>

      <section className="reference-login-hero role-login-hero">
        <div className="reference-login-blueprint" />

        <div className="reference-login-copy">
          <span className="showcase-tag">ONE LAND VIEW</span>
          <h1>Choose Your Workspace</h1>
          <p>
            One secure sign-in page for administrators, employees and clients.
            Select your access type and continue with your LAND VIEW account.
          </p>

          <div className="role-login-explainer">
            <span className="role-login-explainer-label">SELECTED PORTAL</span>
            <strong>{selected.label}</strong>
            <p>{selected.description}</p>
          </div>
        </div>

        <form className="reference-login-card role-login-card" onSubmit={submit}>
          <div className="reference-card-title">
            <span>SECURE LOGIN</span>
            <h2>Sign in to LAND VIEW</h2>
          </div>

          <div className="portal-selector" role="tablist" aria-label="Choose login type">
            {portalOptions.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={portal === item.id}
                className={`portal-option ${portal === item.id ? "active" : ""}`}
                onClick={() => {
                  setPortal(item.id);
                  setError("");
                }}
              >
                <span className="portal-option-icon">{item.short}</span>
                <span>{item.label.replace(" Login", "")}</span>
              </button>
            ))}
          </div>

          {error && (
            <div className="login-error role-login-error">
              <div className="error-icon">!</div>
              <div>
                <strong>Sign in failed</strong>
                <p>{error}</p>
              </div>
            </div>
          )}

          <label className="form-field">
            <span>{identifierLabel}</span>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder={identifierPlaceholder}
              autoComplete="username"
              disabled={loading}
            />
          </label>

          <label className="form-field">
            <span>PASSWORD</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={loading}
            />
          </label>

          <button
            type="submit"
            className="login-submit reference-login-submit"
            disabled={loading}
          >
            <span>
              {loading ? "AUTHENTICATING..." : `CONTINUE AS ${portal.toUpperCase()}`}
            </span>
            <span>→</span>
          </button>

          <div className="login-security">
            <span className="security-dot" />
            Your account role must match the selected portal
          </div>
        </form>
      </section>

      <footer className="reference-login-footer">
        <strong>LAND VIEW</strong>
        <span>Admin • Employee • Client Access</span>
      </footer>
    </main>
  );
}
