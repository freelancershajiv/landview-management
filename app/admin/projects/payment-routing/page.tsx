"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PaymentRow = {
  paymentId: string;
  projectId: string;
  projectName: string;
  clientName: string;
  date: string;
  amount: number;
  category: string;
  serviceType: string;
  financeScope: string;
  method: string;
  account: string;
  reference: string;
  notes: string;
  status: string;
};
type ProjectOption = { id: string; name: string; client: string };
type LoadData = { projectId: string; payments: PaymentRow[]; projects: ProjectOption[] };
type EditForm = { paymentId: string; category: string; serviceType: string };

const BILLING_CATEGORIES = ["Engineering Bill", "Supervision Bill", "Other Services Bill"] as const;
const OTHER_SERVICE_TYPES = ["Soil Test", "Digital Survey", "Municipality File Pass"] as const;

function money(value: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(value || 0);
}
function displayDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Request failed."));
  return json.data;
}
function normalizeProjectId(value: string) {
  const raw = value.trim().toUpperCase();
  const match = raw.match(/^(?:LV[\s_-]*)?0*(\d+)$/i);
  return match ? `LV-${String(Number(match[1])).padStart(3, "0")}` : raw;
}

export default function ProjectPaymentRoutingPage() {
  const [data, setData] = useState<LoadData>({ projectId: "", payments: [], projects: [] });
  const [projectId, setProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [form, setForm] = useState<EditForm>({ paymentId: "", category: "Engineering Bill", serviceType: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = normalizeProjectId(params.get("projectId") || "");
    if (initial) setProjectId(initial);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const normalized = normalizeProjectId(projectId);
    const url = normalized ? `/api/billing/payment-routing?projectId=${encodeURIComponent(normalized)}` : "/api/billing/payment-routing";
    requestJson(url)
      .then((result: LoadData) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load project payments."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, revision]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return data.payments
      .filter((row) => !term || [row.paymentId, row.projectId, row.projectName, row.clientName, row.category, row.serviceType, row.method, row.account, row.reference, row.notes].join(" ").toLowerCase().includes(term))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.paymentId.localeCompare(a.paymentId));
  }, [data.payments, query]);

  const municipalityTotal = useMemo(() => data.payments.filter((row) => row.financeScope === "municipality_file_pass").reduce((sum, row) => sum + Number(row.amount || 0), 0), [data.payments]);
  const unclassifiedOther = useMemo(() => data.payments.filter((row) => row.category === "Other Services Bill" && !row.serviceType).length, [data.payments]);
  const totalReceived = useMemo(() => data.payments.reduce((sum, row) => sum + Number(row.amount || 0), 0), [data.payments]);

  function openEdit(row: PaymentRow, municipality = false) {
    setEditing(row);
    setForm({
      paymentId: row.paymentId,
      category: municipality ? "Other Services Bill" : BILLING_CATEGORIES.includes(row.category as any) ? row.category : "Engineering Bill",
      serviceType: municipality ? "Municipality File Pass" : row.serviceType || "",
    });
    setFormError("");
    setMessage("");
  }

  async function save() {
    if (!editing) return;
    if (form.category === "Other Services Bill" && !form.serviceType) return setFormError("Choose Soil Test, Digital Survey or Municipality File Pass.");
    setSaving(true);
    setFormError("");
    try {
      const result = await requestJson("/api/billing/payment-routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Payment_ID: form.paymentId,
          Payment_For: form.category,
          Income_Category: form.category,
          Service_Type: form.category === "Other Services Bill" ? form.serviceType : "",
        }),
      });
      setEditing(null);
      setMessage(result.financeScope === "municipality_file_pass"
        ? `${form.paymentId} is now classified as Municipality File Pass. The same received amount has been routed to the Municipality File Pass ledger without creating a duplicate payment.`
        : `${form.paymentId} payment classification updated successfully.`);
      setRevision((value) => value + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not update payment classification.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="payment-routing-page">
    <style>{`
      .payment-routing-page{display:grid;gap:16px;color:var(--theme-ink-_e8edf1,#e8edf1)}.pr-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end}.pr-head small{display:block;color:#ef6c66;font-weight:900;letter-spacing:.11em}.pr-head h1{margin:5px 0 3px;font-size:32px;color:var(--theme-ink-_f8fafc,#f8fafc)}.pr-head p{margin:0;color:var(--theme-ink-_89959e,#89959e);font-size:11px;max-width:760px;line-height:1.6}.pr-actions{display:flex;gap:8px;flex-wrap:wrap}.pr-btn{border:1px solid var(--theme-line-_3b454e,#3b454e);background:var(--theme-bg-_151d24,#151d24);color:var(--theme-ink-_edf1f4,#edf1f4);padding:9px 12px;border-radius:8px;font-weight:800;cursor:pointer;text-decoration:none;font-size:11px;display:inline-flex;align-items:center;justify-content:center}.pr-btn.primary{background:#d94b45;border-color:#d94b45;color:#fff}.pr-btn.special{background:#273128;border-color:#52705a;color:#bfe7ca}.pr-btn:disabled{opacity:.55;cursor:not-allowed}.pr-message{padding:11px 13px;border:1px solid #31513d;background:#18281f;color:#a9deb8;border-radius:9px;font-size:11px;line-height:1.55}.pr-message.error{border-color:#713d38;background:#321f1d;color:#ffaaa3}.pr-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.pr-card{border:1px solid var(--theme-line-_303d47,#303d47);background:var(--theme-bg-_111920,#111920);border-radius:11px;padding:15px}.pr-card span{display:block;color:var(--theme-ink-_89959e,#89959e);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.pr-card strong{display:block;margin-top:7px;font-size:20px}.pr-card.special strong{color:#9fd7ae}.pr-card.warn strong{color:#f3b26f}.pr-tools{display:flex;gap:9px;align-items:center;flex-wrap:wrap;padding:13px;border:1px solid var(--theme-line-_303d47,#303d47);background:var(--theme-bg-_111920,#111920);border-radius:10px}.pr-tools select,.pr-tools input{height:40px;background:var(--theme-bg-_0d141a,#0d141a);color:#fff;border:1px solid #36414a;border-radius:8px;padding:0 10px}.pr-tools select{min-width:260px}.pr-tools input{flex:1;min-width:240px}.pr-panel{border:1px solid var(--theme-line-_303d47,#303d47);background:var(--theme-bg-_10181f,#10181f);border-radius:11px;overflow:hidden}.pr-panel-head{padding:13px 15px;border-bottom:1px solid var(--theme-line-_27313a,#27313a)}.pr-panel-head strong{display:block}.pr-panel-head small{display:block;margin-top:4px;color:#84919a;font-size:10px;line-height:1.5}.pr-table-wrap{overflow:auto}.pr-table{width:100%;min-width:1180px;border-collapse:collapse}.pr-table th,.pr-table td{padding:11px 12px;border-bottom:1px solid var(--theme-line-_27313a,#27313a);text-align:left;font-size:11px;vertical-align:top}.pr-table th{font-size:9px;color:#8f9aa3;text-transform:uppercase;letter-spacing:.06em}.pr-table .num{text-align:right;font-variant-numeric:tabular-nums}.pr-sub{display:block;margin-top:3px;color:#84919a;font-size:9px}.pr-id{font-weight:900;color:#ff8f87}.pr-route{display:inline-flex;padding:4px 7px;border-radius:999px;border:1px solid #3b4650;color:#b8c3ca;font-size:9px;font-weight:900}.pr-route.special{border-color:#31513d;background:#18281f;color:#9fd7ae}.pr-route.unclassified{border-color:#73572f;background:#2f281c;color:#f3c47f}.pr-row-actions{display:flex;gap:6px;justify-content:flex-end}.pr-empty{padding:28px;text-align:center;color:#8f9aa3}.pr-backdrop{position:fixed;inset:0;z-index:130;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:16px}.pr-modal{width:min(620px,100%);border:1px solid #3a4650;background:#151d24;border-radius:12px;padding:20px}.pr-modal h2{margin:0 0 4px}.pr-modal>p{margin:0 0 16px;color:#9ba7b0;font-size:11px;line-height:1.55}.pr-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}.pr-summary div{padding:10px;border-radius:8px;background:#0d141a;border:1px solid #303d47}.pr-summary span{display:block;color:#89959e;font-size:9px;text-transform:uppercase}.pr-summary strong{display:block;margin-top:5px;font-size:12px}.pr-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pr-field{display:flex;flex-direction:column;gap:6px}.pr-field.full{grid-column:1/-1}.pr-field label{font-size:9px;font-weight:900;text-transform:uppercase;color:#c7d0d7}.pr-field select{min-height:42px;background:#0d141a;color:#fff;border:1px solid #36414a;border-radius:8px;padding:9px}.pr-route-preview{grid-column:1/-1;padding:11px 12px;border:1px solid #31513d;background:#18281f;color:#a9deb8;border-radius:8px;font-size:11px}.pr-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}@media(max-width:900px){.pr-metrics{grid-template-columns:1fr 1fr}.pr-head{align-items:flex-start;flex-direction:column}}@media(max-width:620px){.pr-metrics{grid-template-columns:1fr}.pr-tools{align-items:stretch}.pr-tools select,.pr-tools input{width:100%;min-width:0}.pr-grid,.pr-summary{grid-template-columns:1fr}.pr-field.full,.pr-route-preview{grid-column:auto}}
    `}</style>

    <header className="pr-head">
      <div><small>LAND VIEW / PROJECT BILLING</small><h1>Edit Project Payments</h1><p>Correct the billing classification of an existing received payment. Selecting Municipality File Pass moves that same payment transaction into the Municipality File Pass ledger; it does not create another payment or change the received amount.</p></div>
      <div className="pr-actions"><Link className="pr-btn" href="/admin/projects">← Projects</Link><Link className="pr-btn" href="/admin/finance">Billing</Link><Link className="pr-btn special" href="/admin/municipality-file-pass">Municipality File Ledger →</Link></div>
    </header>

    {message && <div className="pr-message">{message}</div>}
    {error && <div className="pr-message error">{error}</div>}

    <section className="pr-metrics">
      <div className="pr-card"><span>Payments shown</span><strong>{data.payments.length}</strong></div>
      <div className="pr-card"><span>Total received</span><strong>{money(totalReceived)}</strong></div>
      <div className="pr-card special"><span>Municipality File Pass</span><strong>{money(municipalityTotal)}</strong></div>
      <div className="pr-card warn"><span>Other Services unclassified</span><strong>{unclassifiedOther}</strong></div>
    </section>

    <div className="pr-tools">
      <select value={projectId} onChange={(event) => { setProjectId(event.target.value); setMessage(""); }}>
        <option value="">All project payments</option>
        {data.projects.map((project) => <option key={project.id} value={project.id}>{project.id} — {project.client || project.name || project.id}</option>)}
      </select>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search payment ID, project, client, category, reference..." />
      <button className="pr-btn" type="button" onClick={() => setRevision((value) => value + 1)}>Refresh</button>
    </div>

    <section className="pr-panel">
      <div className="pr-panel-head"><strong>{projectId ? `${normalizeProjectId(projectId)} payment history` : "Project payment history"}</strong><small>Use “Set Municipality” for a fast correction, or “Edit” to choose another billing/service classification.</small></div>
      {loading ? <div className="pr-empty">Loading project payments…</div> : rows.length === 0 ? <div className="pr-empty">No project payments match this view.</div> : <div className="pr-table-wrap"><table className="pr-table"><thead><tr><th>Date / Payment</th><th>Project</th><th>Billing classification</th><th>Method / Account</th><th>Reference</th><th className="num">Received</th><th>Ledger route</th><th></th></tr></thead><tbody>
        {rows.map((row) => {
          const isMunicipality = row.financeScope === "municipality_file_pass";
          const isUnclassified = row.category === "Other Services Bill" && !row.serviceType;
          return <tr key={row.paymentId}>
            <td>{displayDate(row.date)}<span className="pr-sub pr-id">{row.paymentId}</span></td>
            <td><strong>{row.projectId}</strong><span className="pr-sub">{row.clientName || row.projectName || "—"}</span></td>
            <td><strong>{row.category}</strong><span className="pr-sub">{row.serviceType || (isUnclassified ? "Service not classified" : "—")}</span></td>
            <td>{row.method || "—"}<span className="pr-sub">{row.account || "—"}</span></td>
            <td>{row.reference || "—"}<span className="pr-sub">{row.status || ""}</span></td>
            <td className="num"><strong>{money(row.amount)}</strong></td>
            <td>{isMunicipality ? <span className="pr-route special">Municipality File Ledger</span> : isUnclassified ? <span className="pr-route unclassified">Needs classification</span> : <span className="pr-route">Main Finance</span>}</td>
            <td><div className="pr-row-actions"><button className="pr-btn" type="button" onClick={() => openEdit(row)}>Edit</button>{!isMunicipality && <button className="pr-btn special" type="button" onClick={() => openEdit(row, true)}>Set Municipality</button>}</div></td>
          </tr>;
        })}
      </tbody></table></div>}
    </section>

    {editing && <div className="pr-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setEditing(null); }}><div className="pr-modal" role="dialog" aria-modal="true" aria-label="Edit project payment classification">
      <h2>Edit Payment Classification</h2><p>Only the billing/service classification is changed. Amount, payment date, payment method and deposit account remain exactly as recorded.</p>
      {formError && <div className="pr-message error" style={{marginBottom:12}}>{formError}</div>}
      <div className="pr-summary"><div><span>Payment</span><strong>{editing.paymentId}</strong></div><div><span>Received</span><strong>{money(editing.amount)}</strong></div><div><span>Project</span><strong>{editing.projectId}</strong></div><div><span>Current route</span><strong>{editing.financeScope === "municipality_file_pass" ? "Municipality File Ledger" : "Main Finance"}</strong></div></div>
      <div className="pr-grid">
        <div className="pr-field full"><label>Billing Category</label><select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value, serviceType: event.target.value === "Other Services Bill" ? current.serviceType : "" }))}>{BILLING_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div>
        {form.category === "Other Services Bill" && <div className="pr-field full"><label>Other Service</label><select value={form.serviceType} onChange={(event) => setForm((current) => ({ ...current, serviceType: event.target.value }))}><option value="">Choose service</option>{OTHER_SERVICE_TYPES.map((service) => <option key={service}>{service}</option>)}</select></div>}
        {form.serviceType === "Municipality File Pass" && <div className="pr-route-preview"><strong>Municipality File Pass routing:</strong> saving will update this payment’s existing ledger transaction to the Municipality File Pass ledger. No duplicate income is created.</div>}
      </div>
      <div className="pr-modal-actions"><button className="pr-btn" disabled={saving} onClick={() => setEditing(null)}>Cancel</button><button className="pr-btn primary" disabled={saving} onClick={save}>{saving ? "Updating…" : "Update Payment"}</button></div>
    </div></div>}
  </div>;
}
