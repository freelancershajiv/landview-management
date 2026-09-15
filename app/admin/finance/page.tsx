"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi, type BillingBookData } from "@/lib/api";

const BILL_CATEGORIES = ["Engineering Bill", "Supervision Bill", "Other Services Bill"] as const;
type BillCategory = typeof BILL_CATEGORIES[number];
type ProjectRow = Record<string, unknown>;

type BillingForm = { projectId: string; category: BillCategory; service: string; amount: string; date: string; notes: string };
type PaymentForm = { projectId: string; category: BillCategory; amount: string; date: string; method: string; account: string; reference: string; notes: string };

function text(value: unknown) { return String(value ?? "").trim(); }
function field(record: ProjectRow, keys: string[]) { for (const key of keys) { const value = record?.[key]; if (value !== undefined && value !== null && String(value).trim() !== "") return value; } return ""; }
function normalizeProjectId(value: unknown) { const raw = text(value).toUpperCase(); const match = raw.match(/^(?:LV[\s_-]*)?0*(\d+)$/i); return match ? `LV-${Number(match[1])}` : raw; }
function normalizeStatus(value: unknown) { return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function amount(value: unknown) { const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function money(value: number) { return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value || 0); }
function today() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function projectIsOpen(project: ProjectRow) { const status = normalizeStatus(field(project, ["Status", "Project_Status", "Project Status"])); return !/cancel|abandon|complete|done|closed|finish/.test(status); }
function canonicalCategoryKey(key: string, category: BillCategory) { const normalized = normalizeStatus(key); if (category === "Engineering Bill") return normalized === "engineering bill" || normalized === "engineering" || normalized === "design bill"; if (category === "Supervision Bill") return normalized === "supervision bill" || normalized === "supervision"; return normalized === "other services bill" || normalized === "others bill" || normalized === "other services" || normalized === "others"; }

async function writeBilling(action: "saveBill" | "savePayment", payload: Record<string, unknown>) {
  const response = await fetch("/api/billing/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ action, ...payload }),
  });
  const raw = await response.text();
  let json: any;
  try { json = JSON.parse(raw); }
  catch { throw new Error(/^\s*</.test(raw) ? "The server returned HTML instead of JSON." : "The billing write returned an invalid response."); }
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Billing write failed."));
  return json.data;
}

