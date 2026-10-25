"use client";

import Link from "next/link";
import { useState } from "react";

type Row = Record<string, any>;
function money(value: unknown) { return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(Number(value || 0)); }
async function readJson(response: Response, fallback: string) {
  const raw = await response.text(); let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback));
  return json.data ?? json;
}

export default function BillingAdjustmentsPage() {
  const [projectId, setProjectId] = useState("");
  const [bills, setBills] = useState<Row[]>([]);
  const [adjustments, setAdjustments] = useState<Row[]>([]);
  const [billCode, setBillCode] = useState("");
  const [type, setType] = useState<"Credit Note" | "Debit Note">("Credit Note");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const id = projectId.trim().toUpperCase(); if (!id) return setError("Enter a Project / File ID.");
    setBusy(true); setError(""); setMessage("");
    try {
      const [billData, adjustmentData] = await Promise.all([
        readJson(await fetch(`/api/landview?action=getBillingRecords&projectId=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" }), "Could not load project bills."),
        readJson(await fetch(`/api/billing/adjustments?projectId=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" }), "Could not load adjustments."),
      ]);
      const rows = Array.isArray(billData) ? billData : [];
      setBills(rows.filter((row) => !/credit note|debit note/i.test(String(row.Created_Via || row.created_via || ""))));
      setAdjustments(Array.isArray(adjustmentData) ? adjustmentData : []);
      if (!billCode && rows.length) setBillCode(String(rows[0].Bill_ID || rows[0].bill_code || ""));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load bills."); }
    finally { setBusy(false); }
  }

  async function createAdjustment() {
    if (!projectId.trim() || !billCode || !Number(amount) || !reason.trim()) return setError("Project, original bill, amount and reason are required.");
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await readJson(await fetch("/api/billing/adjustments", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", projectId: projectId.trim().toUpperCase(), billCode, type, amount, reason, notes }) }), "Could not post adjustment.");
      setMessage(`${data.adjustment_code || type} posted successfully. Original bill ${billCode} was not changed.`);
      setAmount(""); setReason(""); setNotes(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not post adjustment."); }
    finally { setBusy(false); }
  }

  async function voidAdjustment(row: Row) {
    const why = window.prompt(`Void ${row.adjustment_code}?\n\nEnter the reason:`); if (!why?.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await readJson(await fetch("/api/billing/adjustments", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "void", adjustmentCode: row.adjustment_code, reason: why.trim() }) }), "Could not void adjustment.");
      setMessage(`${row.adjustment_code} voided. The original bill remains unchanged.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not void adjustment."); }
    finally { setBusy(false); }
  }

  const chosen = bills.find((row) => String(row.Bill_ID || row.bill_code) === billCode);
  return <main className="adj-page"><style>{`
    .adj-page{max-width:1350px;margin:0 auto;color:var(--lv-text-primary)}.adj-page *{box-sizing:border-box}.adj-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;margin-bottom:14px}.adj-head small{font-size:9px;font-weight:950;letter-spacing:.12em;color:var(--lv-brand-text)}.adj-head h1{margin:5px 0;font-size:28px}.adj-head p{margin:0;color:var(--lv-text-secondary);font-size:10px;max-width:760px}.adj-actions{display:flex;gap:7px;flex-wrap:wrap}.adj-btn{min-height:37px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px;font-weight:900;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.adj-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.adj-btn.danger{color:var(--lv-danger);border-color:var(--lv-danger)}.adj-btn:disabled{opacity:.5}.adj-msg{padding:10px 12px;border-radius:8px;margin-bottom:10px;font-size:10px}.adj-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.adj-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.adj-card{border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);overflow:hidden;margin-bottom:12px}.adj-card h2{font-size:13px;margin:0}.adj-card-head{padding:12px 14px;border-bottom:1px solid var(--lv-border-default)}.adj-card-head p{margin:4px 0 0;color:var(--lv-text-muted);font-size:8px}.adj-body{padding:13px}.adj-load{display:grid;grid-template-columns:1fr auto;gap:8px}.adj-grid{display:grid;grid-template-columns:1.1fr 1fr 1fr 1.4fr;gap:8px}.adj-field{display:grid;gap:5px}.adj-field label{font-size:7px;text-transform:uppercase;font-weight:950;color:var(--lv-text-muted)}.adj-input,.adj-select,.adj-textarea{width:100%;padding:8px 9px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.adj-input,.adj-select{min-height:38px}.adj-textarea{min-height:75px;resize:vertical}.adj-preview{margin-top:10px;padding:10px 11px;border:1px solid var(--lv-border-subtle);border-radius:8px;background:var(--lv-surface-muted);font-size:9px}.adj-preview strong{display:block}.adj-preview span{display:block;margin-top:4px;color:var(--lv-text-muted)}.adj-table-wrap{overflow:auto}.adj-table{width:100%;border-collapse:collapse;min-width:900px}.adj-table th,.adj-table td{padding:9px 10px;border-bottom:1px solid var(--lv-border-subtle);font-size:8px;text-align:left}.adj-table th{font-size:7px;text-transform:uppercase;color:var(--lv-text-muted);background:var(--lv-surface-muted)}.adj-status{display:inline-flex;padding:4px 6px;border-radius:999px;font-size:7px;font-weight:950;background:var(--lv-success-soft);color:var(--lv-success)}.adj-status.void{background:var(--lv-surface-muted);color:var(--lv-text-muted)}.adj-empty{padding:22px;text-align:center;color:var(--lv-text-muted);font-size:9px}@media(max-width:800px){.adj-head{flex-direction:column;align-items:stretch}.adj-grid,.adj-load{grid-template-columns:1fr}.adj-actions .adj-btn{flex:1}}
  `}</style>
    <header className="adj-head"><div><small>LAND VIEW / BILLING ADJUSTMENTS</small><h1>Credit & Debit Notes</h1><p>Posted bills remain immutable. Use a Credit Note to reduce a billed amount or a Debit Note to add an amount. Every correction stays linked to the original bill and remains auditable.</p></div><div className="adj-actions"><Link className="adj-btn" href="/admin/finance/bills">Bills</Link><Link className="adj-btn primary" href="/admin/finance/billing-control">Billing Controls</Link></div></header>
    {error && <div className="adj-msg bad">{error}</div>}{message && <div className="adj-msg good">{message}</div>}
    <section className="adj-card"><div className="adj-card-head"><h2>Choose Project</h2><p>Load the original posted bill before creating a correction.</p></div><div className="adj-body"><div className="adj-load"><input className="adj-input" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="LV-247" onKeyDown={(e) => { if (e.key === "Enter") void load(); }} /><button className="adj-btn primary" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Load Bills"}</button></div></div></section>
    <section className="adj-card"><div className="adj-card-head"><h2>Post Adjustment</h2><p>The original bill is never edited or deleted.</p></div><div className="adj-body"><div className="adj-grid"><div className="adj-field"><label>Original Bill</label><select className="adj-select" value={billCode} onChange={(e) => setBillCode(e.target.value)}><option value="">Choose bill</option>{bills.map((row) => <option key={String(row.Bill_ID || row.bill_code)} value={String(row.Bill_ID || row.bill_code)}>{String(row.Bill_ID || row.bill_code)} · {String(row.Description || row.description || "Service")} · {money(row.Net_Amount ?? row.net_amount ?? Number(row.Amount || 0) - Number(row.Discount || 0))}</option>)}</select></div><div className="adj-field"><label>Type</label><select className="adj-select" value={type} onChange={(e) => setType(e.target.value as any)}><option>Credit Note</option><option>Debit Note</option></select></div><div className="adj-field"><label>Amount</label><input className="adj-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" /></div><div className="adj-field"><label>Reason</label><input className="adj-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Scope reduction / additional service / correction" /></div></div><div className="adj-field" style={{marginTop:8}}><label>Notes (optional)</label><textarea className="adj-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>{chosen && <div className="adj-preview"><strong>{String(chosen.Bill_ID || chosen.bill_code)} · {String(chosen.Description || chosen.description || "")}</strong><span>Original net: {money(chosen.Net_Amount ?? chosen.net_amount ?? Number(chosen.Amount || 0) - Number(chosen.Discount || 0))} · Status: {String(chosen.Status || chosen.status || "")}</span></div>}<div className="adj-actions" style={{marginTop:10}}><button className="adj-btn primary" disabled={busy || !chosen} onClick={() => void createAdjustment()}>{busy ? "Posting…" : `Post ${type}`}</button></div></div></section>
    <section className="adj-card"><div className="adj-card-head"><h2>Adjustment History</h2><p>Void an adjustment if the note itself was created incorrectly. Original bills remain unchanged.</p></div><div className="adj-table-wrap">{adjustments.length ? <table className="adj-table"><thead><tr><th>Date</th><th>Note</th><th>Original Bill</th><th>Service</th><th>Type</th><th>Amount</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>{adjustments.map((row) => <tr key={row.id}><td>{String(row.posted_at || "").slice(0,10)}</td><td><strong>{row.adjustment_code}</strong></td><td>{row.bill_code}</td><td>{row.service_name}</td><td>{row.adjustment_type}</td><td><strong>{money(row.amount)}</strong></td><td>{row.reason}</td><td><span className={`adj-status ${String(row.status).toLowerCase() === "void" ? "void" : ""}`}>{row.status}</span></td><td>{String(row.status).toLowerCase() !== "void" && <button className="adj-btn danger" disabled={busy} onClick={() => void voidAdjustment(row)}>Void Note</button>}</td></tr>)}</tbody></table> : <div className="adj-empty">No adjustment notes for this project.</div>}</div></section>
  </main>;
}
