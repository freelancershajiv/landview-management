"use client";

import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;

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

function dateLabel(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "Date not set";
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function closed(row: Row) {
  if (row.is_closed === true) return true;
  return ["completed", "cancelled", "canceled", "closed", "done"].includes(String(row.status || row.Status || "").trim().toLowerCase());
}

async function loadTasks() {
  const response = await fetch("/api/task-center", {
    credentials: "same-origin",
    cache: "no-store",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load Site Visit assignments."));
  return json.data;
}

export default function EmployeeSiteVisitAssignments() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const next = await loadTasks();
        if (!cancelled) setData(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load assigned Site Visits.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const today = localDhakaDate(0);
  const rows = useMemo(() => {
    const tasks: Row[] = data?.tasks || [];
    return tasks
      .filter((row) => String(row.task_type || "").trim().toLowerCase() === "site visit" && !closed(row) && String(row.due_date || "").trim())
      .sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  }, [data]);
  const overdueRows = useMemo(() => rows.filter((row) => String(row.due_date) < today), [rows, today]);
  const todayRows = useMemo(() => rows.filter((row) => String(row.due_date) === today), [rows, today]);
  const upcomingRows = useMemo(() => rows.filter((row) => String(row.due_date) > today), [rows, today]);

  if (!loading && !error && !rows.length) return null;

  function visitCard(row: Row, showDate = false) {
    const projectName = text(row.project_name_snapshot || row.project_name, "Project name not set");
    const ownerName = text(row.project_owner_name, "Owner not set");
    const priority = text(row.priority, "Normal");
    return <div className="esva-card" key={row.task_code}>
      <div className="esva-card-main">
        {showDate && <span className="esva-visit-date">{dateLabel(row.due_date)}</span>}
        <strong>{text(row.project_code)} · {projectName}</strong>
        <span>Owner: {ownerName}</span>
        <span>{text(row.description, "No special instruction")}</span>
      </div>
      <span className={`esva-priority ${["high", "urgent"].includes(String(priority).toLowerCase()) ? "high" : ""}`}>{priority}</span>
    </div>;
  }

  return <section className="esva-shell">
    <style>{`
      .esva-shell{display:grid;gap:10px;margin:0;color:var(--theme-ink-_f5f5f5,var(--lv-text-primary))}.esva-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 17px;border:1px solid var(--theme-line-_303a44,var(--lv-border-default));border-radius:13px;background:linear-gradient(145deg,var(--theme-bg-_141b22,var(--lv-surface-panel)),var(--theme-bg-_0d1217,var(--lv-surface-muted)))}.esva-head small{display:block;color:#ff666c;font-size:8px;font-weight:950;letter-spacing:.15em;text-transform:uppercase}.esva-head h3{margin:5px 0 0;font-size:17px}.esva-head p{margin:5px 0 0;max-width:720px;font-size:9px;line-height:1.5;color:var(--theme-ink-_86929d,var(--lv-text-secondary))}.esva-count{flex:0 0 auto;display:grid;place-items:center;min-width:46px;height:46px;border-radius:12px;border:1px solid var(--theme-line-_34404a,var(--lv-border-default));background:var(--theme-bg-_0a1015,var(--lv-surface-input));font-size:17px;font-weight:950}.esva-error{padding:10px 12px;border-radius:8px;background:var(--lv-danger-soft);color:var(--lv-danger);font-size:9px}
      .esva-days{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.4fr);gap:10px}.esva-day{border:1px solid var(--theme-line-_2d3740,var(--lv-border-default));border-radius:12px;background:var(--theme-bg-_10161b,var(--lv-surface-panel));overflow:hidden}.esva-day.attention{border-color:color-mix(in srgb,var(--lv-danger) 40%,var(--lv-border-default))}.esva-day-title{padding:10px 12px;border-bottom:1px solid var(--theme-line-_29333c,var(--lv-border-default));font-size:8px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;color:var(--theme-ink-_aeb7bf,var(--lv-text-secondary))}.esva-list{display:grid}.esva-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:12px;border-top:1px solid var(--theme-line-_252e36,var(--lv-border-subtle))}.esva-card:first-child{border-top:0}.esva-card strong{display:block;font-size:10px;color:var(--theme-ink-_f3f5f6,var(--lv-text-strong))}.esva-card span{display:block;margin-top:4px;font-size:8px;line-height:1.45;color:var(--theme-ink-_818d98,var(--lv-text-secondary))}.esva-visit-date{margin:0 0 5px!important;color:var(--lv-brand-text)!important;font-size:7px!important;font-weight:950!important;letter-spacing:.06em;text-transform:uppercase}.esva-priority{align-self:start;padding:5px 7px;border-radius:999px;background:var(--theme-bg-_20272d,var(--lv-surface-muted));font-size:7px!important;font-weight:950!important;white-space:nowrap}.esva-priority.high{background:var(--lv-danger-soft);color:var(--lv-danger)!important}.esva-empty{padding:17px 12px;text-align:center;font-size:8px;color:var(--theme-ink-_77838d,var(--lv-text-muted))}.esva-loading{padding:14px;border:1px solid var(--theme-line-_303a44,var(--lv-border-default));border-radius:12px;font-size:9px;color:var(--theme-ink-_86929d,var(--lv-text-secondary))}.esva-overdue{border:1px solid color-mix(in srgb,var(--lv-danger) 35%,var(--lv-border-default));border-radius:12px;overflow:hidden;background:var(--lv-danger-soft)}.esva-overdue .esva-day-title{color:var(--lv-danger)}
      @media(max-width:760px){.esva-days{grid-template-columns:1fr}.esva-head{align-items:center}.esva-card{padding:11px}.esva-count{min-width:42px;height:42px}}
    `}</style>
    <div className="esva-head"><div><small>Assigned field work</small><h3>My Site Visit Schedule</h3><p>Today&apos;s visits and every future visit already scheduled by management appear here, with Project Name and Owner Name kept separate.</p></div><div className="esva-count">{rows.length}</div></div>
    {error && <div className="esva-error">{error}</div>}
    {loading ? <div className="esva-loading">Loading Site Visit schedule…</div> : <>
      {overdueRows.length > 0 && <div className="esva-overdue"><div className="esva-day-title">Overdue · needs attention</div><div className="esva-list">{overdueRows.map((row) => visitCard(row, true))}</div></div>}
      <div className="esva-days">
        <div className="esva-day"><div className="esva-day-title">Today · {dateLabel(today)}</div><div className="esva-list">{todayRows.map((row) => visitCard(row))}{!todayRows.length && <div className="esva-empty">No assigned Site Visits for today.</div>}</div></div>
        <div className="esva-day"><div className="esva-day-title">Upcoming · scheduled ahead</div><div className="esva-list">{upcomingRows.map((row) => visitCard(row, true))}{!upcomingRows.length && <div className="esva-empty">No future Site Visits are scheduled yet.</div>}</div></div>
      </div>
    </>}
  </section>;
}
