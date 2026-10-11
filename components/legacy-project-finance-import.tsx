"use client";

import { useMemo, useState } from "react";

export type LegacyBillDraft = {
  key: string;
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
};

export type LegacyPaymentDraft = {
  key: string;
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
  ledger_transaction_code: string;
};

export type LegacyFinanceDraft = { bills: LegacyBillDraft[]; payments: LegacyPaymentDraft[] };

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

type Props = {
  projectCode: string;
  value: LegacyFinanceDraft;
  onChange: (value: LegacyFinanceDraft) => void;
  mode?: "current" | "legacy";
};

const BILL_GROUPS = [
  {
    category: "Engineering Bill",
    services: [
      "Architectural Design",
      "Structural Design",
      "3D Design - Exterior",
      "3D Design - Interior",
      "Electrical Design",
      "Fire Safety Design",
      "Plumbing Design",
      "Plan Approval Design",
      "Estimate & Costing",
      "Design Books",
    ],
  },
  { category: "Supervision Bill", services: ["Supervision Bill"] },
  {
    category: "Other Services Bill",
    services: [
      "Municipality Land NOC",
      "Fire Service Approval",
      "Municipality Approval",
      "District Vetting Committee Approval",
      "Consultancy Fees",
      "Submission Fees",
      "Soil Test",
      "Digital Survey",
      "Municipality File Pass",
    ],
  },
] as const;

const PAYMENT_CATEGORIES = BILL_GROUPS.map((group) => group.category);

function key(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
}
function number(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
function money(value: number) {
  return `BDT ${value.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function standardBill(category: string, description: string, index: number): LegacyBillDraft {
  const slug = `${category}-${description}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    key: `standard-${index}-${slug}`,
    bill_date: "",
    billing_category: category,
    category: "",
    description,
    unit_price: "",
    quantity: "1",
    amount: "",
    discount: "0",
    status: "Issued",
    notes: "",
  };
}
function standardBills() {
  let index = 0;
  return BILL_GROUPS.flatMap((group) => group.services.map((service) => standardBill(group.category, service, index++)));
}
function newCustomBill(category: string): LegacyBillDraft {
  return { key: key("bill"), bill_date: "", billing_category: category, category: "", description: "", unit_price: "", quantity: "1", amount: "", discount: "0", status: "Issued", notes: "" };
}
function newPayment(): LegacyPaymentDraft {
  return { key: key("pay"), payment_date: "", amount: "", payment_method: "Cash", reference_no: "", deposit_account: "", payment_for: "", income_category: "Engineering Bill", received_from: "", received_by: "", notes: "", ledger_transaction_code: "" };
}

export function createEmptyLegacyFinance(): LegacyFinanceDraft {
  return { bills: standardBills(), payments: [] };
}
export const emptyLegacyFinance: LegacyFinanceDraft = createEmptyLegacyFinance();

