"use client";

import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;

type AssignmentData = {
  date: string;
  today: string;
  tomorrow: string;
  assignments: Row[];
  employees: Row[];
  projects: Row[];
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

function dateLabel(value: string) {
  if (!value) return "Select date";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
}

function isClosed(status: unknown) {
  return ["completed", "cancelled", "canceled", "closed", "done"].includes(String(status || "").trim().toLowerCase());
}

async function getAssignments(date: string) {
  const response = await fetch(`/api/site-visit-assignments?date=${encodeURIComponent(date)}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Site Visit assignment request failed."));
  return json.data;
}

async function postAssignment(body: Row) {
  const response = await fetch("/api/site-visit-assignments", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Site Visit assignment request failed."));
  return json.data;
}

export default function SiteVisitAssignmentsAdmin() {
  const [data, setData] = useState<AssignmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [visitDate, setVisitDate] = useState(() => localDhakaDate(1));
  const [employeeId, setEmployeeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [instructions, setInstructions] = useState("");

  async function load(date = visitDate, silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const next = await getAssignments(date);
      setData(next);
      setEmployeeId((current) => current || String(next?.employees?.[0]?.id || ""));
      setProjectId((current) => current || String(next?.projects?.[0]?.id || ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Site Visit assignments.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { void load(visitDate); }, [visitDate]);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await postAssignment({ action: "create", employeeId, projectId, visitDate, priority, instructions });
      setNotice(`Site Visit assigned for ${dateLabel(visitDate)}.`);
      setInstructions("");
      setPriority("Normal");
      await load(visitDate, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign Site Visit.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(row: Row) {
    const code = String(row.Task_Code || "");
    if (!code || busy) return;
    const rowDate = String(row.Visit_Date || visitDate);
    if (!window.confirm(`Cancel ${text(row.Employee_Name)}'s Site Visit to ${text(row.Project_ID)} on ${dateLabel(rowDate)}?`)) return;
    setBusy(code);
    setError("");
    setNotice("");
    try {
      await postAssignment({ action: "cancel", taskCode: code, reason: `Cancelled from Site Visit schedule for ${rowDate}.` });
      setNotice("Site Visit assignment cancelled.");
      await load(visitDate, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel assignment.");
    } finally {
      setBusy("");
    }
  }

  const assignments = data?.assignments || [];
  const openAssignments = useMemo(() => assignments.filter((row) => !isClosed(row.Status)), [assignments]);
  const uniqueEmployees = new Set(openAssignments.map((row) => String(row.Employee_ID || "")).filter(Boolean)).size;
  const urgent = openAssignments.filter((row) => ["urgent", "high"].includes(String(row.Priority || "").toLowerCase())).length;

  return <section className="sva-shell">
    <style>{`
      .sva-shell{margin:0 0 16px;border:1px solid var(--lv-border-default);border-radius:16px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm);overflow:hidden;color:var(--lv-text-primary)}
      .sva-shell *{box-sizing:border-box}.sva-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:18px 20px;border-bottom:1px solid var(--lv-border-default);background:linear-gradient(135deg,var(--lv-surface-panel),var(--lv-surface-muted))}.sva-kicker{font-size:8px;font-weight:950;letter-spacing:.16em;text-transform:uppercase;color:var(--lv-brand-text)}.sva-head h2{margin:5px 0 0;font-size:20px;color:var(--lv-text-strong)}.sva-head p{margin:6px 0 0;max-width:680px;font-size:9px;line-height:1.55;color:var(--lv-text-secondary)}.sva-date-control{flex:0 0 auto;display:grid;gap:5px;min-width:190px}.sva-date-control span{font-size:7px;font-weight:950;letter-spacing:.1em;text-transform:uppercase;color:var(--lv-text-muted)}.sva-date-control input{width:100%;min-height:38px;padding:7px 9px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:10px;font-weight:850;outline:none}.sva-date-control input:focus{border-color:var(--lv-brand-border);box-shadow:0 0 0 3px var(--lv-brand-soft)}.sva-date-label{font-size:8px;color:var(--lv-text-secondary);line-height:1.35}
      .sva-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px 16px 0}.sva-stat{padding:11px 12px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-muted)}.sva-stat span{display:block;font-size:7px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--lv-text-muted)}.sva-stat strong{display:block;margin-top:4px;font-size:18px;color:var(--lv-text-strong)}
      .sva-msg{margin:12px 16px 0;padding:9px 11px;border-radius:8px;font-size:9px}.sva-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.sva-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}
      .sva-form{display:grid;grid-template-columns:minmax(170px,1fr) minmax(220px,1.4fr) 130px minmax(230px,1.4fr) auto;gap:9px;align-items:end;padding:14px 16px}.sva-field{display:grid;gap:5px}.sva-field span{font-size:7px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--lv-text-muted)}.sva-field select,.sva-field input{width:100%;min-height:40px;padding:8px 10px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:10px;outline:none}.sva-field select:focus,.sva-field input:focus{border-color:var(--lv-brand-border);box-shadow:0 0 0 3px var(--lv-brand-soft)}.sva-assign{min-height:40px;padding:0 14px;border:1px solid var(--lv-brand-border);border-radius:8px;background:var(--lv-brand-primary);color:var(--lv-text-inverse);font-size:9px;font-weight:950;cursor:pointer;white-space:nowrap}.sva-assign:disabled{opacity:.55;cursor:not-allowed}
      .sva-list{border-top:1px solid var(--lv-border-default)}.sva-list-head{display:grid;grid-template-columns:150px minmax(190px,1.3fr) minmax(150px,.8fr) 105px 110px 72px;gap:10px;padding:9px 16px;background:var(--lv-surface-muted);font-size:7px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;color:var(--lv-text-muted)}.sva-row{display:grid;grid-template-columns:150px minmax(190px,1.3fr) minmax(150px,.8fr) 105px 110px 72px;gap:10px;align-items:center;padding:11px 16px;border-top:1px solid var(--lv-border-subtle);font-size:9px}.sva-person strong,.sva-project strong{display:block;color:var(--lv-text-strong);font-size:9px}.sva-person span,.sva-project span,.sva-note{display:block;margin-top:3px;color:var(--lv-text-secondary);font-size:8px;line-height:1.4}.sva-badge{display:inline-flex;padding:5px 7px;border-radius:999px;background:var(--lv-surface-muted);font-size:7px;font-weight:950;color:var(--lv-text-secondary)}.sva-badge.urgent{background:var(--lv-danger-soft);color:var(--lv-danger)}.sva-badge.done{background:var(--lv-success-soft);color:var(--lv-success)}.sva-badge.cancelled{background:var(--lv-surface-muted);color:var(--lv-text-muted)}.sva-cancel{border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);padding:7px 8px;font-size:7px;font-weight:900;color:var(--lv-danger);cursor:pointer}.sva-cancel:disabled{opacity:.45}.sva-empty{padding:24px 16px;text-align:center;color:var(--lv-text-muted);font-size:9px}
      @media(max-width:1100px){.sva-form{grid-template-columns:1fr 1fr 130px}.sva-field.instructions{grid-column:1/3}.sva-assign{grid-column:3}.sva-list-head{display:none}.sva-row{grid-template-columns:1fr 1fr 110px}.sva-row>*:nth-child(3),.sva-row>*:nth-child(4),.sva-row>*:nth-child(5){align-self:start}}
      @media(max-width:700px){.sva-head{flex-direction:column}.sva-date-control{width:100%;min-width:0}.sva-stats{grid-template-columns:repeat(3,1fr)}.sva-form{grid-template-columns:1fr}.sva-field.instructions,.sva-assign{grid-column:auto}.sva-row{grid-template-columns:1fr 1fr}.sva-row .sva-person,.sva-row .sva-project{grid-column:1/-1}.sva-row button{justify-self:start}}
    `}</style>

    <div className="sva-head">
      <div><div className="sva-kicker">Visit planning</div><h2>Site Visit Schedule</h2><p>Choose any upcoming date and assign supervision visits in advance. Project Name and Owner Name stay separate so the correct site is easy to identify.</p></div>
      <label className="sva-date-control"><span>Visit Date</span><input type="date" min={localDhakaDate(0)} value={visitDate} onChange={(e) => { setNotice(""); setVisitDate(e.target.value || localDhakaDate(1)); }} /><div className="sva-date-label">{dateLabel(visitDate)}</div></label>
    </div>

    <div className="sva-stats">
      <div className="sva-stat"><span>Assigned visits</span><strong>{openAssignments.length}</strong></div>
      <div className="sva-stat"><span>Employees scheduled</span><strong>{uniqueEmployees}</strong></div>
      <div className="sva-stat"><span>High / urgent</span><strong>{urgent}</strong></div>
    </div>

    {error && <div className="sva-msg bad">{error}</div>}
    {notice && <div className="sva-msg good">{notice}</div>}

    <form className="sva-form" onSubmit={assign}>
      <label className="sva-field"><span>Employee</span><select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required disabled={loading || saving}><option value="">Select employee</option>{(data?.employees || []).map((row) => <option key={row.id} value={row.id}>{text(row.Employee_ID, "")} · {text(row.Employee_Name, "")}{row.Designation ? ` · ${row.Designation}` : ""}</option>)}</select></label>
      <label className="sva-field"><span>Project</span><select value={projectId} onChange={(e) => setProjectId(e.target.value)} required disabled={loading || saving}><option value="">Select supervision project</option>{(data?.projects || []).map((row) => <option key={row.id} value={row.id}>{text(row.Project_ID, "")} · {text(row.Project_Name, "Project name not set")} · Owner: {text(row.Owner_Name, "Owner not set")}</option>)}</select></label>
      <label className="sva-field"><span>Priority</span><select value={priority} onChange={(e) => setPriority(e.target.value)} disabled={saving}>{["Normal", "High", "Urgent", "Low"].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="sva-field instructions"><span>Instructions</span><input value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={1800} placeholder="What should the engineer inspect or follow up?" disabled={saving} /></label>
      <button className="sva-assign" type="submit" disabled={loading || saving || !visitDate || !employeeId || !projectId}>{saving ? "Assigning…" : "Assign Visit"}</button>
    </form>

    <div className="sva-list">
      <div className="sva-list-head"><span>Employee</span><span>Project</span><span>Instructions</span><span>Priority</span><span>Status</span><span>Action</span></div>
      {assignments.map((row) => {
        const status = String(row.Status || "Pending");
        const closed = isClosed(status);
        return <div className="sva-row" key={row.Task_Code}>
          <div className="sva-person"><strong>{text(row.Employee_Name)}</strong><span>{text(row.Employee_ID)}</span></div>
          <div className="sva-project"><strong>{text(row.Project_ID)} · {text(row.Project_Name, "Project name not set")}</strong><span>Owner: {text(row.Owner_Name, "Owner not set")}</span><span>{text(row.Location, "No location text")}</span></div>
          <div className="sva-note">{text(row.Instructions, "No special instruction")}</div>
          <div><span className={`sva-badge ${["urgent", "high"].includes(String(row.Priority || "").toLowerCase()) ? "urgent" : ""}`}>{text(row.Priority, "Normal")}</span></div>
          <div><span className={`sva-badge ${String(status).toLowerCase() === "completed" ? "done" : String(status).toLowerCase().includes("cancel") ? "cancelled" : ""}`}>{status}</span></div>
          <div>{!closed ? <button type="button" className="sva-cancel" disabled={busy === row.Task_Code} onClick={() => void cancel(row)}>{busy === row.Task_Code ? "…" : "Cancel"}</button> : ""}</div>
        </div>;
      })}
      {!loading && !assignments.length && <div className="sva-empty">No Site Visits are assigned for {dateLabel(visitDate)}.</div>}
      {loading && <div className="sva-empty">Loading schedule for {dateLabel(visitDate)}…</div>}
    </div>
  </section>;
}
