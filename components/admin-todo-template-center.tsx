"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Template = Record<string, any> & { id: string; template_code: string; name: string; title: string; checklist?: string[]; lastRun?: Record<string, any> | null };
type Project = { projectCode: string; clientName: string; projectName: string; location: string; lifecyclePhase: string };
type Proposal = { proposalCode: string; clientName: string; projectTitle: string; location: string; status: string };
type Employee = { id: string; employeeCode: string; name: string; designation: string; department: string };
type Workflow = { id: string; projectId: string; serviceName: string; status: string };
type Options = { projects: Project[]; proposals: Proposal[]; employees: Employee[]; workflows: Workflow[] };

type Draft = {
  id: string; name: string; title: string; description: string; priority: string; referenceType: string;
  projectCode: string; proposalCode: string; workflowId: string; employeeCode: string; dueTime: string;
  reminderEnabled: boolean; reminderMinutesBefore: string; recurrenceEnabled: boolean; recurrenceType: string;
  recurrenceInterval: string; recurrenceWeekday: string; recurrenceDayOfMonth: string; startDate: string; endDate: string;
  isActive: boolean; checklistText: string;
};

const EMPTY: Draft = {
  id: "", name: "", title: "", description: "", priority: "Normal", referenceType: "None",
  projectCode: "", proposalCode: "", workflowId: "", employeeCode: "", dueTime: "",
  reminderEnabled: false, reminderMinutesBefore: "60", recurrenceEnabled: false, recurrenceType: "Daily",
  recurrenceInterval: "1", recurrenceWeekday: "0", recurrenceDayOfMonth: "1", startDate: "", endDate: "",
  isActive: true, checklistText: "",
};
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const REMINDERS = [["0", "At deadline"], ["15", "15 minutes before"], ["30", "30 minutes before"], ["60", "1 hour before"], ["120", "2 hours before"], ["1440", "1 day before"], ["2880", "2 days before"]];

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Template request failed."));
  return json.data;
}
function text(value: unknown) { return String(value ?? "").trim(); }
function dateOnly(value: unknown) { const s = text(value); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ""; }
function timeOnly(value: unknown) { const m = text(value).match(/^([01]\d|2[0-3]):([0-5]\d)/); return m ? `${m[1]}:${m[2]}` : ""; }
function todayDhaka() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function formatDate(value: unknown) {
  const d = dateOnly(value); if (!d) return "—";
  const date = new Date(`${d}T00:00:00+06:00`);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric" }).format(date);
}
function recurrenceLabel(row: Template) {
  if (!row.recurrence_enabled) return "Manual template";
  const every = Number(row.recurrence_interval || 1) > 1 ? `Every ${row.recurrence_interval} ` : "Every ";
  if (row.recurrence_type === "Daily") return `${every}${Number(row.recurrence_interval || 1) > 1 ? "days" : "day"}`;
  if (row.recurrence_type === "Weekly") return `${every}${Number(row.recurrence_interval || 1) > 1 ? "weeks" : "week"} · ${WEEKDAYS[Number(row.recurrence_weekday || 0)]}`;
  if (row.recurrence_type === "Monthly") return `${every}${Number(row.recurrence_interval || 1) > 1 ? "months" : "month"} · day ${row.recurrence_day_of_month}`;
  return "Recurring";
}

