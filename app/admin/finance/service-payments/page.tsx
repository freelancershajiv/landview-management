"use client";

import { useEffect, useRef, useState } from "react";
import ProjectReceiptHistory from "@/components/project-receipt-history";

import type { PaymentBillOptions } from "@/lib/billing-payment-bills";

type Row = Record<string, unknown>;
type ProjectOption = { projectId?: string; project_code?: string; ownerName?: string; projectName?: string; project_name?: string };
type PendingPayment = { key: string; fingerprint: string; projectId: string };
const pendingStorageKey = "lv-billing-payment-v4";
function persistPending(payment: PendingPayment) {
  try { window.sessionStorage.setItem(pendingStorageKey, JSON.stringify({ ...payment, createdAt: Date.now() })); }
  catch { /* The in-memory submission key is retained until reload. */ }
}
type Category = "Engineering Bill" | "Other Services Bill" | "Supervision Bill";
const CATEGORY_ORDER: Category[] = ["Engineering Bill", "Other Services Bill", "Supervision Bill"];

function money(v: unknown) {
  const n = Number(v || 0);
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}
function num(v: unknown) {
  const raw = String(v ?? "").trim().replace(/,/g, "");
  return /^\d+(\.\d{1,2})?$/.test(raw) ? Number(raw) : NaN;
}
function today() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
async function readJson(response: Response, fallback: string) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw Object.assign(new Error(String(json?.error || fallback)), { status: response.status });
  return json.data;
}
async function workflowGet(query: string) {
  return readJson(await fetch(`/api/service-workflow?${query}`, { credentials: "same-origin", cache: "no-store" }), "Could not load service billing data.");
}
async function savePayment(payload: Row) {
  return readJson(await fetch("/api/billing/write", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "savePayment", ...payload }),
  }), "Could not save payment.");
}

