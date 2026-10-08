"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

export type AccountsEntryType = "income" | "expense";

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

type Props = {
  type: AccountsEntryType;
  onTypeChange: (type: AccountsEntryType) => void;
  onClose: () => void;
  onSaved: (message: string) => void;
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

export default function AccountsEntryPanel({ type, onTypeChange, onClose, onSaved }: Props) {
  const [userId, setUserId] = useState("admin");
  const [income, setIncome] = useState<EntryState>(() => makeEntry(incomeCategories[0]));
  const [expense, setExpense] = useState<EntryState>(() => makeEntry(expenseCategories[0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    if (busy) return type === "income" ? "SAVING INCOME…" : "SAVING EXPENSE…";
    return type === "income" ? "SAVE INCOME" : "SAVE EXPENSE";
  }, [busy, type]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
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
        onSaved("Income saved as Pending for EMP-0001 approval.");
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
        onSaved("Expense saved as Pending for EMP-0001 approval.");
      }
    } catch (e: any) {
      setError(e?.message || `Could not save ${type}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="accounts-entry-panel" aria-label={`Add ${type}`}>
      <style>{`
        .accounts-entry-panel{margin:0 0 14px;border:1px solid var(--theme-line-_34434e,#34434e);border-radius:14px;background:linear-gradient(180deg,var(--theme-bg-_121b22,#121b22),var(--theme-bg-_0b1217,#0b1217));overflow:hidden}
        .aep-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;border-bottom:1px solid var(--theme-line-_293640,#293640)}
        .aep-title small{display:block;color:#ed6963;font-size:8px;font-weight:900;letter-spacing:.13em}.aep-title h2{margin:4px 0 0;font-size:19px}
        .aep-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.aep-tab,.aep-close{border:1px solid var(--theme-line-_3a4751,#3a4751);border-radius:8px;background:var(--theme-bg-_111920,#111920);color:var(--theme-ink-_b8c2c8,#b8c2c8);padding:7px 10px;font-size:9px;font-weight:900;cursor:pointer}
        .aep-tab.active.income{border-color:var(--theme-line-_315f42,#315f42);background:var(--theme-bg-_152a1e,#152a1e);color:var(--theme-ink-_9ee5b7,#9ee5b7)}
        .aep-tab.active.expense{border-color:var(--theme-line-_6e3439,#6e3439);background:var(--theme-bg-_321b1d,#321b1d);color:var(--theme-ink-_ffaaa5,#ffaaa5)}
        .aep-body{padding:14px 15px}.aep-error{margin-bottom:10px;padding:9px 10px;border:1px solid var(--theme-line-_73363a,#73363a);border-radius:8px;background:var(--theme-bg-_351b1d,#351b1d);color:var(--theme-ink-_ffaaa5,#ffaaa5);font-size:9px}
        .aep-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.aep-fields label{display:grid;gap:5px;color:var(--theme-ink-_87929a,#87929a);font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.03em}.aep-fields label.wide2{grid-column:span 2}.aep-fields label.wide4{grid-column:1/-1}
        .aep-fields input,.aep-fields select,.aep-fields textarea{width:100%;min-width:0;border:1px solid var(--theme-line-_35424b,#35424b);border-radius:7px;background:var(--theme-bg-_091016,#091016);color:var(--theme-ink-_edf1f4,#edf1f4);padding:9px 10px;font-size:10px}.aep-fields textarea{min-height:62px;resize:vertical}.aep-fields input::placeholder,.aep-fields textarea::placeholder{color:var(--theme-ink-_65727b,#65727b)}
        .aep-submit{grid-column:1/-1;min-height:40px;border:0;border-radius:8px;color:#fff;font-size:10px;font-weight:900;cursor:pointer}.aep-submit.income{background:#1d5f3d}.aep-submit.expense{background:#c7262d}.aep-submit:disabled{opacity:.45;cursor:not-allowed}
        .aep-note{grid-column:1/-1;color:var(--theme-ink-_75828b,#75828b);font-size:8px;line-height:1.45}
        @media(max-width:900px){.aep-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.aep-fields label.wide4{grid-column:1/-1}}
        @media(max-width:560px){.aep-head{align-items:flex-start;flex-direction:column}.aep-fields{grid-template-columns:1fr}.aep-fields label.wide2,.aep-fields label.wide4,.aep-submit,.aep-note{grid-column:auto}}
      `}</style>
      <div className="aep-head">
        <div className="aep-title"><small>NEW LEDGER ENTRY</small><h2>{type === "income" ? "Add income" : "Add expense"}</h2></div>
        <div className="aep-actions">
          <button type="button" className={`aep-tab income ${type === "income" ? "active" : ""}`} onClick={() => { onTypeChange("income"); setError(""); }}>Income</button>
          <button type="button" className={`aep-tab expense ${type === "expense" ? "active" : ""}`} onClick={() => { onTypeChange("expense"); setError(""); }}>Expense</button>
          <button type="button" className="aep-close" onClick={onClose}>Close</button>
        </div>
      </div>
      <form className="aep-body" onSubmit={submit}>
        {error && <div className="aep-error">{error}</div>}
        <div className="aep-fields">
          <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Amount (BDT)<input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="0.00" /></label>
          <label>Payment method<select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{methods.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="wide2">Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={type === "income" ? "e.g. LV-280 design bill payment" : "e.g. Office electricity bill"} autoFocus /></label>
          <label>Project ID<input value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} placeholder="Optional LV-xxx" /></label>
          <label>{type === "income" ? "Received from" : "Paid to"}<input value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} placeholder={type === "income" ? "Client / payer" : "Employee / vendor"} /></label>
          <label className="wide2">Reference<input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Optional receipt, bKash, bank or cheque reference" /></label>
          <label className="wide2">Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional note for the approver" /></label>
          <div className="aep-note">The entry is saved as Pending and affects official totals only after EMP-0001 approval.</div>
          <button className={`aep-submit ${type}`} disabled={!canSubmit}>{submitLabel}</button>
        </div>
      </form>
    </section>
  );
}
