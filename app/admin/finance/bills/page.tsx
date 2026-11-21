"use client";
import "./bill-manager.css";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

const BILL_CATEGORIES = ["Engineering Bill", "Design Books", "Supervision Bill", "Other Services Bill"] as const;
type BillCategory = typeof BILL_CATEGORIES[number];
type Row = Record<string, any>;
type DraftForm = { billId: string; date: string; category: BillCategory; service: string; amount: string; discount: string; notes: string };
type CorrectionForm = { billId: string; service: string; originalNet: number; currentNet: number; correctedNet: string; reason: string; notes: string };
type DiscountForm = { billId: string; service: string; currentNet: number; isDraft: boolean; gross: number; existingDiscount: number; amount: string; reason: string; notes: string };

function text(value: unknown) { return String(value ?? "").trim(); }
function pick(row: Row, ...keys: string[]) { for (const key of keys) { if (row?.[key] !== undefined && row?.[key] !== null && text(row[key])) return row[key]; } return ""; }
function num(value: unknown) { const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function money(value: unknown) { return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(num(value)); }
function normalizeProjectId(value: unknown) { const raw = text(value).toUpperCase(); const m = raw.match(/^(?:LV[\s_-]*)?0*(\d+)$/i); return m ? `LV-${Number(m[1])}` : ""; }
function billId(row: Row) { return text(pick(row, "Bill_ID", "bill_code")); }
function billStatus(row: Row) { return text(pick(row, "Status", "status")) || "—"; }
function isDraft(row: Row) { return billStatus(row).toLowerCase() === "draft"; }
function categoryOf(row: Row): BillCategory { const raw = text(pick(row, "Billing_Category", "billing_category", "Category", "category")); return BILL_CATEGORIES.includes(raw as BillCategory) ? raw as BillCategory : "Engineering Bill"; }
function serviceText(value: unknown) { return text(value).replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "").replace(/\s+—\s+(Credit Note|Debit Note).*$/i, "").trim(); }
function originalNet(row: Row) { const explicit = pick(row, "Net_Amount", "net_amount"); return text(explicit) ? num(explicit) : Math.max(0, num(pick(row, "Amount", "amount")) - num(pick(row, "Discount", "discount"))); }
function activeAdjustment(row: Row) { return text(row.status).toLowerCase() !== "void"; }
function isDiscountAdjustment(row: Row) { return activeAdjustment(row) && text(row.adjustment_type) === "Credit Note" && /^service discount\b/i.test(text(row.reason)); }

async function readJson(response: Response, fallback: string) {
  const raw = await response.text(); let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback));
  return json.data ?? json;
}

