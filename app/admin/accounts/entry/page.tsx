"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { landViewApi } from "@/lib/api";

type EntryType = "income" | "expense";

type EntryState = {
  date: string;
  category: string;
  description: string;
  amount: string;
  method: string;
  project: string;
  counterparty: string;
  reference: string;
  notes: string;
};

const incomeCategories = [
  "Design Bill", "Supervision Bill", "Soil Test", "Digital Survey", "3D Design",
  "Estimate & Costing", "Plan Approval", "Site Visit", "Rent Income",
  "Material / Product Sale", "Commission Income", "Other Income",
];
const expenseCategories = [
  "Office Rent", "Salary / Wages", "Staff Commission / Bonus", "Utility", "Internet / Phone",
  "Transport", "Site Visit", "Printing / Stationery", "Software / Subscription", "Equipment",
  "Design Outsourcing", "Soil Test / Survey Cost", "Municipality / Approval Cost", "Marketing",
  "Government Fee", "Refreshment", "Maintenance", "Staff Welfare / Gifts", "Miscellaneous",
];
const methods = ["Cash", "bKash", "Nagad", "Bank", "Card", "Cheque", "Other"];

const t = (value: unknown) => String(value ?? "").trim();
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function makeEntry(category: string): EntryState {
  return {
    date: localDate(),
    category,
    description: "",
    amount: "",
    method: "Cash",
    project: "",
    counterparty: "",
    reference: "",
    notes: "",
  };
}

