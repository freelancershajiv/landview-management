"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import {
  BILL_CATEGORIES,
  BILL_SERVICE_CATALOG,
  type BillCategory,
  type BillEntryMode,
  normalizedBillPricing,
  numberValue,
  serviceDefinition,
} from "@/lib/billing-entry";

type Row = Record<string, unknown>;
type BillState = "Draft" | "Issued";
type ApiEnvelope = { success?: boolean; error?: string; message?: string; data?: unknown };

function text(value: unknown) { return String(value ?? "").trim(); }
function field(record: Row, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && text(value)) return value;
  }
  return "";
}
function normalizeProjectId(value: unknown) {
  const raw = text(value).toUpperCase();
  const match = raw.match(/^(?:LV[\s_-]*)?0*(\d+)$/i);
  return match ? `LV-${Number(match[1])}` : "";
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function saveBill(payload: Record<string, unknown>) {
  const response = await fetch("/api/billing/write", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "saveBill", ...payload }),
  });
  const raw = await response.text();
  let json: ApiEnvelope | null = null;
  try { json = raw ? JSON.parse(raw) as ApiEnvelope : null; } catch { json = null; }
  if (!response.ok || !json?.success) throw new Error(json?.error || json?.message || "Could not add the bill.");
  return json.data;
}

