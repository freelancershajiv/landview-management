"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const CATEGORIES = ["Engineering Bill", "Design Books", "Supervision Bill", "Other Services Bill"];
const ENGINEERING_SERVICES = [
  "Architectural Design", "Structural Design", "3D Design - Exterior", "3D Design - Interior",
  "Electrical Design", "Fire Safety Design", "Plumbing Design", "Plan Approval Design",
  "Estimate & Costing", "Design Books",
];
const OTHER_SERVICES = [
  "Municipality Land NOC", "Fire Service Approval", "Municipality Approval",
  "District Vetting Committee Approval", "Consultancy Fees", "Submission Fees",
  "Soil Test", "Digital Survey", "Municipality File Pass",
];

type BillRow = {
  localKey: string;
  bill_code: string;
  bill_date: string;
  billing_category: string;
  category: string;
  description: string;
  unit_price: string;
  quantity: string;
  amount: string;
  discount: string;
  status: string;
  notes: string;
  created_via?: string;
};
type PaymentRow = {
  localKey: string;
  payment_code: string;
  payment_date: string;
  amount: string;
  payment_method: string;
  reference_no: string;
  deposit_account: string;
  payment_for: string;
  income_category: string;
  received_from: string;
  received_by: string;
  notes: string;
  affects_business_balance: boolean;
  ledger_transaction_code: string;
  ledger_verification_status: string;
  ledger_verification_notes: string;
  finance_scope?: string;
  service_type?: string;
};
type LedgerCandidate = {
  id: string;
  transactionCode: string;
  date: string;
  amount: number;
  projectCode: string;
  category: string;
  description: string;
  reference: string;
  sourceType: string;
  status: string;
  matchStatus: "exact" | "review";
  score: number;
};
type Props = { projectCode: string; onChanged?: () => void | Promise<void> };

