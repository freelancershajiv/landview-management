"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

const BILL_CATEGORIES = ["Engineering Bill", "Design Books", "Supervision Bill", "Other Services Bill"] as const;
type BillCategory = typeof BILL_CATEGORIES[number];
type Row = Record<string, any>;
type ProjectOption = { projectId: string; ownerName: string; projectName: string };
type DraftForm = { billId: string; date: string; category: BillCategory; service: string; amount: string; discount: string; notes: string };
type RevisionForm = { billId: string; service: string; currentNet: number; targetNet: string; reason: string; notes: string };
type DiscountForm = { billId: string; service: string; currentNet: number; isDraft: boolean; gross: number; existingDiscount: number; amount: string; reason: string; notes: string };

function text(value: unknown) { return String(value ?? "").trim(); }
function pick(row: Row, ...keys: string[]) { for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null && text(row[key])) return row[key]; return ""; }
function num(value: unknown) { const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function money(value: unknown) { return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(num(value)); }
function normalizeProjectId(value: unknown) { const raw = text(value).toUpperCase(); const m = raw.match(/^(?:LV[\s_-]*)?0*(\d+)$/i); return m ? `LV-${String(Number(m[1])).padStart(3, "0")}` : raw; }
function billId(row: Row) { return text(pick(row, "Bill_ID", "bill_code")); }
function billStatus(row: Row) { return text(pick(row, "Status", "status")) || "—"; }
function isDraft(row: Row) { return billStatus(row).toLowerCase() === "draft"; }
function categoryOf(row: Row): BillCategory { const raw = text(pick(row, "Billing_Category", "billing_category", "Category", "category")); return BILL_CATEGORIES.includes(raw as BillCategory) ? raw as BillCategory : "Engineering Bill"; }
function serviceText(value: unknown) { return text(value).replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "").replace(/\s+—\s+(Credit Note|Debit Note).*$/i, "").trim(); }
function serviceKey(value: unknown) { return serviceText(value).toLowerCase().replace(/[–—-]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim(); }
function originalNet(row: Row) { const explicit = pick(row, "Net_Amount", "net_amount"); return text(explicit) ? num(explicit) : Math.max(0, num(pick(row, "Amount", "amount")) - num(pick(row, "Discount", "discount"))); }
function activeAdjustment(row: Row) { return text(row.status).toLowerCase() !== "void"; }
function serviceDiscountAdjustment(row: Row) { return activeAdjustment(row) && text(row.adjustment_type) === "Credit Note" && /^service discount\b/i.test(text(row.reason)); }

async function readJson(response: Response, fallback: string) {
  const raw = await response.text(); let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback));
  return json.data ?? json;
}

