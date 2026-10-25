"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi, type BillingBookData } from "@/lib/api";

type BillCategory = "Engineering Bill" | "Supervision Bill" | "Other Services Bill";
type BillState = "Draft" | "Issued";
type ProjectRow = Record<string, unknown>;
type ServiceLine = { id: string; category: BillCategory; service: string; amount: string; discount: string };
type ApiEnvelope = { success?: boolean; error?: string; message?: string; data?: unknown };

const DEFAULT_SERVICES: Array<{ category: BillCategory; service: string }> = [
  { category: "Engineering Bill", service: "Architectural Design" },
  { category: "Engineering Bill", service: "Structural Design" },
  { category: "Engineering Bill", service: "3D Design – Exterior" },
  { category: "Engineering Bill", service: "3D Design – Interior" },
  { category: "Engineering Bill", service: "Electrical Design" },
  { category: "Engineering Bill", service: "Fire Safety Design" },
  { category: "Engineering Bill", service: "Plumbing Design" },
  { category: "Engineering Bill", service: "Plan Approval Design" },
  { category: "Engineering Bill", service: "Estimate & Costing" },
  { category: "Engineering Bill", service: "Design Books" },
  { category: "Other Services Bill", service: "Municipality Land NOC" },
  { category: "Other Services Bill", service: "Fire Service Approval" },
  { category: "Other Services Bill", service: "Municipality Approval" },
  { category: "Other Services Bill", service: "District Vetting Committee Approval" },
  { category: "Other Services Bill", service: "Consultancy Fees" },
  { category: "Other Services Bill", service: "Submission Fees" },
];

function text(value: unknown) { return String(value ?? "").trim(); }
function field(record: ProjectRow, keys: string[]) {
  for (const key of keys) {
    const current = record[key];
    if (current !== undefined && current !== null && String(current).trim() !== "") return current;
  }
  return "";
}
function normalizeProjectId(value: unknown) {
  const raw = text(value).toUpperCase();
  const match = raw.match(/^(?:LV[\s_-]*)?0*(\d+)$/i);
  return match ? `LV-${Number(match[1])}` : raw;
}
function numberValue(value: unknown) {
  const parsed = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
function money(value: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value || 0);
}
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function freshLines(): ServiceLine[] {
  return DEFAULT_SERVICES.map((item, index) => ({ id: `default-${index}`, ...item, amount: "", discount: "" }));
}
async function writeBill(payload: Record<string, unknown>) {
  const response = await fetch("/api/billing/write", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
    body: JSON.stringify({ action: "saveBill", ...payload }),
  });
  const raw = await response.text();
  let json: ApiEnvelope | null = null;
  try { json = raw ? JSON.parse(raw) as ApiEnvelope : null; } catch { json = null; }
  if (!response.ok || !json?.success) throw new Error(json?.error || json?.message || "Could not create bill item.");
  return json.data;
}