export default function AccountsEntryPage() {
  const [type, setType] = useState<EntryType>("income");
  const [userId, setUserId] = useState("admin");
  const [income, setIncome] = useState<EntryState>(() => makeEntry(incomeCategories[0]));
  const [expense, setExpense] = useState<EntryState>(() => makeEntry(expenseCategories[0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    void landViewApi.getSession()
      .then((session) => setUserId(t(session?.user?.userId || session?.user?.User_ID || session?.user?.username || "admin")))
      .catch(() => {});
  }, []);

  const form = type === "income" ? income : expense;
  const categories = type === "income" ? incomeCategories : expenseCategories;
  const setForm = type === "income" ? setIncome : setExpense;
  const amountValue = Number(form.amount || 0);
  const canSubmit = Boolean(form.date && form.description.trim() && amountValue > 0 && !busy);

  const submitLabel = useMemo(() => {
    if (busy) return type === "income" ? "SAVING INCOME…" : "SUBMITTING EXPENSE…";
    return type === "income" ? "SAVE INCOME FOR APPROVAL" : "SUBMIT EXPENSE FOR APPROVAL";
  }, [busy, type]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setOk("");
    if (!form.date) return setError("Choose a transaction date.");
    if (!form.description.trim()) return setError("Enter a short description.");
    if (!Number.isFinite(amountValue) || amountValue <= 0) return setError("Enter a valid amount greater than zero.");

    setBusy(true);
    try {
      const projectId = form.project.trim().toUpperCase();
      if (type === "income") {
        await landViewApi.createPayment({
          Payment_Date: form.date,
          Project_ID: projectId,
          Income_Category: form.category,
          Payment_For: form.description.trim(),
          Amount: amountValue,
          Payment_Method: form.method,
          Reference_No: form.reference.trim(),
          Received_From: form.counterparty.trim(),
          Received_By: userId,
          Notes: form.notes.trim(),
          Transaction_Type: "Office Income",
          Created_At: new Date().toISOString(),
          Created_By: userId,
        });
        setIncome(makeEntry(incomeCategories[0]));
        setOk("Income saved as Pending. It will affect LAND VIEW totals only after EMP-0001 approval.");
      } else {
        await landViewApi.createErpRecord("expenses", {
          Expense_Date: form.date,
          Project_ID: projectId,
          Category: form.category,
          Description: form.description.trim(),
          Amount: amountValue,
          Payment_Method: form.method,
          Reference: form.reference.trim(),
          Paid_To: form.counterparty.trim(),
          Status: "Pending",
          Notes: form.notes.trim(),
          Created_At: new Date().toISOString(),
          Created_By: userId,
        });
        setExpense(makeEntry(expenseCategories[0]));
        setOk("Expense saved as Pending for EMP-0001 approval.");
      }
    } catch (e: any) {
      setError(e?.message || `Could not save ${type}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="entry-page">
      <style>{`
        .entry-page{max-width:980px;margin:0 auto;color:#edf1f4}.entry-page *{box-sizing:border-box}.en-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:18px}.en-head small{color:#e45c5c;font-size:9px;font-weight:900;letter-spacing:.15em}.en-head h1{margin:5px 0 6px;font-size:32px}.en-head p{margin:0;max-width:560px;color:#87939c;font-size:11px;line-height:1.6}.en-back{display:inline-flex;margin-top:7px;color:#e98480;text-decoration:none;font-size:9px;font-weight:900}.en-shell{display:grid;grid-template-columns:220px 1fr;gap:12px}.en-side,.en-form{border:1px solid #2c3841;border-radius:12px;background:#0f171e}.en-side{padding:12px;height:max-content}.en-choice{width:100%;border:1px solid transparent;border-radius:9px;background:transparent;color:#8a969f;text-align:left;padding:12px;cursor:pointer}.en-choice+.en-choice{margin-top:6px}.en-choice strong{display:block;font-size:12px}.en-choice span{display:block;margin-top:4px;font-size:9px;line-height:1.45}.en-choice.active{border-color:#493034;background:#211619;color:#fff}.en-choice.income.active strong{color:#93deb0}.en-choice.expense.active strong{color:#ffaaa6}.en-note{margin-top:11px;padding:10px;border-radius:8px;background:#0b1217;color:#75828b;font-size:9px;line-height:1.55}.en-form{padding:18px}.en-form-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:14px}.en-form-head h2{margin:0;font-size:20px}.en-form-head p{margin:4px 0 0;color:#7d8992;font-size:9px}.en-state{display:inline-flex;padding:5px 8px;border-radius:999px;background:#3a321d;color:#e9cf8c;font-size:8px;font-weight:900}.en-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.en-fields label{display:grid;gap:5px;color:#87929a;font-size:9px}.en-fields label.wide{grid-column:1/-1}.en-fields input,.en-fields select,.en-fields textarea{width:100%;border:1px solid #35424b;border-radius:7px;background:#091016;color:#edf1f4;padding:10px;font-size:10px}.en-fields textarea{min-height:74px;resize:vertical}.en-fields input::placeholder,.en-fields textarea::placeholder{color:#65727b}.en-submit{grid-column:1/-1;height:42px;border:0;border-radius:8px;background:#c7262d;color:#fff;font-size:10px;font-weight:900;cursor:pointer}.en-submit.income{background:#1d5f3d;color:#d8ffe5}.en-submit:disabled{opacity:.45;cursor:not-allowed}.en-msg{margin-bottom:12px;padding:10px 12px;border-radius:8px;font-size:10px}.en-msg.error{border:1px solid #6d3438;background:#351c1e;color:#ffb0ac}.en-msg.ok{border:1px solid #2e6345;background:#183524;color:#a2e6b8}@media(max-width:760px){.en-head{align-items:flex-start;flex-direction:column}.en-shell{grid-template-columns:1fr}.en-side{display:grid;grid-template-columns:1fr 1fr;gap:7px}.en-choice+.en-choice{margin-top:0}.en-note{grid-column:1/-1}}@media(max-width:520px){.en-fields,.en-side{grid-template-columns:1fr}.en-fields label.wide,.en-submit,.en-note{grid-column:auto}}
      `}</style>

      <header className="en-head">
        <div><small>LAND VIEW · ACCOUNTS</small><h1>New transaction</h1></div>
        <div><p>Record the transaction once. Income and expenses are both saved as Pending until EMP-0001 reviews them, so unapproved money does not affect official totals.</p><Link className="en-back" href="/admin/accounts">← Back to accounts ledger</Link></div>
      </header>

      {error && <div className="en-msg error">{error}</div>}
      {ok && <div className="en-msg ok">{ok}</div>}

      <div className="en-shell">
        <aside className="en-side">
          <button className={`en-choice income ${type === "income" ? "active" : ""}`} onClick={() => { setType("income"); setError(""); setOk(""); }}>
            <strong>Income</strong><span>Client payment, rent, service bill, sale or other money received.</span>
          </button>
          <button className={`en-choice expense ${type === "expense" ? "active" : ""}`} onClick={() => { setType("expense"); setError(""); setOk(""); }}>
            <strong>Expense</strong><span>Office cost, salary, commission, site cost, purchase or payment.</span>
          </button>
          <div className="en-note">Project ID, counterparty and reference are optional. Description, date and amount are the only required transaction details.</div>
        </aside>

        <form className="en-form" onSubmit={submit}>
          <div className="en-form-head"><div><h2>{type === "income" ? "Record income" : "Record expense"}</h2><p>{type === "income" ? "Money LAND VIEW received." : "Money LAND VIEW paid or owes."}</p></div><span className="en-state">PENDING APPROVAL</span></div>
          <div className="en-fields">
            <label>Date<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="wide">Description<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={type === "income" ? "e.g. LV-280 design bill payment" : "e.g. Office electricity bill"} autoFocus /></label>
            <label>Amount (BDT)<input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value.replace(/[^0-9.]/g, "") })} placeholder="0.00" /></label>
            <label>Payment method<select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>{methods.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Project ID<input value={form.project} onChange={(event) => setForm({ ...form, project: event.target.value })} placeholder="Optional LV-xxx" /></label>
            <label>{type === "income" ? "Received from" : "Paid to"}<input value={form.counterparty} onChange={(event) => setForm({ ...form, counterparty: event.target.value })} placeholder={type === "income" ? "Client / payer" : "Employee / vendor"} /></label>
            <label className="wide">Reference<input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder="Optional receipt, bKash, bank or cheque reference" /></label>
            <label className="wide">Notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Optional note for the approver" /></label>
            <button className={`en-submit ${type}`} disabled={!canSubmit}>{submitLabel}</button>
          </div>
        </form>
      </div>
    </main>
  );
}