export default function LegacyProjectFinanceImport({ projectCode, value, onChange, mode = "legacy" }: Props) {
  const [searching, setSearching] = useState<Record<string, boolean>>({});
  const [matches, setMatches] = useState<Record<string, LedgerCandidate[]>>({});
  const [matchErrors, setMatchErrors] = useState<Record<string, string>>({});
  const historical = mode === "legacy";

  const totals = useMemo(() => {
    const billed = value.bills.reduce((sum, row) => sum + Math.max(0, number(row.amount) - number(row.discount)), 0);
    const paid = historical ? value.payments.reduce((sum, row) => sum + number(row.amount), 0) : 0;
    const linked = value.payments.filter((row) => row.ledger_transaction_code).length;
    const activeBills = value.bills.filter((row) => number(row.amount) > 0).length;
    return { billed, paid, linked, activeBills, due: Math.max(0, billed - paid) };
  }, [historical, value]);

  function updateBill(rowKey: string, changes: Partial<LegacyBillDraft>) {
    onChange({
      ...value,
      bills: value.bills.map((row) => {
        if (row.key !== rowKey) return row;
        const next = { ...row, ...changes };
        if (!historical && changes.amount !== undefined && number(changes.amount) > 0 && !next.bill_date) next.bill_date = new Date().toISOString().slice(0, 10);
        return next;
      }),
    });
  }
  function updatePayment(rowKey: string, changes: Partial<LegacyPaymentDraft>) {
    onChange({ ...value, payments: value.payments.map((row) => row.key === rowKey ? { ...row, ...changes } : row) });
  }
  function removeBill(rowKey: string) {
    onChange({ ...value, bills: value.bills.filter((row) => row.key !== rowKey) });
  }
  function removePayment(rowKey: string) {
    onChange({ ...value, payments: value.payments.filter((row) => row.key !== rowKey) });
    setMatches((current) => { const next = { ...current }; delete next[rowKey]; return next; });
  }

  async function findLedgerMatches(payment: LegacyPaymentDraft) {
    if (!number(payment.amount)) {
      setMatchErrors((current) => ({ ...current, [payment.key]: "Enter the payment amount first." }));
      return;
    }
    setSearching((current) => ({ ...current, [payment.key]: true }));
    setMatchErrors((current) => ({ ...current, [payment.key]: "" }));
    try {
      const params = new URLSearchParams({ projectCode, amount: String(number(payment.amount)) });
      if (payment.payment_date) params.set("date", payment.payment_date);
      const response = await fetch(`/api/projects/legacy-ledger?${params.toString()}`, { cache: "no-store", credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not search the ledger."));
      setMatches((current) => ({ ...current, [payment.key]: Array.isArray(json.data) ? json.data : [] }));
    } catch (error) {
      setMatchErrors((current) => ({ ...current, [payment.key]: error instanceof Error ? error.message : "Could not search the ledger." }));
    } finally {
      setSearching((current) => ({ ...current, [payment.key]: false }));
    }
  }

  return <section className="legacy-finance-wrap">
    <div className="legacy-finance-intro">
      <div>
        <b>{historical ? "Historical billing & payments" : "Project billing setup"}</b>
        <span>{historical ? "All standard bill categories are already open below. Enter amounts only for the services this old project used; blank rows are ignored. Historical deposits can be linked to the existing Accounts Ledger without double-posting income." : "All standard billing categories are already open. Enter bill details directly in the rows you need; blank rows are ignored when the project is created."}</span>
      </div>
      <div className="legacy-summary">
        <span><small>ACTIVE BILLS</small><b>{totals.activeBills}</b></span>
        <span><small>NET BILLED</small><b>{money(totals.billed)}</b></span>
        <span><small>{historical ? "PAYMENTS" : "BILL GROUPS"}</small><b>{historical ? money(totals.paid) : BILL_GROUPS.length}</b></span>
        <span><small>{historical ? "DUE" : "STANDARD ROWS"}</small><b>{historical ? money(totals.due) : value.bills.length}</b></span>
      </div>
    </div>

    <div className="legacy-section">
      <div className="legacy-section-head"><div><b>Billing details</b><span>Engineering, Supervision and Other Services are expanded automatically. Edit each service inline; there is no separate bill-opening step.</span></div></div>
      {BILL_GROUPS.map((group) => {
        const rows = value.bills.filter((bill) => bill.billing_category === group.category);
        return <div className="bill-group" key={group.category}>
          <div className="bill-group-head"><div><b>{group.category}</b><span>{rows.filter((row) => number(row.amount) > 0).length} active · {rows.length} rows</span></div><button type="button" onClick={() => onChange({ ...value, bills: [...value.bills, newCustomBill(group.category)] })}>+ Custom Row</button></div>
          <div className="bill-grid-scroll">
            <div className="bill-grid bill-grid-header"><span>Service / Description</span><span>Bill Date</span><span>Unit Price</span><span>Qty</span><span>Gross</span><span>Discount</span><span>Net</span><span>Status</span><span>Notes</span><span></span></div>
            {rows.map((bill) => <div className={`bill-grid bill-inline-row ${number(bill.amount) > 0 ? "active" : ""}`} key={bill.key}>
              <input value={bill.description} onChange={(e) => updateBill(bill.key, { description: e.target.value })} placeholder="Service name" />
              <input type="date" value={bill.bill_date} onChange={(e) => updateBill(bill.key, { bill_date: e.target.value })} />
              <input inputMode="decimal" value={bill.unit_price} onChange={(e) => updateBill(bill.key, { unit_price: e.target.value })} placeholder="0.00" />
              <input inputMode="decimal" value={bill.quantity} onChange={(e) => updateBill(bill.key, { quantity: e.target.value })} placeholder="1" />
              <input inputMode="decimal" value={bill.amount} onChange={(e) => updateBill(bill.key, { amount: e.target.value })} placeholder="0.00" />
              <input inputMode="decimal" value={bill.discount} onChange={(e) => updateBill(bill.key, { discount: e.target.value })} placeholder="0.00" />
              <strong>{money(Math.max(0, number(bill.amount) - number(bill.discount)))}</strong>
              <select value={bill.status} onChange={(e) => updateBill(bill.key, { status: e.target.value })}><option>Issued</option><option>Open</option><option>Unpaid</option><option>Partially Paid</option><option>Paid</option></select>
              <input value={bill.notes} onChange={(e) => updateBill(bill.key, { notes: e.target.value })} placeholder="Optional" />
              <button type="button" className="row-remove" onClick={() => removeBill(bill.key)} title="Remove this row">×</button>
            </div>)}
          </div>
        </div>;
      })}
      <div className="blank-note">Blank bill rows are ignored. You only need to enter amounts for services actually billed to this project.</div>
    </div>

    {historical && <div className="legacy-section">
      <div className="legacy-section-head"><div><b>Payment details & ledger verification</b><span>Add each old deposit and match it to the existing Accounts Ledger when possible.</span></div><button type="button" className="legacy-add" onClick={() => onChange({ ...value, payments: [...value.payments, newPayment()] })}>+ Add Payment</button></div>
      {!value.payments.length && <div className="legacy-empty">No historical payments added yet.</div>}
      {value.payments.map((payment, index) => {
        const rowMatches = matches[payment.key] || [];
        return <div className="legacy-row payment" key={payment.key}>
          <div className="legacy-row-title"><b>Payment #{index + 1}</b><button type="button" onClick={() => removePayment(payment.key)}>Remove</button></div>
          <div className="legacy-grid">
            <label>Payment Date<input type="date" value={payment.payment_date} onChange={(e) => updatePayment(payment.key, { payment_date: e.target.value, ledger_transaction_code: "" })} /></label>
            <label>Amount<input inputMode="decimal" value={payment.amount} onChange={(e) => updatePayment(payment.key, { amount: e.target.value, ledger_transaction_code: "" })} /></label>
            <label>Billing Category<select value={payment.income_category} onChange={(e) => updatePayment(payment.key, { income_category: e.target.value })}>{PAYMENT_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Payment For<input value={payment.payment_for} onChange={(e) => updatePayment(payment.key, { payment_for: e.target.value })} placeholder="e.g. Architectural Design" /></label>
            <label>Payment Method<select value={payment.payment_method} onChange={(e) => updatePayment(payment.key, { payment_method: e.target.value })}><option>Cash</option><option>Bank Transfer</option><option>Cheque</option><option>bKash</option><option>Nagad</option><option>Card</option><option>Other</option></select></label>
            <label>Reference No.<input value={payment.reference_no} onChange={(e) => updatePayment(payment.key, { reference_no: e.target.value })} /></label>
            <label>Deposit Account<input value={payment.deposit_account} onChange={(e) => updatePayment(payment.key, { deposit_account: e.target.value })} placeholder="Optional historical account" /></label>
            <label>Received From<input value={payment.received_from} onChange={(e) => updatePayment(payment.key, { received_from: e.target.value })} /></label>
            <label>Received By<input value={payment.received_by} onChange={(e) => updatePayment(payment.key, { received_by: e.target.value })} /></label>
            <label className="wide">Notes<input value={payment.notes} onChange={(e) => updatePayment(payment.key, { notes: e.target.value })} /></label>
          </div>
          <div className="ledger-link-box">
            <div className="ledger-link-top">
              <div><b>Accounts Ledger Link</b><span>{payment.ledger_transaction_code ? `Selected: ${payment.ledger_transaction_code}` : "Not linked — this payment will remain Unverified."}</span></div>
              <div className="ledger-link-actions"><button type="button" onClick={() => findLedgerMatches(payment)} disabled={searching[payment.key]}>{searching[payment.key] ? "Searching…" : "Find Ledger Match"}</button>{payment.ledger_transaction_code && <button type="button" onClick={() => updatePayment(payment.key, { ledger_transaction_code: "" })}>Unlink</button>}</div>
            </div>
            {matchErrors[payment.key] && <div className="legacy-error">{matchErrors[payment.key]}</div>}
            {!!rowMatches.length && <div className="ledger-matches">{rowMatches.map((candidate) => <button type="button" key={candidate.id} className={`ledger-candidate ${payment.ledger_transaction_code === candidate.transactionCode ? "selected" : ""}`} onClick={() => updatePayment(payment.key, { ledger_transaction_code: candidate.transactionCode })}>
              <span className={`match-badge ${candidate.matchStatus}`}>{candidate.matchStatus === "exact" ? "Exact Match" : "Review"}</span>
              <b>{candidate.transactionCode}</b><span>{candidate.date || "No date"} · {money(candidate.amount)}{candidate.projectCode ? ` · ${candidate.projectCode}` : " · No project assigned"}</span><small>{[candidate.category, candidate.description, candidate.reference].filter(Boolean).join(" · ") || candidate.sourceType}</small>
            </button>)}</div>}
            {!searching[payment.key] && rowMatches.length === 0 && matches[payment.key] && <div className="legacy-empty compact">No likely unused ledger match found. You can keep the historical payment unlinked and review it later.</div>}
          </div>
        </div>;
      })}
    </div>}

    <style>{`
      .legacy-finance-wrap{grid-column:1/-1;display:grid;gap:12px;min-width:0}.legacy-finance-intro,.legacy-section{border:1px solid rgba(255,255,255,.11);border-radius:12px;background:#0d161f;overflow:hidden}.legacy-finance-intro{padding:15px;display:grid;gap:13px}.legacy-finance-intro>div:first-child>b,.legacy-section-head b{display:block;color:#f4f6f8;font-size:13px}.legacy-finance-intro>div:first-child>span,.legacy-section-head span{display:block;margin-top:4px;color:#7f8c96;font-size:10px;line-height:1.5}.legacy-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.legacy-summary span{border:1px solid rgba(255,255,255,.09);border-radius:8px;background:#111c25;padding:10px}.legacy-summary small{display:block;color:#75838e;font-size:8px;font-weight:900;letter-spacing:.08em}.legacy-summary b{display:block;margin-top:5px;color:#fff;font-size:11px}.legacy-section-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.08);background:#121d26}.legacy-add,.legacy-row-title button,.ledger-link-actions button,.bill-group-head button{border:1px solid rgba(255,255,255,.13);border-radius:7px;background:#18242e;color:#fff;padding:8px 10px;font-size:10px;font-weight:800;cursor:pointer}.legacy-add{background:#d61f26;border-color:#d61f26}.bill-group{border-bottom:1px solid rgba(255,255,255,.08)}.bill-group:last-of-type{border-bottom:0}.bill-group-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;background:#0f1922}.bill-group-head>div{display:flex;align-items:center;gap:10px}.bill-group-head b{color:#f2f5f7;font-size:11px}.bill-group-head span{color:#778590;font-size:9px}.bill-group-head button{padding:6px 8px;background:#16232d}.bill-grid-scroll{overflow-x:auto;padding:0 10px 10px}.bill-grid{min-width:1160px;display:grid;grid-template-columns:minmax(190px,2fr) 128px 100px 64px 105px 95px 110px 120px minmax(130px,1fr) 34px;gap:6px;align-items:center}.bill-grid-header{padding:8px 4px 5px;color:#71808b;font-size:7px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.bill-inline-row{padding:5px 4px;border-top:1px solid rgba(255,255,255,.055)}.bill-inline-row.active{background:rgba(214,31,38,.035)}.bill-inline-row input,.bill-inline-row select{width:100%;height:34px;border:1px solid rgba(255,255,255,.11);border-radius:6px;background:#101a23;color:#edf1f4;padding:0 8px;font-size:10px}.bill-inline-row input:focus,.bill-inline-row select:focus{outline:none;border-color:#d61f26}.bill-inline-row strong{font-size:9px;color:#dbe2e7;text-align:right;white-space:nowrap}.row-remove{width:30px;height:30px;border:1px solid rgba(214,31,38,.22);border-radius:6px;background:rgba(214,31,38,.06);color:#ff9d96;font-size:15px;cursor:pointer}.blank-note{padding:10px 13px;border-top:1px solid rgba(255,255,255,.06);color:#74828d;font-size:9px}.legacy-empty{padding:16px;color:#71808b;font-size:10px}.legacy-empty.compact{padding:10px 0 0}.legacy-row{margin:12px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:#101a23;overflow:hidden}.legacy-row-title{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08)}.legacy-row-title b{color:#e9eef2;font-size:11px}.legacy-row-title button{padding:6px 8px;color:#ff9d96}.legacy-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:12px}.legacy-grid label{display:grid;gap:5px;color:#83909a;font-size:9px;font-weight:800}.legacy-grid label.wide{grid-column:span 2}.legacy-grid input,.legacy-grid select{height:37px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:#0d161f;color:#edf1f4;padding:0 9px;font-size:11px}.ledger-link-box{margin:0 12px 12px;padding:11px;border:1px solid rgba(214,31,38,.25);border-radius:8px;background:rgba(214,31,38,.04)}.ledger-link-top{display:flex;justify-content:space-between;align-items:center;gap:10px}.ledger-link-top b{display:block;color:#f0f3f5;font-size:10px}.ledger-link-top span{display:block;margin-top:4px;color:#7f8c96;font-size:9px}.ledger-link-actions{display:flex;gap:6px;flex-wrap:wrap}.ledger-matches{display:grid;gap:6px;margin-top:9px}.ledger-candidate{text-align:left;border:1px solid rgba(255,255,255,.09);border-radius:7px;background:#111d26;color:#dbe2e7;padding:9px;cursor:pointer}.ledger-candidate.selected{border-color:#d61f26;background:rgba(214,31,38,.09)}.ledger-candidate b{display:block;margin-top:4px;font-size:10px}.ledger-candidate span:not(.match-badge){display:block;margin-top:3px;color:#a9b3ba;font-size:9px}.ledger-candidate small{display:block;margin-top:3px;color:#6f7e89;font-size:8px}.match-badge{display:inline-flex;border-radius:999px;padding:3px 6px;font-size:7px;font-weight:900;text-transform:uppercase}.match-badge.exact{background:rgba(52,190,115,.15);color:#83dfaa}.match-badge.review{background:rgba(243,172,47,.14);color:#f1c66f}.legacy-error{margin-top:8px;color:#ff9d96;font-size:9px}@media(max-width:800px){.legacy-summary{grid-template-columns:1fr 1fr}.legacy-grid{grid-template-columns:1fr 1fr}.ledger-link-top{align-items:flex-start;flex-direction:column}}@media(max-width:560px){.legacy-summary,.legacy-grid{grid-template-columns:1fr}.legacy-grid label.wide{grid-column:auto}.legacy-section-head,.bill-group-head{align-items:flex-start;flex-direction:column}}
    `}</style>
  </section>;
}