function localKey(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
}
function number(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money(value: number) {
  return `BDT ${value.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function newBill(): BillRow {
  return { localKey: localKey("bill"), bill_code: "", bill_date: "", billing_category: "Engineering Bill", category: "", description: "", unit_price: "", quantity: "1", amount: "", discount: "0", status: "Issued", notes: "" };
}
function newPayment(): PaymentRow {
  return { localKey: localKey("pay"), payment_code: "", payment_date: "", amount: "", payment_method: "Cash", reference_no: "", deposit_account: "", payment_for: "", income_category: "Engineering Bill", received_from: "", received_by: "", notes: "", affects_business_balance: false, ledger_transaction_code: "", ledger_verification_status: "unlinked", ledger_verification_notes: "" };
}
function normalizeBill(row: Record<string, unknown>): BillRow {
  return {
    localKey: String(row.bill_code || row.id || localKey("bill")),
    bill_code: String(row.bill_code || ""),
    bill_date: String(row.bill_date || ""),
    billing_category: String(row.billing_category || "Engineering Bill"),
    category: String(row.category || ""),
    description: String(row.description || ""),
    unit_price: row.unit_price === null || row.unit_price === undefined ? "" : String(row.unit_price),
    quantity: row.quantity === null || row.quantity === undefined ? "" : String(row.quantity),
    amount: String(row.amount ?? ""),
    discount: String(row.discount ?? "0"),
    status: String(row.status || "Issued"),
    notes: String(row.notes || ""),
    created_via: String(row.created_via || ""),
  };
}
function normalizePayment(row: Record<string, unknown>): PaymentRow {
  return {
    localKey: String(row.payment_code || row.id || localKey("pay")),
    payment_code: String(row.payment_code || ""),
    payment_date: String(row.payment_date || ""),
    amount: String(row.amount ?? ""),
    payment_method: String(row.payment_method || "Cash"),
    reference_no: String(row.reference_no || ""),
    deposit_account: String(row.deposit_account || ""),
    payment_for: String(row.payment_for || ""),
    income_category: String(row.income_category || "Engineering Bill"),
    received_from: String(row.received_from || ""),
    received_by: String(row.received_by || ""),
    notes: String(row.notes || ""),
    affects_business_balance: row.affects_business_balance !== false,
    ledger_transaction_code: String(row.ledger_transaction_code || ""),
    ledger_verification_status: String(row.ledger_verification_status || (row.affects_business_balance !== false ? "posted" : "unlinked")),
    ledger_verification_notes: String(row.ledger_verification_notes || ""),
    finance_scope: String(row.finance_scope || "main"),
    service_type: String(row.service_type || ""),
  };
}

export default function ProjectFinanceHistoryEditor({ projectCode, onChanged }: Props) {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [legacyImport, setLegacyImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [searching, setSearching] = useState<Record<string, boolean>>({});
  const [matches, setMatches] = useState<Record<string, LedgerCandidate[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/finance-editor`, { cache: "no-store", credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load project finance history."));
      setBills((Array.isArray(json.data?.bills) ? json.data.bills : []).map(normalizeBill));
      setPayments((Array.isArray(json.data?.payments) ? json.data.payments : []).map(normalizePayment));
      setLegacyImport(Boolean(json.data?.legacyImport));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load project finance history.");
    } finally {
      setLoading(false);
    }
  }, [projectCode]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const billed = bills.reduce((sum, row) => sum + Math.max(0, number(row.amount) - number(row.discount)), 0);
    const paid = payments.reduce((sum, row) => sum + number(row.amount), 0);
    const verified = payments.filter((row) => ["verified", "posted"].includes(row.ledger_verification_status.toLowerCase())).length;
    const mismatches = payments.filter((row) => row.ledger_verification_status.toLowerCase() === "mismatch").length;
    return { billed, paid, due: Math.max(0, billed - paid), verified, mismatches };
  }, [bills, payments]);

  function updateBill(key: string, changes: Partial<BillRow>) {
    setBills((rows) => rows.map((row) => row.localKey === key ? { ...row, ...changes } : row));
  }
  function updatePayment(key: string, changes: Partial<PaymentRow>) {
    setPayments((rows) => rows.map((row) => row.localKey === key ? { ...row, ...changes } : row));
  }
  function removeUnsavedBill(key: string) { setBills((rows) => rows.filter((row) => row.localKey !== key)); }
  function removeUnsavedPayment(key: string) { setPayments((rows) => rows.filter((row) => row.localKey !== key)); }

  async function saveBill(row: BillRow) {
    setSaving((v) => ({ ...v, [row.localKey]: true })); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/finance-editor`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
        body: JSON.stringify({ action: "saveBill", ...row }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not save the bill."));
      const saved = normalizeBill(json.data || {});
      setBills((rows) => rows.map((item) => item.localKey === row.localKey ? saved : item));
      setMessage(`${saved.bill_code} saved.`);
      await onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the bill."); }
    finally { setSaving((v) => ({ ...v, [row.localKey]: false })); }
  }

  async function savePayment(row: PaymentRow) {
    setSaving((v) => ({ ...v, [row.localKey]: true })); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/finance-editor`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
        body: JSON.stringify({ action: "savePayment", ...row }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not save the payment."));
      const saved = normalizePayment(json.data || {});
      setPayments((rows) => rows.map((item) => item.localKey === row.localKey ? saved : item));
      setMessage(`${saved.payment_code} saved · ${saved.ledger_verification_status === "verified" ? "Ledger Verified" : saved.ledger_verification_status === "mismatch" ? "Ledger Mismatch" : saved.ledger_verification_status === "posted" ? "Ledger Posted" : "Unverified"}.`);
      await onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the payment."); }
    finally { setSaving((v) => ({ ...v, [row.localKey]: false })); }
  }

  async function findLedgerMatches(payment: PaymentRow) {
    if (!number(payment.amount)) { setError("Enter the payment amount before searching the ledger."); return; }
    setSearching((v) => ({ ...v, [payment.localKey]: true })); setError("");
    try {
      const params = new URLSearchParams({ projectCode, amount: String(number(payment.amount)) });
      if (payment.payment_date) params.set("date", payment.payment_date);
      const response = await fetch(`/api/projects/legacy-ledger?${params.toString()}`, { cache: "no-store", credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not search the Accounts Ledger."));
      setMatches((v) => ({ ...v, [payment.localKey]: Array.isArray(json.data) ? json.data : [] }));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not search the Accounts Ledger."); }
    finally { setSearching((v) => ({ ...v, [payment.localKey]: false })); }
  }

  if (loading) return <div className="pfh-loading">Loading full billing and payment history…<style>{styles}</style></div>;

  return <div className="pfh-wrap">
    <style>{styles}</style>
    <div className="pfh-head">
      <div><strong>Full billing, payments & ledger verification</strong><span>Edit the project's canonical bill and payment records here. Add missing old records and link historical deposits to existing Accounts Ledger entries without double-posting income.</span></div>
      <div className="pfh-actions"><span className={`pfh-origin ${legacyImport ? "legacy" : ""}`}>{legacyImport ? "LEGACY IMPORT PROJECT" : "CURRENT PROJECT"}</span><button type="button" onClick={() => void load()}>Refresh</button></div>
    </div>

    <div className="pfh-summary">
      <div><span>NET BILLED</span><b>{money(totals.billed)}</b></div>
      <div><span>PAYMENTS</span><b>{money(totals.paid)}</b></div>
      <div><span>DUE</span><b>{money(totals.due)}</b></div>
      <div><span>LEDGER VERIFIED / POSTED</span><b>{totals.verified}/{payments.length}</b><small>{totals.mismatches ? `${totals.mismatches} mismatch${totals.mismatches === 1 ? "" : "es"}` : "No mismatches"}</small></div>
    </div>

    {error && <div className="pfh-msg error">{error}</div>}
    {message && <div className="pfh-msg ok">{message}</div>}

    <section className="pfh-section">
      <div className="pfh-section-head"><div><b>Billing details</b><span>Every service bill, amount, discount, date and status can be maintained here.</span></div><button type="button" onClick={() => setBills((rows) => [...rows, newBill()])}>+ Add Historical Bill</button></div>
      {!bills.length && <div className="pfh-empty">No bills found for this project.</div>}
      {bills.map((bill, index) => {
        const suggestions = bill.billing_category === "Other Services Bill" ? OTHER_SERVICES : bill.billing_category === "Engineering Bill" ? ENGINEERING_SERVICES : [];
        return <div className="pfh-row" key={bill.localKey}>
          <div className="pfh-row-title"><div><b>Bill #{index + 1}</b><span>{bill.bill_code || "New historical bill"}{bill.created_via ? ` · ${bill.created_via}` : ""}</span></div><div>{!bill.bill_code && <button type="button" className="ghost" onClick={() => removeUnsavedBill(bill.localKey)}>Remove</button>}<button type="button" className="save" disabled={saving[bill.localKey]} onClick={() => void saveBill(bill)}>{saving[bill.localKey] ? "Saving…" : bill.bill_code ? "Save Bill" : "Add Bill"}</button></div></div>
          <div className="pfh-grid">
            <label>Bill Date<input type="date" value={bill.bill_date} onChange={(e) => updateBill(bill.localKey, { bill_date: e.target.value })} /></label>
            <label>Billing Category<select value={bill.billing_category} onChange={(e) => updateBill(bill.localKey, { billing_category: e.target.value })}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="wide">Service / Description<input list={`pfh-services-${bill.localKey}`} value={bill.description} onChange={(e) => updateBill(bill.localKey, { description: e.target.value })} /><datalist id={`pfh-services-${bill.localKey}`}>{suggestions.map((item) => <option key={item} value={item} />)}</datalist></label>
            <label>Sub-category<input value={bill.category} onChange={(e) => updateBill(bill.localKey, { category: e.target.value })} /></label>
            <label>Unit Price<input inputMode="decimal" value={bill.unit_price} onChange={(e) => updateBill(bill.localKey, { unit_price: e.target.value })} /></label>
            <label>Quantity<input inputMode="decimal" value={bill.quantity} onChange={(e) => updateBill(bill.localKey, { quantity: e.target.value })} /></label>
            <label>Gross Amount<input inputMode="decimal" value={bill.amount} onChange={(e) => updateBill(bill.localKey, { amount: e.target.value })} /></label>
            <label>Discount<input inputMode="decimal" value={bill.discount} onChange={(e) => updateBill(bill.localKey, { discount: e.target.value })} /></label>
            <label>Status<select value={bill.status} onChange={(e) => updateBill(bill.localKey, { status: e.target.value })}><option>Issued</option><option>Open</option><option>Unpaid</option><option>Partially Paid</option><option>Paid</option></select></label>
            <label className="wide">Notes<input value={bill.notes} onChange={(e) => updateBill(bill.localKey, { notes: e.target.value })} /></label>
          </div>
        </div>;
      })}
    </section>

    <section className="pfh-section">
      <div className="pfh-section-head"><div><b>Payment details & Accounts Ledger verification</b><span>Edit old deposits, add missing historical payments, and link them to existing income rows. New historical rows created here do not post a second ledger income.</span></div><button type="button" onClick={() => setPayments((rows) => [...rows, newPayment()])}>+ Add Historical Payment</button></div>
      {!payments.length && <div className="pfh-empty">No payments found for this project.</div>}
      {payments.map((payment, index) => {
        const rowMatches = matches[payment.localKey] || [];
        const verification = payment.ledger_verification_status.toLowerCase();
        return <div className="pfh-row payment" key={payment.localKey}>
          <div className="pfh-row-title"><div><b>Payment #{index + 1}</b><span>{payment.payment_code || "New historical payment"}</span></div><div className="pfh-row-actions"><span className={`pfh-verify ${verification}`}>{verification === "verified" ? "Ledger Verified" : verification === "mismatch" ? "Ledger Mismatch" : verification === "posted" ? "Ledger Posted" : "Unverified"}</span>{!payment.payment_code && <button type="button" className="ghost" onClick={() => removeUnsavedPayment(payment.localKey)}>Remove</button>}<button type="button" className="save" disabled={saving[payment.localKey]} onClick={() => void savePayment(payment)}>{saving[payment.localKey] ? "Saving…" : payment.payment_code ? "Save Payment" : "Add Payment"}</button></div></div>
          <div className="pfh-grid">
            <label>Payment Date<input type="date" value={payment.payment_date} onChange={(e) => updatePayment(payment.localKey, { payment_date: e.target.value, ledger_verification_status: payment.affects_business_balance ? "posted" : "unlinked" })} /></label>
            <label>Amount<input inputMode="decimal" value={payment.amount} onChange={(e) => updatePayment(payment.localKey, { amount: e.target.value, ledger_verification_status: payment.affects_business_balance ? "posted" : "unlinked" })} /></label>
            <label>Billing Category<select value={payment.income_category} onChange={(e) => updatePayment(payment.localKey, { income_category: e.target.value })}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Payment For<input value={payment.payment_for} onChange={(e) => updatePayment(payment.localKey, { payment_for: e.target.value })} /></label>
            <label>Payment Method<select value={payment.payment_method} onChange={(e) => updatePayment(payment.localKey, { payment_method: e.target.value })}><option>Cash</option><option>Bank Transfer</option><option>Cheque</option><option>bKash</option><option>Nagad</option><option>Card</option><option>Other</option></select></label>
            <label>Reference No.<input value={payment.reference_no} onChange={(e) => updatePayment(payment.localKey, { reference_no: e.target.value })} /></label>
            <label>Deposit Account<input value={payment.deposit_account} onChange={(e) => updatePayment(payment.localKey, { deposit_account: e.target.value })} /></label>
            <label>Received From<input value={payment.received_from} onChange={(e) => updatePayment(payment.localKey, { received_from: e.target.value })} /></label>
            <label>Received By<input value={payment.received_by} onChange={(e) => updatePayment(payment.localKey, { received_by: e.target.value })} /></label>
            <label className="wide">Notes<input value={payment.notes} onChange={(e) => updatePayment(payment.localKey, { notes: e.target.value })} /></label>
          </div>
          <div className="pfh-ledger">
            <div className="pfh-ledger-top"><div><b>Accounts Ledger Link</b><span>{payment.ledger_transaction_code ? `Linked: ${payment.ledger_transaction_code}` : payment.affects_business_balance ? "This operational payment posts to its own ledger transaction automatically." : "No ledger row linked yet."}</span>{payment.ledger_verification_notes && <small>{payment.ledger_verification_notes}</small>}</div><div><button type="button" onClick={() => void findLedgerMatches(payment)} disabled={searching[payment.localKey]}>{searching[payment.localKey] ? "Searching…" : payment.ledger_transaction_code ? "Find Another Match" : "Find Ledger Match"}</button>{payment.ledger_transaction_code && !payment.affects_business_balance && <button type="button" onClick={() => updatePayment(payment.localKey, { ledger_transaction_code: "", ledger_verification_status: "unlinked", ledger_verification_notes: "" })}>Unlink</button>}</div></div>
            {!!rowMatches.length && <div className="pfh-matches">{rowMatches.map((candidate) => <button type="button" key={candidate.id} className={payment.ledger_transaction_code === candidate.transactionCode ? "selected" : ""} onClick={() => updatePayment(payment.localKey, { ledger_transaction_code: candidate.transactionCode, ledger_verification_status: candidate.matchStatus === "exact" ? "verified" : "mismatch" })}><span className={`candidate-badge ${candidate.matchStatus}`}>{candidate.matchStatus === "exact" ? "Exact Match" : "Review"}</span><b>{candidate.transactionCode}</b><span>{candidate.date || "No date"} · {money(candidate.amount)}{candidate.projectCode ? ` · ${candidate.projectCode}` : " · No project assigned"}</span><small>{[candidate.category, candidate.description, candidate.reference].filter(Boolean).join(" · ") || candidate.sourceType}</small></button>)}</div>}
            {!searching[payment.localKey] && matches[payment.localKey] && rowMatches.length === 0 && <div className="pfh-empty compact">No unused likely ledger match was found.</div>}
          </div>
        </div>;
      })}
    </section>

    <div className="pfh-foot">Existing canonical rows are never silently deleted from this editor. Unsaved new rows can be removed before saving. Use the dedicated finance/audit controls for destructive corrections to posted history.</div>
  </div>;
}

const styles = `
.pfh-wrap{display:grid;gap:12px;color:#eaf0f3}.pfh-loading{padding:18px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:#111820;color:#8d99a3;font-size:11px}.pfh-head,.pfh-section{border:1px solid rgba(255,255,255,.1);border-radius:11px;background:#0f171f;overflow:hidden}.pfh-head{padding:15px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.pfh-head strong{display:block;font-size:13px;color:#fff}.pfh-head span,.pfh-section-head span{display:block;margin-top:5px;color:#7f8b95;font-size:10px;line-height:1.55}.pfh-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pfh-actions button,.pfh-section-head button,.pfh-row-title button,.pfh-ledger button{border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#18232d;color:#eef2f5;padding:8px 10px;font-size:9px;font-weight:800;cursor:pointer}.pfh-origin{padding:6px 8px;border-radius:999px;background:#1c2832;color:#9aa6af!important;font-size:8px!important;font-weight:900;letter-spacing:.08em;margin:0!important}.pfh-origin.legacy{background:rgba(214,31,38,.12);color:#ff918a!important}.pfh-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.pfh-summary>div{padding:11px;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:#121b23}.pfh-summary span{display:block;color:#75838e;font-size:8px;font-weight:900;letter-spacing:.08em}.pfh-summary b{display:block;margin-top:6px;font-size:12px;color:#fff}.pfh-summary small{display:block;margin-top:4px;color:#82909a;font-size:8px}.pfh-msg{padding:10px 12px;border-radius:8px;font-size:10px}.pfh-msg.error{border:1px solid rgba(214,31,38,.35);background:rgba(214,31,38,.07);color:#ffaaa4}.pfh-msg.ok{border:1px solid rgba(72,190,123,.3);background:rgba(72,190,123,.06);color:#a8dfbd}.pfh-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.08)}.pfh-section-head b{display:block;color:#fff;font-size:12px}.pfh-section-head button,.pfh-row-title .save{background:#d61f26;border-color:#d61f26}.pfh-row{padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.07)}.pfh-row:last-child{border-bottom:0}.pfh-row.payment{background:rgba(255,255,255,.012)}.pfh-row-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.pfh-row-title>div{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.pfh-row-title b{color:#f2f5f7;font-size:11px}.pfh-row-title span{color:#778590;font-size:8px}.pfh-row-title .ghost{background:transparent}.pfh-row-actions{justify-content:flex-end}.pfh-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.pfh-grid label{display:grid;gap:5px;color:#84929c;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.pfh-grid label.wide{grid-column:span 2}.pfh-grid input,.pfh-grid select{width:100%;height:36px;padding:0 9px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:#111b24;color:#eef2f5;font-size:10px}.pfh-grid input:focus,.pfh-grid select:focus{outline:none;border-color:#d61f26}.pfh-ledger{margin-top:10px;padding:11px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:#0b131a}.pfh-ledger-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.pfh-ledger-top>div:last-child{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.pfh-ledger b{display:block;color:#eaf0f3;font-size:10px}.pfh-ledger span,.pfh-ledger small{display:block;margin-top:4px;color:#7f8d97;font-size:8px;line-height:1.5}.pfh-matches{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:9px}.pfh-matches>button{text-align:left;background:#111b24;padding:10px;display:block}.pfh-matches>button.selected{border-color:#d61f26;background:rgba(214,31,38,.08)}.candidate-badge,.pfh-verify{display:inline-flex!important;width:max-content;padding:4px 6px;border-radius:999px;background:#293641;color:#b6c1c9!important;font-size:7px!important;font-weight:900;text-transform:uppercase;letter-spacing:.05em;margin:0 0 5px!important}.candidate-badge.exact,.pfh-verify.verified,.pfh-verify.posted{background:rgba(55,177,105,.14);color:#98ddb4!important}.candidate-badge.review,.pfh-verify.mismatch{background:rgba(214,151,31,.14);color:#f0c66f!important}.pfh-verify.unlinked{background:rgba(255,255,255,.07);color:#aab4bc!important}.pfh-empty{padding:18px;text-align:center;color:#75838d;font-size:9px}.pfh-empty.compact{padding:10px;margin-top:8px}.pfh-foot{padding:10px 12px;border-left:3px solid #d61f26;background:#111921;color:#7f8c96;font-size:9px;line-height:1.55}
@media(max-width:1000px){.pfh-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pfh-summary{grid-template-columns:repeat(2,1fr)}.pfh-matches{grid-template-columns:1fr}}
@media(max-width:650px){.pfh-head,.pfh-section-head,.pfh-ledger-top,.pfh-row-title{flex-direction:column;align-items:stretch}.pfh-grid{grid-template-columns:1fr}.pfh-grid label.wide{grid-column:auto}.pfh-summary{grid-template-columns:1fr 1fr}.pfh-row-title>div,.pfh-row-actions{justify-content:flex-start}}
`;