export default function BillingPage() {
  const [book, setBook] = useState<BillingBookData | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [billOpen, setBillOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [billForm, setBillForm] = useState<BillingForm>({ projectId: "", category: "Engineering Bill", service: "", amount: "", date: today(), notes: "" });
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({ projectId: "", category: "Engineering Bill", amount: "", date: today(), method: "Bank Transfer", account: "Bank Account", reference: "", notes: "" });

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    Promise.all([landViewApi.getBillingBook(), landViewApi.getProjects()])
      .then(([billingBook, projectRows]) => { if (!cancelled) { setBook(billingBook); setProjects(projectRows || []); } })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load Billing."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  const projectById = useMemo(() => { const map = new Map<string, ProjectRow>(); projects.forEach((project) => { const id = normalizeProjectId(field(project, ["Project_ID", "Project ID", "ProjectId"])); if (id) map.set(id, project); }); return map; }, [projects]);
  const openProjects = useMemo(() => projects.filter(projectIsOpen).map((project) => { const id = normalizeProjectId(field(project, ["Project_ID", "Project ID", "ProjectId"])); return { id, projectName: text(field(project, ["Project_Name", "Project Name", "Name"])) || id, clientName: text(field(project, ["Client_Name", "Client Name", "Client"])) }; }).filter((project) => project.id).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [projects]);
  const rows = useMemo(() => { const term = query.trim().toLowerCase(); return (book?.projects || []).filter((row) => !term || [row.projectId, row.projectName, row.clientName].join(" ").toLowerCase().includes(term)).sort((a, b) => b.projectId.localeCompare(a.projectId, undefined, { numeric: true })); }, [book, query]);

  function categoryDue(projectId: string, category: BillCategory) { const project = book?.projects?.find((item) => normalizeProjectId(item.projectId) === normalizeProjectId(projectId)); if (!project) return 0; const match = Object.entries(project.categories || {}).find(([key]) => canonicalCategoryKey(key, category)); return match ? amount(match[1]?.due) : 0; }
  const paymentProjects = useMemo(() => (book?.projects || []).filter((project) => project.due > 0.009).map((project) => ({ id: normalizeProjectId(project.projectId), projectName: project.projectName, clientName: project.clientName, due: project.due })).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [book]);
  const selectedPaymentProject = paymentProjects.find((project) => project.id === paymentForm.projectId);
  const selectedCategoryDue = selectedPaymentProject ? Math.max(0, categoryDue(selectedPaymentProject.id, paymentForm.category)) : 0;

  function startBill(category: BillCategory = "Engineering Bill") { setMessage(""); setBillForm({ projectId: "", category, service: "", amount: "", date: today(), notes: "" }); setBillOpen(true); }
  function startPayment(category: BillCategory = "Engineering Bill") { setMessage(""); setPaymentForm({ projectId: "", category, amount: "", date: today(), method: "Bank Transfer", account: "Bank Account", reference: "", notes: "" }); setPaymentOpen(true); }

  async function saveBill() {
    const value = amount(billForm.amount);
    if (!billForm.projectId) return setMessage("Choose a project first.");
    if (!billForm.service.trim()) return setMessage("Enter the service or bill description.");
    if (!(value > 0)) return setMessage("Enter a valid bill amount.");
    setSaving(true); setMessage("");
    const idempotencyKey = `web-bill-${crypto.randomUUID()}`;
    try {
      await writeBilling("saveBill", { Project_ID: billForm.projectId, Bill_Date: billForm.date, Description: `[${billForm.category}] ${billForm.service.trim()}`, Amount: value, Status: "Issued", Billing_Category: billForm.category, Category: billForm.category, Created_Via: "Billing Workspace", Notes: billForm.notes.trim(), Idempotency_Key: idempotencyKey });
      setMessage("Bill added successfully."); setBillOpen(false); setRevision((value) => value + 1);
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not add bill."); }
    finally { setSaving(false); }
  }

  async function savePayment() {
    const value = amount(paymentForm.amount);
    if (!paymentForm.projectId) return setMessage("Choose a project first.");
    if (!(selectedCategoryDue > 0)) return setMessage("This category has no outstanding amount.");
    if (!(value > 0)) return setMessage("Enter a valid payment amount.");
    if (value > selectedCategoryDue + 0.01) return setMessage(`Payment cannot exceed ${money(selectedCategoryDue)}.`);
    setSaving(true); setMessage("");
    const idempotencyKey = `web-payment-${crypto.randomUUID()}`;
    try {
      await writeBilling("savePayment", { Project_ID: paymentForm.projectId, Payment_Date: paymentForm.date, Amount: value, Payment_Method: paymentForm.method, Deposit_Account: paymentForm.account, Reference_No: paymentForm.reference.trim(), Payment_For: paymentForm.category, Income_Category: paymentForm.category, Transaction_Type: "Business Income", Affects_Business_Balance: "Yes", Received_From: selectedPaymentProject?.clientName || "", Notes: paymentForm.notes.trim(), Idempotency_Key: idempotencyKey });
      setMessage("Payment recorded and sent for the configured approval/accounting flow."); setPaymentOpen(false); setRevision((value) => value + 1);
    } catch (err) { setMessage(err instanceof Error ? err.message : "Could not record payment."); }
    finally { setSaving(false); }
  }

  const totals = book?.totals || { gross: 0, discount: 0, billed: 0, paid: 0, due: 0 };

  return <div className="billing-page">
    <style>{`
      .billing-page{color:#e8edf1}.billing-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:22px}.billing-head small{display:block;color:#ef6c66;font-weight:900;letter-spacing:.11em}.billing-head h1{font-size:34px;margin:5px 0 0}.billing-actions{display:flex;gap:9px;flex-wrap:wrap}.billing-btn{border:1px solid #3b454e;background:#151d24;color:#edf1f4;padding:10px 14px;border-radius:8px;font-weight:800;cursor:pointer;text-decoration:none}.billing-btn.primary{background:#d94b45;border-color:#d94b45;color:#fff}.billing-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}.billing-card{background:#151d24;border:1px solid #313b44;border-radius:10px;padding:16px}.billing-card span{display:block;color:#89959e;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.billing-card strong{display:block;margin-top:7px;font-size:21px}.billing-cats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:18px}.billing-cat h3{margin:0 0 12px}.billing-cat dl{display:grid;grid-template-columns:1fr auto;gap:7px 12px;margin:0;font-size:12px}.billing-cat dt{color:#89959e}.billing-cat dd{margin:0;font-weight:800}.billing-cat button{margin-top:13px}.billing-panel{background:#11181e;border:1px solid #313b44;border-radius:10px;overflow:hidden}.billing-toolbar{display:flex;justify-content:space-between;gap:12px;padding:14px;border-bottom:1px solid #313b44}.billing-toolbar input{min-width:280px;max-width:480px;width:100%;background:#0d141a;color:#fff;border:1px solid #36414a;border-radius:7px;padding:10px}.billing-table{overflow:auto}.billing-table table{width:100%;border-collapse:collapse;min-width:900px}.billing-table th,.billing-table td{text-align:left;padding:11px 13px;border-bottom:1px solid #27313a;font-size:12px}.billing-table th{color:#8f9aa3;text-transform:uppercase;font-size:11px;letter-spacing:.06em}.billing-due{color:#ff8f87;font-weight:900}.billing-ok{color:#9fd7ae;font-weight:900}.billing-note{margin:0 0 14px;padding:11px 13px;border:1px solid #31513d;background:#18281f;color:#a9deb8;border-radius:8px}.billing-note.error{border-color:#67352f;background:#34201e;color:#ffaaa3}.billing-empty{padding:28px;color:#8f9aa3;text-align:center}.billing-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:100;display:grid;place-items:center;padding:20px}.billing-modal{width:min(620px,100%);max-height:90vh;overflow:auto;background:#11181e;border:1px solid #3a4650;border-radius:12px;padding:20px;box-shadow:0 24px 80px rgba(0,0,0,.45)}.billing-modal h2{margin:0 0 16px}.billing-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.billing-field{display:flex;flex-direction:column;gap:6px}.billing-field.full{grid-column:1/-1}.billing-field label{font-size:11px;color:#929da5;font-weight:800;text-transform:uppercase}.billing-field input,.billing-field select,.billing-field textarea{background:#0d141a;color:#fff;border:1px solid #36414a;border-radius:7px;padding:10px}.billing-field textarea{min-height:78px;resize:vertical}.billing-help{font-size:11px;color:#89959e}.billing-modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}@media(max-width:900px){.billing-metrics{grid-template-columns:1fr 1fr}.billing-cats{grid-template-columns:1fr}.billing-head{align-items:flex-start;flex-direction:column}.billing-grid{grid-template-columns:1fr}.billing-field.full{grid-column:auto}}@media(max-width:540px){.billing-metrics{grid-template-columns:1fr}.billing-toolbar{flex-direction:column}.billing-toolbar input{min-width:0}}
    `}</style>

    <header className="billing-head"><div><small>LAND VIEW / CLIENT BILLING</small><h1>Billing</h1></div><div className="billing-actions"><button className="billing-btn primary" type="button" onClick={() => startBill()}>+ Add Bill</button><Link className="billing-btn" href="/admin/finance/invoices">Generate Invoice</Link><button className="billing-btn" type="button" onClick={() => startPayment()}>+ Add Payment</button><Link className="billing-btn" href="/admin/accounts">Accounts</Link></div></header>

    {message && <div className={`billing-note ${/could not|cannot|choose|valid|no outstanding|timed out/i.test(message) ? "error" : ""}`}>{message}</div>}
    {error && <div className="billing-note error">{error}</div>}

    <section className="billing-metrics"><div className="billing-card"><span>Net billed</span><strong>{money(totals.billed)}</strong></div><div className="billing-card"><span>Approved collected</span><strong>{money(totals.paid)}</strong></div><div className="billing-card"><span>Receivables</span><strong className={totals.due > 0 ? "billing-due" : "billing-ok"}>{money(totals.due)}</strong></div><div className="billing-card"><span>Projects with billing</span><strong>{book?.projects?.filter((project) => project.billed > 0 || project.paid > 0).length || 0}</strong></div></section>

    <section className="billing-cats">{BILL_CATEGORIES.map((category) => { const totalsForCategory = book?.categories?.find((item) => canonicalCategoryKey(item.category, category)); return <div className="billing-card billing-cat" key={category}><h3>{category}</h3><dl><dt>Billed</dt><dd>{money(totalsForCategory?.billed || 0)}</dd><dt>Collected</dt><dd>{money(totalsForCategory?.paid || 0)}</dd><dt>Due</dt><dd>{money(totalsForCategory?.due || 0)}</dd></dl><button className="billing-btn" type="button" onClick={() => startBill(category)}>Add {category}</button></div>; })}</section>

    <section className="billing-panel"><div className="billing-toolbar"><div><strong>Project receivables</strong><div className="billing-help">Calculated directly from canonical Bills and approved Payments.</div></div><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search File ID, project or client..." /></div>{loading ? <div className="billing-empty">Loading canonical billing data…</div> : rows.length === 0 ? <div className="billing-empty">No matching billing records.</div> : <div className="billing-table"><table><thead><tr><th>File ID</th><th>Project / Client</th><th>Billed</th><th>Collected</th><th>Due</th><th>Project status</th><th>Invoice</th></tr></thead><tbody>{rows.map((row) => { const project = projectById.get(normalizeProjectId(row.projectId)); const projectStatus = text(field(project || {}, ["Status", "Project_Status", "Project Status"])) || "—"; return <tr key={row.projectId}><td><strong>{normalizeProjectId(row.projectId)}</strong></td><td><strong>{row.projectName || row.projectId}</strong><br/><span className="billing-help">{row.clientName || "—"}</span></td><td>{money(row.billed)}</td><td>{money(row.paid)}</td><td className={row.due > 0.009 ? "billing-due" : "billing-ok"}>{money(row.due)}</td><td>{projectStatus}</td><td><Link className="billing-btn" href={`/admin/finance/invoices?fileId=${encodeURIComponent(normalizeProjectId(row.projectId))}`}>Open</Link></td></tr>; })}</tbody></table></div>}</section>

    {billOpen && <div className="billing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setBillOpen(false); }}><div className="billing-modal" role="dialog" aria-modal="true" aria-label="Add bill"><h2>Add Bill</h2><div className="billing-grid"><div className="billing-field full"><label>Project</label><select value={billForm.projectId} onChange={(event) => setBillForm((form) => ({ ...form, projectId: event.target.value }))}><option value="">Choose active project</option>{openProjects.map((project) => <option key={project.id} value={project.id}>{project.id} — {project.projectName}{project.clientName ? ` — ${project.clientName}` : ""}</option>)}</select></div><div className="billing-field"><label>Category</label><select value={billForm.category} onChange={(event) => setBillForm((form) => ({ ...form, category: event.target.value as BillCategory }))}>{BILL_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div><div className="billing-field"><label>Bill date</label><input type="date" value={billForm.date} onChange={(event) => setBillForm((form) => ({ ...form, date: event.target.value }))}/></div><div className="billing-field full"><label>Service / description</label><input value={billForm.service} onChange={(event) => setBillForm((form) => ({ ...form, service: event.target.value }))} placeholder="e.g. Structural Design"/></div><div className="billing-field"><label>Amount (BDT)</label><input inputMode="decimal" value={billForm.amount} onChange={(event) => setBillForm((form) => ({ ...form, amount: event.target.value }))}/></div><div className="billing-field full"><label>Notes</label><textarea value={billForm.notes} onChange={(event) => setBillForm((form) => ({ ...form, notes: event.target.value }))}/></div></div><div className="billing-modal-actions"><button className="billing-btn" disabled={saving} type="button" onClick={() => setBillOpen(false)}>Cancel</button><button className="billing-btn primary" disabled={saving} type="button" onClick={saveBill}>{saving ? "Saving…" : "Save Bill"}</button></div></div></div>}

    {paymentOpen && <div className="billing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setPaymentOpen(false); }}><div className="billing-modal" role="dialog" aria-modal="true" aria-label="Add payment"><h2>Add Payment</h2><div className="billing-grid"><div className="billing-field full"><label>Project with receivable</label><select value={paymentForm.projectId} onChange={(event) => setPaymentForm((form) => ({ ...form, projectId: event.target.value }))}><option value="">Choose project</option>{paymentProjects.map((project) => <option key={project.id} value={project.id}>{project.id} — {project.projectName} — Due {money(project.due)}</option>)}</select></div><div className="billing-field"><label>Category</label><select value={paymentForm.category} onChange={(event) => setPaymentForm((form) => ({ ...form, category: event.target.value as BillCategory }))}>{BILL_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select><span className="billing-help">Category due: {money(selectedCategoryDue)}</span></div><div className="billing-field"><label>Payment date</label><input type="date" value={paymentForm.date} onChange={(event) => setPaymentForm((form) => ({ ...form, date: event.target.value }))}/></div><div className="billing-field"><label>Amount received</label><input inputMode="decimal" value={paymentForm.amount} onChange={(event) => setPaymentForm((form) => ({ ...form, amount: event.target.value }))}/></div><div className="billing-field"><label>Method</label><select value={paymentForm.method} onChange={(event) => setPaymentForm((form) => ({ ...form, method: event.target.value }))}><option>Bank Transfer</option><option>Cash</option><option>bKash</option><option>Nagad</option><option>Cheque</option><option>Other</option></select></div><div className="billing-field"><label>Deposit account</label><select value={paymentForm.account} onChange={(event) => setPaymentForm((form) => ({ ...form, account: event.target.value }))}><option>Bank Account</option><option>Cash</option></select></div><div className="billing-field"><label>Reference</label><input value={paymentForm.reference} onChange={(event) => setPaymentForm((form) => ({ ...form, reference: event.target.value }))}/></div><div className="billing-field full"><label>Notes</label><textarea value={paymentForm.notes} onChange={(event) => setPaymentForm((form) => ({ ...form, notes: event.target.value }))}/></div></div><div className="billing-modal-actions"><button className="billing-btn" disabled={saving} type="button" onClick={() => setPaymentOpen(false)}>Cancel</button><button className="billing-btn primary" disabled={saving} type="button" onClick={savePayment}>{saving ? "Saving…" : "Save Payment"}</button></div></div></div>}
  </div>;
}