export default function FinanceV3Page() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState("");
  const [records, setRecords] = useState<Row[]>([]);
  const [adjustments, setAdjustments] = useState<Row[]>([]);
  const [workspace, setWorkspace] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<DraftForm | null>(null);
  const [revision, setRevision] = useState<RevisionForm | null>(null);
  const [discount, setDiscount] = useState<DiscountForm | null>(null);

  const adjustmentByBill = useMemo(() => {
    const map = new Map<string, { debit: number; credit: number; discount: number }>();
    for (const row of adjustments.filter(activeAdjustment)) {
      const key = text(row.bill_code);
      if (!key) continue;
      const current = map.get(key) || { debit: 0, credit: 0, discount: 0 };
      const amount = Math.max(0, num(row.amount));
      if (text(row.adjustment_type) === "Debit Note") current.debit += amount;
      else if (text(row.adjustment_type) === "Credit Note") current.credit += amount;
      if (serviceDiscountAdjustment(row)) current.discount += amount;
      map.set(key, current);
    }
    return map;
  }, [adjustments]);

  function effectiveNet(row: Row) {
    const base = originalNet(row);
    const adj = adjustmentByBill.get(billId(row)) || { debit: 0, credit: 0, discount: 0 };
    return Math.max(0, base + adj.debit - adj.credit);
  }
  function totalDiscount(row: Row) {
    const base = Math.max(0, num(pick(row, "Discount", "discount")));
    return base + (adjustmentByBill.get(billId(row))?.discount || 0);
  }

  const workspaceByService = useMemo(() => {
    const map = new Map<string, Row>();
    for (const row of workspace?.services || []) map.set(serviceKey(row.serviceName), row);
    return map;
  }, [workspace]);

  const serviceSummary = useMemo(() => {
    const map = new Map<string, Row>();
    for (const row of records) {
      const service = serviceText(pick(row, "Description", "description")) || "Service";
      const key = serviceKey(service);
      const current = map.get(key) || { key, service, category: categoryOf(row), gross: 0, discount: 0, billed: 0, bills: 0 };
      current.gross += Math.max(0, num(pick(row, "Amount", "amount")));
      current.discount += totalDiscount(row);
      current.billed += effectiveNet(row);
      current.bills += 1;
      map.set(key, current);
    }
    return Array.from(map.values()).map((row) => ({ ...row, finance: workspaceByService.get(row.key) || null }))
      .sort((a, b) => a.service.localeCompare(b.service));
  }, [records, adjustmentByBill, workspaceByService]);

  const totals = useMemo(() => serviceSummary.reduce((sum, row) => ({ gross: sum.gross + row.gross, discount: sum.discount + row.discount, billed: sum.billed + row.billed }), { gross: 0, discount: 0, billed: 0 }), [serviceSummary]);

  async function load(raw = projectId) {
    const id = normalizeProjectId(raw);
    if (!/^LV-\d+$/.test(id)) return setError("Enter a valid File ID, for example LV-157.");
    setProjectId(id); setLoading(true); setError(""); setMessage("");
    try {
      const [billRows, adjustmentRows, billingWorkspace] = await Promise.all([
        landViewApi.getBillingRecords(id),
        readJson(await fetch(`/api/billing/adjustments?projectId=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" }), "Could not load bill revisions."),
        readJson(await fetch(`/api/billing/project-workspace?projectId=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" }), "Could not load service finance."),
      ]);
      setRecords(Array.isArray(billRows) ? billRows.filter((row) => !/credit note|debit note/i.test(text(pick(row, "Created_Via", "created_via")))) : []);
      setAdjustments(Array.isArray(adjustmentRows) ? adjustmentRows : []);
      setWorkspace(billingWorkspace || null);
      const url = new URL(window.location.href); url.searchParams.set("fileId", id); window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load Finance 3.0."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    readJson(fetch("/api/billing/project-workspace?mode=projects", { credentials: "same-origin", cache: "no-store" }), "Could not load projects.")
      .then((data) => { if (active) setProjects(data.projects || []); }).catch(() => {});
    const id = normalizeProjectId(new URLSearchParams(window.location.search).get("fileId") || "");
    if (id) void load(id);
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function beginEdit(row: Row) {
    setError(""); setMessage(""); setDiscount(null);
    if (isDraft(row)) {
      setDraft({ billId: billId(row), date: text(pick(row, "Bill_Date", "bill_date")).slice(0, 10), category: categoryOf(row), service: serviceText(pick(row, "Description", "description")), amount: text(pick(row, "Amount", "amount")), discount: text(pick(row, "Discount", "discount")) || "0", notes: text(pick(row, "Notes", "notes")) });
      setRevision(null);
      return;
    }
    const current = effectiveNet(row);
    setRevision({ billId: billId(row), service: serviceText(pick(row, "Description", "description")), currentNet: current, targetNet: String(current), reason: "", notes: "" });
    setDraft(null);
  }

  function beginDiscount(row: Row) {
    setError(""); setMessage(""); setDraft(null); setRevision(null);
    setDiscount({ billId: billId(row), service: serviceText(pick(row, "Description", "description")), currentNet: effectiveNet(row), isDraft: isDraft(row), gross: Math.max(0, num(pick(row, "Amount", "amount"))), existingDiscount: Math.max(0, num(pick(row, "Discount", "discount"))), amount: "", reason: "", notes: "" });
  }

  async function saveDraft() {
    if (!draft) return;
    const gross = num(draft.amount); const discountAmount = num(draft.discount);
    if (!draft.date || !draft.service.trim() || !(gross > 0) || discountAmount < 0 || discountAmount > gross) return setError("Check the bill date, service, gross amount and discount.");
    setSaving(true); setError(""); setMessage("");
    try {
      await readJson(await fetch("/api/billing/bills", { method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ Bill_ID: draft.billId, Project_ID: projectId, Bill_Date: draft.date, Billing_Category: draft.category, Description: draft.service.trim(), Amount: gross, Discount: discountAmount, Notes: draft.notes.trim() }) }), "Could not update the draft bill.");
      const id = draft.billId; setDraft(null); await load(projectId); setMessage(`${id} updated.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update the draft bill."); }
    finally { setSaving(false); }
  }

  async function saveRevision() {
    if (!revision) return;
    const target = Math.round(num(revision.targetNet) * 100) / 100;
    if (target < 0) return setError("Corrected billed value cannot be negative.");
    const delta = Math.round((target - revision.currentNet) * 100) / 100;
    if (Math.abs(delta) < 0.01) return setError("Enter a new billed value different from the current value.");
    if (!revision.reason.trim()) return setError("Enter a reason for the bill revision.");
    setSaving(true); setError(""); setMessage("");
    try {
      const type = delta > 0 ? "Debit Note" : "Credit Note";
      const data = await readJson(await fetch("/api/billing/adjustments", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", projectId, billCode: revision.billId, type, amount: Math.abs(delta), reason: `Bill revision — ${revision.reason.trim()}`, notes: revision.notes.trim() }) }), "Could not revise the issued bill.");
      const id = revision.billId; setRevision(null); await load(projectId); setMessage(`${id} revised to ${money(target)} using ${data?.adjustment_code || type}. Payment history remains intact.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not revise the issued bill."); }
    finally { setSaving(false); }
  }

  async function applyDiscount() {
    if (!discount) return;
    const amount = Math.round(num(discount.amount) * 100) / 100;
    if (!(amount > 0)) return setError("Enter a discount amount greater than zero.");
    if (amount > discount.currentNet + 0.009) return setError(`Discount cannot exceed the current billed value of ${money(discount.currentNet)}.`);
    setSaving(true); setError(""); setMessage("");
    try {
      if (discount.isDraft) {
        const row = records.find((item) => billId(item) === discount.billId);
        if (!row) throw new Error("Draft bill could not be resolved.");
        const newDiscount = Math.round((discount.existingDiscount + amount) * 100) / 100;
        if (newDiscount > discount.gross + 0.009) throw new Error("Total discount cannot exceed the gross amount.");
        await readJson(await fetch("/api/billing/bills", { method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ Bill_ID: discount.billId, Project_ID: projectId, Bill_Date: text(pick(row, "Bill_Date", "bill_date")).slice(0, 10), Billing_Category: categoryOf(row), Description: serviceText(pick(row, "Description", "description")), Amount: discount.gross, Discount: newDiscount, Notes: [text(pick(row, "Notes", "notes")), `Service discount: ${money(amount)}${discount.reason.trim() ? ` — ${discount.reason.trim()}` : ""}`].filter(Boolean).join("\n") }) }), "Could not apply the draft discount.");
      } else {
        await readJson(await fetch("/api/billing/adjustments", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", projectId, billCode: discount.billId, type: "Credit Note", amount, reason: `Service discount${discount.reason.trim() ? ` — ${discount.reason.trim()}` : ""}`, notes: discount.notes.trim() }) }), "Could not apply the service discount.");
      }
      const service = discount.service; setDiscount(null); await load(projectId); setMessage(`${money(amount)} service discount applied to ${service}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not apply the service discount."); }
    finally { setSaving(false); }
  }

  return <main className="f3-page"><style>{`
    .f3-page{max-width:1500px;margin:0 auto;color:var(--lv-text-primary)}.f3-page *{box-sizing:border-box}.f3-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;margin-bottom:14px}.f3-head small{font-size:8px;font-weight:950;letter-spacing:.13em;color:var(--lv-brand-text)}.f3-head h1{margin:5px 0 3px;font-size:30px}.f3-head p{margin:0;max-width:780px;color:var(--lv-text-muted);font-size:9px}.f3-actions,.f3-row-actions{display:flex;gap:6px;flex-wrap:wrap}.f3-btn{min-height:36px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px;font-weight:900;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.f3-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.f3-btn.discount{border-color:var(--lv-warning,#b98a3d);color:var(--lv-warning,#d7a54f);background:var(--lv-warning-soft,rgba(185,138,61,.1))}.f3-btn:disabled{opacity:.5;cursor:not-allowed}.f3-picker{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:8px;padding:12px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);margin-bottom:11px}.f3-input,.f3-select,.f3-textarea{width:100%;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);padding:8px 9px;font-size:9px}.f3-input,.f3-select{min-height:38px}.f3-textarea{min-height:76px;resize:vertical}.f3-msg{padding:10px 12px;border-radius:8px;margin-bottom:10px;font-size:9px}.f3-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.f3-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.f3-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:11px}.f3-kpi{padding:11px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-panel)}.f3-kpi span{display:block;font-size:7px;text-transform:uppercase;color:var(--lv-text-muted);font-weight:900}.f3-kpi strong{display:block;margin-top:5px;font-size:17px}.f3-kpi.discount strong{color:var(--lv-warning,#d7a54f)}.f3-kpi.due strong{color:var(--lv-danger)}.f3-kpi.paid strong{color:var(--lv-success)}.f3-section{margin-top:12px}.f3-title{display:flex;justify-content:space-between;align-items:end;gap:8px;margin:0 0 7px}.f3-title h2{margin:0;font-size:15px}.f3-title span{font-size:8px;color:var(--lv-text-muted)}.f3-table-wrap{overflow:auto;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel)}.f3-table{width:100%;border-collapse:collapse;min-width:1120px}.f3-table th,.f3-table td{padding:9px 10px;border-bottom:1px solid var(--lv-border-subtle);font-size:8px;text-align:left}.f3-table th{background:var(--lv-surface-muted);font-size:7px;text-transform:uppercase;color:var(--lv-text-muted)}.f3-table tbody tr:hover{background:var(--lv-surface-muted)}.f3-service strong{display:block;font-size:9px}.f3-service span{display:block;margin-top:2px;font-size:7px;color:var(--lv-text-muted)}.f3-discount{color:var(--lv-warning,#d7a54f);font-weight:900}.f3-adjusted{color:var(--lv-brand-text);font-weight:900}.f3-empty{padding:26px;text-align:center;color:var(--lv-text-muted);font-size:9px}.f3-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:18px}.f3-modal{width:min(700px,100%);max-height:90vh;overflow:auto;border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel);padding:17px;box-shadow:0 24px 70px rgba(0,0,0,.45)}.f3-modal h2{margin:0 0 4px;font-size:18px}.f3-modal p{margin:0 0 13px;color:var(--lv-text-muted);font-size:9px}.f3-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.f3-field{display:grid;gap:5px}.f3-field.full{grid-column:1/-1}.f3-field label{font-size:7px;font-weight:950;text-transform:uppercase;color:var(--lv-text-muted)}.f3-summary{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.f3-summary div{padding:9px;border:1px solid var(--lv-border-subtle);border-radius:7px;background:var(--lv-surface-muted)}.f3-summary span{display:block;font-size:7px;color:var(--lv-text-muted)}.f3-summary strong{display:block;margin-top:3px}.f3-modal-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:13px}@media(max-width:900px){.f3-kpis{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.f3-head{align-items:stretch;flex-direction:column}.f3-picker,.f3-grid{grid-template-columns:1fr}.f3-field.full{grid-column:auto}.f3-kpis{grid-template-columns:1fr 1fr}.f3-summary{grid-template-columns:1fr}.f3-actions .f3-btn{flex:1}}@media(max-width:480px){.f3-kpis{grid-template-columns:1fr}}
  `}</style>

    <header className="f3-head"><div><small>LAND VIEW / FINANCE 3.0</small><h1>Service Bill Editor</h1><p>Edit draft bills directly, revise issued bill values without losing history, and apply discounts service by service. Payments remain untouched.</p></div><div className="f3-actions"><Link className="f3-btn" href="/admin/finance/workspace">Billing Workflow</Link><Link className="f3-btn primary" href={`/admin/finance/direct-bill${projectId ? `?fileId=${encodeURIComponent(projectId)}` : ""}`}>+ New Bill</Link>{projectId && <Link className="f3-btn" href={`/admin/finance/service-payments?fileId=${encodeURIComponent(projectId)}`}>Receive Payment</Link>}{projectId && <Link className="f3-btn" href={`/admin/finance/invoices?fileId=${encodeURIComponent(projectId)}`}>Statement</Link>}</div></header>

    <section className="f3-picker"><input className="f3-input" list="f3-projects" value={projectId} onChange={(e)=>setProjectId(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter") void load();}} placeholder="File ID — e.g. LV-157"/><datalist id="f3-projects">{projects.map((p)=><option key={p.projectId} value={p.projectId}>{p.ownerName || p.projectName}</option>)}</datalist><button className="f3-btn primary" disabled={loading} onClick={()=>void load()}>{loading?"Loading…":"Open Finance"}</button></section>
    {error && <div className="f3-msg bad">{error}</div>}{message && <div className="f3-msg good">{message}</div>}

    {workspace && <section className="f3-kpis"><div className="f3-kpi"><span>Gross Services</span><strong>{money(totals.gross)}</strong></div><div className="f3-kpi discount"><span>Total Discounts</span><strong>{money(totals.discount)}</strong></div><div className="f3-kpi"><span>Current Billed</span><strong>{money(totals.billed)}</strong></div><div className="f3-kpi paid"><span>Paid</span><strong>{money(workspace?.totals?.paid)}</strong></div><div className="f3-kpi due"><span>Due</span><strong>{money(workspace?.totals?.due)}</strong></div></section>}

    <section className="f3-section"><div className="f3-title"><h2>Services</h2><span>Discount and due are tracked per service.</span></div><div className="f3-table-wrap">{serviceSummary.length ? <table className="f3-table"><thead><tr><th>Service</th><th>Category</th><th>Gross</th><th>Discount</th><th>Current Billed</th><th>Paid</th><th>Due</th><th>Bills</th></tr></thead><tbody>{serviceSummary.map((row)=><tr key={row.key}><td className="f3-service"><strong>{row.service}</strong><span>{row.finance?.financeStatus || "Billed service"}</span></td><td>{row.category}</td><td>{money(row.gross)}</td><td className={row.discount>.009?"f3-discount":""}>{row.discount>.009?money(row.discount):"—"}</td><td>{money(row.billed)}</td><td>{money(row.finance?.paid || 0)}</td><td>{money(row.finance?.due || Math.max(0,row.billed-num(row.finance?.paid)))}</td><td>{row.bills}</td></tr>)}</tbody></table> : <div className="f3-empty">{loading?"Loading services…":projectId?"No service bills found.":"Choose a project to open Finance 3.0."}</div>}</div></section>

    <section className="f3-section"><div className="f3-title"><h2>Existing Bills</h2><span>Drafts edit directly. Issued bills use audited revisions.</span></div><div className="f3-table-wrap">{records.length ? <table className="f3-table"><thead><tr><th>Bill ID</th><th>Date</th><th>Service</th><th>Category</th><th>Gross</th><th>Discount</th><th>Current Billed</th><th>Status</th><th>Actions</th></tr></thead><tbody>{records.map((row)=>{const id=billId(row), base=originalNet(row), current=effectiveNet(row), given=totalDiscount(row);return <tr key={id}><td><strong>{id}</strong></td><td>{text(pick(row,"Bill_Date","bill_date"))||"—"}</td><td>{serviceText(pick(row,"Description","description"))||"—"}</td><td>{categoryOf(row)}</td><td>{money(pick(row,"Amount","amount"))}</td><td className={given>.009?"f3-discount":""}>{given>.009?money(given):"—"}</td><td className={Math.abs(current-base)>.009?"f3-adjusted":""}>{money(current)}{Math.abs(current-base)>.009?" · revised":""}</td><td>{billStatus(row)}</td><td><div className="f3-row-actions"><button className="f3-btn" onClick={()=>beginEdit(row)}>{isDraft(row)?"Edit Bill":"Edit Value"}</button><button className="f3-btn discount" onClick={()=>beginDiscount(row)}>Discount</button></div></td></tr>})}</tbody></table> : <div className="f3-empty">{loading?"Loading bills…":"No bills to show."}</div>}</div></section>

    {draft && <div className="f3-backdrop" onMouseDown={(e)=>{if(e.currentTarget===e.target&&!saving)setDraft(null)}}><section className="f3-modal"><h2>Edit Draft Bill · {draft.billId}</h2><p>Draft changes update the original bill directly.</p><div className="f3-grid"><div className="f3-field"><label>Date</label><input className="f3-input" type="date" value={draft.date} onChange={(e)=>setDraft({...draft,date:e.target.value})}/></div><div className="f3-field"><label>Category</label><select className="f3-select" value={draft.category} onChange={(e)=>setDraft({...draft,category:e.target.value as BillCategory})}>{BILL_CATEGORIES.map((x)=><option key={x}>{x}</option>)}</select></div><div className="f3-field full"><label>Service</label><input className="f3-input" value={draft.service} onChange={(e)=>setDraft({...draft,service:e.target.value})}/></div><div className="f3-field"><label>Gross</label><input className="f3-input" inputMode="decimal" value={draft.amount} onChange={(e)=>setDraft({...draft,amount:e.target.value})}/></div><div className="f3-field"><label>Service Discount</label><input className="f3-input" inputMode="decimal" value={draft.discount} onChange={(e)=>setDraft({...draft,discount:e.target.value})}/></div><div className="f3-summary"><div><span>Gross</span><strong>{money(draft.amount)}</strong></div><div><span>Discount</span><strong>{money(draft.discount)}</strong></div><div><span>Net</span><strong>{money(Math.max(0,num(draft.amount)-num(draft.discount)))}</strong></div></div><div className="f3-field full"><label>Notes</label><textarea className="f3-textarea" value={draft.notes} onChange={(e)=>setDraft({...draft,notes:e.target.value})}/></div></div><div className="f3-modal-actions"><button className="f3-btn" disabled={saving} onClick={()=>setDraft(null)}>Cancel</button><button className="f3-btn primary" disabled={saving} onClick={()=>void saveDraft()}>{saving?"Saving…":"Save Bill"}</button></div></section></div>}

    {revision && <div className="f3-backdrop" onMouseDown={(e)=>{if(e.currentTarget===e.target&&!saving)setRevision(null)}}><section className="f3-modal"><h2>Edit Issued Value · {revision.service}</h2><p>The original issued bill remains in the audit trail. Finance 3.0 posts the exact difference as a linked Debit/Credit Note.</p><div className="f3-grid"><div className="f3-summary"><div><span>Current Billed</span><strong>{money(revision.currentNet)}</strong></div><div><span>New Billed</span><strong>{money(revision.targetNet)}</strong></div><div><span>Difference</span><strong>{money(num(revision.targetNet)-revision.currentNet)}</strong></div></div><div className="f3-field full"><label>Corrected billed value</label><input autoFocus className="f3-input" inputMode="decimal" value={revision.targetNet} onChange={(e)=>setRevision({...revision,targetNet:e.target.value})}/></div><div className="f3-field full"><label>Reason</label><input className="f3-input" value={revision.reason} onChange={(e)=>setRevision({...revision,reason:e.target.value})} placeholder="Wrong amount / negotiated scope / correction"/></div><div className="f3-field full"><label>Notes</label><textarea className="f3-textarea" value={revision.notes} onChange={(e)=>setRevision({...revision,notes:e.target.value})}/></div></div><div className="f3-modal-actions"><button className="f3-btn" disabled={saving} onClick={()=>setRevision(null)}>Cancel</button><button className="f3-btn primary" disabled={saving} onClick={()=>void saveRevision()}>{saving?"Saving…":"Save Revision"}</button></div></section></div>}

    {discount && <div className="f3-backdrop" onMouseDown={(e)=>{if(e.currentTarget===e.target&&!saving)setDiscount(null)}}><section className="f3-modal"><h2>Service Discount · {discount.service}</h2><p>{discount.isDraft?"The discount will be stored directly on this draft service bill.":"The discount will be posted as a linked Credit Note and permanently reduce this service's commercial value."}</p><div className="f3-grid"><div className="f3-summary"><div><span>Current Billed</span><strong>{money(discount.currentNet)}</strong></div><div><span>New Discount</span><strong>{money(discount.amount)}</strong></div><div><span>After Discount</span><strong>{money(Math.max(0,discount.currentNet-num(discount.amount)))}</strong></div></div><div className="f3-field full"><label>Discount amount</label><input autoFocus className="f3-input" inputMode="decimal" value={discount.amount} onChange={(e)=>setDiscount({...discount,amount:e.target.value})}/></div><div className="f3-field full"><label>Reason (optional)</label><input className="f3-input" value={discount.reason} onChange={(e)=>setDiscount({...discount,reason:e.target.value})} placeholder="Client discount / negotiated discount"/></div><div className="f3-field full"><label>Notes</label><textarea className="f3-textarea" value={discount.notes} onChange={(e)=>setDiscount({...discount,notes:e.target.value})}/></div></div><div className="f3-modal-actions"><button className="f3-btn" disabled={saving} onClick={()=>setDiscount(null)}>Cancel</button><button className="f3-btn primary" disabled={saving} onClick={()=>void applyDiscount()}>{saving?"Applying…":"Apply Discount"}</button></div></section></div>}
  </main>;
}