export default function AddBillPage() {
  const [projects, setProjects] = useState<Row[]>([]);
  const [projectId, setProjectId] = useState("");
  const [billDate, setBillDate] = useState(today());
  const [category, setCategory] = useState<BillCategory>("Engineering Bill");
  const [service, setService] = useState("");
  const [entryMode, setEntryMode] = useState<BillEntryMode>("flat_amount");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<BillState>("Issued");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const requested = normalizeProjectId(new URLSearchParams(window.location.search).get("fileId") || "");
    if (requested) setProjectId(requested);
    landViewApi.getProjects()
      .then((rows) => { if (active) setProjects(rows || []); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Could not load projects."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const options = useMemo(() => projects.map((project) => {
    const id = normalizeProjectId(field(project, ["Project_ID", "Project ID", "ProjectId"]));
    const client = text(field(project, ["Client_Name", "Client Name", "Client"]));
    const name = text(field(project, ["Project_Name", "Project Name", "Name"]));
    return { id, client, name };
  }).filter((item) => item.id).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [projects]);

  const selected = options.find((item) => item.id === normalizeProjectId(projectId));
  const knownService = serviceDefinition(service);
  const effectiveCategory = knownService?.category || category;
  const pricing = normalizedBillPricing({ mode: entryMode, quantity, unitPrice, amount });
  const gross = pricing.gross;
  const discountAmount = Math.max(0, numberValue(discount));
  const net = Math.max(0, gross - discountAmount);

  function changeService(value: string) {
    setService(value);
    const definition = serviceDefinition(value);
    if (!definition) return;
    setCategory(definition.category);
    setEntryMode(definition.defaultMode);
    if (definition.defaultMode === "quantity_rate" && !quantity) setQuantity("1");
  }

  function changeCategory(next: BillCategory) {
    if (knownService) return;
    setCategory(next);
    if (next === "Other Services Bill" && !amount && !unitPrice) {
      setEntryMode("quantity_rate");
      if (!quantity) setQuantity("1");
    }
  }

  async function submit() {
    const id = normalizeProjectId(projectId);
    if (!id || !selected) return setError("Choose a valid LAND VIEW project / File ID.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(billDate)) return setError("Choose a valid bill date.");
    if (!service.trim()) return setError("Enter a service / description.");
    if (entryMode === "quantity_rate" && !(numberValue(quantity) > 0)) return setError("Quantity must be greater than zero.");
    if (entryMode === "quantity_rate" && !(numberValue(unitPrice) > 0)) return setError("Enter a valid unit rate.");
    if (!(gross > 0)) return setError("Enter a valid bill amount.");
    if (discountAmount > gross) return setError("Discount cannot exceed the bill amount.");

    setSaving(true); setError(""); setMessage("");
    try {
      await saveBill({
        Project_ID: id,
        Bill_Date: billDate,
        Billing_Category: effectiveCategory,
        Category: effectiveCategory,
        Description: `[${effectiveCategory}] ${service.trim()}`,
        Quantity: pricing.quantity,
        Unit_Price: pricing.unitPrice,
        Amount: gross,
        Discount: discountAmount,
        Status: status,
        Notes: notes.trim(),
        Created_Via: "Finance Add Bill",
        Idempotency_Key: `finance-add-bill:${crypto.randomUUID()}`,
      });
      setMessage(`${service.trim()} added to ${id}${status === "Draft" ? " as Draft" : " and issued"}.`);
      setService("");
      setCategory("Engineering Bill");
      setEntryMode("flat_amount");
      setQuantity("1");
      setUnitPrice("");
      setAmount("");
      setDiscount("0");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the bill.");
    } finally { setSaving(false); }
  }

  return <main className="ab-page">
    <style>{`
      .ab-page{max-width:980px;margin:0 auto;color:var(--lv-text-primary)}.ab-page *{box-sizing:border-box}
      .ab-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:14px}.ab-head small{font-size:8px;font-weight:950;letter-spacing:.13em;color:var(--lv-brand-text)}.ab-head h1{margin:5px 0 3px;font-size:30px}.ab-head p{margin:0;color:var(--lv-text-muted);font-size:9px;line-height:1.5}.ab-actions{display:flex;gap:7px;flex-wrap:wrap}
      .ab-btn{min-height:38px;padding:0 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px;font-weight:950;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.ab-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.ab-btn:disabled{opacity:.55;cursor:not-allowed}
      .ab-msg{padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:9px}.ab-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.ab-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}
      .ab-panel{border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);padding:15px}.ab-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}.ab-field{display:grid;gap:6px}.ab-field.full{grid-column:1/-1}.ab-field label,.ab-field>span{font-size:8px;font-weight:950;letter-spacing:.07em;text-transform:uppercase;color:var(--lv-text-muted)}.ab-field input,.ab-field select,.ab-field textarea{width:100%;min-height:42px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);padding:9px 10px}.ab-field select:disabled{opacity:.62}.ab-field textarea{min-height:80px;resize:vertical}.ab-project{grid-column:1/-1;padding:10px 11px;border:1px solid var(--lv-border-subtle);border-radius:8px;background:var(--lv-surface-muted);font-size:9px;color:var(--lv-text-muted)}.ab-project strong{color:var(--lv-text-primary)}
      .ab-mode-note{grid-column:1/-1;padding:9px 10px;border:1px solid var(--lv-border-subtle);border-radius:8px;background:var(--lv-surface-muted);font-size:8px;color:var(--lv-text-muted)}
      .ab-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.ab-stat{padding:10px;border:1px solid var(--lv-border-subtle);border-radius:8px;background:var(--lv-surface-muted)}.ab-stat span{display:block;font-size:7px;font-weight:900;text-transform:uppercase;color:var(--lv-text-muted)}.ab-stat strong{display:block;margin-top:5px;font-size:17px}.ab-stat.net strong{color:var(--lv-brand-text)}.ab-submit{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
      @media(max-width:700px){.ab-head{align-items:flex-start;flex-direction:column}.ab-actions{width:100%}.ab-actions .ab-btn{flex:1}.ab-grid{grid-template-columns:1fr}.ab-field.full,.ab-project,.ab-mode-note{grid-column:auto}.ab-summary{grid-template-columns:1fr 1fr}.ab-submit{flex-direction:column}.ab-submit .ab-btn{width:100%}}
    `}</style>

    <header className="ab-head">
      <div><small>FINANCE / BILL ENTRY</small><h1>Add Bill</h1><p>Add one service bill quickly. Use Quantity × Rate for measurable items or Flat Amount for lump-sum services.</p></div>
      <div className="ab-actions"><Link className="ab-btn" href="/admin/finance/direct-bill">New Full Bill</Link><Link className="ab-btn" href="/admin/finance/full-bill-editor">Edit Full Bill</Link></div>
    </header>

    {error ? <div className="ab-msg bad">{error}</div> : null}
    {message ? <div className="ab-msg good">{message}</div> : null}

    <section className="ab-panel">
      <div className="ab-grid">
        <label className="ab-field full"><span>Project / File ID</span><select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={loading}><option value="">{loading ? "Loading projects…" : "Select project"}</option>{options.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.client || item.name || "Project"}</option>)}</select></label>
        {selected ? <div className="ab-project"><strong>{selected.id}</strong> · {selected.client || "Client not set"}{selected.name ? ` · ${selected.name}` : ""}</div> : null}
        <label className="ab-field"><span>Bill Date</span><input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)}/></label>
        <label className="ab-field"><span>Status</span><select value={status} onChange={(e) => setStatus(e.target.value as BillState)}><option value="Issued">Issued</option><option value="Draft">Draft</option></select></label>
        <label className="ab-field"><span>Billing Category</span><select value={effectiveCategory} disabled={Boolean(knownService)} onChange={(e) => changeCategory(e.target.value as BillCategory)}>{BILL_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="ab-field"><span>Service / Description</span><input list="finance-add-bill-services" value={service} onChange={(e) => changeService(e.target.value)} placeholder="Select or type service"/><datalist id="finance-add-bill-services">{BILL_SERVICE_CATALOG.map((item) => <option key={item.service} value={item.service}/>)}</datalist></label>
        <label className="ab-field"><span>Entry Type</span><select value={entryMode} onChange={(e) => setEntryMode(e.target.value as BillEntryMode)}><option value="quantity_rate">Quantity × Rate</option><option value="flat_amount">Flat Amount</option></select></label>
        {entryMode === "quantity_rate" ? <>
          <label className="ab-field"><span>Quantity</span><input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1"/></label>
          <label className="ab-field"><span>Unit Rate (BDT)</span><input inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0"/></label>
          <div className="ab-mode-note">Gross is calculated automatically: {numberValue(quantity) || 0} × ৳{numberValue(unitPrice).toLocaleString("en-BD")} = <strong>৳{gross.toLocaleString("en-BD")}</strong>.</div>
        </> : <>
          <label className="ab-field"><span>Flat Amount (BDT)</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"/></label>
          <div className="ab-mode-note">Flat Amount is stored consistently as Quantity 1 × Unit Rate, so invoices and reports use one pricing structure.</div>
        </>}
        <label className="ab-field"><span>Discount (BDT)</span><input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0"/></label>
        <label className="ab-field full"><span>Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes"/></label>
      </div>

      <div className="ab-summary"><div className="ab-stat"><span>Gross</span><strong>৳{gross.toLocaleString("en-BD")}</strong></div><div className="ab-stat"><span>Discount</span><strong>৳{discountAmount.toLocaleString("en-BD")}</strong></div><div className="ab-stat net"><span>Net Bill</span><strong>৳{net.toLocaleString("en-BD")}</strong></div></div>
      <div className="ab-submit"><button className="ab-btn primary" onClick={() => void submit()} disabled={saving}>{saving ? "Saving…" : status === "Draft" ? "Save Draft Bill" : "Add & Issue Bill"}</button></div>
    </section>
  </main>;
}
