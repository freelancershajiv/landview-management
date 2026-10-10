"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type HealthStatus = "healthy" | "warning" | "critical" | "unknown";
type HealthCheck = {
  id: string;
  label: string;
  status: HealthStatus;
  score: number;
  weight: number;
  detail: string;
  metric?: string;
  href: string;
};
type HealthData = {
  score: number;
  status: HealthStatus;
  criticalCount: number;
  warningCount: number;
  checks: HealthCheck[];
  generatedAt?: string;
};

function statusLabel(status: HealthStatus) {
  if (status === "healthy") return "Healthy";
  if (status === "warning") return "Watch";
  if (status === "critical") return "Critical";
  return "Unknown";
}

function toneClass(status: HealthStatus) {
  return status === "healthy" ? "ok" : status === "critical" ? "bad" : "watch";
}

export default function AdminSystemHealth() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/system-health", { cache: "no-store", credentials: "same-origin" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load system health."));
      setData(json.data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load system health.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const checks = data?.checks || [];
  const score = Number(data?.score || 0);
  const tone = toneClass(data?.status || "unknown");
  const generated = useMemo(() => {
    if (!data?.generatedAt) return "";
    const date = new Date(data.generatedAt);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" });
  }, [data?.generatedAt]);

  return (
    <section className="lv-system-health">
      <style>{`
        .lv-system-health{margin:0 0 14px;color:var(--lv-text-primary)}
        .lv-system-health *{box-sizing:border-box}.lv-system-health a{text-decoration:none}
        .lv-sh-shell{border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-lg);background:var(--lv-surface-panel);overflow:hidden;box-shadow:var(--lv-shadow-md)}
        .lv-sh-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;padding:18px 20px;border-bottom:1px solid var(--lv-divider);background:var(--lv-surface-muted)}
        .lv-sh-eyebrow{display:block;color:var(--lv-brand-text);font-size:8px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.lv-sh-head h2{margin:6px 0 4px;font-size:18px;color:var(--lv-text-strong)}.lv-sh-head p{margin:0;color:var(--lv-text-muted);font-size:9.5px;line-height:1.5}.lv-sh-actions{display:flex;align-items:center;gap:8px}.lv-sh-actions>span{color:var(--lv-text-muted)!important}.lv-sh-refresh{height:36px;padding:0 12px;border:1px solid var(--lv-control-border);border-radius:var(--lv-radius-sm);background:var(--lv-control-bg);color:var(--lv-text-primary);font-size:9px;font-weight:900;cursor:pointer;transition:background var(--lv-motion-fast),border-color var(--lv-motion-fast)}.lv-sh-refresh:hover:not(:disabled){background:var(--lv-control-bg-hover);border-color:var(--lv-border-strong)}.lv-sh-refresh:disabled{opacity:.5;cursor:not-allowed}
        .lv-sh-body{display:grid;grid-template-columns:180px minmax(0,1fr);gap:0}.lv-sh-score{padding:18px;border-right:1px solid var(--lv-divider);display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:var(--lv-surface-panel)}.lv-sh-ring{--score:0;width:108px;height:108px;border-radius:50%;display:grid;place-items:center;position:relative;background:conic-gradient(var(--lv-success) calc(var(--score)*1%),var(--lv-surface-subtle) 0)}.lv-sh-ring.watch{background:conic-gradient(var(--lv-warning) calc(var(--score)*1%),var(--lv-surface-subtle) 0)}.lv-sh-ring.bad{background:conic-gradient(var(--lv-danger) calc(var(--score)*1%),var(--lv-surface-subtle) 0)}.lv-sh-ring:after{content:"";position:absolute;inset:9px;border-radius:50%;background:var(--lv-surface-panel)}.lv-sh-ring strong{position:relative;z-index:1;font-size:29px;color:var(--lv-text-strong)}.lv-sh-score b{margin-top:10px;font-size:11px;color:var(--lv-text-strong)}.lv-sh-score small{margin-top:4px;color:var(--lv-text-muted);font-size:8px;line-height:1.4}
        .lv-sh-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0}.lv-sh-card{min-width:0;padding:15px;border-right:1px solid var(--lv-divider);color:var(--lv-text-primary);background:var(--lv-surface-panel);transition:background var(--lv-motion-fast)}.lv-sh-card:last-child{border-right:0}.lv-sh-card:hover{background:var(--lv-surface-muted)}.lv-sh-card-top{display:flex;justify-content:space-between;gap:6px;align-items:flex-start}.lv-sh-card-top span{font-size:8px;font-weight:900;text-transform:uppercase;color:var(--lv-text-secondary);line-height:1.35}.lv-sh-pill{flex:0 0 auto;border:1px solid var(--lv-success-border);border-radius:var(--lv-radius-pill);padding:4px 6px;font-size:7px!important;color:var(--lv-success)!important;background:var(--lv-success-soft)}.lv-sh-card.watch .lv-sh-pill{border-color:var(--lv-warning-border);color:var(--lv-warning)!important;background:var(--lv-warning-soft)}.lv-sh-card.bad .lv-sh-pill{border-color:var(--lv-danger-border);color:var(--lv-danger)!important;background:var(--lv-danger-soft)}.lv-sh-card strong{display:block;margin:12px 0 6px;font-size:15px;color:var(--lv-text-strong);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-sh-card p{margin:0;color:var(--lv-text-muted);font-size:8px;line-height:1.45;min-height:35px}.lv-sh-open{display:block;margin-top:10px;color:var(--lv-brand-text);font-size:8px;font-weight:900}.lv-sh-error{padding:15px 18px;color:var(--lv-danger);background:var(--lv-danger-soft);border-top:1px solid var(--lv-danger-border);font-size:10px}.lv-sh-loading{padding:17px 20px;color:var(--lv-text-muted);font-size:10px;background:var(--lv-surface-panel)}
        @media(max-width:1180px){.lv-sh-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.lv-sh-card{border-bottom:1px solid var(--lv-divider)}.lv-sh-card:nth-child(3n){border-right:0}}
        @media(max-width:760px){.lv-sh-head{grid-template-columns:1fr;align-items:flex-start}.lv-sh-actions{justify-content:flex-start}.lv-sh-body{grid-template-columns:1fr}.lv-sh-score{border-right:0;border-bottom:1px solid var(--lv-divider);flex-direction:row;justify-content:flex-start;gap:16px;text-align:left}.lv-sh-ring{width:78px;height:78px}.lv-sh-ring strong{font-size:22px}.lv-sh-grid{grid-template-columns:1fr 1fr}.lv-sh-card{border-right:1px solid var(--lv-divider)}.lv-sh-card:nth-child(3n){border-right:1px solid var(--lv-divider)}.lv-sh-card:nth-child(2n){border-right:0}}
        @media(max-width:480px){.lv-sh-grid{grid-template-columns:1fr}.lv-sh-card,.lv-sh-card:nth-child(3n){border-right:0}.lv-sh-score{align-items:center}.lv-sh-head{padding:16px}.lv-sh-card{padding:14px 16px}}
      `}</style>
      <div className="lv-sh-shell">
        <header className="lv-sh-head">
          <div>
            <span className="lv-sh-eyebrow">LAND VIEW / LIVE SYSTEM HEALTH</span>
            <h2>Operations & Integration Health</h2>
            <p>Live checks for the database, analytics, WhatsApp sessions and Site Visit media pipeline.</p>
          </div>
          <div className="lv-sh-actions">
            {generated ? <span style={{fontSize:8,fontWeight:800}}>Checked {generated}</span> : null}
            <button className="lv-sh-refresh" onClick={() => void load()} disabled={loading}>{loading ? "Checking…" : "Run Health Check"}</button>
          </div>
        </header>

        {data ? (
          <div className="lv-sh-body">
            <div className="lv-sh-score">
              <div className={`lv-sh-ring ${tone}`} style={{ "--score": Math.max(0, Math.min(100, score)) } as React.CSSProperties}><strong>{score}</strong></div>
              <div>
                <b>{statusLabel(data.status)}</b>
                <small>{data.criticalCount ? `${data.criticalCount} critical issue${data.criticalCount === 1 ? "" : "s"}` : data.warningCount ? `${data.warningCount} item${data.warningCount === 1 ? "" : "s"} need watching` : "All monitored systems are healthy"}</small>
              </div>
            </div>
            <div className="lv-sh-grid">
              {checks.map((check) => {
                const cardTone = toneClass(check.status);
                return <Link href={check.href} className={`lv-sh-card ${cardTone}`} key={check.id}>
                  <div className="lv-sh-card-top"><span>{check.label}</span><span className="lv-sh-pill">{statusLabel(check.status)}</span></div>
                  <strong title={check.metric || statusLabel(check.status)}>{check.metric || statusLabel(check.status)}</strong>
                  <p>{check.detail}</p>
                  <span className="lv-sh-open">Open module →</span>
                </Link>;
              })}
            </div>
          </div>
        ) : loading ? <div className="lv-sh-loading">Running LAND VIEW system checks…</div> : null}
        {error ? <div className="lv-sh-error">System health check failed: {error}</div> : null}
      </div>
    </section>
  );
}
