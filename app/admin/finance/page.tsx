"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi, type BillingBookData } from "@/lib/api";

const BILL_CATEGORIES = ["Engineering Bill", "Supervision Bill", "Other Services Bill"] as const;
type BillCategory = typeof BILL_CATEGORIES[number];
type BillingFilter = "due" | "paid";
type CategoryDueFilter = "all" | "eb" | "sb" | "ob";
type BillingProject = BillingBookData["projects"][number];
type ProjectRow = Record<string, unknown>;

const CATEGORY_DUE_FILTERS = [
  { key: "eb", label: "EB Due", category: "Engineering Bill" },
  { key: "sb", label: "SB Due", category: "Supervision Bill" },
  { key: "ob", label: "OB Due", category: "Other Services Bill" },
] as const;

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
function projectCategoryDue(project: BillingProject | undefined, category: BillCategory) { if (!project) return 0; const match = Object.entries(project.categories || {}).find(([key]) => canonicalCategoryKey(key, category)); return match ? amount(match[1]?.due) : 0; }

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
  const [listFilter, setListFilter] = useState<BillingFilter>("due");
  const [categoryFilter, setCategoryFilter] = useState<CategoryDueFilter>("all");
  const [revision, setRevision] = useState(0);
  const [billOpen, setBillOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [billError, setBillError] = useState("");
  const [paymentError, setPaymentError] = useState("");
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

  const openProjects = useMemo(() => projects.filter(projectIsOpen).map((project) => { const id = normalizeProjectId(field(project, ["Project_ID", "Project ID", "ProjectId"])); return { id, projectName: text(field(project, ["Project_Name", "Project Name", "Name"])) || id, clientName: text(field(project, ["Client_Name", "Client Name", "Client"])) }; }).filter((project) => project.id).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [projects]);

  const projectMeta = useMemo(() => {
    const map = new Map<string, { phone: string; address: string }>();
    for (const project of projects) {
      const id = normalizeProjectId(field(project, ["Project_ID", "Project ID", "ProjectId"]));
      if (!id) continue;
      const phone = text(field(project, ["Phone_Number", "Phone Number", "Phone", "Client_Phone", "Client Phone"]));
      const explicitAddress = text(field(project, ["Address", "Project_Address", "Project Address", "Client_Address", "Client Address"]));
      const location = text(field(project, ["Location", "Project_Location", "Project Location"]));
      const locationTag = text(field(project, ["Location_Tag", "Location Tag"]));
      const addressParts = [location, locationTag && locationTag.toLowerCase() !== location.toLowerCase() ? locationTag : ""].filter(Boolean);
      map.set(id, { phone, address: explicitAddress || addressParts.join(" · ") });
    }
    return map;
  }, [projects]);

  const billingCounts = useMemo(() => {
    const billingProjects = (book?.projects || []).filter((row) => row.billed > 0.009 || row.paid > 0.009);
    return {
      due: billingProjects.filter((row) => row.due > 0.009).length,
      paid: billingProjects.filter((row) => row.billed > 0.009 && row.due <= 0.009).length,
      eb: billingProjects.filter((row) => projectCategoryDue(row, "Engineering Bill") > 0.009).length,
      sb: billingProjects.filter((row) => projectCategoryDue(row, "Supervision Bill") > 0.009).length,
      ob: billingProjects.filter((row) => projectCategoryDue(row, "Other Services Bill") > 0.009).length,
    };
  }, [book]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const selectedCategory = CATEGORY_DUE_FILTERS.find((item) => item.key === categoryFilter)?.category;
    return (book?.projects || [])
      .map((row) => { const meta = projectMeta.get(normalizeProjectId(row.projectId)); return { ...row, phone: meta?.phone || "", address: meta?.address || "" }; })
      .filter((row) => listFilter === "due" ? row.due > 0.009 : row.billed > 0.009 && row.due <= 0.009)
      .filter((row) => !selectedCategory || projectCategoryDue(row, selectedCategory) > 0.009)
      .filter((row) => !term || [row.projectId, row.projectName, row.clientName, row.phone, row.address].join(" ").toLowerCase().includes(term))
      .sort((a, b) => b.projectId.localeCompare(a.projectId, undefined, { numeric: true }));
  }, [book, projectMeta, query, listFilter, categoryFilter]);

  function categoryDue(projectId: string, category: BillCategory) { const project = book?.projects?.find((item) => normalizeProjectId(item.projectId) === normalizeProjectId(projectId)); return projectCategoryDue(project, category); }
  const paymentProjects = useMemo(() => (book?.projects || []).filter((project) => project.due > 0.009).map((project) => ({ id: normalizeProjectId(project.projectId), projectName: project.projectName, clientName: project.clientName, due: project.due })).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [book]);
  const selectedPaymentProject = paymentProjects.find((project) => project.id === paymentForm.projectId);
  const selectedCategoryDue = selectedPaymentProject ? Math.max(0, categoryDue(selectedPaymentProject.id, paymentForm.category)) : 0;

  function startBill(category: BillCategory = "Engineering Bill") { if (saving) return; setMessage(""); setBillError(""); setBillForm({ projectId: "", category, service: "", amount: "", date: today(), notes: "" }); setBillOpen(true); }
  function startPayment(category: BillCategory = "Engineering Bill") { if (saving) return; setMessage(""); setPaymentError(""); setPaymentForm({ projectId: "", category, amount: "", date: today(), method: "Bank Transfer", account: "Bank Account", reference: "", notes: "" }); setPaymentOpen(true); }

  async function saveBill() {
    const value = amount(billForm.amount);
    if (!billForm.projectId) return setBillError("Choose a project first.");
    if (!billForm.service.trim()) return setBillError("Enter the service or bill description.");
    if (!(value > 0)) return setBillError("Enter a valid bill amount.");
    setSaving(true); setBillError(""); setMessage("Saving bill…"); setBillOpen(false);
    const idempotencyKey = `web-bill-${crypto.randomUUID()}`;
    try {
      await writeBilling("saveBill", { Project_ID: billForm.projectId, Bill_Date: billForm.date, Description: `[${billForm.category}] ${billForm.service.trim()}`, Amount: value, Status: "Issued", Billing_Category: billForm.category, Category: billForm.category, Created_Via: "Billing Workspace", Notes: billForm.notes.trim(), Idempotency_Key: idempotencyKey });
      setMessage("Bill added successfully."); setRevision((value) => value + 1);
    } catch (err) { setBillError(err instanceof Error ? err.message : "Could not add bill."); setMessage(""); setBillOpen(true); }
    finally { setSaving(false); }
  }

  async function savePayment() {
    const value = amount(paymentForm.amount);
    if (!paymentForm.projectId) return setPaymentError("Choose a project first.");
    if (!(selectedCategoryDue > 0)) return setPaymentError("This category has no outstanding amount.");
    if (!(value > 0)) return setPaymentError("Enter a valid payment amount.");
    if (value > selectedCategoryDue + 0.01) return setPaymentError(`Payment cannot exceed ${money(selectedCategoryDue)}.`);
    setSaving(true); setPaymentError(""); setMessage("Saving payment…"); setPaymentOpen(false);
    const idempotencyKey = `web-payment-${crypto.randomUUID()}`;
    try {
      await writeBilling("savePayment", { Project_ID: paymentForm.projectId, Payment_Date: paymentForm.date, Amount: value, Payment_Method: paymentForm.method, Deposit_Account: paymentForm.account, Reference_No: paymentForm.reference.trim(), Payment_For: paymentForm.category, Income_Category: paymentForm.category, Transaction_Type: "Business Income", Affects_Business_Balance: "Yes", Received_From: selectedPaymentProject?.clientName || "", Notes: paymentForm.notes.trim(), Idempotency_Key: idempotencyKey });
      setMessage("Payment recorded successfully."); setRevision((value) => value + 1);
    } catch (err) { setPaymentError(err instanceof Error ? err.message : "Could not record payment."); setMessage(""); setPaymentOpen(true); }
    finally { setSaving(false); }
  }

  const totals = book?.totals || { gross: 0, discount: 0, billed: 0, paid: 0, due: 0 };

  return <div className="billing-page">
    <style>{`
      .billing-page{color:#e8edf1;line-height:1.45}.billing-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:22px}.billing-head small{display:block;color:#ef6c66;font-weight:900;letter-spacing:.11em}.billing-head h1{font-size:34px;margin:5px 0 0;color:#f8fafc}.billing-actions{display:flex;gap:9px;flex-wrap:wrap}.billing-btn{border:1px solid #3b454e;background:#151d24;color:#edf1f4;padding:10px 14px;border-radius:8px;font-weight:800;cursor:pointer;text-decoration:none;min-height:40px;display:inline-flex;align-items:center;justify-content:center;line-height:1.1;transition:border-color .15s ease,background .15s ease,transform .15s ease}.billing-btn:hover:not(:disabled){border-color:#67737d;background:#1b252d}.billing-btn.primary{background:#d94b45;border-color:#d94b45;color:#fff}.billing-btn.primary:hover:not(:disabled){background:#ee5b53;border-color:#ee5b53}.billing-btn:disabled{opacity:.55;cursor:not-allowed}.billing-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}.billing-card{background:#151d24;border:1px solid #313b44;border-radius:10px;padding:16px}.billing-card span{display:block;color:#89959e;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.billing-card strong{display:block;margin-top:7px;font-size:21px}.billing-cats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:18px}.billing-cat h3{margin:0 0 12px;color:#f8fafc}.billing-cat dl{display:grid;grid-template-columns:1fr auto;gap:7px 12px;margin:0;font-size:12px}.billing-cat dt{color:#89959e}.billing-cat dd{margin:0;font-weight:800}.billing-cat button{margin-top:13px}.billing-panel{background:#11181e;border:1px solid #313b44;border-radius:10px;overflow:hidden}.billing-toolbar{display:flex;justify-content:space-between;gap:12px;padding:14px;border-bottom:1px solid #313b44;align-items:center}.billing-toolbar strong{color:#f8fafc}.billing-toolbar-right{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:1;flex-wrap:wrap}.billing-toolbar input{min-width:250px;max-width:430px;width:100%;background:#0d141a;color:#fff;border:1px solid #36414a;border-radius:7px;padding:10px}.billing-filter-group,.billing-category-filter-group{display:flex;gap:6px}.billing-filter{border:1px solid #3b454e;background:#151d24;color:#aeb7be;padding:9px 12px;border-radius:7px;font-weight:900;cursor:pointer;white-space:nowrap}.billing-filter:hover{border-color:#59656f;color:#eef3f6}.billing-filter.active{background:#d94b45;border-color:#d94b45;color:#fff}.billing-category-filter-group .billing-filter.active{box-shadow:0 0 0 1px rgba(239,108,102,.2)}.billing-table{overflow:auto}.billing-table table{width:100%;border-collapse:collapse;min-width:1180px}.billing-table th,.billing-table td{text-align:left;padding:11px 13px;border-bottom:1px solid #27313a;font-size:12px}.billing-table th{color:#8f9aa3;text-transform:uppercase;font-size:11px;letter-spacing:.06em}.billing-table td{color:#e7edf2;vertical-align:middle}.billing-table td strong{color:#f8fafc}.billing-table tbody tr:hover{background:#151f27}.billing-project-cell{min-width:270px}.billing-client-line{display:block;margin-top:3px;color:#c6d0d7;font-size:11px}.billing-contact-line{display:flex;gap:7px 12px;flex-wrap:wrap;margin-top:5px;color:#85939d;font-size:10px}.billing-contact-line span{display:inline-flex;align-items:center}.billing-contact-line .billing-address{max-width:360px}.billing-due{color:#ff8f87;font-weight:900}.billing-ok{color:#9fd7ae;font-weight:900}.billing-breakdown{display:grid;gap:4px;min-width:155px}.billing-breakdown-line{display:grid;grid-template-columns:26px minmax(0,1fr);gap:7px;align-items:center}.billing-breakdown-line span{display:inline-flex;align-items:center;justify-content:center;padding:2px 4px;border:1px solid #39444d;border-radius:5px;color:#9ba7b0;font-size:9px;font-weight:900}.billing-breakdown-line strong{font-size:11px!important;margin:0!important;text-align:right;color:#aeb8bf!important}.billing-breakdown-line.has-due span{border-color:#713d38;background:#321f1d;color:#ffaaa3}.billing-breakdown-line.has-due strong{color:#ffaaa3!important}.billing-breakdown-line.clear{opacity:.55}.billing-status{display:inline-flex;align-items:center;min-width:76px;justify-content:center;border:1px solid;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:900;letter-spacing:.03em;white-space:nowrap;line-height:1.1}.billing-status.due{color:#ffaaa3;border-color:#713d38;background:#321f1d}.billing-status.paid{color:#a9deb8;border-color:#31513d;background:#18281f}.billing-note{margin:0 0 14px;padding:11px 13px;border:1px solid #31513d;background:#18281f;color:#a9deb8;border-radius:8px}.billing-note.error{border-color:#67352f;background:#34201e;color:#ffaaa3}.billing-help{font-size:11px;color:#b7c1c9;line-height:1.5}.billing-empty{padding:28px;color:#8f9aa3;text-align:center}.billing-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:100;display:grid;place-items:center;padding:20px}.billing-modal{width:min(620px,100%);max-height:90vh;overflow:auto;background:#151d24;color:#f5f7f9;border:1px solid #3a4650;border-radius:12px;padding:20px;box-shadow:0 24px 80px rgba(0,0,0,.45)}.billing-modal h2{margin:0 0 16px;color:#f8fafc}.billing-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.billing-field{display:flex;flex-direction:column;gap:6px}.billing-field.full{grid-column:1/-1}.billing-field label{font-size:11px;color:#c7d0d7;font-weight:800;text-transform:uppercase;line-height:1.2}.billing-field input,.billing-field select,.billing-field textarea{background:#0d141a;color:#fff;border:1px solid #36414a;border-radius:7px;padding:10px;min-height:44px;line-height:1.25;color-scheme:dark}.billing-field select option{background:#11181e;color:#f7f9fa}.billing-field textarea{min-height:78px;resize:vertical}.billing-inline-error{margin:0 0 14px;padding:10px 12px;border:1px solid #8b4039;border-radius:8px;background:#3a211f;color:#ffd0cc;font-size:12px;font-weight:800;line-height:1.45}.billing-modal-actions{display:flex;justify-content:flex-end;gap:9px;position:sticky;bottom:-20px;margin:18px -20px -20px;padding:14px 20px 20px;background:linear-gradient(180deg,rgba(21,29,36,.78),#151d24 30%);border-top:1px solid #2f3942}.billing-modal-actions .billing-btn{min-width:112px}@media(max-width:1050px){.billing-toolbar{align-items:flex-start;flex-direction:column}.billing-toolbar-right{width:100%;justify-content:flex-start}.billing-toolbar input{max-width:none;flex:1}}@media(max-width:900px){.billing-metrics{grid-template-columns:1fr 1fr}.billing-cats{grid-template-columns:1fr}.billing-head{align-items:flex-start;flex-direction:column}.billing-grid{grid-template-columns:1fr}.billing-field.full{grid-column:auto}}@media(max-width:640px){.billing-metrics{grid-template-columns:1fr}.billing-toolbar-right{align-items:stretch;flex-direction:column}.billing-toolbar input{min-width:0;max-width:none}.billing-filter-group,.billing-category-filter-group{width:100%}.billing-filter{flex:1;padding:9px 7px}.billing-actions{width:100%}.billing-actions .billing-btn{flex:1 1 calc(50% - 6px);min-width:0}.billing-modal-backdrop{padding:10px}.billing-modal{padding:16px;max-height:94vh}.billing-modal-actions{bottom:-16px;margin:18px -16px -16px;padding:12px 16px 16px}.billing-modal-actions .billing-btn{flex:1;min-width:0}}
    `}</style>

    <header className="billing-head"><div><small>LAND VIEW / CLIENT BILLING</small><h1>Billing</h1></div><div className="billing-actions"><button className="billing-btn primary" disabled={saving} type="button" onClick={() => startBill()}>+ Add Bill</button><Link className="billing-btn" href="/admin/finance/invoices">Generate Invoice</Link><button className="billing-btn" disabled={saving} type="button" onClick={() => startPayment()}>+ Add Payment</button><Link className="billing-btn" href="/admin/accounts">Accounts</Link></div></header>

    {message && <div className={`billing-note ${/could not|cannot|choose|valid|no outstanding|timed out/i.test(message) ? "error" : ""}`}>{message}</div>}
    {error && <div className="billing-note error">{error}</div>}

    <section className="billing-metrics"><div className="billing-card"><span>Net billed</span><strong>{money(totals.billed)}</strong></div><div className="billing-card"><span>Approved collected</span><strong>{money(totals.paid)}</strong></div><div className="billing-card"><span>Receivables</span><strong className={totals.due > 0 ? "billing-due" : "billing-ok"}>{money(totals.due)}</strong></div><div className="billing-card"><span>Projects with billing</span><strong>{book?.projects?.filter((project) => project.billed > 0 || project.paid > 0).length || 0}</strong></div></section>

    <section className="billing-cats">{BILL_CATEGORIES.map((category) => { const totalsForCategory = book?.categories?.find((item) => canonicalCategoryKey(item.category, category)); return <div className="billing-card billing-cat" key={category}><h3>{category}</h3><dl><dt>Billed</dt><dd>{money(totalsForCategory?.billed || 0)}</dd><dt>Collected</dt><dd>{money(totalsForCategory?.paid || 0)}</dd><dt>Due</dt><dd>{money(totalsForCategory?.due || 0)}</dd></dl><button className="billing-btn" type="button" onClick={() => startBill(category)}>Add {category}</button></div>; })}</section>

    <section className="billing-panel"><div className="billing-toolbar"><div><strong>Project receivables</strong><div className="billing-help">Due projects are shown by default. Use EB/SB/OB filters for category-specific collection follow-up.</div></div><div className="billing-toolbar-right"><div className="billing-category-filter-group" role="group" aria-label="Due category filter">{CATEGORY_DUE_FILTERS.map((filter) => <button key={filter.key} type="button" className={`billing-filter ${categoryFilter === filter.key ? "active" : ""}`} aria-pressed={categoryFilter === filter.key} title={categoryFilter === filter.key ? "Click again to clear this filter" : `Show projects with ${filter.label}`} onClick={() => { setListFilter("due"); setCategoryFilter((current) => current === filter.key ? "all" : filter.key); }}>{filter.label} · {billingCounts[filter.key]}</button>)}</div><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search File ID, project, client, phone or address..."/><div className="billing-filter-group" role="group" aria-label="Billing status filter"><button type="button" className={`billing-filter ${listFilter === "due" && categoryFilter === "all" ? "active" : ""}`} aria-pressed={listFilter === "due" && categoryFilter === "all"} onClick={() => { setListFilter("due"); setCategoryFilter("all"); }}>Due · {billingCounts.due}</button><button type="button" className={`billing-filter ${listFilter === "paid" ? "active" : ""}`} aria-pressed={listFilter === "paid"} onClick={() => { setListFilter("paid"); setCategoryFilter("all"); }}>Paid · {billingCounts.paid}</button></div></div></div>{loading ? <div className="billing-empty">Loading canonical billing data…</div> : rows.length === 0 ? <div className="billing-empty">{query.trim() ? `No matching ${listFilter === "due" ? "due" : "fully paid"} billing records.` : `No ${listFilter === "due" ? "due" : "fully paid"} billing records.`}</div> : <div className="billing-table"><table><thead><tr><th>File ID</th><th>Project / Client</th><th>Billed</th><th>Collected</th><th>Due</th><th>Due breakdown</th><th>Billing status</th><th>Invoice</th></tr></thead><tbody>{rows.map((row) => { const isDue = row.due > 0.009; const ebDue = projectCategoryDue(row, "Engineering Bill"); const sbDue = projectCategoryDue(row, "Supervision Bill"); const obDue = projectCategoryDue(row, "Other Services Bill"); return <tr key={row.projectId}><td><strong>{normalizeProjectId(row.projectId)}</strong></td><td className="billing-project-cell"><strong>{row.projectName || row.projectId}</strong><span className="billing-client-line">{row.clientName || "—"}</span>{(row.phone || row.address) && <div className="billing-contact-line">{row.phone && <span>Phone: {row.phone}</span>}{row.address && <span className="billing-address">Address: {row.address}</span>}</div>}</td><td>{money(row.billed)}</td><td>{money(row.paid)}</td><td className={isDue ? "billing-due" : "billing-ok"}>{money(row.due)}</td><td><div className="billing-breakdown"><div className={`billing-breakdown-line ${ebDue > 0.009 ? "has-due" : "clear"}`}><span>EB</span><strong>{money(ebDue)}</strong></div><div className={`billing-breakdown-line ${sbDue > 0.009 ? "has-due" : "clear"}`}><span>SB</span><strong>{money(sbDue)}</strong></div><div className={`billing-breakdown-line ${obDue > 0.009 ? "has-due" : "clear"}`}><span>OB</span><strong>{money(obDue)}</strong></div></div></td><td><span className={`billing-status ${isDue ? "due" : "paid"}`}>{isDue ? "Due" : "Full Paid"}</span></td><td><Link className="billing-btn" href={`/admin/finance/invoices?fileId=${encodeURIComponent(normalizeProjectId(row.projectId))}`}>Open</Link></td></tr>; })}</tbody></table></div>}</section>

    {billOpen && <div className="billing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setBillOpen(false); }}><div className="billing-modal" role="dialog" aria-modal="true" aria-label="Add bill"><h2>Add Bill</h2>{billError && <div className="billing-inline-error" role="alert">{billError}</div>}<div className="billing-grid"><div className="billing-field full"><label>Project</label><select value={billForm.projectId} onChange={(event) => setBillForm((form) => ({ ...form, projectId: event.target.value }))}><option value="">Choose active project</option>{openProjects.map((project) => <option key={project.id} value={project.id}>{project.id} — {project.projectName}{project.clientName ? ` — ${project.clientName}` : ""}</option>)}</select></div><div className="billing-field"><label>Category</label><select value={billForm.category} onChange={(event) => setBillForm((form) => ({ ...form, category: event.target.value as BillCategory }))}>{BILL_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div><div className="billing-field"><label>Bill date</label><input type="date" value={billForm.date} onChange={(event) => setBillForm((form) => ({ ...form, date: event.target.value }))}/></div><div className="billing-field full"><label>Service / description</label><input value={billForm.service} onChange={(event) => setBillForm((form) => ({ ...form, service: event.target.value }))} placeholder="e.g. Structural Design"/></div><div className="billing-field"><label>Amount (BDT)</label><input inputMode="decimal" value={billForm.amount} onChange={(event) => setBillForm((form) => ({ ...form, amount: event.target.value }))}/></div><div className="billing-field full"><label>Notes</label><textarea value={billForm.notes} onChange={(event) => setBillForm((form) => ({ ...form, notes: event.target.value }))}/></div></div><div className="billing-modal-actions"><button className="billing-btn" disabled={saving} type="button" onClick={() => setBillOpen(false)}>Cancel</button><button className="billing-btn primary" disabled={saving} type="button" onClick={saveBill}>{saving ? "Saving…" : "Save Bill"}</button></div></div></div>}

    {paymentOpen && <div className="billing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setPaymentOpen(false); }}><div className="billing-modal" role="dialog" aria-modal="true" aria-label="Add payment"><h2>Add Payment</h2>{paymentError && <div className="billing-inline-error" role="alert">{paymentError}</div>}<div className="billing-grid"><div className="billing-field full"><label>Project with receivable</label><select value={paymentForm.projectId} onChange={(event) => setPaymentForm((form) => ({ ...form, projectId: event.target.value }))}><option value="">Choose project</option>{paymentProjects.map((project) => <option key={project.id} value={project.id}>{project.id} — {project.projectName} — Due {money(project.due)}</option>)}</select></div><div className="billing-field"><label>Category</label><select value={paymentForm.category} onChange={(event) => setPaymentForm((form) => ({ ...form, category: event.target.value as BillCategory }))}>{BILL_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select><span className="billing-help">Category due: {money(selectedCategoryDue)}</span></div><div className="billing-field"><label>Payment date</label><input type="date" value={paymentForm.date} onChange={(event) => setPaymentForm((form) => ({ ...form, date: event.target.value }))}/></div><div className="billing-field"><label>Amount received</label><input inputMode="decimal" value={paymentForm.amount} onChange={(event) => setPaymentForm((form) => ({ ...form, amount: event.target.value }))}/></div><div className="billing-field"><label>Method</label><select value={paymentForm.method} onChange={(event) => setPaymentForm((form) => ({ ...form, method: event.target.value }))}><option>Bank Transfer</option><option>Cash</option><option>bKash</option><option>Nagad</option><option>Cheque</option><option>Other</option></select></div><div className="billing-field"><label>Deposit account</label><select value={paymentForm.account} onChange={(event) => setPaymentForm((form) => ({ ...form, account: event.target.value }))}><option>Bank Account</option><option>Cash</option></select></div><div className="billing-field"><label>Reference</label><input value={paymentForm.reference} onChange={(event) => setPaymentForm((form) => ({ ...form, reference: event.target.value }))}/></div><div className="billing-field full"><label>Notes</label><textarea value={paymentForm.notes} onChange={(event) => setPaymentForm((form) => ({ ...form, notes: event.target.value }))}/></div></div><div className="billing-modal-actions"><button className="billing-btn" disabled={saving} type="button" onClick={() => setPaymentOpen(false)}>Cancel</button><button className="billing-btn primary" disabled={saving} type="button" onClick={savePayment}>{saving ? "Saving…" : "Save Payment"}</button></div></div></div>}
  </div>;
}
