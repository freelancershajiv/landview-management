"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
function text(value: unknown, fallback = "—") { const v = String(value ?? "").trim(); return v || fallback; }
function dateText(value: unknown) { const raw = String(value || ""); if (!raw) return "—"; const d = new Date(`${raw}T00:00:00`); return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }

async function api(method: "GET" | "POST" = "GET", body?: Row) {
  const response = await fetch("/api/task-center", { method, credentials: "same-origin", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Task Center request failed."));
  return json.data;
}

export default function AdminTaskResponsibilityCenter() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("Open");
  const [employeeFilter, setEmployeeFilter] = useState("All");

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try { setData(await api()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load responsibility dashboard."); }
    finally { if (!silent) setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function act(key: string, body: Row, success: string) {
    if (busy) return;
    setBusy(key); setError(""); setNotice("");
    try { await api("POST", body); setNotice(success); await load(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Task action failed."); }
    finally { setBusy(""); }
  }

  const rows = useMemo(() => {
    const all: Row[] = data?.tasks || [];
    return all.filter((row) => {
      if (employeeFilter !== "All" && text(row.assigned_employee_id, "") !== employeeFilter) return false;
      if (filter === "Open" && row.is_closed) return false;
      if (filter === "Overdue" && !row.is_overdue) return false;
      if (filter === "Blocked" && !row.is_blocked) return false;
      if (filter === "Unassigned" && (row.is_closed || row.assigned_employee_id)) return false;
      if (filter === "Completed" && !row.is_closed) return false;
      return true;
    }).slice(0, 300);
  }, [data, filter, employeeFilter]);

  const workload = useMemo(() => {
    const open: Row[] = (data?.tasks || []).filter((row: Row) => !row.is_closed && row.assigned_employee_id);
    const map = new Map<string, { employeeId: string; code: string; name: string; open: number; overdue: number; blocked: number }>();
    for (const row of open) {
      const key = text(row.assigned_employee_id, ""); if (!key) continue;
      const item = map.get(key) || { employeeId: key, code: text(row.employee_code), name: text(row.employee_name), open: 0, overdue: 0, blocked: 0 };
      item.open += 1; if (row.is_overdue) item.overdue += 1; if (row.is_blocked) item.blocked += 1; map.set(key, item);
    }
    return Array.from(map.values()).sort((a, b) => b.open - a.open).slice(0, 12);
  }, [data]);

  if (loading) return <section className="atr-shell"><div className="atr-empty">Loading responsibility dashboard…</div></section>;
  if (!data) return <section className="atr-shell"><div className="atr-error">{error || "Responsibility dashboard unavailable."}</div></section>;
  const m = data.metrics || {};

  return <section className="atr-shell">
    <style>{`
      .atr-shell{margin-bottom:14px;border:1px solid var(--lv-border-default);border-radius:14px;background:var(--lv-surface-panel);overflow:hidden;box-shadow:var(--lv-shadow-sm);color:var(--lv-text-primary)}.atr-shell *{box-sizing:border-box}.atr-head{padding:15px 16px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default)}.atr-head h2{margin:0;font-size:15px;color:var(--lv-text-strong)}.atr-head p{margin:4px 0 0;font-size:8px;color:var(--lv-text-secondary)}
      .atr-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:12px 14px}.atr-metric{padding:11px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-muted);cursor:pointer}.atr-metric span{display:block;font-size:7px;font-weight:900;color:var(--lv-text-muted);text-transform:uppercase}.atr-metric strong{display:block;margin-top:5px;font-size:18px;color:var(--lv-text-strong)}.atr-metric.bad strong{color:var(--lv-danger)}.atr-metric.warn strong{color:var(--lv-warning)}
      .atr-body{display:grid;grid-template-columns:310px minmax(0,1fr);border-top:1px solid var(--lv-border-default)}.atr-workload{padding:12px;border-right:1px solid var(--lv-border-default)}.atr-workload h3{margin:0 0 9px;font-size:10px}.atr-person{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:8px 0;border-bottom:1px solid var(--lv-border-subtle)}.atr-person strong{font-size:8px}.atr-person span{display:block;margin-top:3px;font-size:7px;color:var(--lv-text-muted)}.atr-count{font-size:8px;font-weight:900;color:var(--lv-brand-text)}
      .atr-main{min-width:0}.atr-toolbar{display:flex;gap:7px;align-items:center;padding:10px;border-bottom:1px solid var(--lv-border-default);overflow:auto}.atr-toolbar select{padding:7px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.atr-toolbar small{margin-left:auto;font-size:7px;color:var(--lv-text-muted);white-space:nowrap}.atr-table-wrap{overflow:auto}.atr-table{width:100%;min-width:940px;border-collapse:collapse}.atr-table th{padding:8px 9px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default);font-size:7px;text-transform:uppercase;color:var(--lv-text-muted);text-align:left}.atr-table td{padding:9px;border-bottom:1px solid var(--lv-border-subtle);font-size:8px;vertical-align:top}.atr-title strong{display:block;font-size:9px}.atr-title span{display:block;margin-top:3px;color:var(--lv-text-secondary)}.atr-table select{max-width:160px;padding:6px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.atr-badge{display:inline-flex;padding:4px 6px;border-radius:999px;background:var(--lv-surface-muted);font-size:7px;font-weight:900}.atr-badge.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.atr-badge.warn{background:var(--lv-warning-soft);color:var(--lv-warning)}.atr-badge.good{background:var(--lv-success-soft);color:var(--lv-success)}.atr-link{color:var(--lv-brand-text);font-weight:900;text-decoration:none}.atr-msg{margin:10px 14px 0;padding:8px;border-radius:7px;font-size:8px}.atr-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.atr-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.atr-empty{padding:22px;text-align:center;font-size:9px;color:var(--lv-text-muted)}.atr-error{padding:12px;color:var(--lv-danger)}
      @media(max-width:1050px){.atr-metrics{grid-template-columns:repeat(3,1fr)}.atr-body{grid-template-columns:1fr}.atr-workload{border-right:0;border-bottom:1px solid var(--lv-border-default)}}@media(max-width:560px){.atr-metrics{grid-template-columns:repeat(2,1fr)}}
    `}</style>
    <div className="atr-head"><h2>Responsibility & Deadline Control</h2><p>Organization-wide view of assigned work, overdue deadlines, blockers and unassigned responsibilities.</p></div>
    <div className="atr-metrics"><div className="atr-metric" onClick={() => setFilter("Open")}><span>Open</span><strong>{m.open || 0}</strong></div><div className="atr-metric"><span>Required Open</span><strong>{m.requiredOpen || 0}</strong></div><div className="atr-metric bad" onClick={() => setFilter("Overdue")}><span>Overdue</span><strong>{m.overdue || 0}</strong></div><div className="atr-metric warn" onClick={() => setFilter("Blocked")}><span>Blocked</span><strong>{m.blocked || 0}</strong></div><div className="atr-metric warn" onClick={() => setFilter("Unassigned")}><span>Unassigned</span><strong>{m.unassigned || 0}</strong></div><div className="atr-metric" onClick={() => setFilter("Completed")}><span>Completed</span><strong>{m.completed || 0}</strong></div></div>
    {error && <div className="atr-msg bad">{error}</div>}{notice && <div className="atr-msg good">{notice}</div>}
    <div className="atr-body"><aside className="atr-workload"><h3>Employee Workload</h3>{workload.map((item) => <div className="atr-person" key={item.employeeId}><div><strong>{item.code} · {item.name}</strong><span>{item.overdue} overdue · {item.blocked} blocked</span></div><div className="atr-count">{item.open} open</div></div>)}{!workload.length && <div className="atr-empty">No assigned open tasks.</div>}</aside><div className="atr-main">
      <div className="atr-toolbar"><select value={filter} onChange={(e) => setFilter(e.target.value)}>{["Open", "All", "Overdue", "Blocked", "Unassigned", "Completed"].map((v) => <option key={v}>{v}</option>)}</select><select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}><option>All</option>{(data.employees || []).map((employee: Row) => <option key={employee.id} value={employee.id}>{employee.employeeCode} · {employee.name}</option>)}</select><small>{rows.length} task(s)</small></div>
      <div className="atr-table-wrap"><table className="atr-table"><thead><tr><th>Project</th><th>Task</th><th>Stage</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>{rows.map((row: Row) => <tr key={row.task_code}><td><Link className="atr-link" href={`/admin/projects/${encodeURIComponent(row.project_code)}/lifecycle`}>{text(row.project_code)}</Link><div>{text(row.project_name)}</div></td><td className="atr-title"><strong>{text(row.task_title)}</strong><span>{text(row.source_service, row.task_type)}{row.is_required ? " · Required" : ""}</span></td><td>{text(row.lifecycle_stage, "General")}</td><td><select disabled={Boolean(busy)} value={row.assigned_employee_id || ""} onChange={(e) => void act(`assign-${row.task_code}`, { action: "assignTask", taskCode: row.task_code, assignedEmployeeId: e.target.value }, `${row.task_title} assignment updated.`)}><option value="">Unassigned</option>{(data.employees || []).map((employee: Row) => <option key={employee.id} value={employee.id}>{employee.employeeCode} · {employee.name}</option>)}</select></td><td>{dateText(row.due_date)}<div style={{marginTop:4}}>{row.is_overdue && <span className="atr-badge bad">Overdue</span>}{row.is_due_today && <span className="atr-badge warn">Today</span>}{row.is_blocked && <span className="atr-badge bad">Blocked</span>}</div></td><td><span className={`atr-badge ${row.is_closed ? "good" : row.is_blocked ? "bad" : ""}`}>{text(row.status, "Pending")}</span></td></tr>)}{!rows.length && <tr><td colSpan={6}><div className="atr-empty">No tasks match this view.</div></td></tr>}</tbody></table></div>
    </div></div>
  </section>;
}
