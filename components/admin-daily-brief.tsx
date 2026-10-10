"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Brief = {
  dateLabel?: string;
  finance?: { received?: number; spent?: number; netMovement?: number };
  operations?: { newSiteEntries?: number; proposals?: number; siteVisits?: number; projectStageChanges?: number; tasksDue?: number; websiteEnquiries?: number };
  actionCenter?: { score?: number; status?: string; counts?: { total?: number; critical?: number; warning?: number } };
  message?: string;
  generatedAt?: string;
};
const money = (value: unknown) => `৳${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

export default function AdminDailyBrief() {
  const [data, setData] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/daily-brief", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(String(payload?.error || "Could not load daily brief."));
      setData(payload.data || null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load daily brief."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const copy = async () => {
    if (!data?.message) return;
    try { await navigator.clipboard.writeText(data.message); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError("Could not copy the brief from this browser."); }
  };

  if (loading && !data) return <div className="lv-daily-loading">Preparing today&apos;s management brief…</div>;

  const ops = data?.operations || {};
  const finance = data?.finance || {};
  const counts = data?.actionCenter?.counts || {};
  return <section className="lv-daily-brief">
    <style>{`
      .lv-daily-brief{margin:14px 0;border:1px solid var(--lv-border,#d7dde3);border-radius:15px;background:var(--lv-surface,#fff);color:var(--lv-text-primary,#18222c);overflow:hidden;box-shadow:var(--lv-shadow-sm,0 8px 24px rgba(0,0,0,.06))}.lv-daily-brief *{box-sizing:border-box}.lv-daily-head{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:16px 18px;border-bottom:1px solid var(--lv-border,#d7dde3);background:var(--lv-surface-muted,#f6f8fa)}.lv-daily-kicker{display:block;color:var(--lv-action-text,#c71f26);font-size:8px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.lv-daily-head h2{margin:4px 0 2px;font-size:18px}.lv-daily-head p{margin:0;color:var(--lv-text-muted,#66727d);font-size:9px}.lv-daily-actions{display:flex;gap:7px;flex-wrap:wrap}.lv-daily-actions button,.lv-daily-actions a{min-height:34px;display:inline-flex;align-items:center;padding:0 10px;border:1px solid var(--lv-border,#d7dde3);border-radius:8px;background:var(--lv-surface,#fff);color:var(--lv-text-primary,#18222c);font-size:8px;font-weight:900;text-decoration:none;cursor:pointer}.lv-daily-actions .primary{border-color:var(--lv-action-primary-border,#d61f26);color:var(--lv-action-text,#c71f26)}.lv-daily-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px 14px}.lv-daily-card{padding:12px;border:1px solid var(--lv-border,#d7dde3);border-radius:10px;background:var(--lv-surface-muted,#f6f8fa)}.lv-daily-card small{display:block;color:var(--lv-text-muted,#66727d);font-size:8px;font-weight:900;text-transform:uppercase}.lv-daily-card strong{display:block;margin-top:6px;font-size:16px}.lv-daily-card.net strong{color:${Number(finance.netMovement || 0) < 0 ? "var(--lv-danger,#d83a42)" : "var(--lv-success,#268454)"}}.lv-daily-ops{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;padding:0 14px 14px}.lv-daily-op{padding:10px;border:1px solid var(--lv-border,#d7dde3);border-radius:9px;background:var(--lv-surface,#fff);text-align:center}.lv-daily-op strong{display:block;font-size:15px}.lv-daily-op span{display:block;margin-top:4px;color:var(--lv-text-muted,#66727d);font-size:7.5px;font-weight:800;line-height:1.25}.lv-daily-foot{display:flex;justify-content:space-between;gap:10px;padding:10px 14px;border-top:1px solid var(--lv-border,#d7dde3);color:var(--lv-text-muted,#66727d);font-size:8px}.lv-daily-health{font-weight:900}.lv-daily-health.critical{color:var(--lv-danger,#d83a42)}.lv-daily-health.warning{color:var(--lv-warning,#b57a12)}.lv-daily-health.healthy{color:var(--lv-success,#268454)}.lv-daily-error,.lv-daily-loading{margin:14px 0;padding:14px;border:1px solid var(--lv-border,#d7dde3);border-radius:12px;color:var(--lv-text-muted,#66727d);background:var(--lv-surface,#fff);font-size:10px}.lv-daily-error{color:var(--lv-danger,#d83a42)}@media(max-width:760px){.lv-daily-head{align-items:flex-start;flex-direction:column}.lv-daily-grid{grid-template-columns:1fr}.lv-daily-ops{grid-template-columns:repeat(2,minmax(0,1fr))}.lv-daily-actions{width:100%}.lv-daily-actions button,.lv-daily-actions a{flex:1;justify-content:center}}
    `}</style>
    <div className="lv-daily-head"><div><span className="lv-daily-kicker">Management Intelligence · Today</span><h2>Daily Management Brief</h2><p>{data?.dateLabel || "Today"}</p></div><div className="lv-daily-actions"><button className="primary" onClick={() => void copy()}>{copied ? "COPIED ✓" : "COPY WHATSAPP BRIEF"}</button><Link href="/admin/action-center">ACTION CENTER</Link><button onClick={() => void load()}>REFRESH</button></div></div>
    {error && <div className="lv-daily-error">{error}</div>}
    <div className="lv-daily-grid"><div className="lv-daily-card"><small>Received Today</small><strong>{money(finance.received)}</strong></div><div className="lv-daily-card"><small>Expenses Today</small><strong>{money(finance.spent)}</strong></div><div className="lv-daily-card net"><small>Net Movement</small><strong>{money(finance.netMovement)}</strong></div></div>
    <div className="lv-daily-ops">
      <div className="lv-daily-op"><strong>{ops.newSiteEntries || 0}</strong><span>New Sites</span></div><div className="lv-daily-op"><strong>{ops.proposals || 0}</strong><span>Proposals</span></div><div className="lv-daily-op"><strong>{ops.siteVisits || 0}</strong><span>Site Visits</span></div><div className="lv-daily-op"><strong>{ops.projectStageChanges || 0}</strong><span>Stage Changes</span></div><div className="lv-daily-op"><strong>{ops.tasksDue || 0}</strong><span>Tasks Due</span></div><div className="lv-daily-op"><strong>{ops.websiteEnquiries || 0}</strong><span>New Enquiries</span></div>
    </div>
    <div className="lv-daily-foot"><span className={`lv-daily-health ${data?.actionCenter?.status || "healthy"}`}>Organization health {data?.actionCenter?.score ?? "—"}/100 · {counts.total || 0} action item(s) · {counts.critical || 0} critical</span><span>{data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString("en-BD", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" }) : "Live"}</span></div>
  </section>;
}
