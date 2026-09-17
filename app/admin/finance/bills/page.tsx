"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { landViewApi } from "@/lib/api";

const BILL_CATEGORIES = ["Engineering Bill", "Design Books", "Supervision Bill", "Other Services Bill"] as const;
type BillCategory = typeof BILL_CATEGORIES[number];
type BillRow = Record<string, unknown>;
type EditForm = { billId: string; date: string; category: BillCategory; service: string; amount: string; discount: string; notes: string };

function value(row: BillRow, key: string) { return String(row?.[key] ?? "").trim(); }
function normalizeProjectId(raw: string) {
  const match = raw.trim().toUpperCase().match(/^(?:LV[\s_-]*)?0*(\d+)$/i);
  return match ? `LV-${Number(match[1])}` : "";
}
function money(input: unknown) {
  const n = Number(String(input ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}
function serviceText(input: unknown) {
  return String(input ?? "").replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "").trim();
}
function categoryOf(row: BillRow): BillCategory {
  const raw = value(row, "Billing_Category") || value(row, "Category");
  return BILL_CATEGORIES.includes(raw as BillCategory) ? raw as BillCategory : "Engineering Bill";
}

export default function EditBillsPage() {
  const [projectId, setProjectId] = useState("");
  const [records, setRecords] = useState<BillRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [edit, setEdit] = useState<EditForm | null>(null);

  async function load(raw = projectId) {
    const id = normalizeProjectId(raw);
    if (!id) { setError("Enter a valid Project ID, for example LV-279."); return; }
    setProjectId(id); setLoading(true); setError(""); setMessage("");
    try { setRecords(await landViewApi.getBillingRecords(id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load billed items."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const id = normalizeProjectId(new URLSearchParams(window.location.search).get("fileId") || "");
    if (id) void load(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function begin(row: BillRow) {
    setError(""); setMessage("");
    setEdit({
      billId: value(row, "Bill_ID"),
      date: value(row, "Bill_Date").slice(0, 10),
      category: categoryOf(row),
      service: serviceText(value(row, "Description")),
      amount: value(row, "Amount"),
      discount: value(row, "Discount") || "0",
      notes: value(row, "Notes"),
    });
  }

  async function save() {
    if (!edit) return;
    const gross = Number(edit.amount.replace(/,/g, ""));
    const discount = Number(edit.discount.replace(/,/g, ""));
    if (!edit.service.trim()) return setError("Service / description is required.");
    if (!(gross > 0)) return setError("Enter a valid gross amount.");
    if (!Number.isFinite(discount) || discount < 0 || discount > gross) return setError("Discount must be between zero and the gross amount.");
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/billing/bills", {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Bill_ID: edit.billId, Project_ID: projectId, Bill_Date: edit.date, Billing_Category: edit.category, Description: edit.service.trim(), Amount: gross, Discount: discount, Notes: edit.notes.trim() }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not update billed item."));
      setEdit(null); setMessage(`${edit.billId} updated. The generated invoice will use the revised values.`); await load(projectId);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update billed item."); }
    finally { setSaving(false); }
  }

  return <div className="bill-editor">
    <style>{`
      .bill-editor{color:#edf2f6}.be-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:18px}.be-head small{color:#ef6c66;font-weight:900;letter-spacing:.12em}.be-head h1{margin:5px 0 0;font-size:32px}.be-actions{display:flex;gap:7px;flex-wrap:wrap}.be-btn{border:1px solid #3b4852;background:#17222b;color:#eef2f5;border-radius:8px;padding:9px 12px;font-weight:850;text-decoration:none;cursor:pointer}.be-btn.primary{background:#d94b45;border-color:#d94b45;color:#fff}.be-btn:disabled{opacity:.5;cursor:not-allowed}.be-find{display:flex;gap:8px;align-items:end;padding:14px;border:1px solid #303b44;background:#101820;border-radius:10px;margin-bottom:14px}.be-find label{display:grid;gap:5px;flex:1;color:#8d9aa4;font-size:10px}.be-find input,.be-edit input,.be-edit select,.be-edit textarea{border:1px solid #36434d;border-radius:7px;background:#0a1117;color:#eef2f5;padding:10px}.be-msg,.be-error{padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:11px}.be-msg{border:1px solid #315e45;background:#163023;color:#a8e6bb}.be-error{border:1px solid #73363a;background:#351b1d;color:#ffaaa5}.be-table{overflow:auto;border:1px solid #303b44;border-radius:10px}.be-table table{width:100%;border-collapse:collapse;min-width:950px}.be-table th,.be-table td{padding:10px 11px;border-bottom:1px solid #28323a;text-align:left;font-size:11px}.be-table th{color:#8f9aa3;text-transform:uppercase;font-size:9px;letter-spacing:.06em}.be-table tbody tr:hover{background:#131d25}.be-empty{padding:22px;text-align:center;color:#8996a0;border:1px solid #303b44;border-radius:10px}.be-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:18px;z-index:1000}.be-edit{width:min(720px,100%);max-height:90vh;overflow:auto;border:1px solid #3a4650;border-radius:12px;background:#101820;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.45)}.be-edit h2{margin:0 0 4px}.be-edit p{margin:0 0 14px;color:#8996a0;font-size:10px}.be-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.be-grid label{display:grid;gap:5px;color:#8d9aa4;font-size:10px}.be-grid .full{grid-column:1/-1}.be-grid textarea{min-height:80px;resize:vertical}.be-summary{grid-column:1/-1;display:flex;justify-content:space-between;padding:10px 12px;border:1px solid #35414a;border-radius:8px}.be-edit-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}@media(max-width:650px){.be-head,.be-find{align-items:stretch;flex-direction:column}.be-grid{grid-template-columns:1fr}.be-grid .full{grid-column:auto}}
    `}</style>
    <header className="be-head"><div><small>LAND VIEW / BILLING</small><h1>Edit Billed Invoice Items</h1></div><div className="be-actions"><Link className="be-btn" href="/admin/finance">← Billing</Link>{projectId&&<Link className="be-btn primary" href={`/admin/finance/invoices?fileId=${encodeURIComponent(projectId)}`}>Open invoice</Link>}</div></header>
    <div className="be-find"><label>Project / File ID<input value={projectId} onChange={(e)=>setProjectId(e.target.value)} placeholder="LV-279"/></label><button className="be-btn primary" disabled={loading} onClick={()=>void load()}>{loading?"Loading…":"Load billed items"}</button></div>
    {error&&<div className="be-error">{error}</div>}{message&&<div className="be-msg">{message}</div>}
    {!loading&&projectId&&records.length===0?<div className="be-empty">No billed items found for {projectId}.</div>:records.length>0&&<div className="be-table"><table><thead><tr><th>Bill ID</th><th>Date</th><th>Category</th><th>Description</th><th>Gross</th><th>Discount</th><th>Net</th><th>Status</th><th></th></tr></thead><tbody>{records.map((row)=><tr key={value(row,"Bill_ID")}><td><strong>{value(row,"Bill_ID")}</strong></td><td>{value(row,"Bill_Date")||"—"}</td><td>{value(row,"Billing_Category")||value(row,"Category")||"—"}</td><td>{serviceText(value(row,"Description"))||"—"}</td><td>{money(row.Amount)}</td><td>{money(row.Discount)}</td><td>{money(row.Net_Amount)}</td><td>{value(row,"Status")||"—"}</td><td><button className="be-btn" onClick={()=>begin(row)}>Edit</button></td></tr>)}</tbody></table></div>}
    {edit&&<div className="be-backdrop" onMouseDown={(e)=>{if(e.currentTarget===e.target&&!saving)setEdit(null)}}><section className="be-edit"><h2>Edit {edit.billId}</h2><p>Changes update the billed item in Supabase. Existing payment records remain untouched.</p><div className="be-grid"><label>Bill date<input type="date" value={edit.date} onChange={(e)=>setEdit({...edit,date:e.target.value})}/></label><label>Category<select value={edit.category} onChange={(e)=>setEdit({...edit,category:e.target.value as BillCategory})}>{BILL_CATEGORIES.map((item)=><option key={item}>{item}</option>)}</select></label><label className="full">Service / description<input value={edit.service} onChange={(e)=>setEdit({...edit,service:e.target.value})}/></label><label>Gross amount (BDT)<input inputMode="decimal" value={edit.amount} onChange={(e)=>setEdit({...edit,amount:e.target.value})}/></label><label>Discount (BDT)<input inputMode="decimal" value={edit.discount} onChange={(e)=>setEdit({...edit,discount:e.target.value})}/></label><div className="be-summary"><span>Net billed</span><strong>{money(Math.max(0,(Number(edit.amount.replace(/,/g,""))||0)-(Number(edit.discount.replace(/,/g,""))||0)))}</strong></div><label className="full">Notes<textarea value={edit.notes} onChange={(e)=>setEdit({...edit,notes:e.target.value})}/></label></div><div className="be-edit-actions"><button className="be-btn" disabled={saving} onClick={()=>setEdit(null)}>Cancel</button><button className="be-btn primary" disabled={saving} onClick={()=>void save()}>{saving?"Saving…":"Save changes"}</button></div></section></div>}
  </div>;
}