export default function AdminTodoTemplateCenter() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [options, setOptions] = useState<Options>({ projects: [], proposals: [], employees: [], workflows: [] });
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [useDate, setUseDate] = useState(todayDhaka());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(preferred = selected) {
    setLoading(true); setError("");
    try {
      const [rows, opts] = await Promise.all([
        api("/api/admin/todo/templates") as Promise<Template[]>,
        api("/api/admin/todo?mode=options") as Promise<Options>,
      ]);
      setTemplates(rows || []); setOptions(opts);
      const next = preferred && rows.some((row) => row.id === preferred) ? preferred : rows[0]?.id || "";
      setSelected(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load templates."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(""); }, []);

  useEffect(() => {
    if (!selected) return;
    const row = templates.find((item) => item.id === selected);
    if (!row) return;
    const employee = options.employees.find((item) => item.id === text(row.assigned_employee_id));
    setDraft({
      id: row.id, name: text(row.name), title: text(row.title), description: text(row.description), priority: text(row.priority) || "Normal",
      referenceType: text(row.reference_type) || "None", projectCode: text(row.project_code), proposalCode: text(row.proposal_code), workflowId: text(row.workflow_id),
      employeeCode: employee?.employeeCode || "", dueTime: timeOnly(row.due_time), reminderEnabled: row.reminder_enabled === true,
      reminderMinutesBefore: String(row.reminder_minutes_before ?? 60), recurrenceEnabled: row.recurrence_enabled === true,
      recurrenceType: text(row.recurrence_type) === "None" ? "Daily" : text(row.recurrence_type) || "Daily", recurrenceInterval: String(row.recurrence_interval || 1),
      recurrenceWeekday: String(row.recurrence_weekday ?? 0), recurrenceDayOfMonth: String(row.recurrence_day_of_month ?? 1),
      startDate: dateOnly(row.start_date), endDate: dateOnly(row.end_date), isActive: row.is_active !== false,
      checklistText: (row.checklist || []).join("\n"),
    });
  }, [selected, templates, options.employees]);

  const project = useMemo(() => options.projects.find((row) => row.projectCode.toUpperCase() === draft.projectCode.toUpperCase()) || null, [options.projects, draft.projectCode]);
  const proposal = useMemo(() => options.proposals.find((row) => row.proposalCode.toUpperCase() === draft.proposalCode.toUpperCase()) || null, [options.proposals, draft.proposalCode]);
  const employee = useMemo(() => options.employees.find((row) => row.employeeCode.toUpperCase() === draft.employeeCode.toUpperCase()) || null, [options.employees, draft.employeeCode]);
  const workflows = useMemo(() => options.workflows.filter((row) => row.projectId.toUpperCase() === draft.projectCode.toUpperCase()), [options.workflows, draft.projectCode]);
  const selectedTemplate = templates.find((row) => row.id === selected) || null;

  function patch(values: Partial<Draft>) { setDraft((current) => ({ ...current, ...values })); }
  function fresh() { setSelected(""); setDraft({ ...EMPTY, startDate: todayDhaka() }); setError(""); setNotice(""); }

  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy("save"); setError(""); setNotice("");
    try {
      if (draft.referenceType === "Project" && !project) throw new Error("Choose an exact Project from the live list.");
      if (draft.referenceType === "Proposal" && !proposal) throw new Error("Choose an exact Proposal from the live list.");
      if (draft.employeeCode && !employee) throw new Error("Choose an exact active Employee from the live list.");
      if (draft.workflowId && !workflows.some((row) => row.id === draft.workflowId)) throw new Error("Choose a Workflow service from the selected Project.");
      const template = {
        id: draft.id || undefined, name: draft.name, title: draft.title, description: draft.description, priority: draft.priority,
        referenceType: draft.referenceType, projectCode: draft.referenceType === "Project" ? draft.projectCode : "",
        proposalCode: draft.referenceType === "Proposal" ? draft.proposalCode : "", workflowId: draft.referenceType === "Project" ? draft.workflowId : "",
        assignedEmployeeId: employee?.id || "", dueTime: draft.dueTime, reminderEnabled: draft.reminderEnabled,
        reminderMinutesBefore: Number(draft.reminderMinutesBefore || 0), recurrenceEnabled: draft.recurrenceEnabled,
        recurrenceType: draft.recurrenceEnabled ? draft.recurrenceType : "None", recurrenceInterval: Number(draft.recurrenceInterval || 1),
        recurrenceWeekday: Number(draft.recurrenceWeekday || 0), recurrenceDayOfMonth: Number(draft.recurrenceDayOfMonth || 1),
        startDate: draft.recurrenceEnabled ? draft.startDate : "", endDate: draft.recurrenceEnabled ? draft.endDate : "", isActive: draft.isActive,
        checklist: draft.checklistText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      };
      const saved = await api("/api/admin/todo/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", template }) }) as Template;
      setNotice(draft.id ? "Template updated." : "Template created.");
      await load(saved.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save template."); }
    finally { setBusy(""); }
  }

  async function useNow() {
    if (!selectedTemplate || busy) return;
    setBusy("use"); setError(""); setNotice("");
    try {
      const todo = await api("/api/admin/todo/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "use", id: selectedTemplate.id, scheduledDate: useDate }) }) as Record<string, any>;
      setNotice(`Created ${todo.todo_code} from ${selectedTemplate.template_code}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create To Do from template."); }
    finally { setBusy(""); }
  }

  async function remove() {
    if (!selectedTemplate || busy || !window.confirm(`Delete template “${selectedTemplate.name}”? Existing To Dos will not be deleted.`)) return;
    setBusy("delete"); setError(""); setNotice("");
    try {
      await api("/api/admin/todo/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: selectedTemplate.id }) });
      setNotice("Template deleted. Existing To Dos were left unchanged.");
      setDraft(EMPTY); await load("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete template."); }
    finally { setBusy(""); }
  }

  return <section className="tt-shell">
    <style>{`
      .tt-shell{margin:18px 28px 0;border:1px solid var(--lv-border-default);border-radius:16px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm);overflow:hidden;color:var(--lv-text-primary)}.tt-shell *{box-sizing:border-box}.tt-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.tt-head h2{margin:0;font-size:19px}.tt-head p{margin:5px 0 0;font-size:11px;color:var(--lv-text-secondary);line-height:1.5}.tt-head button,.tt-btn{min-height:36px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:10px;font-weight:900;cursor:pointer}.tt-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.tt-btn.danger{color:var(--lv-danger)}.tt-btn:disabled{opacity:.45;cursor:not-allowed}.tt-msg{margin:12px 16px 0;padding:9px 10px;border-radius:8px;font-size:10px;font-weight:800}.tt-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.tt-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}
      .tt-layout{display:grid;grid-template-columns:310px minmax(0,1fr);min-height:460px}.tt-list{border-right:1px solid var(--lv-border-default);padding:12px;background:var(--lv-surface-muted);display:grid;align-content:start;gap:7px;max-height:760px;overflow:auto}.tt-card{width:100%;text-align:left;padding:11px;border:1px solid var(--lv-border-subtle);border-radius:9px;background:var(--lv-surface-panel);color:var(--lv-text-primary);cursor:pointer}.tt-card.active{border-color:var(--lv-brand-border);box-shadow:0 0 0 1px var(--lv-brand-border)}.tt-card strong{display:block;font-size:11px}.tt-card span{display:block;margin-top:4px;font-size:9px;color:var(--lv-text-muted);line-height:1.4}.tt-empty{padding:25px 10px;text-align:center;font-size:10px;color:var(--lv-text-muted)}
      .tt-editor{padding:16px 18px}.tt-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.tt-field{display:grid;gap:5px}.tt-field.wide{grid-column:1/-1}.tt-field.two{grid-column:span 2}.tt-field label{font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.04em;color:var(--lv-text-muted)}.tt-field input,.tt-field select,.tt-field textarea{width:100%;min-height:38px;padding:8px 9px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:11px}.tt-field textarea{min-height:82px;resize:vertical}.tt-hint{font-size:9px;color:var(--lv-text-muted);line-height:1.4}.tt-section{grid-column:1/-1;margin-top:4px;padding-top:12px;border-top:1px solid var(--lv-border-subtle);font-size:10px;font-weight:950;color:var(--lv-text-strong)}.tt-switch{display:flex;gap:8px;align-items:center;min-height:38px}.tt-switch input{width:18px;height:18px;min-height:0;accent-color:var(--lv-brand-primary)}.tt-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:1px solid var(--lv-border-subtle)}.tt-use{display:flex;gap:7px;align-items:center;margin-left:auto}.tt-use input{min-height:36px;padding:0 8px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:10px}.tt-status{margin-top:10px;padding:9px 10px;border-radius:8px;background:var(--lv-surface-muted);font-size:9px;color:var(--lv-text-secondary);line-height:1.5}.tt-status strong{color:var(--lv-text-strong)}
      @media(max-width:980px){.tt-layout{grid-template-columns:1fr}.tt-list{border-right:0;border-bottom:1px solid var(--lv-border-default);max-height:220px}.tt-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tt-field.two{grid-column:span 1}}@media(max-width:680px){.tt-shell{margin:14px 12px 0}.tt-head{flex-direction:column}.tt-grid{grid-template-columns:1fr}.tt-field.two,.tt-field.wide,.tt-section{grid-column:1}.tt-actions{flex-direction:column}.tt-actions .tt-btn{width:100%}.tt-use{margin-left:0;width:100%;display:grid;grid-template-columns:1fr 1fr}.tt-use input,.tt-use .tt-btn{width:100%}}
    `}</style>

    <header className="tt-head"><div><h2>Templates & Recurring To Dos</h2><p>Save reusable task setups with checklist, assignment, project/proposal link, deadline time and reminders. Recurring templates generate normal To Dos automatically.</p></div><button type="button" onClick={fresh}>+ New template</button></header>
    {error ? <div className="tt-msg bad">{error}</div> : null}{notice ? <div className="tt-msg good">{notice}</div> : null}

    <div className="tt-layout">
      <aside className="tt-list">
        {loading && !templates.length ? <div className="tt-empty">Loading templates…</div> : null}
        {!loading && !templates.length ? <div className="tt-empty">No templates yet. Create the first reusable To Do template.</div> : null}
        {templates.map((row) => <button type="button" key={row.id} className={`tt-card${selected === row.id ? " active" : ""}`} onClick={() => setSelected(row.id)}><strong>{row.template_code} · {row.name}</strong><span>{row.title}</span><span>{recurrenceLabel(row)}{row.next_run_date ? ` · Next ${formatDate(row.next_run_date)}` : row.recurrence_enabled ? " · No future run" : ""}</span><span>{row.is_active === false ? "Inactive" : "Active"} · {(row.checklist || []).length} checklist item{(row.checklist || []).length === 1 ? "" : "s"}</span></button>)}
      </aside>

      <form className="tt-editor" onSubmit={save}>
        <div className="tt-grid">
          <div className="tt-field"><label>Template name</label><input value={draft.name} maxLength={180} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Weekly site follow-up" required /></div>
          <div className="tt-field two"><label>To Do title</label><input value={draft.title} maxLength={500} onChange={(e) => patch({ title: e.target.value })} placeholder="Task title created from this template" required /></div>
          <div className="tt-field wide"><label>Description</label><textarea value={draft.description} maxLength={4000} onChange={(e) => patch({ description: e.target.value })} placeholder="Instructions or context for the employee" /></div>
          <div className="tt-field"><label>Priority</label><select value={draft.priority} onChange={(e) => patch({ priority: e.target.value })}><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select></div>
          <div className="tt-field"><label>Reference</label><select value={draft.referenceType} onChange={(e) => patch({ referenceType: e.target.value, projectCode: "", proposalCode: "", workflowId: "" })}><option>None</option><option>Project</option><option>Proposal</option></select></div>
          <div className="tt-field"><label>Active</label><div className="tt-switch"><input type="checkbox" checked={draft.isActive} onChange={(e) => patch({ isActive: e.target.checked })} /><span className="tt-hint">Inactive templates cannot be used or recur.</span></div></div>

          {draft.referenceType === "Project" ? <><div className="tt-field two"><label>Project</label><input list="tt-projects" value={draft.projectCode} onChange={(e) => patch({ projectCode: e.target.value.toUpperCase(), workflowId: "" })} placeholder="LV-000" /><datalist id="tt-projects">{options.projects.map((row) => <option key={row.projectCode} value={row.projectCode}>{row.clientName} · {row.projectName}</option>)}</datalist>{project ? <span className="tt-hint">{project.clientName} · {project.projectName} · {project.location}</span> : null}</div><div className="tt-field"><label>Workflow service (optional)</label><select value={draft.workflowId} onChange={(e) => patch({ workflowId: e.target.value })}><option value="">No Workflow link</option>{workflows.map((row) => <option key={row.id} value={row.id}>{row.serviceName} · {row.status}</option>)}</select></div></> : null}
          {draft.referenceType === "Proposal" ? <div className="tt-field wide"><label>Proposal</label><input list="tt-proposals" value={draft.proposalCode} onChange={(e) => patch({ proposalCode: e.target.value.toUpperCase() })} placeholder="Proposal code" /><datalist id="tt-proposals">{options.proposals.map((row) => <option key={row.proposalCode} value={row.proposalCode}>{row.clientName} · {row.projectTitle}</option>)}</datalist>{proposal ? <span className="tt-hint">{proposal.clientName} · {proposal.projectTitle} · {proposal.status}</span> : null}</div> : null}

          <div className="tt-field two"><label>Assign employee</label><input list="tt-employees" value={draft.employeeCode} onChange={(e) => patch({ employeeCode: e.target.value.toUpperCase() })} placeholder="EMP-0000 (optional)" /><datalist id="tt-employees">{options.employees.map((row) => <option key={row.id} value={row.employeeCode}>{row.name} · {row.designation}</option>)}</datalist>{employee ? <span className="tt-hint">{employee.name} · {employee.designation}</span> : null}</div>
          <div className="tt-field"><label>Due time</label><input type="time" value={draft.dueTime} onChange={(e) => patch({ dueTime: e.target.value })} /></div>

          <div className="tt-section">Reminder</div>
          <div className="tt-field"><label>WhatsApp reminder</label><div className="tt-switch"><input type="checkbox" checked={draft.reminderEnabled} onChange={(e) => patch({ reminderEnabled: e.target.checked })} /><span className="tt-hint">Requires employee + due time.</span></div></div>
          <div className="tt-field"><label>Reminder timing</label><select value={draft.reminderMinutesBefore} disabled={!draft.reminderEnabled} onChange={(e) => patch({ reminderMinutesBefore: e.target.value })}>{REMINDERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>

          <div className="tt-section">Recurrence</div>
          <div className="tt-field"><label>Recurring</label><div className="tt-switch"><input type="checkbox" checked={draft.recurrenceEnabled} onChange={(e) => patch({ recurrenceEnabled: e.target.checked, startDate: e.target.checked && !draft.startDate ? todayDhaka() : draft.startDate })} /><span className="tt-hint">Automatic To Do generation.</span></div></div>
          <div className="tt-field"><label>Frequency</label><select value={draft.recurrenceType} disabled={!draft.recurrenceEnabled} onChange={(e) => patch({ recurrenceType: e.target.value })}><option>Daily</option><option>Weekly</option><option>Monthly</option></select></div>
          <div className="tt-field"><label>Every</label><input type="number" min={1} max={365} value={draft.recurrenceInterval} disabled={!draft.recurrenceEnabled} onChange={(e) => patch({ recurrenceInterval: e.target.value })} /><span className="tt-hint">1 = every period, 2 = every 2 periods.</span></div>
          {draft.recurrenceEnabled && draft.recurrenceType === "Weekly" ? <div className="tt-field"><label>Weekday</label><select value={draft.recurrenceWeekday} onChange={(e) => patch({ recurrenceWeekday: e.target.value })}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></div> : null}
          {draft.recurrenceEnabled && draft.recurrenceType === "Monthly" ? <div className="tt-field"><label>Day of month</label><input type="number" min={1} max={28} value={draft.recurrenceDayOfMonth} onChange={(e) => patch({ recurrenceDayOfMonth: e.target.value })} /><span className="tt-hint">1–28 keeps every month valid.</span></div> : null}
          <div className="tt-field"><label>Start date</label><input type="date" value={draft.startDate} disabled={!draft.recurrenceEnabled} onChange={(e) => patch({ startDate: e.target.value })} /></div>
          <div className="tt-field"><label>End date (optional)</label><input type="date" value={draft.endDate} disabled={!draft.recurrenceEnabled} onChange={(e) => patch({ endDate: e.target.value })} /></div>

          <div className="tt-section">Checklist template</div>
          <div className="tt-field wide"><label>Checklist — one item per line</label><textarea value={draft.checklistText} onChange={(e) => patch({ checklistText: e.target.value })} placeholder={"Review drawings\nConfirm dimensions\nSend final update"} /><span className="tt-hint">These steps are copied into every To Do created from this template.</span></div>
        </div>

        {selectedTemplate ? <div className="tt-status"><strong>{selectedTemplate.template_code}</strong> · {recurrenceLabel(selectedTemplate)} · Next run: <strong>{selectedTemplate.next_run_date ? formatDate(selectedTemplate.next_run_date) : "None"}</strong>{selectedTemplate.last_run_at ? ` · Last generated ${formatDate(selectedTemplate.last_run_at)}` : ""}{selectedTemplate.last_error ? ` · Last error: ${selectedTemplate.last_error}` : ""}</div> : null}
        <div className="tt-actions"><button className="tt-btn primary" type="submit" disabled={Boolean(busy) || !draft.name.trim() || !draft.title.trim()}>{busy === "save" ? "Saving…" : draft.id ? "Update template" : "Create template"}</button>{selectedTemplate ? <button className="tt-btn danger" type="button" onClick={() => void remove()} disabled={Boolean(busy)}>Delete</button> : null}{selectedTemplate ? <div className="tt-use"><input type="date" value={useDate} onChange={(e) => setUseDate(e.target.value)} /><button className="tt-btn" type="button" onClick={() => void useNow()} disabled={Boolean(busy)}>{busy === "use" ? "Creating…" : "Use template now"}</button></div> : null}</div>
      </form>
    </div>
  </section>;
}