export default function DirectFullBillWorkspace() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [book, setBook] = useState<BillingBookData | null>(null);
  const [projectId, setProjectId] = useState("");
  const [billDate, setBillDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ServiceLine[]>(freshLines);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savedProjectId, setSavedProjectId] = useState("");
  const [savedState, setSavedState] = useState<BillState | "">("");

  useEffect(() => {
    let cancelled = false;
    const queryId = normalizeProjectId(new URLSearchParams(window.location.search).get("fileId") || "");
    if (queryId) setProjectId(queryId);
    Promise.all([landViewApi.getProjects(), landViewApi.getBillingBook()])
      .then(([projectRows, billingBook]) => {
        if (cancelled) return;
        setProjects(projectRows || []);
        setBook(billingBook);
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load projects and billing history."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const projectOptions = useMemo(() => projects.map((project) => {
    const id = normalizeProjectId(field(project, ["Project_ID", "Project ID", "ProjectId"]));
    const clientName = text(field(project, ["Client_Name", "Client Name", "Client"]));
    const projectName = text(field(project, ["Project_Name", "Project Name", "Name"]));
    const phone = text(field(project, ["Phone_Number", "Phone Number", "Phone", "Client_Phone", "Client Phone"]));
    const address = text(field(project, ["Address", "Project_Address", "Project Address", "Client_Address", "Client Address", "Location"]));
    const status = text(field(project, ["Status", "Project_Status", "Project Status", "Stage", "Project_Stage", "Project Stage"]));
    return { id, clientName, projectName, phone, address, status };
  }).filter((project) => project.id).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [projects]);

  const selectedProject = useMemo(() => projectOptions.find((project) => project.id === normalizeProjectId(projectId)), [projectOptions, projectId]);
  const existing = useMemo(() => (book?.projects || []).find((project) => normalizeProjectId(project.projectId) === normalizeProjectId(projectId)), [book, projectId]);
  const activeLines = useMemo(() => lines.filter((line) => numberValue(line.amount) > 0), [lines]);
  const grossTotal = useMemo(() => activeLines.reduce((sum, line) => sum + numberValue(line.amount), 0), [activeLines]);
  const discountTotal = useMemo(() => activeLines.reduce((sum, line) => sum + Math.max(0, numberValue(line.discount)), 0), [activeLines]);
  const netTotal = Math.max(0, grossTotal - discountTotal);
  const existingBilled = numberValue(existing?.billed);
  const existingPaid = numberValue(existing?.paid);
  const projectedDue = Math.max(0, existingBilled + netTotal - existingPaid);

  function updateLine(id: string, patch: Partial<ServiceLine>) { setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line)); }
  function addCustomLine() { setLines((current) => [...current, { id: `custom-${crypto.randomUUID()}`, category: "Engineering Bill", service: "", amount: "", discount: "" }]); }
  function deleteLine(id: string) { setLines((current) => current.filter((line) => line.id !== id)); }
  function restoreStandardServices() { setLines(freshLines()); setError(""); }

  async function createFullBill(status: BillState) {
    const normalizedId = normalizeProjectId(projectId);
    if (!normalizedId || !selectedProject) { setError("Choose a valid existing LAND VIEW File ID / project first."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate)) { setError("Choose a valid bill date."); return; }
    if (!activeLines.length) { setError("Enter an amount for at least one service."); return; }
    for (const line of activeLines) {
      if (!line.service.trim()) { setError("Every billed line needs a service / description."); return; }
      const gross = numberValue(line.amount);
      const discount = numberValue(line.discount);
      if (!(gross > 0)) { setError(`Enter a valid amount for ${line.service || "the service"}.`); return; }
      if (discount < 0 || discount > gross) { setError(`Discount for ${line.service} must be between zero and the gross amount.`); return; }
    }

    setSaving(true); setError(""); setMessage(""); setSavedProjectId(""); setSavedState("");
    let saved = 0;
    try {
      const batchId = crypto.randomUUID();
      for (const [index, line] of activeLines.entries()) {
        const gross = numberValue(line.amount);
        const discount = numberValue(line.discount);
        await writeBill({
          Project_ID: normalizedId, Bill_Date: billDate, Description: `[${line.category}] ${line.service.trim()}`,
          Amount: gross, Discount: discount, Status: status, Billing_Category: line.category, Category: line.category,
          Created_Via: "Direct Full Billing", Notes: ["Direct / Full Bill — no proposal required", notes.trim()].filter(Boolean).join(" | "),
          Idempotency_Key: `direct-full-${batchId}-${index}`,
        });
        saved += 1;
      }
      setSavedProjectId(normalizedId);
      setSavedState(status);
      setMessage(status === "Draft"
        ? `${saved} service item${saved === 1 ? "" : "s"} saved as a draft full bill for ${normalizedId}. Review or discount it in Full Bill Editor before issuing.`
        : `${saved} service item${saved === 1 ? "" : "s"} issued for ${normalizedId}. Existing payments were not changed and will automatically reduce the invoice due.`);
      const updatedBook = await landViewApi.getBillingBook().catch(() => null);
      if (updatedBook) setBook(updatedBook);
    } catch (err) {
      const base = err instanceof Error ? err.message : "Could not complete the direct bill.";
      setError(saved > 0 ? `${saved} item${saved === 1 ? " was" : "s were"} saved before an error occurred. Do not re-enter those saved lines. ${base}` : base);
    } finally { setSaving(false); }
  }

  return <div className="direct-bill-page">
    <style>{`
      .direct-bill-page{color:var(--theme-ink-_e8edf1,#e8edf1);line-height:1.45}.db-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:18px}.db-head small{display:block;color:#ef6c66;font-weight:900;letter-spacing:.11em}.db-head h1{margin:5px 0 0;font-size:32px;color:var(--theme-ink-_f8fafc,#f8fafc)}.db-actions,.db-row-actions{display:flex;gap:8px;flex-wrap:wrap}.db-btn{border:1px solid var(--theme-line-_3b454e,#3b454e);background:var(--theme-bg-_151d24,#151d24);color:var(--theme-ink-_edf1f4,#edf1f4);padding:10px 13px;border-radius:8px;font-weight:850;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;min-height:40px}.db-btn.primary{background:#d94b45;border-color:#d94b45;color:#fff}.db-btn.draft{border-color:#8a7440;background:#292417;color:#f6dc9a}.db-btn:disabled{opacity:.55;cursor:not-allowed}.db-note{padding:11px 13px;border:1px solid var(--theme-line-_31513d,#31513d);background:var(--theme-bg-_18281f,#18281f);color:var(--theme-ink-_a9deb8,#a9deb8);border-radius:8px;margin-bottom:14px}.db-note.error{border-color:#67352f;background:#34201e;color:#ffaaa3}.db-panel{border:1px solid var(--theme-line-_313b44,#313b44);border-radius:11px;background:var(--theme-bg-_11181e,#11181e);padding:16px;margin-bottom:14px}.db-panel h2{margin:0 0 12px;font-size:18px}.db-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}.db-field{display:grid;gap:6px}.db-field.full{grid-column:1/-1}.db-field label{font-size:10px;font-weight:900;color:var(--theme-ink-_aab5bd,#aab5bd);text-transform:uppercase;letter-spacing:.05em}.db-field input,.db-field select,.db-field textarea{min-height:42px;padding:9px 10px;border:1px solid var(--theme-line-_36414a,#36414a);border-radius:7px;background:var(--theme-bg-_0d141a,#0d141a);color:var(--theme-ink-_fff,#fff);color-scheme:dark}.db-field textarea{min-height:76px;resize:vertical}.db-project{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:4px}.db-project div,.db-stat{border:1px solid var(--theme-line-_35414a,#35414a);border-radius:8px;background:var(--theme-bg-_0f171d,#0f171d);padding:10px}.db-project span,.db-stat span{display:block;color:var(--theme-ink-_8f9aa3,#8f9aa3);font-size:9px;text-transform:uppercase;letter-spacing:.05em}.db-project strong,.db-stat strong{display:block;margin-top:4px;font-size:12px;word-break:break-word}.db-table{overflow:auto;border:1px solid var(--theme-line-_303b44,#303b44);border-radius:9px}.db-table table{width:100%;border-collapse:collapse;min-width:940px}.db-table th,.db-table td{padding:9px;border-bottom:1px solid var(--theme-line-_28323a,#28323a);text-align:left;font-size:11px}.db-table th{font-size:9px;text-transform:uppercase;color:var(--theme-ink-_8f9aa3,#8f9aa3);letter-spacing:.05em}.db-table input,.db-table select{width:100%;min-height:38px;padding:7px 8px;border:1px solid var(--theme-line-_36414a,#36414a);border-radius:6px;background:var(--theme-bg-_0d141a,#0d141a);color:var(--theme-ink-_fff,#fff);color-scheme:dark}.db-service{min-width:240px}.db-money{width:130px}.db-delete{border:1px solid #73363a;background:#351b1d;color:#ffaaa5;border-radius:7px;padding:8px 10px;font-weight:900;cursor:pointer;white-space:nowrap}.db-delete:disabled{opacity:.5;cursor:not-allowed}.db-bottom{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap}.db-summary{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:8px;margin-top:14px}.db-stat strong{font-size:17px}.db-due strong{color:#ff9e97}.db-paid strong{color:#a9deb8}.db-submit{display:flex;justify-content:flex-end;gap:8px;margin-top:15px;flex-wrap:wrap}.db-help{font-size:11px;color:var(--theme-ink-_9da9b2,#9da9b2);margin:8px 0 0}@media(max-width:900px){.db-head{align-items:flex-start;flex-direction:column}.db-grid{grid-template-columns:1fr}.db-field.full{grid-column:auto}.db-project{grid-template-columns:1fr 1fr}.db-summary{grid-template-columns:1fr 1fr}}@media(max-width:600px){.db-project,.db-summary{grid-template-columns:1fr}.db-actions{width:100%}.db-actions .db-btn{flex:1}.db-submit{flex-direction:column}.db-submit .db-btn{width:100%}}
    `}</style>

    <header className="db-head">
      <div><small>LAND VIEW / CLIENT BILLING</small><h1>Direct / Full Bill</h1></div>
      <div className="db-actions"><Link className="db-btn" href="/admin/finance">← Finance Home</Link>{savedProjectId && <Link className="db-btn primary" href={savedState === "Draft" ? `/admin/finance/full-bill-editor?fileId=${encodeURIComponent(savedProjectId)}` : `/admin/finance/invoices?fileId=${encodeURIComponent(savedProjectId)}`}>{savedState === "Draft" ? "Review draft" : "Open invoice"}</Link>}</div>
    </header>

    <div className="db-note"><strong>Prepare first, issue when ready.</strong> Select any existing File ID and enter the complete service values. Save as Draft when the bill still needs review or negotiation; Issue Now only when the commercial value is final.</div>
    {error && <div className="db-note error">{error}</div>}
    {message && <div className="db-note">{message}</div>}

    <section className="db-panel">
      <h2>Client / Project</h2>
      <div className="db-grid">
        <div className="db-field full"><label>File ID / Project</label><input list="direct-bill-project-list" value={projectId} disabled={loading || saving} onChange={(event) => { setProjectId(event.target.value); setSavedProjectId(""); setSavedState(""); }} onBlur={() => setProjectId(normalizeProjectId(projectId))} placeholder={loading ? "Loading projects…" : "e.g. LV-199"}/><datalist id="direct-bill-project-list">{projectOptions.map((project) => <option key={project.id} value={project.id}>{project.clientName || project.projectName || project.id}</option>)}</datalist></div>
        {selectedProject ? <div className="db-project"><div><span>Client</span><strong>{selectedProject.clientName || "—"}</strong></div><div><span>Project</span><strong>{selectedProject.projectName || "—"}</strong></div><div><span>Phone</span><strong>{selectedProject.phone || "—"}</strong></div><div><span>Status / Stage</span><strong>{selectedProject.status || "—"}</strong></div><div style={{gridColumn:"1/-1"}}><span>Address</span><strong>{selectedProject.address || "—"}</strong></div></div> : projectId && !loading ? <div className="db-note error" style={{gridColumn:"1/-1",margin:0}}>No existing project matches {normalizeProjectId(projectId)}.</div> : null}
        <div className="db-field"><label>Bill date</label><input type="date" value={billDate} disabled={saving} onChange={(event) => setBillDate(event.target.value)}/></div>
        <div className="db-field"><label>Billing type</label><input value="Full Bill · Direct Billing" disabled/></div>
        <div className="db-field full"><label>Invoice / internal note</label><textarea value={notes} disabled={saving} onChange={(event) => setNotes(event.target.value)} placeholder="Optional note for this full bill"/></div>
      </div>
    </section>

    <section className="db-panel">
      <h2>Complete Service Billing</h2>
      <div className="db-table"><table><thead><tr><th>Category</th><th>Service / Description</th><th>Gross BDT</th><th>Discount BDT</th><th>Net</th><th>Action</th></tr></thead><tbody>{lines.map((line) => {
        const gross = Math.max(0, numberValue(line.amount));
        const discount = Math.max(0, numberValue(line.discount));
        return <tr key={line.id}><td><select value={line.category} disabled={saving} onChange={(event) => updateLine(line.id, { category: event.target.value as BillCategory })}><option>Engineering Bill</option><option>Supervision Bill</option><option>Other Services Bill</option></select></td><td className="db-service"><input value={line.service} disabled={saving} onChange={(event) => updateLine(line.id, { service: event.target.value })}/></td><td className="db-money"><input inputMode="decimal" value={line.amount} disabled={saving} onChange={(event) => updateLine(line.id, { amount: event.target.value })} placeholder="0"/></td><td className="db-money"><input inputMode="decimal" value={line.discount} disabled={saving} onChange={(event) => updateLine(line.id, { discount: event.target.value })} placeholder="0"/></td><td><strong>{money(Math.max(0, gross - discount))}</strong></td><td><button type="button" className="db-delete" disabled={saving} onClick={() => deleteLine(line.id)}>Delete</button></td></tr>;
      })}</tbody></table></div>
      {lines.length === 0 && <div className="db-note" style={{marginTop:12}}>No service rows remain. Restore the standard services or add a custom service.</div>}
      <div className="db-bottom"><div className="db-row-actions"><button type="button" className="db-btn" disabled={saving} onClick={addCustomLine}>+ Custom service</button><button type="button" className="db-btn" disabled={saving} onClick={restoreStandardServices}>Restore standard services</button></div><span className="db-help">Only rows with an amount greater than zero are saved. Each service can have its own discount.</span></div>

      <div className="db-summary">
        <div className="db-stat"><span>Already billed</span><strong>{money(existingBilled)}</strong></div>
        <div className="db-stat db-paid"><span>Payments received</span><strong>{money(existingPaid)}</strong></div>
        <div className="db-stat"><span>This full bill</span><strong>{money(netTotal)}</strong></div>
        <div className="db-stat"><span>Gross / Discount</span><strong>{money(grossTotal)} / {money(discountTotal)}</strong></div>
        <div className="db-stat db-due"><span>Projected due</span><strong>{money(projectedDue)}</strong></div>
      </div>
      <p className="db-help">Projected due = existing net billed + this full bill − all payments already recorded for the project. A Draft lets you review/edit the entire bill before it becomes an issued financial document.</p>
      <div className="db-submit"><Link className="db-btn" href="/admin/finance">Cancel</Link><button type="button" className="db-btn draft" disabled={saving || loading} onClick={() => void createFullBill("Draft")}>{saving ? "Saving…" : `Save as Draft${activeLines.length ? ` · ${activeLines.length} item${activeLines.length === 1 ? "" : "s"}` : ""}`}</button><button type="button" className="db-btn primary" disabled={saving || loading} onClick={() => void createFullBill("Issued")}>{saving ? "Saving…" : `Issue Now${activeLines.length ? ` · ${activeLines.length} item${activeLines.length === 1 ? "" : "s"}` : ""}`}</button></div>
    </section>
  </div>;
}
