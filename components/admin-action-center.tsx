"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type AlertRow = {
  alert_key: string;
  category: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  href?: string | null;
  status: "open" | "acknowledged" | "resolved" | "dismissed";
  assigned_to?: string | null;
  metadata?: Record<string, unknown>;
  first_detected_at?: string;
  last_detected_at?: string;
};
type Data = {
  score: number;
  status: "healthy" | "warning" | "critical";
  counts: { critical: number; warning: number; info: number; acknowledged: number; total: number };
  alerts: AlertRow[];
  metrics?: Record<string, unknown>;
  generatedAt?: string;
};

const label = (value: unknown) => String(value ?? "").trim();

function relative(value?: string) {
  if (!value) return "now";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "now";
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export default function AdminActionCenter({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "info" | "acknowledged">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/action-center", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(String(payload?.error || "Could not load Action Required."));
      setData(payload.data || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Action Required.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const mutate = async (alertKey: string, operation: "acknowledge" | "resolve" | "dismiss") => {
    setBusy(alertKey + operation);
    setError("");
    try {
      const response = await fetch("/api/admin/action-center", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alertKey, operation }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(String(payload?.error || "Could not update alert."));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update alert.");
    } finally {
      setBusy("");
    }
  };

  const alerts = useMemo(() => {
    const rows = data?.alerts || [];
    const filtered = rows.filter((item) => filter === "all" ? true : filter === "acknowledged" ? item.status === "acknowledged" : item.severity === filter);
    const weight = { critical: 0, warning: 1, info: 2 } as const;
    return [...filtered].sort((a, b) => weight[a.severity] - weight[b.severity] || label(a.title).localeCompare(label(b.title)));
  }, [data, filter]);

  const visible = compact ? alerts.slice(0, 5) : alerts;
  const counts = data?.counts || { critical: 0, warning: 0, info: 0, acknowledged: 0, total: 0 };

  return (
    <section className={`lv-action-center ${compact ? "compact" : "full"}`}>
      <style>{`
        .lv-action-center{border:1px solid var(--lv-border);border-radius:16px;background:var(--lv-surface-1);color:var(--lv-text);overflow:hidden;box-shadow:var(--lv-shadow-sm)}
        .lv-action-center *{box-sizing:border-box}.lv-action-center a{text-decoration:none}.lv-action-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid var(--lv-border);background:linear-gradient(135deg,var(--lv-surface-1),var(--lv-surface-2))}.lv-action-kicker{display:block;color:var(--lv-accent);font-size:9px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.lv-action-head h2{margin:5px 0 4px;font-size:20px;color:var(--lv-text-strong)}.lv-action-head p{margin:0;max-width:650px;color:var(--lv-text-muted);font-size:10px;line-height:1.55}.lv-action-score{display:grid;place-items:center;min-width:68px;height:58px;border:1px solid var(--lv-border);border-radius:12px;background:var(--lv-surface-2)}.lv-action-score strong{font-size:20px;color:var(--lv-text-strong)}.lv-action-score small{font-size:8px;color:var(--lv-text-muted);text-transform:uppercase;font-weight:900}
        .lv-action-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;padding:12px 14px;border-bottom:1px solid var(--lv-border)}.lv-action-stat{min-width:0;padding:10px;border:1px solid var(--lv-border);border-radius:10px;background:var(--lv-surface-2);cursor:pointer;color:var(--lv-text);text-align:left}.lv-action-stat.active{border-color:var(--lv-accent)}.lv-action-stat small{display:block;color:var(--lv-text-muted);font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.lv-action-stat strong{display:block;margin-top:5px;font-size:16px}.lv-action-stat.critical strong{color:var(--lv-danger)}.lv-action-stat.warning strong{color:var(--lv-warning)}.lv-action-stat.info strong{color:var(--lv-info)}
        .lv-action-list{display:grid;gap:8px;padding:12px 14px}.lv-action-item{display:grid;grid-template-columns:6px minmax(0,1fr) auto;gap:11px;align-items:start;padding:12px;border:1px solid var(--lv-border);border-radius:11px;background:var(--lv-surface-2)}.lv-action-bar{width:6px;align-self:stretch;min-height:42px;border-radius:8px;background:var(--lv-info)}.lv-action-item.critical .lv-action-bar{background:var(--lv-danger)}.lv-action-item.warning .lv-action-bar{background:var(--lv-warning)}.lv-action-copy{min-width:0}.lv-action-meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:4px}.lv-action-chip{padding:3px 6px;border-radius:999px;border:1px solid var(--lv-border);color:var(--lv-text-muted);font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.lv-action-copy strong{display:block;color:var(--lv-text-strong);font-size:11px}.lv-action-copy p{margin:4px 0 0;color:var(--lv-text-muted);font-size:9px;line-height:1.45}.lv-action-buttons{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.lv-action-btn{min-height:32px;padding:0 9px;border:1px solid var(--lv-border);border-radius:7px;background:var(--lv-surface-1);color:var(--lv-text);font-size:8px;font-weight:900;cursor:pointer}.lv-action-btn:hover{border-color:var(--lv-accent)}.lv-action-btn.primary{border-color:var(--lv-accent);color:var(--lv-accent)}.lv-action-btn:disabled{opacity:.5;cursor:wait}.lv-action-empty,.lv-action-error{margin:12px 14px;padding:14px;border:1px dashed var(--lv-border);border-radius:10px;color:var(--lv-text-muted);font-size:10px}.lv-action-error{border-style:solid;border-color:color-mix(in srgb,var(--lv-danger) 45%,var(--lv-border));color:var(--lv-danger)}.lv-action-foot{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 14px;border-top:1px solid var(--lv-border);color:var(--lv-text-muted);font-size:8px}.lv-action-foot a,.lv-action-foot button{color:var(--lv-accent);font-weight:900;background:none;border:0;cursor:pointer;font-size:8px}.lv-action-center.compact{margin:14px 0}.lv-action-center.full{margin-bottom:24px}
        @media(max-width:760px){.lv-action-head{padding:15px;align-items:center}.lv-action-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.lv-action-stat:last-child{grid-column:1/-1}.lv-action-item{grid-template-columns:5px minmax(0,1fr)}.lv-action-buttons{grid-column:2;justify-content:flex-start}.lv-action-score{min-width:58px}.lv-action-center.compact .lv-action-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `}</style>

      <div className="lv-action-head">
        <div>
          <span className="lv-action-kicker">Organization Intelligence</span>
          <h2>Action Required</h2>
          <p>Live operational, client, delivery, communication and finance conditions that need management attention.</p>
        </div>
        <div className="lv-action-score"><strong>{data?.score ?? "—"}</strong><small>Health</small></div>
      </div>

      <div className="lv-action-summary">
        <button className={`lv-action-stat ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}><small>Open</small><strong>{counts.total}</strong></button>
        <button className={`lv-action-stat critical ${filter === "critical" ? "active" : ""}`} onClick={() => setFilter("critical")}><small>Critical</small><strong>{counts.critical}</strong></button>
        <button className={`lv-action-stat warning ${filter === "warning" ? "active" : ""}`} onClick={() => setFilter("warning")}><small>Warning</small><strong>{counts.warning}</strong></button>
        <button className={`lv-action-stat info ${filter === "info" ? "active" : ""}`} onClick={() => setFilter("info")}><small>Info</small><strong>{counts.info}</strong></button>
        <button className={`lv-action-stat ${filter === "acknowledged" ? "active" : ""}`} onClick={() => setFilter("acknowledged")}><small>Acknowledged</small><strong>{counts.acknowledged}</strong></button>
      </div>

      {error && <div className="lv-action-error">{error}</div>}
      {loading && !data ? <div className="lv-action-empty">Scanning LAND VIEW organization health…</div> : visible.length ? (
        <div className="lv-action-list">
          {visible.map((item) => {
            const isBusy = busy.startsWith(item.alert_key);
            return <article key={item.alert_key} className={`lv-action-item ${item.severity}`}>
              <span className="lv-action-bar" />
              <div className="lv-action-copy">
                <div className="lv-action-meta"><span className="lv-action-chip">{item.category}</span><span className="lv-action-chip">{item.severity}</span>{item.status === "acknowledged" && <span className="lv-action-chip">Acknowledged</span>}<span className="lv-action-chip">{relative(item.last_detected_at)}</span></div>
                <strong>{item.title}</strong><p>{item.detail}</p>
              </div>
              <div className="lv-action-buttons">
                {item.href && <Link className="lv-action-btn primary" href={item.href}>OPEN</Link>}
                {item.status !== "acknowledged" && <button className="lv-action-btn" disabled={isBusy} onClick={() => void mutate(item.alert_key, "acknowledge")}>ACKNOWLEDGE</button>}
                <button className="lv-action-btn" disabled={isBusy} onClick={() => void mutate(item.alert_key, "resolve")}>MARK HANDLED</button>
                {!compact && <button className="lv-action-btn" disabled={isBusy} onClick={() => void mutate(item.alert_key, "dismiss")}>DISMISS</button>}
              </div>
            </article>;
          })}
        </div>
      ) : <div className="lv-action-empty">No active items in this filter. LAND VIEW has nothing requiring action here right now.</div>}

      <div className="lv-action-foot">
        <span>{data?.generatedAt ? `Scanned ${new Date(data.generatedAt).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" })}` : "Live organization scan"}</span>
        {compact ? <Link href="/admin/action-center">OPEN FULL ACTION CENTER →</Link> : <button onClick={() => void load()}>RESCAN NOW</button>}
      </div>
    </section>
  );
}
