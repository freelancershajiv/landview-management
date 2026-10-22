"use client";

import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;

type DayData = {
  date: string;
  assignments: Row[];
};

function text(value: unknown, fallback = "—") {
  const valueText = String(value ?? "").trim();
  return valueText || fallback;
}

function localDhakaDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value || 0);
  const month = Number(parts.find((part) => part.type === "month")?.value || 1);
  const day = Number(parts.find((part) => part.type === "day")?.value || 1);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}

function dayLabel(value: string, prefix: string) {
  const date = new Date(`${value}T00:00:00`);
  const formatted = Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short" });
  return `${prefix} · ${formatted}`;
}

async function getDay(date: string): Promise<DayData> {
  const response = await fetch(`/api/site-visit-assignments?date=${encodeURIComponent(date)}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load Site Visit assignments."));
  return json.data as DayData;
}

function closed(status: unknown) {
  return ["completed", "cancelled", "canceled", "closed", "done"].includes(String(status || "").trim().toLowerCase());
}

export default function EmployeeSiteVisitAssignments() {
  const [today, setToday] = useState<DayData | null>(null);
  const [tomorrow, setTomorrow] = useState<DayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [todayData, tomorrowData] = await Promise.all([getDay(localDhakaDate(0)), getDay(localDhakaDate(1))]);
        if (!cancelled) {
          setToday(todayData);
          setTomorrow(tomorrowData);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load assigned Site Visits.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const todayRows = useMemo(() => (today?.assignments || []).filter((row) => !closed(row.Status)), [today]);
  const tomorrowRows = useMemo(() => (tomorrow?.assignments || []).filter((row) => !closed(row.Status)), [tomorrow]);
  if (!loading && !error && !todayRows.length && !tomorrowRows.length) return null;

  return <section className="esva-shell">
    <style>{`
      .esva-shell{display:grid;gap:10px;margin:0 0 14px;color:var(--theme-ink-_f5f5f5,var(--lv-text-primary))}.esva-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:15px 17px;border:1px solid var(--theme-line-_303a44,var(--lv-border-default));border-radius:13px;background:linear-gradient(145deg,var(--theme-bg-_141b22,var(--lv-surface-panel)),var(--theme-bg-_0d1217,var(--lv-surface-muted)))}.esva-head small{display:block;color:#ff666c;font-size:8px;font-weight:950;letter-spacing:.15em;text-transform:uppercase}.esva-head h3{margin:5px 0 0;font-size:17px}.esva-head p{margin:5px 0 0;font-size:9px;line-height:1.5;color:var(--theme-ink-_86929d,var(--lv-text-secondary))}.esva-count{flex:0 0 auto;display:grid;place-items:center;min-width:44px;height:44px;border-radius:12px;border:1px solid var(--theme-line-_34404a,var(--lv-border-default));background:var(--theme-bg-_0a1015,var(--lv-surface-input));font-size:17px;font-weight:950}.esva-error{padding:10px 12px;border-radius:8px;background:var(--lv-danger-soft);color:var(--lv-danger);font-size:9px}
      .esva-days{display:grid;grid-template-columns:1fr 1fr;gap:10px}.esva-day{border:1px solid var(--theme-line-_2d3740,var(--lv-border-default));border-radius:12px;background:var(--theme-bg-_10161b,var(--lv-surface-panel));overflow:hidden}.esva-day-title{padding:10px 12px;border-bottom:1px solid var(--theme-line-_29333c,var(--lv-border-default));font-size:8px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;color:var(--theme-ink-_aeb7bf,var(--lv-text-secondary))}.esva-list{display:grid}.esva-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:12px;border-top:1px solid var(--theme-line-_252e36,var(--lv-border-subtle))}.esva-card:first-child{border-top:0}.esva-card strong{display:block;font-size:10px;color:var(--theme-ink-_f3f5f6,var(--lv-text-strong))}.esva-card span{display:block;margin-top:4px;font-size:8px;line-height:1.45;color:var(--theme-ink-_818d98,var(--lv-text-secondary))}.esva-priority{align-self:start;padding:5px 7px;border-radius:999px;background:var(--theme-bg-_20272d,var(--lv-surface-muted));font-size:7px!important;font-weight:950!important;white-space:nowrap}.esva-priority.high{background:var(--lv-danger-soft);color:var(--lv-danger)!important}.esva-empty{padding:16px 12px;text-align:center;font-size:8px;color:var(--theme-ink-_77838d,var(--lv-text-muted))}.esva-loading{padding:14px;border:1px solid var(--theme-line-_303a44,var(--lv-border-default));border-radius:12px;font-size:9px;color:var(--theme-ink-_86929d,var(--lv-text-secondary))}
      @media(max-width:760px){.esva-days{grid-template-columns:1fr}.esva-head{align-items:center}}
    `}</style>
    <div className="esva-head"><div><small>Assigned field work</small><h3>My Site Visit Plan</h3><p>Management-assigned visits appear here. Submit the matching Site Visit with GPS verification to complete the task automatically.</p></div><div className="esva-count">{todayRows.length + tomorrowRows.length}</div></div>
    {error && <div className="esva-error">{error}</div>}
    {loading ? <div className="esva-loading">Loading Site Visit assignments…</div> : <div className="esva-days">
      <div className="esva-day"><div className="esva-day-title">{dayLabel(today?.date || localDhakaDate(0), "Today")}</div><div className="esva-list">{todayRows.map((row) => <div className="esva-card" key={row.Task_Code}><div><strong>{text(row.Project_ID)} · {text(row.Project_Name)}</strong><span>{text(row.Location, "Location not listed")}</span><span>{text(row.Instructions, "No special instruction")}</span></div><span className={`esva-priority ${["high", "urgent"].includes(String(row.Priority || "").toLowerCase()) ? "high" : ""}`}>{text(row.Priority, "Normal")}</span></div>)}{!todayRows.length && <div className="esva-empty">No assigned Site Visits for today.</div>}</div></div>
      <div className="esva-day"><div className="esva-day-title">{dayLabel(tomorrow?.date || localDhakaDate(1), "Tomorrow")}</div><div className="esva-list">{tomorrowRows.map((row) => <div className="esva-card" key={row.Task_Code}><div><strong>{text(row.Project_ID)} · {text(row.Project_Name)}</strong><span>{text(row.Location, "Location not listed")}</span><span>{text(row.Instructions, "No special instruction")}</span></div><span className={`esva-priority ${["high", "urgent"].includes(String(row.Priority || "").toLowerCase()) ? "high" : ""}`}>{text(row.Priority, "Normal")}</span></div>)}{!tomorrowRows.length && <div className="esva-empty">No assigned Site Visits for tomorrow yet.</div>}</div></div>
    </div>}
  </section>;
}
