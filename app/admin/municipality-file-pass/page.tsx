"use client";

import { useEffect, useMemo, useState } from "react";

type LedgerRow = {
  id: string;
  date: string;
  type: "Income" | "Expense";
  projectId: string;
  category: string;
  description: string;
  debit: number;
  credit: number;
  account: string;
  method: string;
  reference: string;
  createdBy: string;
};
type ProjectOption = { id: string; name: string; client: string };
type AccountOption = { code: string; name: string };
type LoadData = { transactions: LedgerRow[]; projects: ProjectOption[]; accounts: AccountOption[] };
type ExpenseForm = { projectId: string; date: string; category: string; description: string; amount: string; paidTo: string; account: string; reference: string; notes: string };

const EXPENSE_CATEGORIES = ["Municipality Fee", "Submission Fee", "Staff Commission / Bonus", "Transport", "Printing / Documentation", "Other"];

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function amount(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money(value: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
}
function displayDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Request failed."));
  return json.data;
}
function blankExpense(account = ""): ExpenseForm {
  return { projectId: "", date: today(), category: "Municipality Fee", description: "", amount: "", paidTo: "", account, reference: "", notes: "" };
}

export default function MunicipalityFilePassPage() {
  const [data, setData] = useState<LoadData>({ transactions: [], projects: [], accounts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [expense, setExpense] = useState<ExpenseForm>(blankExpense());
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    requestJson("/api/municipality-file-pass")
      .then((result: LoadData) => {
        if (cancelled) return;
        setData(result);
        setExpense((current) => current.account ? current : { ...current, account: result.accounts[0]?.name || "" });
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load Municipality File Pass ledger."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...data.transactions]
      .filter((row) => !term || [row.id, row.date, row.projectId, row.category, row.description, row.account, row.reference, row.createdBy].join(" ").toLowerCase().includes(term))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [data.transactions, query]);
  const totalIncome = data.transactions.reduce((sum, row) => sum + amount(row.credit), 0);
  const totalExpense = data.transactions.reduce((sum, row) => sum + amount(row.debit), 0);
  const balance = totalIncome - totalExpense;

  async function saveExpense() {
    const value = amount(expense.amount);
    if (!expense.projectId) return setFormError("Choose a project.");
    if (!expense.date) return setFormError("Choose the expense date.");
    if (!(value > 0)) return setFormError("Enter a valid expense amount.");
    if (!expense.account) return setFormError("Choose the account used for payment.");
    if (!expense.description.trim()) return setFormError("Enter the expense details.");
    setSaving(true);
    setFormError("");
    try {
      await requestJson("/api/municipality-file-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Project_ID: expense.projectId,
          Expense_Date: expense.date,
          Category: expense.category,
          Description: expense.description.trim(),
          Amount: value,
          Paid_To: expense.paidTo.trim(),
          Account: expense.account,
          Reference_No: expense.reference.trim(),
          Notes: expense.notes.trim(),
        }),
      });
      setExpenseOpen(false);
      setExpense(blankExpense(data.accounts[0]?.name || ""));
      setMessage("Municipality File Pass expense added successfully.");
      setRevision((value) => value + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save expense.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="mfp-page">
    <style>{`
      .mfp-page{color:var(--theme-ink-_edf2f5,#edf2f5);padding-bottom:26px}.mfp-page *{box-sizing:border-box}.mfp-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:18px}.mfp-kicker{display:block;color:#ed6963;font-size:10px;font-weight:900;letter-spacing:.14em}.mfp-head h1{margin:5px 0 3px;font-size:34px;letter-spacing:-.03em}.mfp-head p{margin:0;color:var(--theme-ink-_8d99a2,#8d99a2);font-size:11px}.mfp-actions{display:flex;gap:8px;flex-wrap:wrap}.mfp-btn{border:1px solid var(--theme-line-_3b4650,#3b4650);background:var(--theme-bg-_151d24,#151d24);color:var(--theme-ink-_eef3f6,#eef3f6);border-radius:9px;padding:10px 13px;font-weight:900;cursor:pointer}.mfp-btn.primary{background:#d94b45;border-color:#d94b45;color:#fff}.mfp-btn:disabled{opacity:.55;cursor:not-allowed}.mfp-note{padding:10px 12px;border-radius:9px;margin-bottom:12px;border:1px solid var(--theme-line-_31513d,#31513d);background:var(--theme-bg-_18281f,#18281f);color:var(--theme-ink-_a9deb8,#a9deb8)}.mfp-note.error{border-color:#713d38;background:#321f1d;color:#ffaaa3}.mfp-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.mfp-card{border:1px solid var(--theme-line-_303d47,#303d47);background:var(--theme-bg-_111920,#111920);border-radius:12px;padding:16px}.mfp-card span{display:block;color:var(--theme-ink-_8d99a2,#8d99a2);font-size:10px;text-transform:uppercase;letter-spacing:.08em}.mfp-card strong{display:block;margin-top:7px;font-size:22px}.mfp-card.income strong{color:#9fd7ae}.mfp-card.expense strong{color:#ff9e98}.mfp-card.balance strong.negative{color:#ff9e98}.mfp-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}.mfp-toolbar input{width:min(420px,100%);background:#0d141a;color:#fff;border:1px solid #36414a;border-radius:8px;padding:10px}.mfp-panel{border:1px solid var(--theme-line-_303d47,#303d47);background:var(--theme-bg-_10181f,#10181f);border-radius:12px;overflow:hidden}.mfp-table-wrap{overflow:auto}.mfp-table{width:100%;border-collapse:collapse;min-width:1080px}.mfp-table th,.mfp-table td{padding:11px 12px;border-bottom:1px solid var(--theme-line-_27313a,#27313a);text-align:left;font-size:12px}.mfp-table th{font-size:10px;color:var(--theme-ink-_8f9aa3,#8f9aa3);text-transform:uppercase;letter-spacing:.06em}.mfp-table .num{text-align:right;font-variant-numeric:tabular-nums}.mfp-income{color:#9fd7ae;font-weight:800}.mfp-expense{color:#ff9e98;font-weight:800}.mfp-type{display:inline-flex;border:1px solid;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900}.mfp-type.income{color:#9fd7ae;border-color:#31513d;background:#18281f}.mfp-type.expense{color:#ffaaa3;border-color:#713d38;background:#321f1d}.mfp-sub{display:block;margin-top:3px;color:var(--theme-ink-_84919a,#84919a);font-size:10px}.mfp-empty{padding:26px;text-align:center;color:#8f9aa3}.mfp-backdrop{position:fixed;inset:0;z-index:110;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:16px}.mfp-modal{width:min(680px,100%);max-height:92vh;overflow:auto;border:1px solid #3a4650;background:#151d24;border-radius:12px;padding:20px}.mfp-modal h2{margin:0 0 4px}.mfp-modal>p{margin:0 0 16px;color:#9ba7b0;font-size:11px}.mfp-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mfp-field{display:flex;flex-direction:column;gap:6px}.mfp-field.full{grid-column:1/-1}.mfp-field label{font-size:10px;font-weight:900;text-transform:uppercase;color:#c7d0d7}.mfp-field input,.mfp-field select,.mfp-field textarea{background:#0d141a;color:#fff;border:1px solid #36414a;border-radius:8px;padding:10px;min-height:43px;color-scheme:dark}.mfp-field textarea{min-height:78px;resize:vertical}.mfp-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}@media(max-width:900px){.mfp-metrics{grid-template-columns:1fr 1fr}.mfp-head{align-items:flex-start;flex-direction:column}.mfp-grid{grid-template-columns:1fr}.mfp-field.full{grid-column:auto}}@media(max-width:620px){.mfp-metrics{grid-template-columns:1fr}.mfp-toolbar{align-items:stretch;flex-direction:column}.mfp-toolbar input{width:100%}}
    `}</style>

    <header className="mfp-head">
      <div><span className="mfp-kicker">LAND VIEW / SPECIAL SERVICE FINANCE</span><h1>Municipality File Pass</h1><p>Municipality File Pass income and expenses are kept separate from the main LAND VIEW ledger.</p></div>
      <div className="mfp-actions"><button className="mfp-btn primary" onClick={() => { setMessage(""); setFormError(""); setExpense(blankExpense(data.accounts[0]?.name || "")); setExpenseOpen(true); }}>+ Add Expense</button></div>
    </header>

    {message && <div className="mfp-note">{message}</div>}
    {error && <div className="mfp-note error">{error}</div>}

    <section className="mfp-metrics">
      <div className="mfp-card income"><span>Total income</span><strong>{money(totalIncome)}</strong></div>
      <div className="mfp-card expense"><span>Total expense</span><strong>{money(totalExpense)}</strong></div>
      <div className="mfp-card balance"><span>Net balance</span><strong className={balance < 0 ? "negative" : ""}>{money(balance)}</strong></div>
      <div className="mfp-card"><span>Entries</span><strong>{data.transactions.length}</strong></div>
    </section>

    <div className="mfp-toolbar"><div><strong>Income & expense ledger</strong><span className="mfp-sub">Income comes from Finance → Add Payment → Other Services → Municipality File Pass.</span></div><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search project, details, reference or account..." /></div>

    <section className="mfp-panel">
      {loading ? <div className="mfp-empty">Loading Municipality File Pass ledger…</div> : rows.length === 0 ? <div className="mfp-empty">No Municipality File Pass transactions found.</div> : <div className="mfp-table-wrap"><table className="mfp-table"><thead><tr><th>Date</th><th>Type</th><th>File ID</th><th>Particulars</th><th>Account / Reference</th><th className="num">Expense</th><th className="num">Income</th><th>Added By</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{displayDate(row.date)}</td><td><span className={`mfp-type ${row.type.toLowerCase()}`}>{row.type}</span></td><td><strong>{row.projectId || "—"}</strong><span className="mfp-sub">{row.id}</span></td><td><strong>{row.description}</strong><span className="mfp-sub">{row.category}</span></td><td>{row.account || row.method || "—"}<span className="mfp-sub">{row.reference || "No reference"}</span></td><td className="num mfp-expense">{row.debit > 0 ? money(row.debit) : "—"}</td><td className="num mfp-income">{row.credit > 0 ? money(row.credit) : "—"}</td><td>{row.createdBy || "—"}</td></tr>)}</tbody></table></div>}
    </section>

    {expenseOpen && <div className="mfp-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setExpenseOpen(false); }}><div className="mfp-modal" role="dialog" aria-modal="true" aria-label="Add Municipality File Pass Expense"><h2>Add Municipality File Pass Expense</h2><p>This expense will affect the selected account balance but will appear only in the Municipality File Pass ledger.</p>{formError && <div className="mfp-note error">{formError}</div>}<div className="mfp-grid">
      <div className="mfp-field full"><label>Project</label><select value={expense.projectId} onChange={(e) => setExpense((f) => ({ ...f, projectId: e.target.value }))}><option value="">Choose project</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.id} — {project.client || project.name || project.id}{project.name && project.name !== project.client ? ` — ${project.name}` : ""}</option>)}</select></div>
      <div className="mfp-field"><label>Expense date</label><input type="date" value={expense.date} onChange={(e) => setExpense((f) => ({ ...f, date: e.target.value }))}/></div>
      <div className="mfp-field"><label>Category</label><select value={expense.category} onChange={(e) => setExpense((f) => ({ ...f, category: e.target.value }))}>{EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div>
      <div className="mfp-field full"><label>Details</label><input value={expense.description} onChange={(e) => setExpense((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Municipality submission / processing fee"/></div>
      <div className="mfp-field"><label>Amount (BDT)</label><input inputMode="decimal" value={expense.amount} onChange={(e) => setExpense((f) => ({ ...f, amount: e.target.value }))}/></div>
      <div className="mfp-field"><label>Paid to</label><input value={expense.paidTo} onChange={(e) => setExpense((f) => ({ ...f, paidTo: e.target.value }))} placeholder="Person / office / authority"/></div>
      <div className="mfp-field"><label>Paid from account</label><select value={expense.account} onChange={(e) => setExpense((f) => ({ ...f, account: e.target.value }))}><option value="">Choose account</option>{data.accounts.map((account) => <option key={`${account.code}-${account.name}`} value={account.name}>{account.name}</option>)}</select></div>
      <div className="mfp-field"><label>Reference</label><input value={expense.reference} onChange={(e) => setExpense((f) => ({ ...f, reference: e.target.value }))}/></div>
      <div className="mfp-field full"><label>Notes</label><textarea value={expense.notes} onChange={(e) => setExpense((f) => ({ ...f, notes: e.target.value }))}/></div>
    </div><div className="mfp-modal-actions"><button className="mfp-btn" disabled={saving} onClick={() => setExpenseOpen(false)}>Cancel</button><button className="mfp-btn primary" disabled={saving} onClick={saveExpense}>{saving ? "Saving…" : "Save Expense"}</button></div></div></div>}
  </div>;
}
