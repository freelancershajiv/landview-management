"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Row = Record<string, any>;

const SERVICES = [
  "Architectural Design",
  "Structural Design",
  "3D Design – Exterior",
  "3D Design – Interior",
  "Electrical Design",
  "Fire Safety Design",
  "Plumbing Design",
  "Plan Approval Design",
  "Estimate & Costing",
  "Design Books",
  "Digital Survey",
  "Soil Test",
  "Municipality File Pass",
];

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeProjectCode(value: unknown) {
  const raw = String(value || "").trim().toUpperCase();
  const match = raw.match(/LV[\s_-]*0*(\d+)/i);
  if (match?.[1]) return `LV-${String(Number(match[1])).padStart(3, "0")}`;
  return raw;
}

export default function NewProjectOutsourcingPage() {
  const router = useRouter();
  const [data, setData] = useState<Row | null>(null);
  const [projectCode, setProjectCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    partyId: "",
    serviceType: "Structural Design",
    agreedAmount: "",
    assignedDate: today(),
    targetDate: "",
    scopeDescription: "",
    notes: "",
  });

  useEffect(() => {
    const requested = normalizeProjectCode(new URLSearchParams(window.location.search).get("project") || "");
    setProjectCode(requested);
    setLoading(true);
    void fetch("/api/outsourcing", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load outsourcing setup."));
        setData(json.data || {});
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load outsourcing setup."))
      .finally(() => setLoading(false));
  }, []);

  const projects: Row[] = data?.projects || [];
  const parties: Row[] = (data?.parties || []).filter((party: Row) => party.active !== false);
  const project = useMemo(() => projects.find((row) => normalizeProjectCode(row.project_code) === projectCode), [projects, projectCode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!projectCode) return setError("Choose a project first.");
    if (!project) return setError(`Project ${projectCode} was not found.`);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/outsourcing", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "addJob", projectCode, ...form }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not create outsourcing work."));
      router.push("/admin/finance/outsourcing");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create outsourcing work.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="po">
    <style>{`
      .po{max-width:980px;margin:0 auto;display:grid;gap:14px;color:var(--lv-text-primary)}.po *{box-sizing:border-box}.po-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.po-kicker{font-size:8px;font-weight:950;letter-spacing:.15em;color:var(--lv-brand-text);text-transform:uppercase}.po h1{margin:5px 0 6px;font-size:27px}.po-head p{margin:0;max-width:650px;color:var(--lv-text-secondary);font-size:10px;line-height:1.55}.po-back{display:inline-flex;align-items:center;min-height:36px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:8px;color:var(--lv-text-primary);text-decoration:none;font-size:9px;font-weight:900}.po-card{border:1px solid var(--lv-border-default);border-radius:14px;background:var(--lv-surface-panel);overflow:hidden}.po-project{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;padding:15px;border-bottom:1px solid var(--lv-border-subtle);background:var(--lv-surface-muted)}.po-project span{display:block;color:var(--lv-text-muted);font-size:7px;font-weight:900;text-transform:uppercase}.po-project strong{display:block;margin-top:5px;font-size:16px}.po-project small{display:block;margin-top:4px;color:var(--lv-text-secondary);font-size:9px}.po-project select{min-width:240px;height:39px;padding:0 9px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary)}.po-form{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px}.po-field{display:grid;gap:5px}.po-field.full{grid-column:1/-1}.po-field label{font-size:7px;font-weight:900;text-transform:uppercase;color:var(--lv-text-muted)}.po-field input,.po-field select,.po-field textarea{width:100%;min-height:39px;padding:8px 10px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.po-field textarea{min-height:90px;resize:vertical}.po-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;padding-top:4px}.po-btn{min-height:40px;padding:0 14px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-muted);color:var(--lv-text-primary);font-size:9px;font-weight:950;cursor:pointer}.po-btn.primary{border-color:var(--lv-brand-border);background:var(--lv-brand-primary);color:var(--lv-text-inverse)}.po-btn:disabled{opacity:.5;cursor:not-allowed}.po-alert{padding:10px 12px;border:1px solid var(--lv-danger);border-radius:8px;background:var(--lv-danger-soft);color:var(--lv-danger);font-size:9px}.po-note{padding:11px 13px;border-top:1px solid var(--lv-border-subtle);color:var(--lv-text-secondary);font-size:8px;line-height:1.55}.po-empty{padding:20px;text-align:center;color:var(--lv-text-muted);font-size:10px}@media(max-width:720px){.po-head{flex-direction:column}.po-project{grid-template-columns:1fr}.po-project select{min-width:0;width:100%}.po-form{grid-template-columns:1fr}.po-field.full,.po-actions{grid-column:auto}}
    `}</style>

    <header className="po-head">
      <div><div className="po-kicker">LAND VIEW / PROJECTS / OUTSOURCING</div><h1>Add Outsourcing</h1><p>Create outsourced work from its project. The job will be linked to the File ID from the beginning and will appear in the Outsourcing payable register.</p></div>
      <Link className="po-back" href="/admin/projects">← Projects</Link>
    </header>

    {error && <div className="po-alert">{error}</div>}

    <section className="po-card">
      <div className="po-project">
        <div>
          <span>Selected Project</span>
          <strong>{projectCode || "Choose a project"}</strong>
          <small>{project ? `${project.client_name || project.project_name || "Project"}${project.project_name && project.client_name ? ` · ${project.project_name}` : ""}` : loading ? "Loading project…" : "Select a File ID to continue."}</small>
        </div>
        <select disabled={loading} value={projectCode} onChange={(e) => setProjectCode(normalizeProjectCode(e.target.value))}>
          <option value="">Choose project</option>
          {projects.map((row) => <option key={String(row.id || row.project_code)} value={String(row.project_code || "")}>{row.project_code} — {row.client_name || row.project_name || "Project"}</option>)}
        </select>
      </div>

      {loading ? <div className="po-empty">Loading outsourcing setup…</div> : <form className="po-form" onSubmit={submit}>
        <div className="po-field"><label>Outsource To</label><select required value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })}><option value="">Choose person / firm</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.name} — {party.party_type || "Outsource"}</option>)}</select></div>
        <div className="po-field"><label>Service</label><input required list="project-outsourcing-services" value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} /><datalist id="project-outsourcing-services">{SERVICES.map((service) => <option key={service} value={service} />)}</datalist></div>
        <div className="po-field"><label>Agreed Amount</label><input required inputMode="decimal" value={form.agreedAmount} onChange={(e) => setForm({ ...form, agreedAmount: e.target.value })} placeholder="0.00" /></div>
        <div className="po-field"><label>Assigned Date</label><input required type="date" value={form.assignedDate} onChange={(e) => setForm({ ...form, assignedDate: e.target.value })} /></div>
        <div className="po-field"><label>Target Date</label><input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></div>
        <div className="po-field"><label>File ID</label><input readOnly value={projectCode} /></div>
        <div className="po-field full"><label>Scope / Deliverable</label><textarea value={form.scopeDescription} onChange={(e) => setForm({ ...form, scopeDescription: e.target.value })} placeholder="What exactly is being outsourced?" /></div>
        <div className="po-field full"><label>Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        {!parties.length && <div className="po-field full"><div className="po-alert">No active outsource person / firm is available. Add one from the Outsourcing workspace first.</div></div>}
        <div className="po-actions"><Link className="po-btn" href="/admin/finance/outsourcing" style={{display:"inline-flex",alignItems:"center",textDecoration:"none"}}>Cancel</Link><button className="po-btn primary" disabled={busy || !projectCode || !project || !parties.length}>{busy ? "Creating…" : "Create Outsourced Work"}</button></div>
      </form>}
      <div className="po-note">New outsourcing entries are project-linked. Existing historical outsourcing records are excluded from the fresh workspace reset.</div>
    </section>
  </main>;
}