export default function BillManagerPage() {
  const [projectId, setProjectId] = useState("");
  const [records, setRecords] = useState<Row[]>([]);
  const [adjustments, setAdjustments] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<DraftForm | null>(null);
  const [correction, setCorrection] = useState<CorrectionForm | null>(null);
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
      if (isDiscountAdjustment(row)) current.discount += amount;
      map.set(key, current);
    }
    return map;
  }, [adjustments]);

  function effectiveNet(row: Row) {
    const original = originalNet(row);
    const adj = adjustmentByBill.get(billId(row)) || { debit: 0, credit: 0, discount: 0 };
    return Math.max(0, original + adj.debit - adj.credit);
  }

  function totalDiscount(row: Row) {
    const base = Math.max(0, num(pick(row, "Discount", "discount")));
    const adj = adjustmentByBill.get(billId(row)) || { debit: 0, credit: 0, discount: 0 };
    return base + adj.discount;
  }

  async function load(raw = projectId) {
    const id = normalizeProjectId(raw);
    if (!id) return setError("Enter a valid File ID, for example LV-134.");
    setProjectId(id); setLoading(true); setError(""); setMessage("");
    try {
      const [billRows, adjustmentRows] = await Promise.all([
        landViewApi.getBillingRecords(id),
        readJson(await fetch(`/api/billing/adjustments?projectId=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" }), "Could not load bill corrections."),
      ]);
      setRecords(Array.isArray(billRows) ? billRows.filter((row) => !/credit note|debit note/i.test(text(pick(row, "Created_Via", "created_via")))) : []);
      setAdjustments(Array.isArray(adjustmentRows) ? adjustmentRows : []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load billed items."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const id = normalizeProjectId(new URLSearchParams(window.location.search).get("fileId") || "");
    if (id) void load(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function begin(row: Row) {
    setError(""); setMessage(""); setDiscount(null);
    if (isDraft(row)) {
      setDraft({
        billId: billId(row),
        date: text(pick(row, "Bill_Date", "bill_date")).slice(0, 10),
        category: categoryOf(row),
        service: serviceText(pick(row, "Description", "description")),
        amount: text(pick(row, "Amount", "amount")),
        discount: text(pick(row, "Discount", "discount")) || "0",
        notes: text(pick(row, "Notes", "notes")),
      });
      setCorrection(null);
      return;
    }
    const original = originalNet(row);
    const current = effectiveNet(row);
    setCorrection({ billId: billId(row), service: serviceText(pick(row, "Description", "description")), originalNet: original, currentNet: current, correctedNet: String(current), reason: "", notes: "" });
    setDraft(null);
  }

  function beginDiscount(row: Row) {
    setError(""); setMessage(""); setDraft(null); setCorrection(null);
    const gross = Math.max(0, num(pick(row, "Amount", "amount")));
    const existingDiscount = Math.max(0, num(pick(row, "Discount", "discount")));
    setDiscount({
      billId: billId(row),
      service: serviceText(pick(row, "Description", "description")),
      currentNet: effectiveNet(row),
      isDraft: isDraft(row),
      gross,
      existingDiscount,
      amount: "",
      reason: "",
      notes: "",
    });
  }

  async function saveDraft() {
    if (!draft) return;
    const gross = num(draft.amount); const discountAmount = num(draft.discount);
    if (!draft.date) return setError("Bill date is required.");
    if (!draft.service.trim()) return setError("Service / description is required.");
    if (!(gross > 0)) return setError("Enter a valid gross amount.");
    if (discountAmount < 0 || discountAmount > gross) return setError("Discount must be between zero and the gross amount.");
    setSaving(true); setError(""); setMessage("");
    try {
      await readJson(await fetch("/api/billing/bills", { method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ Bill_ID: draft.billId, Project_ID: projectId, Bill_Date: draft.date, Billing_Category: draft.category, Description: draft.service.trim(), Amount: gross, Discount: discountAmount, Notes: draft.notes.trim() }) }), "Could not update draft bill.");
      const id = draft.billId; setDraft(null); await load(projectId); setMessage(`${id} updated.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update draft bill."); }
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
        if (newDiscount > discount.gross + 0.009) throw new Error("Total discount cannot exceed the gross bill amount.");
        await readJson(await fetch("/api/billing/bills", {
          method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            Bill_ID: discount.billId,
            Project_ID: projectId,
            Bill_Date: text(pick(row, "Bill_Date", "bill_date")).slice(0, 10),
            Billing_Category: categoryOf(row),
            Description: serviceText(pick(row, "Description", "description")),
            Amount: discount.gross,
            Discount: newDiscount,
            Notes: [text(pick(row, "Notes", "notes")), `Service discount: ${money(amount)}${discount.reason.trim() ? ` — ${discount.reason.trim()}` : ""}`].filter(Boolean).join("\n"),
          }),
        }), "Could not apply draft discount.");
      } else {
        await readJson(await fetch("/api/billing/adjustments", {
          method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            projectId,
            billCode: discount.billId,
            type: "Credit Note",
            amount,
            reason: `Service discount${discount.reason.trim() ? ` — ${discount.reason.trim()}` : ""}`,
            notes: discount.notes.trim(),
          }),
        }), "Could not apply service discount.");
      }
      const id = discount.billId; const service = discount.service; setDiscount(null); await load(projectId);
      setMessage(`${money(amount)} discount applied to ${service || id}. ${discount.isDraft ? "Draft net value was reduced." : "A Credit Note preserved the issued bill history."}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not apply service discount."); }
    finally { setSaving(false); }
  }

  async function postCorrection() {
    if (!correction) return;
    const corrected = num(correction.correctedNet);
    if (corrected < 0) return setError("Corrected billed value cannot be negative.");
    if (!correction.reason.trim()) return setError("Enter a reason for this correction.");
    const delta = Math.round((corrected - correction.currentNet) * 100) / 100;
    if (Math.abs(delta) < 0.01) return setError("Enter a corrected value different from the current billed value.");
    const type = delta > 0 ? "Debit Note" : "Credit Note";
    const amount = Math.abs(delta);
    setSaving(true); setError(""); setMessage("");
    try {
      const data = await readJson(await fetch("/api/billing/adjustments", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", projectId, billCode: correction.billId, type, amount, reason: correction.reason.trim(), notes: correction.notes.trim() }) }), "Could not correct billed item.");
      const id = correction.billId; setCorrection(null); await load(projectId);
      setMessage(`${id} corrected to ${money(corrected)} using ${data?.adjustment_code || type}. Original billing history was preserved.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not correct billed item."); }
    finally { setSaving(false); }
  }

  async function removeDraft(row: Row) {
    const id = billId(row); if (!id || deleting || !isDraft(row)) return;
    if (!window.confirm(`Remove draft ${id}?\n\nOnly draft bills can be deleted.`)) return;
    setDeleting(id); setError(""); setMessage("");
    try {
      await readJson(await fetch("/api/billing/bills", { method: "DELETE", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ Bill_ID: id, Project_ID: projectId }) }), "Could not remove draft bill.");
      setRecords((rows) => rows.filter((item) => billId(item) !== id)); setMessage(`${id} removed.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove draft bill."); }
    finally { setDeleting(""); }
  }

  const totals = useMemo(() => records.reduce((sum, row) => sum + effectiveNet(row), 0), [records, adjustmentByBill]);
  const discountTotal = useMemo(() => records.reduce((sum, row) => sum + totalDiscount(row), 0), [records, adjustmentByBill]);

  return <main className="bm-page">

    <header className="bm-head"><div><small>LAND VIEW / FINANCE</small><h1>Bill Manager</h1><p>Add bills, apply service-wise discounts, edit drafts, and safely correct issued bills.</p></div><div className="bm-actions"><Link className="bm-btn primary" data-lv-button="primary" href={`/admin/finance/direct-bill${projectId ? `?fileId=${encodeURIComponent(projectId)}` : ""}`}>+ Add New Bill</Link>{projectId && <Link className="bm-btn" data-lv-button="secondary" href={`/admin/finance/invoices?fileId=${encodeURIComponent(projectId)}`}>Invoice / Statement</Link>}</div></header>

    <section className="bm-find"><input className="bm-input" value={projectId} onChange={(e)=>setProjectId(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter") void load();}} placeholder="File ID — e.g. LV-134"/><button className="bm-btn primary" data-lv-button="primary" disabled={loading} onClick={()=>void load()}>{loading?"Loading…":"Load Bills"}</button></section>
    {error && <div className="bm-msg bad">{error}</div>}{message && <div className="bm-msg good">{message}</div>}

    <section className="bm-table-wrap">{records.length ? <><table role="table" data-mobile-table="" className="bm-table"><thead role="rowgroup"><tr role="row"><th role="columnheader">Bill ID</th><th role="columnheader">Date</th><th role="columnheader">Category</th><th role="columnheader">Service</th><th role="columnheader">Original Net</th><th role="columnheader">Discount</th><th role="columnheader">Current Billed</th><th role="columnheader">Status</th><th role="columnheader">Actions</th></tr></thead><tbody role="rowgroup">{records.map((row)=>{const id=billId(row);const original=originalNet(row);const current=effectiveNet(row);const given=totalDiscount(row);return <tr role="row" key={id}><td role="cell" data-mobile-label="Bill ID"><strong>{id}</strong></td><td role="cell" data-mobile-label="Date">{text(pick(row,"Bill_Date","bill_date"))||"—"}</td><td role="cell" data-mobile-label="Category">{categoryOf(row)}</td><td role="cell" data-mobile-label="Service">{serviceText(pick(row,"Description","description"))||"—"}</td><td role="cell" data-mobile-label="Original Net">{money(original)}</td><td role="cell" data-mobile-label="Discount" className={given>.009?"bm-discount-value":""}>{given>.009?money(given):"—"}</td><td role="cell" data-mobile-label="Current Billed" className={Math.abs(current-original)>.009?"bm-adjusted":""}>{money(current)}{Math.abs(current-original)>.009?" · adjusted":""}</td><td role="cell" data-mobile-label="Status"><span className="bm-status">{billStatus(row)}</span></td><td role="cell" data-mobile-label="Actions"><div className="bm-row-actions"><button className="bm-btn discount" data-lv-button="soft" onClick={()=>beginDiscount(row)}>Discount</button><button className="bm-btn" data-lv-button="secondary" onClick={()=>begin(row)}>{isDraft(row)?"Edit":"Edit / Correct"}</button>{isDraft(row)&&<button className="bm-btn danger" data-lv-button="danger" disabled={Boolean(deleting)} onClick={()=>void removeDraft(row)}>{deleting===id?"Removing…":"Remove"}</button>}</div></td></tr>})}</tbody></table><div className="bm-total"><span>Service discounts:<strong>{money(discountTotal)}</strong></span><span>Current billed total:<strong>{money(totals)}</strong></span></div></> : <div className="bm-empty">{loading?"Loading billed items…":projectId?`No billed items found for ${projectId}. Use Add New Bill to create one.`:"Enter a File ID to view and manage bills."}</div>}</section>

    {discount && <div className="bm-backdrop" onMouseDown={(e)=>{if(e.currentTarget===e.target&&!saving)setDiscount(null)}}><section className="bm-modal"><h2>Give Discount · {discount.service || discount.billId}</h2><p>{discount.isDraft ? "This draft discount will be stored directly on the service bill." : "This issued bill stays unchanged. The discount will be posted as a linked Credit Note and will reduce the service due."}</p><div className="bm-grid"><div className="bm-summary"><div><span>Current billed</span><strong>{money(discount.currentNet)}</strong></div><div><span>Discount</span><strong>{money(discount.amount)}</strong></div><div><span>New billed value</span><strong>{money(Math.max(0, discount.currentNet-num(discount.amount)))}</strong></div></div><div className="bm-field full"><label>Discount amount (BDT)</label><input className="bm-input" autoFocus inputMode="decimal" value={discount.amount} onChange={(e)=>setDiscount({...discount,amount:e.target.value})} placeholder="e.g. 5000"/></div><div className="bm-field full"><label>Reason (optional)</label><input className="bm-input" value={discount.reason} onChange={(e)=>setDiscount({...discount,reason:e.target.value})} placeholder="Special client discount / negotiated discount"/></div><div className="bm-field full"><label>Notes (optional)</label><textarea className="bm-textarea" value={discount.notes} onChange={(e)=>setDiscount({...discount,notes:e.target.value})}/></div></div><div className="bm-modal-actions"><button className="bm-btn" data-lv-button="secondary" disabled={saving} onClick={()=>setDiscount(null)}>Cancel</button><button className="bm-btn discount" data-lv-button="soft" disabled={saving} onClick={()=>void applyDiscount()}>{saving?"Applying…":"Apply Discount"}</button></div></section></div>}

    {draft && <div className="bm-backdrop" onMouseDown={(e)=>{if(e.currentTarget===e.target&&!saving)setDraft(null)}}><section className="bm-modal"><h2>Edit Draft · {draft.billId}</h2><p>Draft bills can be edited directly because they have not been posted.</p><div className="bm-grid"><div className="bm-field"><label>Bill date</label><input className="bm-input" type="date" value={draft.date} onChange={(e)=>setDraft({...draft,date:e.target.value})}/></div><div className="bm-field"><label>Category</label><select className="bm-select" value={draft.category} onChange={(e)=>setDraft({...draft,category:e.target.value as BillCategory})}>{BILL_CATEGORIES.map((x)=><option key={x}>{x}</option>)}</select></div><div className="bm-field full"><label>Service / description</label><input className="bm-input" value={draft.service} onChange={(e)=>setDraft({...draft,service:e.target.value})}/></div><div className="bm-field"><label>Gross amount</label><input className="bm-input" inputMode="decimal" value={draft.amount} onChange={(e)=>setDraft({...draft,amount:e.target.value})}/></div><div className="bm-field"><label>Discount</label><input className="bm-input" inputMode="decimal" value={draft.discount} onChange={(e)=>setDraft({...draft,discount:e.target.value})}/></div><div className="bm-field full"><label>Notes</label><textarea className="bm-textarea" value={draft.notes} onChange={(e)=>setDraft({...draft,notes:e.target.value})}/></div></div><div className="bm-modal-actions"><button className="bm-btn" data-lv-button="secondary" disabled={saving} onClick={()=>setDraft(null)}>Cancel</button><button className="bm-btn primary" data-lv-button="primary" disabled={saving} onClick={()=>void saveDraft()}>{saving?"Saving…":"Save Changes"}</button></div></section></div>}

    {correction && <div className="bm-backdrop" onMouseDown={(e)=>{if(e.currentTarget===e.target&&!saving)setCorrection(null)}}><section className="bm-modal"><h2>Edit / Correct · {correction.billId}</h2><p>{correction.service || "Billed item"}. Issued/paid bills stay audit-safe: changing the billed value posts the required Credit Note or Debit Note automatically.</p><div className="bm-grid"><div className="bm-summary"><div><span>Original bill</span><strong>{money(correction.originalNet)}</strong></div><div><span>Current billed value</span><strong>{money(correction.currentNet)}</strong></div><div><span>Correction</span><strong>{(()=>{const d=num(correction.correctedNet)-correction.currentNet;return Math.abs(d)<.01?"No change":`${d>0?"Debit":"Credit"} ${money(Math.abs(d))}`;})()}</strong></div></div><div className="bm-field full"><label>Correct billed value</label><input className="bm-input" inputMode="decimal" value={correction.correctedNet} onChange={(e)=>setCorrection({...correction,correctedNet:e.target.value})}/></div><div className="bm-field full"><label>Reason</label><input className="bm-input" value={correction.reason} onChange={(e)=>setCorrection({...correction,reason:e.target.value})} placeholder="Amount correction / scope change / additional work"/></div><div className="bm-field full"><label>Notes (optional)</label><textarea className="bm-textarea" value={correction.notes} onChange={(e)=>setCorrection({...correction,notes:e.target.value})}/></div></div><div className="bm-modal-actions"><Link className="bm-btn" data-lv-button="secondary" href={`/admin/finance/adjustments?fileId=${encodeURIComponent(projectId)}`}>Advanced Notes</Link><button className="bm-btn" data-lv-button="secondary" disabled={saving} onClick={()=>setCorrection(null)}>Cancel</button><button className="bm-btn primary" data-lv-button="primary" disabled={saving} onClick={()=>void postCorrection()}>{saving?"Posting…":"Save Correction"}</button></div></section></div>}
  </main>;
}
