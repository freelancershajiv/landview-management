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

const METHODS = ["Cash", "Bank", "bKash", "Nagad", "Cheque", "Other"];

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

async function postOutsourcing(action: string, payload: Row) {
  const response = await fetch("/api/outsourcing", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Outsourcing request failed."));
  return json.data as Row;
}

export default function NewProjectOutsourcingPage() {
  const router = useRouter();
  const [data, setData] = useState<Row | null>(null);
  const [projectCode, setProjectCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [partyBusy, setPartyBusy] = useState(false);
  const [showPartyForm, setShowPartyForm] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    partyId: "",
    serviceType: "Structural Design",
    agreedAmount: "",
    assignedDate: today(),
    targetDate: "",
    scopeDescription: "",
    notes: "",
  });
  const [partyForm, setPartyForm] = useState({
    name: "",
    partyType: "Individual",
    phone: "",
    expertise: "",
    preferredPaymentMethod: "Cash",
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
  const project = useMemo(
    () => projects.find((row) => normalizeProjectCode(row.project_code) === projectCode),
    [projects, projectCode],
  );
  const partyEditorOpen = showPartyForm || (!loading && parties.length === 0);

  async function createParty() {
    if (!partyForm.name.trim()) return setError("Enter the outsource person or firm name.");
    setPartyBusy(true);
    setError("");
    setMessage("");
    try {
      const created = await postOutsourcing("addParty", partyForm);
      if (!created?.id) throw new Error("The outsource person / firm was saved but no ID was returned.");
      setData((current) => ({ ...(current || {}), parties: [...((current?.parties || []) as Row[]), created] }));
      setForm((current) => ({ ...current, partyId: String(created.id) }));
      setPartyForm({ name: "", partyType: "Individual", phone: "", expertise: "", preferredPaymentMethod: "Cash", notes: "" });
      setShowPartyForm(false);
      setMessage(`${created.name || "Outsource person / firm"} added and selected.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add outsource person / firm.");
    } finally {
      setPartyBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!projectCode) return setError("Choose a project first.");
    if (!project) return setError(`Project ${projectCode} was not found.`);
    if (!form.partyId) return setError("Choose or create an outsource person / firm first.");
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await postOutsourcing("addJob", { projectCode, ...form });
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
      .po{max-width:1040px;margin:0 auto;display:grid;gap:14px;color:var(--lv-text-primary)}.po *{box-sizing:border-box}.po-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.po-kicker{font-size:8px;font-weight:950;letter-spacing:.15em;color:var(--lv-brand-text);text-transform:uppercase}.po h1{margin:5px 0 6px;font-size:27px}.po-head p{margin:0;max-width:690px;color:var(--lv-text-secondary);font-size:10px;line-height:1.55}.po-back{display:inline-flex;align-items:center;min-height:36px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:8px;color:var(--lv-text-primary);text-decoration:none;font-size:9px;font-weight:900}.po-card{border:1px solid var(--lv-border-default);border-radius:14px;background:var(--lv-surface-panel);overflow:hidden}.po-project{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;padding:15px;border-bottom:1px solid var(--lv-border-subtle);background:var(--lv-surface-muted)}.po-project span{display:block;color:var(--lv-text-muted);font-size:7px;font-weight:900;text-transform:uppercase}.po-project strong{display:block;margin-top:5px;font-size:16px}.po-project small{display:block;margin-top:4px;color:var(--lv-text-secondary);font-size:9px}.po-project select{min-width:280px;height:39px;padding:0 9px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary)}.po-form{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px}.po-field{display:grid;gap:5px}.po-field.full{grid-column:1/-1}.po-field label{font-size:7px;font-weight:900;text-transform:uppercase;color:var(--lv-text-muted)}.po-field input,.po-field select,.po-field textarea{width:100%;min-height:39px;padding:8px 10px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.po-field textarea{min-height:90px;resize:vertical}.po-party-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.po-mini{min-height:39px;padding:0 10px;border:1px solid var(--lv-brand-border);border-radius:8px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:8px;font-weight:950;cursor:pointer;white-space:nowrap}.po-party-editor{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:13px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-muted)}.po-party-editor h3{grid-column:1/-1;margin:0;font-size:12px;color:var(--lv-text-primary)}.po-party-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:7px}.po-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;padding-top:4px}.po-btn{min-height:40px;padding:0 14px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-muted);color:var(--lv-text-primary);font-size:9px;font-weight:950;cursor:pointer}.po-btn.primary{border-color:var(--lv-brand-border);background:var(--lv-brand-primary);color:var(--lv-text-inverse)}.po-btn:disabled,.po-mini:disabled{opacity:.5;cursor:not-allowed}.po-alert{padding:10px 12px;border:1px solid var(--lv-danger);border-radius:8px;background:var(--lv-danger-soft);color:var(--lv-danger);font-size:9px}.po-message{padding:10px 12px;border:1px solid var(--lv-success);border-radius:8px;background:var(--lv-success-soft);color:var(--lv-success);font-size:9px}.po-note{padding:11px 13px;border-top:1px solid var(--lv-border-subtle);color:var(--lv-text-secondary);font-size:8px;line-height:1.55}.po-empty{padding:20px;text-align:center;color:var(--lv-text-muted);font-size:10px}@media(max-width:720px){.po-head{flex-direction:column}.po-project{grid-template-columns:1fr}.po-project select{min-width:0;width:100%}.po-form,.po-party-editor{grid-template-columns:1fr}.po-field.full,.po-actions,.po-party-editor,.po-party-editor h3,.po-party-actions{grid-column:auto}.po-party-line{grid-template-columns:1fr}.po-mini{width:100%}}
    `}</style>

    <header className="po-head">
      <div><div className="po-kicker">LAND VIEW / PROJECTS / OUTSOURCING</div><h1>Add Outsourcing</h1><p>Create outsourced work from its project. Select an existing outsource person or firm, or create a new one here without leaving the project workflow.</p></div>
      <Link className="po-back" href="/admin/projects">← Projects</Link>
    </header>

    {error && <div className="po-alert">{error}</div>}
    {message && <div className="po-message">{message}</div>}

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
        <div className="po-field full">
          <label>Outsource To</label>
          <div className="po-party-line">
            <select value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })}>
              <option value="">Choose person / firm</option>
              {parties.map((party) => <option key={party.id} value={party.id}>{party.name} — {party.party_type || "Outsource"}</option>)}
            </select>
            <button className="po-mini" type="button" onClick={() => setShowPartyForm((value) => !value)}>{partyEditorOpen ? "Close" : "+ New Person / Firm"}</button>
          </div>
        </div>

        {partyEditorOpen && <div className="po-party-editor">
          <h3>{parties.length ? "Add another outsource person / firm" : "Add your first outsource person / firm"}</h3>
          <div className="po-field"><label>Name</label><input value={partyForm.name} onChange={(e) => setPartyForm({ ...partyForm, name: e.target.value })} placeholder="Person or firm name" /></div>
          <div className="po-field"><label>Type</label><select value={partyForm.partyType} onChange={(e) => setPartyForm({ ...partyForm, partyType: e.target.value })}><option>Individual</option><option>Firm</option></select></div>
          <div className="po-field"><label>Phone</label><input value={partyForm.phone} onChange={(e) => setPartyForm({ ...partyForm, phone: e.target.value })} placeholder="Phone number" /></div>
          <div className="po-field"><label>Expertise</label><input value={partyForm.expertise} onChange={(e) => setPartyForm({ ...partyForm, expertise: e.target.value })} placeholder="Structural, 3D, Electrical…" /></div>
          <div className="po-field"><label>Preferred Payment</label><select value={partyForm.preferredPaymentMethod} onChange={(e) => setPartyForm({ ...partyForm, preferredPaymentMethod: e.target.value })}>{METHODS.map((method) => <option key={method}>{method}</option>)}</select></div>
          <div className="po-field"><label>Notes</label><input value={partyForm.notes} onChange={(e) => setPartyForm({ ...partyForm, notes: e.target.value })} /></div>
          <div className="po-party-actions"><button className="po-btn primary" type="button" disabled={partyBusy || !partyForm.name.trim()} onClick={() => void createParty()}>{partyBusy ? "Adding…" : "Add & Select"}</button></div>
        </div>}

        <div className="po-field"><label>Service</label><input required list="project-outsourcing-services" value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} /><datalist id="project-outsourcing-services">{SERVICES.map((service) => <option key={service} value={service} />)}</datalist></div>
        <div className="po-field"><label>Agreed Amount</label><input required inputMode="decimal" value={form.agreedAmount} onChange={(e) => setForm({ ...form, agreedAmount: e.target.value })} placeholder="0.00" /></div>
        <div className="po-field"><label>Assigned Date</label><input required type="date" value={form.assignedDate} onChange={(e) => setForm({ ...form, assignedDate: e.target.value })} /></div>
        <div className="po-field"><label>Target Date</label><input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></div>
        <div className="po-field full"><label>Scope / Deliverable</label><textarea value={form.scopeDescription} onChange={(e) => setForm({ ...form, scopeDescription: e.target.value })} placeholder="What exactly is being outsourced?" /></div>
        <div className="po-field full"><label>Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        <div className="po-actions"><Link className="po-btn" href="/admin/projects" style={{display:"inline-flex",alignItems:"center",textDecoration:"none"}}>Cancel</Link><button className="po-btn primary" disabled={busy || partyBusy || !projectCode || !project || !form.partyId}>{busy ? "Creating…" : "Create Outsourced Work"}</button></div>
      </form>}
      <div className="po-note">Outsourcing work is always linked to a project/File ID. Creating a person or firm does not create any payable until an outsourced work item is saved.</div>
    </section>
  </main>;
}
