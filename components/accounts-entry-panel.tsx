"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

export type AccountsEntryType = "income" | "expense";
type ExpenseMode = "regular" | "outsourcing";
type PaymentStage = "Advance" | "Partial" | "Final";
type Row = Record<string, any>;

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

type OutsourcingData = {
  jobs?: Row[];
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
const money = (value: unknown) => Number(value || 0).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const [expenseMode, setExpenseMode] = useState<ExpenseMode>("regular");
  const [paymentStage, setPaymentStage] = useState<PaymentStage>("Partial");
  const [outsourcingJobId, setOutsourcingJobId] = useState("");
  const [outsourcingData, setOutsourcingData] = useState<OutsourcingData | null>(null);
  const [outsourcingLoading, setOutsourcingLoading] = useState(false);
  const [outsourcingError, setOutsourcingError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void landViewApi.getSession()
      .then((session) => setUserId(t(session?.user?.userId || session?.user?.User_ID || session?.user?.username || "admin")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (type !== "expense" || expenseMode !== "outsourcing" || outsourcingData || outsourcingLoading) return;
    let cancelled = false;
    setOutsourcingLoading(true);
    setOutsourcingError("");
    void fetch("/api/outsourcing", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load outsourcing work."));
        if (!cancelled) setOutsourcingData(json.data as OutsourcingData);
      })
      .catch((err) => {
        if (!cancelled) setOutsourcingError(err instanceof Error ? err.message : "Could not load outsourcing work.");
      })
      .finally(() => {
        if (!cancelled) setOutsourcingLoading(false);
      });
    return () => { cancelled = true; };
  }, [type, expenseMode, outsourcingData, outsourcingLoading]);

  const jobs = useMemo(() => (outsourcingData?.jobs || []).filter((job) => {
    const due = Number(job.due_amount || 0);
    const status = t(job.status).toLowerCase();
    return due > 0 && status !== "cancelled" && status !== "canceled" && t(job.finance_scope) !== "municipality_file_pass";
  }), [outsourcingData]);

  const selectedJob = useMemo(
    () => jobs.find((job) => String(job.id) === outsourcingJobId) || null,
    [jobs, outsourcingJobId],
  );

  const form = type === "income" ? income : expense;
  const categories = type === "income" ? incomeCategories : expenseCategories;
  const setForm = type === "income" ? setIncome : setExpense;
  const amountValue = Number(form.amount || 0);
  const isOutsourcing = type === "expense" && expenseMode === "outsourcing";
  const canSubmit = Boolean(
    form.date &&
    amountValue > 0 &&
    !busy &&
    (isOutsourcing ? selectedJob : form.description.trim()),
  );

  const submitLabel = useMemo(() => {
    if (busy) return type === "income" ? "SAVING INCOME…" : isOutsourcing ? "POSTING OUTSOURCING PAYMENT…" : "SAVING EXPENSE…";
    return type === "income" ? "SAVE INCOME" : isOutsourcing ? "POST OUTSOURCING PAYMENT" : "SAVE EXPENSE";
  }, [busy, type, isOutsourcing]);

  function selectOutsourcingJob(jobId: string) {
    setOutsourcingJobId(jobId);
    const job = jobs.find((row) => String(row.id) === jobId);
    if (!job) return;
    const projectCode = t(job.project_code).toUpperCase();
    const service = t(job.service_type) || "Outsourcing";
    setExpense((current) => ({
      ...current,
      project: projectCode,
      category: service,
      counterparty: t(job.party_name),
      description: `${service} outsourcing payment${projectCode ? ` - ${projectCode}` : ""}`,
      amount: "",
    }));
    setPaymentStage(Number(job.paid_amount || 0) > 0 ? "Partial" : "Advance");
    setError("");
  }

  function changePaymentStage(stage: PaymentStage) {
    setPaymentStage(stage);
    if (stage === "Final" && selectedJob) {
      setExpense((current) => ({ ...current, amount: String(Number(selectedJob.due_amount || 0).toFixed(2)) }));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!form.date) return setError("Choose a transaction date.");
    if (!isOutsourcing && !form.description.trim()) return setError("Enter a short description.");
    if (!Number.isFinite(amountValue) || amountValue <= 0) return setError("Enter a valid amount greater than zero.");

    if (isOutsourcing) {
      if (!selectedJob) return setError("Choose an outsourcing work item.");
      const due = Number(selectedJob.due_amount || 0);
      if (amountValue > due + 0.005) return setError(`Payment cannot exceed the current due of BDT ${money(due)}.`);
      if (paymentStage === "Final" && Math.abs(amountValue - due) > 0.005) return setError(`Final payment must equal the current due of BDT ${money(due)}.`);
    }

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
      } else if (isOutsourcing && selectedJob) {
        const stageNote = `Payment Stage: ${paymentStage}`;
        const detailsNote = form.description.trim() && form.description.trim() !== `${t(selectedJob.service_type)} outsourcing payment${projectId ? ` - ${projectId}` : ""}`
          ? `Details: ${form.description.trim()}`
          : "";
        const notes = [stageNote, detailsNote, form.notes.trim()].filter(Boolean).join("\n");
        const response = await fetch("/api/outsourcing", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "addPayment",
            jobId: String(selectedJob.id),
            amount: amountValue,
            paymentDate: form.date,
            paymentMethod: form.method,
            referenceNo: form.reference.trim(),
            notes,
          }),
        });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not post outsourcing payment."));

        setExpense(makeEntry(expenseCategories[0]));
        setExpenseMode("regular");
        setOutsourcingJobId("");
        setPaymentStage("Partial");
        setOutsourcingData(null);
        onSaved("Outsourcing payment posted once to Main Accounts and the outsourcing balance was updated.");
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
        .aep-fields input:disabled,.aep-fields select:disabled{opacity:.72;cursor:not-allowed;background:var(--theme-bg-_111920,#111920)}
        .aep-type-row{grid-column:1/-1;display:flex;gap:7px;padding:2px 0 4px}.aep-type-btn{border:1px solid var(--theme-line-_35424b,#35424b);border-radius:8px;background:var(--theme-bg-_091016,#091016);color:var(--theme-ink-_aeb8bf,#aeb8bf);padding:8px 12px;font-size:9px;font-weight:900;cursor:pointer}.aep-type-btn.active{border-color:#b88b28;background:#2b2414;color:#ffd978}
        .aep-outsourcing-card{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;border:1px solid #5a4a22;border-radius:9px;overflow:hidden;background:#5a4a22}.aep-outsourcing-card>div{padding:9px 11px;background:#17150f}.aep-outsourcing-card span{display:block;color:#9b927b;font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.aep-outsourcing-card strong{display:block;margin-top:4px;color:#f2e6c4;font-size:11px}.aep-outsourcing-card .due strong{color:#ffd978}
        .aep-out-loading{grid-column:1/-1;padding:9px 11px;border:1px solid #45402f;border-radius:8px;background:#17150f;color:#bdb59e;font-size:9px}
        .aep-submit{grid-column:1/-1;min-height:40px;border:0;border-radius:8px;color:#fff;font-size:10px;font-weight:900;cursor:pointer}.aep-submit.income{background:#1d5f3d}.aep-submit.expense{background:#c7262d}.aep-submit:disabled{opacity:.45;cursor:not-allowed}
        .aep-note{grid-column:1/-1;color:var(--theme-ink-_75828b,#75828b);font-size:8px;line-height:1.45}
        @media(max-width:900px){.aep-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.aep-fields label.wide4{grid-column:1/-1}.aep-outsourcing-card{grid-template-columns:1fr 1fr 1fr}}
        @media(max-width:560px){.aep-head{align-items:flex-start;flex-direction:column}.aep-fields{grid-template-columns:1fr}.aep-fields label.wide2,.aep-fields label.wide4,.aep-submit,.aep-note{grid-column:auto}.aep-type-row,.aep-outsourcing-card,.aep-out-loading{grid-column:auto}.aep-type-row{display:grid;grid-template-columns:1fr 1fr}.aep-outsourcing-card{grid-template-columns:1fr}}
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
          {type === "expense" && <div className="aep-type-row" aria-label="Expense transaction type">
            <button type="button" className={`aep-type-btn ${expenseMode === "regular" ? "active" : ""}`} onClick={() => { setExpenseMode("regular"); setError(""); }}>Regular Expense</button>
            <button type="button" className={`aep-type-btn ${expenseMode === "outsourcing" ? "active" : ""}`} onClick={() => { setExpenseMode("outsourcing"); setError(""); }}>Outsourcing Payment</button>
          </div>}

          {isOutsourcing && <>
            {outsourcingLoading && <div className="aep-out-loading">Loading open outsourcing work…</div>}
            {outsourcingError && <div className="aep-error wide4">{outsourcingError}</div>}
            <label className="wide4">Outsourcing Job
              <select required value={outsourcingJobId} onChange={(e) => selectOutsourcingJob(e.target.value)} disabled={outsourcingLoading}>
                <option value="">Choose project, service and outsourced person / firm</option>
                {jobs.map((job) => <option key={job.id} value={String(job.id)}>{t(job.project_code) || "General"} — {t(job.service_type) || "Outsourcing"} — {t(job.party_name) || "Unknown"} — Due BDT {money(job.due_amount)}</option>)}
              </select>
            </label>
            {selectedJob && <div className="aep-outsourcing-card">
              <div><span>Agreed / Contract</span><strong>BDT {money(selectedJob.agreed_amount)}</strong></div>
              <div><span>Previously Paid</span><strong>BDT {money(selectedJob.paid_amount)}</strong></div>
              <div className="due"><span>Current Due</span><strong>BDT {money(selectedJob.due_amount)}</strong></div>
            </div>}
            <label>Payment Stage<select value={paymentStage} onChange={(e) => changePaymentStage(e.target.value as PaymentStage)}><option>Advance</option><option>Partial</option><option>Final</option></select></label>
            <label>Project / File ID<input value={form.project} disabled /></label>
            <label>Service<input value={form.category} disabled /></label>
            <label>Outsourced To<input value={form.counterparty} disabled /></label>
          </>}

          <label>Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          {!isOutsourcing && <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>}
          <label>Amount (BDT)<input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="0.00" /></label>
          <label>Payment method<select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{methods.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="wide2">Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={type === "income" ? "e.g. LV-280 design bill payment" : isOutsourcing ? "Optional payment detail" : "e.g. Office electricity bill"} autoFocus={!isOutsourcing} /></label>
          {!isOutsourcing && <label>Project ID<input value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} placeholder="Optional LV-xxx" /></label>}
          {!isOutsourcing && <label>{type === "income" ? "Received from" : "Paid to"}<input value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} placeholder={type === "income" ? "Client / payer" : "Employee / vendor"} /></label>}
          <label className="wide2">Reference<input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Optional receipt, bKash, bank or cheque reference" /></label>
          <label className="wide2">Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={isOutsourcing ? "Optional payment note" : "Optional note for the approver"} /></label>
          <div className="aep-note">{isOutsourcing ? "This creates one outsourcing payment and one linked Main Accounts expense. Paid, due and job status update automatically; no duplicate expense entry is created." : "The entry is saved as Pending and affects official totals only after EMP-0001 approval."}</div>
          <button className={`aep-submit ${type}`} disabled={!canSubmit}>{submitLabel}</button>
        </div>
      </form>
    </section>
  );
}