export default function ReceivePaymentPage() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<PaymentBillOptions | null>(null);
  const [category, setCategory] = useState<Category>("Engineering Bill");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [selectedBillId, setSelectedBillId] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [method, setMethod] = useState("Bank Transfer");
  const [account, setAccount] = useState("Bank Account");
  const [reference, setReference] = useState("");
  const [payer, setPayer] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [receiptPaymentCode, setReceiptPaymentCode] = useState("");
  const [advanceMode, setAdvanceMode] = useState(false);
  const [pendingCheck, setPendingCheck] = useState(false);
  const pendingSubmission = useRef<PendingPayment | null>(null);
  const requestNumber = useRef(0);
  const submitting = useRef(false);
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(pendingStorageKey);
      const item = stored ? JSON.parse(stored) : null;
      if (item && typeof item.key === "string" && typeof item.fingerprint === "string" &&
          typeof item.projectId === "string" && item.createdAt > Date.now() - 24 * 60 * 60 * 1000) {
        pendingSubmission.current = item;
        window.setTimeout(() => setPendingCheck(true), 0);
      }
    } catch { /* Private mode may disable session storage. The in-memory key still works. */ }
  }, []);
  async function fingerprint(payload: Row) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  function forgetPending() {
    pendingSubmission.current = null;
    setPendingCheck(false);
    try { window.sessionStorage.removeItem(pendingStorageKey); } catch { /* Storage disabled. */ }
  }
  function clearSelection() {
    setAllocations({}); setSelectedBillId(""); setPaymentAmount(""); setAdvanceMode(false);
  }
  async function loadProject(id = projectId, fromAccounts = false) {
    const current = ++requestNumber.current;
    setData(null); setLoading(Boolean(id)); setError(""); setMessage("");
    clearSelection();
    if (!id) return;
    try {
      const next: PaymentBillOptions = await readJson(await fetch(
        `/api/billing/payment-bills?projectId=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" }),
        "Could not load the current collectible balance.");
      if (current !== requestNumber.current) return;
      setData(next);
      if (!next.bills.some((bill) => bill.category === category)) {
        setCategory(CATEGORY_ORDER.find((item) => next.bills.some((bill) => bill.category === item)) || "Engineering Bill");
      }
      if (fromAccounts) {
        try {
          const raw = window.sessionStorage.getItem("lv-accounts-bill-draft");
          const draft = raw ? JSON.parse(raw) : null;
          if (draft?.fileId === id && CATEGORY_ORDER.includes(draft.category)) {
            setCategory(draft.category); setPaymentAmount(draft.amount); setPaymentDate(draft.date || today());
            setMethod(draft.method); setReference(draft.reference); setNotes(draft.notes); setPayer(draft.payer);
            const open = next.bills.filter((bill) => bill.category === draft.category && bill.available > 0);
            if (draft.category === "Engineering Bill" && open.length === 1) setAllocations({ [open[0].billId]: draft.amount });
          }
          window.sessionStorage.removeItem("lv-accounts-bill-draft");
        } catch { /* Read the selected project even if a draft is unavailable. */ }
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("from");
      url.searchParams.set("fileId", id);
      window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
    } catch (cause) {
      if (current === requestNumber.current) setError(cause instanceof Error ? cause.message : "Could not load the project balance.");
    } finally { if (current === requestNumber.current) setLoading(false); }
  }

  async function checkPending() {
    const pending = pendingSubmission.current;
    if (!pending) return;
    setBusy(true); setError("");
    try {
      const url = `/api/billing/submission-status?projectId=${encodeURIComponent(pending.projectId)}&key=${encodeURIComponent(pending.key)}`;
      const result = await readJson(await fetch(url, { credentials: "same-origin", cache: "no-store" }), "Could not confirm the previous payment.");
      if (result.found) {
        forgetPending();
        setProjectId(pending.projectId);
        await loadProject(pending.projectId);
        setReceiptPaymentCode(String(result.paymentCode || ""));
        setMessage(`Previously submitted payment ${result.paymentCode || ""} was recorded. No duplicate was created.`);
      } else {
        setError("No recorded payment was found for the previous submission. Retry the same unchanged payment to reuse its protected submission ID, or verify the payment register before starting a different payment.");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not check previous payment."); }
    finally { setBusy(false); }
  }
  function resetAfterReview() {
    if (!window.confirm("Confirm that you checked the previous payment and receipt register. Start a DIFFERENT submission?")) return;
    forgetPending();
    setError(""); setMessage("New payment submission is ready. Confirm the amount and project before saving.");
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("fileId")?.toUpperCase() || "";
      if (requested) { setProjectId(requested); void loadProject(requested, params.get("from") === "accounts"); }
      else setLoading(false);
      void workflowGet("mode=billing-projects").then((result) => setProjects(result.projects || [])).catch((cause) => setError(cause.message));
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryBills = data?.bills.filter((bill) => bill.category === category) || [];
  const openBills = categoryBills.filter((bill) => bill.available > 0);
  const categorySummary = data?.categories[category];
  const activeBillId = selectedBillId || (openBills.length === 1 ? openBills[0].billId : "");
  const allocatedTotal = Object.values(allocations).reduce((sum, value) => sum + (num(value) || 0), 0);
  function changeAmount(value: string) {
    setPaymentAmount(value);
    if (!advanceMode && category === "Engineering Bill" && openBills.length === 1) {
      setAllocations({ [openBills[0].billId]: value });
    }
  }

  async function pay() {
    if (busy || submitting.current) return;
    if (!projectId || !data || data.projectCode !== projectId || !categorySummary) return setError("Choose a project first.");
    if (!paymentDate) return setError("Choose a payment date.");
    const amount = Math.max(0, num(paymentAmount));
    if (!(amount > 0)) return setError("Enter a payment amount.");
    if (!advanceMode && amount > categorySummary.due + 0.00001) {
      return setError(`Payment cannot exceed ${money(categorySummary.due)} due. Use Receive Advance to record extra money.`);
    }

    submitting.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      let billAllocations: Array<{ billId: string; amount: number }> = [];
      if (!advanceMode) {
        billAllocations = category === "Engineering Bill"
          ? Object.entries(allocations).filter(([, value]) => value.trim() && num(value) !== 0)
            .map(([billId, value]) => ({ billId, amount: num(value) }))
          : [{ billId: activeBillId, amount }];
        for (const split of billAllocations) {
          const bill = openBills.find((item) => item.billId === split.billId);
          if (!bill) throw new Error("Choose an issued bill to receive this payment.");
          if (!(split.amount > 0) || Math.round(split.amount * 100) > Math.round(bill.available * 100)) {
            throw new Error(`Enter an allocation up to ${money(bill.available)} for ${bill.billCode}.`);
          }
        }
        if (billAllocations.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) !== Math.round(amount * 100)) {
          throw new Error("Enter the amount for each selected bill. The allocations must add up to the payment.");
        }
      }
      const payload: Row = {
        Project_ID: projectId, Payment_Date: paymentDate, Amount: amount,
        Payment_Method: method, Deposit_Account: account, Reference_No: reference.trim(),
        Payment_For: category, Income_Category: category,
        Transaction_Type: "Business Income", Affects_Business_Balance: "Yes",
        Received_From: payer.trim() || data.ownerName, Notes: notes.trim(),
        Bill_Allocations: billAllocations, Receive_Advance: advanceMode,
      };
      const hash = await fingerprint(payload);
      const prior = pendingSubmission.current;
      if (prior && (prior.fingerprint !== hash || prior.projectId !== projectId)) {
        throw new Error("An earlier payment submission is unresolved. Check its status first; do not accidentally submit the same money again with a different amount or project.");
      }
      const key = prior?.key || `receive-payment-${crypto.randomUUID()}`;
      if (!prior) {
        pendingSubmission.current = { key, fingerprint: hash, projectId };
        setPendingCheck(true);
        persistPending(pendingSubmission.current);
      }
      const savedPayment = await savePayment({ ...payload, Idempotency_Key: key });
      const paymentCode = String(savedPayment?.Payment_ID || savedPayment?.paymentCode || "").trim();
      forgetPending();
      setReference(""); setNotes(""); setPayer("");
      await loadProject(projectId);
      setReceiptPaymentCode(paymentCode);
      setMessage(paymentCode
        ? `Payment ${paymentCode} saved. Open the linked receipt below.`
        : "Payment saved. Refresh receipts to view its recorded details.");
    } catch (cause) {
      if (cause instanceof Error && "status" in cause &&
          (cause.status === 400 || (cause.status === 409 && /balance changed|bill changed/i.test(cause.message)))) forgetPending();
      setError(cause instanceof Error ? cause.message : "Could not save payment. Check the payment status before retrying.");
    } finally { submitting.current = false; setBusy(false); }
  }

  return <main className="rp">
    <style>{`
      .rp{max-width:1450px;margin:0 auto;color:var(--lv-text-primary)}.rp *{box-sizing:border-box}.rp-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:15px}.rp-head small{font-size:8px;font-weight:950;letter-spacing:.12em;color:var(--lv-brand-text)}.rp-head h1{margin:5px 0 0;font-size:27px}.rp-head p{margin:5px 0 0;font-size:12px;color:var(--lv-text-secondary)}.rp-card{border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel)}.rp-select{display:grid;grid-template-columns:1fr;gap:9px;padding:13px;margin-bottom:12px}.rp-field label{display:block;margin-bottom:5px;font-size:12px;font-weight:900;text-transform:uppercase;color:var(--lv-text-muted)}.rp-field input,.rp-field select,.rp-field textarea{width:100%;min-height:38px;padding:8px 10px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:13px}.rp-tabs{display:flex;gap:6px;margin-bottom:12px}.rp-tab{padding:9px 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-panel);color:var(--lv-text-secondary);font-size:12px;font-weight:900;cursor:pointer}.rp-tab.active{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.rp-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:12px;margin-bottom:12px}.rp-stat{padding:11px;border:1px solid var(--lv-border-subtle);border-radius:9px;background:var(--lv-surface-muted)}.rp-stat span{display:block;font-size:7px;text-transform:uppercase;color:var(--lv-text-muted)}.rp-stat strong{display:block;margin-top:6px;font-size:15px}.rp-layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(330px,.7fr);gap:12px}.rp-table{overflow:auto}.rp-table table{width:100%;border-collapse:collapse;min-width:800px}.rp-table th,.rp-table td{padding:10px;border-bottom:1px solid var(--lv-border-subtle);font-size:12px;text-align:left}.rp-table th{background:var(--lv-surface-muted);color:var(--lv-text-muted);text-transform:uppercase}.rp-table input{width:115px;padding:7px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary)}.rp-form{display:grid;gap:9px;padding:13px}.rp-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rp-btn{min-height:39px;border:1px solid var(--lv-brand-border);border-radius:8px;background:var(--lv-brand-primary);color:var(--lv-text-inverse);font-size:13px;font-weight:950;cursor:pointer}.rp-btn:disabled{opacity:.5}.rp-msg{margin-bottom:12px;padding:10px 12px;border-radius:8px;font-size:12px}.rp-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.rp-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.rp-empty{padding:28px;text-align:center;color:var(--lv-text-muted);font-size:9px}.rp-due{color:var(--lv-danger);font-weight:900}.rp-paid{color:var(--lv-success);font-weight:900}@media(max-width:950px){.rp-summary{grid-template-columns:repeat(2,1fr)}.rp-layout{grid-template-columns:1fr}}@media(max-width:600px){.rp-two{grid-template-columns:1fr}.rp-summary{grid-template-columns:1fr 1fr}.rp-head{align-items:flex-start;flex-direction:column}}
      .rp-table table{min-width:480px}.rp-table small{display:block;color:var(--lv-text-secondary)}.rp-explain{margin:0;padding:8px 12px;font-size:12px;color:var(--lv-text-secondary)}.rp-stat span{font-size:11px}.rp-tabs{flex-wrap:wrap}
    `}</style>

    <header className="rp-head"><div><small>LAND VIEW / BILLING</small><h1>Receive Payment</h1><p>Choose the bills covered by the payment or record an advance.</p></div></header>
    {error && <div className="rp-msg bad" role="alert">{error}</div>}{message && <div className="rp-msg good" role="status">{message}</div>}
    {pendingCheck && <section className="rp-card" style={{ padding: 14, marginBottom: 12, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 9 }}>
      <strong style={{ fontSize: 13 }}>Previous payment submission requires confirmation</strong>
      <button type="button" className="rp-btn" data-lv-button="primary" style={{ padding: "0 12px" }} onClick={() => void checkPending()} disabled={busy}>Check recorded payment</button>
      <button type="button" className="rp-btn" data-lv-button="secondary" style={{ padding: "0 12px", background: "var(--lv-surface-input)", color: "var(--lv-text-primary)", borderColor: "var(--lv-border-default)" }} onClick={resetAfterReview} disabled={busy}>Start different payment after review</button>
    </section>}

    <section className="rp-card rp-select">
      <div className="rp-field"><label>Project / File ID</label><select aria-label="Project / File ID" disabled={busy} value={projectId} onChange={(e) => { setProjectId(e.target.value); setReceiptPaymentCode(""); setReference(""); setNotes(""); setPayer(""); void loadProject(e.target.value); }}><option value="">Choose project</option>{projects.map((p) => <option key={p.projectId || p.project_code} value={p.projectId || p.project_code}>{p.projectId || p.project_code} · {p.ownerName || p.projectName || p.project_name || "Project"}</option>)}</select></div>
      {projectId && !loading && <div><button type="button" data-lv-button="secondary" disabled={busy} onClick={() => void loadProject(projectId)}>Refresh balance</button></div>}
    </section>

    <div className="rp-tabs">{CATEGORY_ORDER.map((item) => <button key={item} className={`rp-tab ${category === item ? "active" : ""}`} data-lv-button={category===item?"primary":"secondary"} disabled={busy || loading} onClick={() => { setCategory(item); clearSelection(); setError(""); }}>{item}</button>)}</div>

    {data && categorySummary ? <>
      <section className="rp-card rp-summary">
        {([["Gross billed", categorySummary.gross], ["Discount / credit notes", categorySummary.discount],
          ["Net billed", categorySummary.net], ["Paid against bills", categorySummary.paid],
          ["Write-offs / credit applied", categorySummary.relief], ["Category collectible", categorySummary.due],
          ["Project collectible", data.projectDue]] as const).map(([label, value]) =>
          <div className="rp-stat" key={label}><span>{label}</span><strong>{money(value)}</strong></div>)}
      </section>
      <div className="rp-layout">
        <section className="rp-card rp-table"><table><thead><tr><th>Bill / service</th><th>Net billed</th><th>Paid</th><th>Available to collect</th>{category === "Engineering Bill" && !advanceMode && <th>Apply payment</th>}</tr></thead>
          <tbody>{categoryBills.map((bill) => <tr key={bill.billId}>
            <td><strong>{bill.name}</strong><small>{bill.billCode}</small>{bill.needsReview && <small>Review invoice link</small>}</td>
            <td>{money(bill.net)}</td><td className="rp-paid">{money(bill.paid)}</td><td>{money(bill.available)}</td>
            {category === "Engineering Bill" && !advanceMode && <td><input aria-label={`Apply to ${bill.billCode}`} inputMode="decimal" disabled={busy || !bill.available} value={allocations[bill.billId] || ""} onChange={(e) => setAllocations((current) => ({ ...current, [bill.billId]: e.target.value }))} /></td>}
          </tr>)}</tbody></table>
          {!categoryBills.length && <div className="rp-empty">No issued bills in this category.</div>}
          {categorySummary.relief > 0 && <p className="rp-explain">Write-offs and available credit reduce the category balance. All selected bills together can receive up to {money(categorySummary.due)}.</p>}
        </section>
        <section className="rp-card rp-form">
          {category !== "Engineering Bill" && !advanceMode && <div className="rp-field"><label htmlFor="rp-bill">Apply to bill</label><select id="rp-bill" disabled={busy} value={activeBillId} onChange={(e) => setSelectedBillId(e.target.value)}><option value="">Choose a bill</option>{openBills.map((bill) => <option key={bill.billId} value={bill.billId}>{bill.billCode} · {bill.name} · {money(bill.available)}</option>)}</select></div>}
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5 }}>
            <input type="checkbox" disabled={busy} checked={advanceMode} onChange={(e) => { clearSelection(); setAdvanceMode(e.target.checked); }} style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }} />
            <span><strong>Receive Advance / Extra Payment</strong><small style={{ display: "block", color: "var(--lv-text-secondary)", fontSize: 12 }}>Applies up to the collectible balance of this category. Any excess stays on the project as advance credit.</small></span>
          </label>
          <div className="rp-two">
            <div className="rp-field"><label htmlFor="rp-amount">Payment Amount</label><input id="rp-amount" disabled={busy} inputMode="decimal" value={paymentAmount} onChange={(e) => changeAmount(e.target.value)} placeholder="0" /></div>
            <div className="rp-field"><label>Payment Date</label><input type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
          </div>
          {category === "Engineering Bill" && !advanceMode && <div className="rp-field"><label>Allocated</label><input readOnly value={money(allocatedTotal)} /></div>}
          <div className="rp-two">
            <div className="rp-field"><label>Payment Method</label><select value={method} onChange={(e) => setMethod(e.target.value)}><option>Bank Transfer</option><option>Cash</option><option>bKash</option><option>Nagad</option><option>Cheque</option><option>Card</option><option>Other</option></select></div>
            <div className="rp-field"><label>Deposit Account</label><input value={account} onChange={(e) => setAccount(e.target.value)} /></div>
          </div>
          <div className="rp-two"><div className="rp-field"><label>Reference</label><input value={reference} onChange={(e) => setReference(e.target.value)} /></div><div className="rp-field"><label>Category Due</label><input readOnly value={money(categorySummary.due)} /></div></div>
          <div className="rp-field"><label htmlFor="rp-payer">Received from</label><input id="rp-payer" placeholder={data.ownerName} value={payer} onChange={(e) => setPayer(e.target.value)} /></div>
          <div className="rp-field"><label>Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <button type="button" className="rp-btn" data-lv-button="primary" disabled={busy || loading || (!advanceMode && (!openBills.length || categorySummary.due <= 0))} onClick={() => void pay()}>{busy ? "Saving…" : advanceMode ? "Save Advance Payment" : "Save Payment"}</button>
        </section>
      </div>

    </> : <div className="rp-empty">{loading ? "Loading project balance…" : projectId ? <button onClick={() => void loadProject(projectId)}>Reload project balance</button> : "Choose a project to receive payment."}</div>}
    {projectId && <div style={{marginTop:14}}><ProjectReceiptHistory key={projectId} projectId={projectId} highlightPaymentCode={receiptPaymentCode} projectDue={data?.projectDue}
      billCollectible={data && Object.fromEntries(data.bills.filter((bill) => !bill.needsReview).map((bill) => [bill.billCode, bill.available])) || undefined} /></div>}
  </main>;
}
