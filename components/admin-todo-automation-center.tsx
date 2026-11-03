"use client";

import { useEffect, useMemo, useState } from "react";
type Rule = { rule_key: string; label: string; description: string; enabled: boolean; due_days: number; assigned_employee_id?: string | null; active_since?: string };
type Event = { id: string; rule_key: string; event_key: string; status: string; todo_code?: string | null; error?: string | null; created_at: string };
type Employee = { id: string; employeeCode: string; name: string };
type Preview = { pending: number; counts: Record<string, number>; samples: Array<{ruleKey: string; title: string; dueDate: string}> };
type Result = { scanned: number; generated: number; skipped: number; errors: Array<{ruleKey: string; eventKey: string; error: string}> };
async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) throw new Error(String(body?.error || "Automation request failed."));
  return body.data;
}
const css = [
  ".ta-shell{margin:18px 28px 0;border:1px solid var(--lv-border-default);border-radius:16px;background:var(--lv-surface-panel);color:var(--lv-text-primary);overflow:hidden;box-shadow:var(--lv-shadow-sm)}",
  ".ta-shell *{box-sizing:border-box}.ta-head{padding:18px 20px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted);display:flex;justify-content:space-between;gap:14px;align-items:flex-start}",
  ".ta-head h2{font-size:19px;margin:0}.ta-head p{font-size:11px;margin:5px 0 0;color:var(--lv-text-secondary);line-height:1.5;max-width:680px}.ta-toolbar{display:flex;gap:7px;flex-wrap:wrap}",
  ".ta-btn{border:1px solid var(--lv-border-default);border-radius:8px;min-height:35px;padding:0 12px;background:var(--lv-surface-input);font-size:11px;font-weight:850;color:var(--lv-text-primary);cursor:pointer;white-space:nowrap}",
  ".ta-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.ta-btn:disabled{opacity:.5;cursor:default}",
  ".ta-body{padding:15px 17px}.ta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}",
  ".ta-rule{border:1px solid var(--lv-border-subtle);border-radius:12px;padding:14px;background:var(--lv-surface-muted)}.ta-top{display:flex;align-items:center;gap:8px;justify-content:space-between}",
  ".ta-name{font-size:12px;font-weight:900}.ta-rule p{font-size:10px;color:var(--lv-text-secondary);line-height:1.45;min-height:29px;margin:7px 0 12px}.ta-fields{display:grid;grid-template-columns:105px minmax(0,1fr) 80px;gap:8px;align-items:end}",
  ".ta-label{display:grid;gap:5px;font-size:9px;font-weight:800;color:var(--lv-text-muted)}.ta-label input[type=number],.ta-label select{width:100%;border:1px solid var(--lv-border-default);border-radius:7px;min-height:35px;padding:4px 7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:10px}",
  ".ta-toggle{display:flex;gap:6px;align-items:center;font-size:10px;font-weight:800}.ta-toggle input{width:17px;height:17px;accent-color:var(--lv-brand-primary)}.ta-hint{padding:0 17px 14px;font-size:10px;color:var(--lv-text-secondary);line-height:1.5}",
  ".ta-message{margin:12px 16px 0;padding:9px 11px;border-radius:8px;font-size:11px;line-height:1.5;background:var(--lv-surface-muted)}.ta-message.bad{color:var(--lv-danger);background:var(--lv-danger-soft)}.ta-message.good{color:var(--lv-success);background:var(--lv-success-soft)}",
  ".ta-section{margin-top:18px;border-top:1px solid var(--lv-border-subtle);padding-top:13px}.ta-section h3{margin:0 0 10px;font-size:12px}.ta-list{display:grid;gap:7px}.ta-row{display:grid;grid-template-columns:130px 1fr auto;gap:9px;padding:9px 11px;border:1px solid var(--lv-border-subtle);border-radius:8px;font-size:10px;align-items:center}",
  ".ta-row strong{font-size:10px}.ta-muted{font-size:9px;color:var(--lv-text-muted);margin-top:4px}.ta-foot{margin:9px 0 0;font-size:9px;color:var(--lv-text-secondary)}",
  "@media(max-width:860px){.ta-head{flex-direction:column}.ta-grid{grid-template-columns:1fr}.ta-rule p{min-height:0}}",
  "@media(max-width:550px){.ta-shell{margin:14px 12px 0}.ta-fields{grid-template-columns:1fr 1fr}.ta-fields .ta-employee{grid-column:1/-1;grid-row:1}.ta-row{grid-template-columns:1fr;gap:4px}.ta-toolbar{width:100%}}",
].join("");
function when(value?: string) {
  if (!value) return "—";
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Intl.DateTimeFormat("en-GB",{ timeZone:"Asia/Dhaka", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit", hour12:true }).format(new Date(ms)) : "—";
}
export default function AdminTodoAutomationCenter() {
  const [rules,setRules] = useState<Rule[]>([]);
  const [employees,setEmployees] = useState<Employee[]>([]);
  const [events,setEvents] = useState<Event[]>([]);
  const [preview,setPreview] = useState<Preview | null>(null);
  const [result,setResult] = useState<Result | null>(null);
  const [busy,setBusy] = useState("");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  async function load() {
    setLoading(true);
    try {
      const data = await api("/api/admin/todo/automations") as { rules: Rule[]; events: Event[]; employees: Employee[] };
      setRules(data.rules || []); setEvents(data.events || []); setEmployees(data.employees || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load automation rules."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const enabled = useMemo(() => rules.filter((r) => r.enabled).length, [rules]);
  function edit(key: string, fields: Partial<Rule>) { setRules((rows) => rows.map((r) => r.rule_key === key ? { ...r, ...fields } : r)); }
  async function save(rule: Rule) {
    if (busy) return; setBusy(rule.rule_key); setError(""); setNotice("");
    try {
      await api("/api/admin/todo/automations", {
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"save",ruleKey:rule.rule_key,rule:{enabled:rule.enabled,assignedEmployeeId:rule.assigned_employee_id||"",dueDays:Number(rule.due_days)}})
      });
      setNotice(rule.label + " rule saved."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save rule."); }
    finally { setBusy(""); }
  }
  async function check() {
    if (busy) return; setBusy("preview"); setError(""); setNotice("");
    try { setPreview(await api("/api/admin/todo/automations?mode=preview") as Preview); }
    catch (e) { setError(e instanceof Error ? e.message : "Preview failed."); }
    finally { setBusy(""); }
  }
  async function runNow() {
    if (busy || !window.confirm("Run all enabled automation rules now? This may create real To Dos for newly eligible events.")) return;
    setBusy("run"); setError(""); setNotice("");
    try {
      const data = await api("/api/admin/todo/automations", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"run"})}) as Result;
      setResult(data); setPreview(null); setNotice("Automation run complete: " + data.generated + " To Dos generated; " + data.errors.length + " errors."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not run automation."); }
    finally { setBusy(""); }
  }
  return <section className="ta-shell">
    <style>{css}</style>
    <header className="ta-head">
      <div>
        <h2>Automation Rules</h2>
        <p>Automatically create normal To Dos from new project, payment activation, proposal, site visit, printing, invoice and document events. Each event creates at most one task; Workflow and finance records remain unchanged.</p>
      </div>
      <div className="ta-toolbar">
        <button type="button" className="ta-btn" onClick={() => void check()} disabled={Boolean(busy)||loading}>Preview events</button>
        <button type="button" className="ta-btn primary" onClick={() => void runNow()} disabled={Boolean(busy)||loading}>Run now</button>
        <button type="button" className="ta-btn" onClick={() => void load()} disabled={Boolean(busy)||loading}>Refresh</button>
      </div>
    </header>
    {error && <div className="ta-message bad">{error}</div>}
    {notice && <div className="ta-message good">{notice}</div>}
    <div className="ta-body">
      {loading && !rules.length ? <div className="ta-muted">Loading automation rules…</div> : null}
      <div className="ta-grid">
        {rules.map((rule) => <article className="ta-rule" key={rule.rule_key}>
          <div className="ta-top">
            <strong className="ta-name">{rule.label}</strong>
            <label className="ta-toggle"><input type="checkbox" checked={rule.enabled} onChange={(e) => edit(rule.rule_key,{enabled:e.target.checked})} />{rule.enabled?"Enabled":"Off"}</label>
          </div>
          <p>{rule.description}</p>
          <div className="ta-fields">
            <label className="ta-label">Due after (days)
              <input type="number" min={0} max={90} value={rule.due_days} onChange={(e) => edit(rule.rule_key,{due_days:Number(e.target.value)})} />
            </label>
            <label className="ta-label ta-employee">Assign to
              <select value={rule.assigned_employee_id||""} onChange={(e) => edit(rule.rule_key,{assigned_employee_id:e.target.value||null})}>
                <option value="">Unassigned — management triage</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.employeeCode} · {emp.name}</option>)}
              </select>
            </label>
            <button type="button" className="ta-btn primary" onClick={() => void save(rule)} disabled={Boolean(busy)}>{busy===rule.rule_key?"Saving…":"Save"}</button>
          </div>
          <div className="ta-muted">Events from {when(rule.active_since)} onward</div>
        </article>)}
      </div>
      <p className="ta-foot">{enabled} of {rules.length} rules enabled. Re-enabling a rule resets its event cutoff, so it will not process old records. Automated To Dos have reminders off by default.</p>
      {preview && <div className="ta-section">
        <h3>Preview: {preview.pending} new eligible event(s)</h3>
        <div className="ta-list">{preview.samples.map((row,i) => <div className="ta-row" key={i}><strong>{row.ruleKey.replace(/_/g," ")}</strong><span>{row.title}</span><span>Due {row.dueDate}</span></div>)}</div>
        {!preview.samples.length && <div className="ta-muted">Nothing new to generate.</div>}
      </div>}
      {result && <div className="ta-section"><h3>Last manual run</h3><div className="ta-muted">{result.scanned} detected · {result.generated} created · {result.skipped} skipped · {result.errors.length} failed</div></div>}
      <div className="ta-section">
        <h3>Recent automation activity</h3>
        <div className="ta-list">
          {events.slice(0,25).map((event) => <div className="ta-row" key={event.id}>
            <strong>{event.rule_key.replace(/_/g," ")}</strong>
            <span>{event.status==="generated" ? event.todo_code : event.error || event.event_key}</span>
            <span>{when(event.created_at)}</span>
          </div>)}
          {!events.length && <div className="ta-muted">No automation events yet. Rules only process records created or activated after their cutoff.</div>}
        </div>
      </div>
    </div>
  </section>;
}
