"use client";

import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
const EMPLOYEE_STATUSES = ["Pending", "In Progress", "Waiting", "Completed"];

function text(value: unknown, fallback = "—") { const v = String(value ?? "").trim(); return v || fallback; }
function dateText(value: unknown) { const raw = String(value || ""); if (!raw) return "—"; const d = new Date(`${raw}T00:00:00`); return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }

async function api(method: "GET" | "POST" = "GET", body?: Row) {
  const response = await fetch("/api/task-center", { method, credentials: "same-origin", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Task Center request failed."));
  return json.data;
}

export default function EmployeeTaskCenter() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState("Focus");

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try { setData(await api()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load assigned tasks."); }
    finally { if (!silent) setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function update(row: Row, changes: Row) {
    if (busy) return;
    setBusy(row.task_code); setError(""); setNotice("");
    try { await api("POST", { action: "updateTask", taskCode: row.task_code, ...changes }); setNotice(`${row.task_title} updated.`); await load(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Task update failed."); }
    finally { setBusy(""); }
  }

  function notes(row: Row) {
    const value = window.prompt("Work note / update", row.work_notes || "");
    if (value === null) return;
    void update(row, { workNotes: value });
  }

  const rows = useMemo(() => {
    const all: Row[] = data?.tasks || [];
    if (view === "Overdue") return all.filter((row) => row.is_overdue);
    if (view === "Today") return all.filter((row) => row.is_due_today);
    if (view === "Blocked") return all.filter((row) => row.is_blocked || text(row.status, "") === "Waiting");
    if (view === "Upcoming") return data?.buckets?.upcoming || [];
    if (view === "Completed") return all.filter((row) => row.is_closed);
    return all.filter((row) => !row.is_closed).sort((a, b) => Number(Boolean(b.is_overdue)) - Number(Boolean(a.is_overdue)) || String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
  }, [data, view]);

  if (loading) return <section className="etc-shell"><div className="etc-empty">Loading My Tasks…</div></section>;
  if (!data) return <section className="etc-shell"><div className="etc-error">{error || "Task Center unavailable."}</div></section>;
  const metrics = data.metrics || {};

  return <section className="etc-shell">
    <style>{`
      .etc-shell{margin:0 0 14px;border:1px solid var(--lv-border-default);border-radius:14px;background:var(--lv-surface-panel);overflow:hidden;box-shadow:var(--lv-shadow-sm);color:var(--lv-text-primary)}.etc-shell *{box-sizing:border-box}.etc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:15px 16px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default)}.etc-head h2{margin:0;font-size:15px;color:var(--lv-text-strong)}.etc-head p{margin:4px 0 0;font-size:8px;color:var(--lv-text-secondary)}.etc-id{padding:6px 8px;border-radius:999px;background:var(--lv-surface-input);font-size:8px;font-weight:900;color:var(--lv-brand-text)}
      .etc-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;padding:12px 14px}.etc-metric{padding:10px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-muted);cursor:pointer}.etc-metric span{display:block;font-size:7px;font-weight:900;text-transform:uppercase;color:var(--lv-text-muted)}.etc-metric strong{display:block;margin-top:4px;font-size:17px;color:var(--lv-text-strong)}.etc-metric.bad strong{color:var(--lv-danger)}.etc-metric.warn strong{color:var(--lv-warning)}
      .etc-tabs{display:flex;gap:5px;padding:0 14px 11px;overflow:auto}.etc-tabs button{border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);padding:7px 9px;font-size:7px;font-weight:900;color:var(--lv-text-secondary);cursor:pointer;white-space:nowrap}.etc-tabs button.active{background:var(--lv-brand-primary);color:var(--lv-text-inverse);border-color:var(--lv-brand-border)}
      .etc-msg{margin:0 14px 10px;padding:8px 9px;border-radius:7px;font-size:8px}.etc-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.etc-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}
      .etc-list{display:grid;border-top:1px solid var(--lv-border-default)}.etc-row{display:grid;grid-template-columns:minmax(0,1.4fr) 170px 120px 150px 120px;gap:10px;align-items:center;padding:11px 14px;border-bottom:1px solid var(--lv-border-subtle)}.etc-row:last-child{border-bottom:0}.etc-title strong{display:block;font-size:9px;color:var(--lv-text-strong)}.etc-title span{display:block;margin-top:4px;font-size:8px;line-height:1.4;color:var(--lv-text-secondary)}.etc-meta{font-size:8px;color:var(--lv-text-secondary)}.etc-meta b{display:block;color:var(--lv-text-primary);font-size:8px}.etc-badge{display:inline-flex;margin-top:4px;padding:4px 6px;border-radius:999px;background:var(--lv-surface-muted);font-size:7px;font-weight:900;color:var(--lv-text-secondary)}.etc-badge.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.etc-badge.warn{background:var(--lv-warning-soft);color:var(--lv-warning)}.etc-badge.good{background:var(--lv-success-soft);color:var(--lv-success)}.etc-row select{width:100%;padding:7px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.etc-btn{padding:7px 8px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);font-size:7px;font-weight:900;color:var(--lv-text-primary);cursor:pointer}.etc-btn:disabled{opacity:.5}.etc-empty{padding:24px;text-align:center;font-size:9px;color:var(--lv-text-muted)}.etc-error{padding:12px;color:var(--lv-danger);font-size:9px}
      @media(max-width:900px){.etc-metrics{grid-template-columns:repeat(3,1fr)}.etc-row{grid-template-columns:1fr 1fr}.etc-title{grid-column:1/-1}}@media(max-width:560px){.etc-head{flex-direction:column}.etc-metrics{grid-template-columns:repeat(2,1fr)}.etc-row{grid-template-columns:1fr}.etc-title{grid-column:auto}}
    `}</style>
    <div className="etc-head"><div><h2>My Tasks</h2><p>Today, overdue work, upcoming deadlines and blockers assigned directly to you.</p></div><span className="etc-id">{text(data.employee?.employeeCode)} · {text(data.employee?.name)}</span></div>
    <div className="etc-metrics"><div className="etc-metric" onClick={() => setView("Focus")}><span>Open</span><strong>{metrics.open || 0}</strong></div><div className="etc-metric bad" onClick={() => setView("Overdue")}><span>Overdue</span><strong>{metrics.overdue || 0}</strong></div><div className="etc-metric warn" onClick={() => setView("Today")}><span>Due Today</span><strong>{data.buckets?.today?.length || 0}</strong></div><div className="etc-metric warn" onClick={() => setView("Blocked")}><span>Blocked / Waiting</span><strong>{metrics.blocked || 0}</strong></div><div className="etc-metric" onClick={() => setView("Completed")}><span>Completed</span><strong>{metrics.completed || 0}</strong></div></div>
    <div className="etc-tabs">{["Focus", "Today", "Overdue", "Upcoming", "Blocked", "Completed"].map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}</button>)}</div>
    {error && <div className="etc-msg bad">{error}</div>}{notice && <div className="etc-msg good">{notice}</div>}
    <div className="etc-list">{rows.map((row: Row) => <div className="etc-row" key={row.task_code}>
      <div className="etc-title"><strong>{text(row.task_title)}</strong><span>{text(row.project_code)} · {text(row.project_name_snapshot || row.project_name, "Project name not set")} · {text(row.lifecycle_stage, "General")}</span><span>Owner: {text(row.project_owner_name, "Owner not set")}</span>{row.dependency_blocked && <span className="etc-badge warn">Waiting for: {text(row.dependency_title)}</span>}{row.blocker_reason && <span className="etc-badge bad">Blocked: {row.blocker_reason}</span>}</div>
      <div className="etc-meta"><b>Deadline</b>{dateText(row.due_date)}<span className={`etc-badge ${row.is_overdue ? "bad" : row.is_due_today ? "warn" : ""}`}>{row.is_overdue ? "Overdue" : row.is_due_today ? "Due today" : text(row.priority, "Normal")}</span></div>
      <div className="etc-meta"><b>Progress</b>{Math.round(Number(row.progress || 0))}%</div>
      <select disabled={busy === row.task_code || row.is_blocked} value={text(row.status, "Pending")} onChange={(e) => void update(row, { status: e.target.value })}>{EMPLOYEE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
      <button className="etc-btn" disabled={busy === row.task_code} onClick={() => notes(row)}>Work Note</button>
    </div>)}{!rows.length && <div className="etc-empty">No tasks in this view.</div>}</div>
  </section>;
}
