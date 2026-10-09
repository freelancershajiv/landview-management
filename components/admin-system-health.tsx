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
        .lv-system-health{margin:0 0 14px;color:var(--theme-ink-_eef2f5,#eef2f5)}
        .lv-system-health *{box-sizing:border-box}.lv-system-health a{text-decoration:none}
        .lv-sh-shell{border:1px solid var(--theme-line-_2d3841,#2d3841);border-radius:15px;background:linear-gradient(145deg,var(--theme-bg-_141b21,#141b21),var(--theme-bg-_0d1318,#0d1318));overflow:hidden;box-shadow:0 14px 34px rgba(0,0,0,.12)}
        .lv-sh-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;padding:18px 20px;border-bottom:1px solid var(--theme-line-_29343d,#29343d)}
        .lv-sh-eyebrow{display:block;color:#ef6e69;font-size:8px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.lv-sh-head h2{margin:6px 0 4px;font-size:18px;color:var(--theme-ink-_fff,#fff)}.lv-sh-head p{margin:0;color:var(--theme-ink-_84919b,#84919b);font-size:9.5px;line-height:1.5}.lv-sh-actions{display:flex;align-items:center;gap:8px}.lv-sh-refresh{height:36px;padding:0 12px;border:1px solid var(--theme-line-_3c4851,#3c4851);border-radius:8px;background:var(--theme-bg-_172029,#172029);color:var(--theme-ink-_eef2f5,#eef2f5);font-size:9px;font-weight:900;cursor:pointer}.lv-sh-refresh:disabled{opacity:.5;cursor:not-allowed}
        .lv-sh-body{display:grid;grid-template-columns:180px minmax(0,1fr);gap:0}.lv-sh-score{padding:18px;border-right:1px solid var(--theme-line-_29343d,#29343d);display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}.lv-sh-ring{--score:0;width:108px;height:108px;border-radius:50%;display:grid;place-items:center;position:relative;background:conic-gradient(#54c986 calc(var(--score)*1%),rgba(255,255,255,.07) 0)}.lv-sh-ring.watch{background:conic-gradient(#dda748 calc(var(--score)*1%),rgba(255,255,255,.07) 0)}.lv-sh-ring.bad{background:conic-gradient(#e05860 calc(var(--score)*1%),rgba(255,255,255,.07) 0)}.lv-sh-ring:after{content:"";position:absolute;inset:9px;border-radius:50%;background:var(--theme-bg-_10171d,#10171d)}.lv-sh-ring strong{position:relative;z-index:1;font-size:29px;color:#fff}.lv-sh-score b{margin-top:10px;font-size:11px;color:#fff}.lv-sh-score small{margin-top:4px;color:#7d8993;font-size:8px;line-height:1.4}
        .lv-sh-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0}.lv-sh-card{min-width:0;padding:15px;border-right:1px solid var(--theme-line-_29343d,#29343d);color:inherit;background:transparent}.lv-sh-card:last-child{border-right:0}.lv-sh-card:hover{background:rgba(255,255,255,.025)}.lv-sh-card-top{display:flex;justify-content:space-between;gap:6px;align-items:flex-start}.lv-sh-card-top span{font-size:8px;font-weight:900;text-transform:uppercase;color:#b5bec6;line-height:1.35}.lv-sh-pill{flex:0 0 auto;border-radius:999px;padding:4px 6px;font-size:7px!important;color:#90d5a8!important;background:#183225}.lv-sh-card.watch .lv-sh-pill{color:#efca78!important;background:#382d18}.lv-sh-card.bad .lv-sh-pill{color:#ff989b!important;background:#3c2023}.lv-sh-card strong{display:block;margin:12px 0 6px;font-size:15px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-sh-card p{margin:0;color:#78858f;font-size:8px;line-height:1.45;min-height:35px}.lv-sh-open{display:block;margin-top:10px;color:#ef7772;font-size:8px;font-weight:900}.lv-sh-error{padding:15px 18px;color:#ffaaa6;background:#321a1d;border-top:1px solid #6d3035;font-size:10px}.lv-sh-loading{padding:17px 20px;color:#87939d;font-size:10px}
        @media(max-width:1180px){.lv-sh-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.lv-sh-card{border-bottom:1px solid var(--theme-line-_29343d,#29343d)}.lv-sh-card:nth-child(3n){border-right:0}}
        @media(max-width:760px){.lv-sh-head{grid-template-columns:1fr;align-items:flex-start}.lv-sh-actions{justify-content:flex-start}.lv-sh-body{grid-template-columns:1fr}.lv-sh-score{border-right:0;border-bottom:1px solid var(--theme-line-_29343d,#29343d);flex-direction:row;justify-content:flex-start;gap:16px;text-align:left}.lv-sh-ring{width:78px;height:78px}.lv-sh-ring strong{font-size:22px}.lv-sh-grid{grid-template-columns:1fr 1fr}.lv-sh-card{border-right:1px solid var(--theme-line-_29343d,#29343d)}.lv-sh-card:nth-child(3n){border-right:1px solid var(--theme-line-_29343d,#29343d)}.lv-sh-card:nth-child(2n){border-right:0}}
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
            {generated ? <span style={{color:"#71808b",fontSize:8,fontWeight:800}}>Checked {generated}</span> : null}
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
