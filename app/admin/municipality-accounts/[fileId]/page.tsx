"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type LedgerRow = {
  id: string;
  sourceId: string;
  date: string;
  type: "Income" | "Expense" | "Transfer";
  sourceType: string;
  projectId: string;
  category: string;
  description: string;
  debit: number;
  credit: number;
  account: string;
  method: string;
  reference: string;
  paidTo: string;
  notes: string;
  createdBy: string;
};
type ProjectOption = { id: string; name: string; client: string };
type AccountOption = { code: string; name: string };
type LoadData = {
  transactions: LedgerRow[];
  projects: ProjectOption[];
  accounts: AccountOption[];
  canAddExpense?: boolean;
  canEditExpenses?: boolean;
};
type ExpenseForm = {
  date: string;
  category: string;
  amount: string;
  paidTo: string;
  account: string;
  reference: string;
  notes: string;
};

const STANDARD_EXPENSES = [
  "Floor Fees",
  "Extra for 6 Storied",
  "Boundary Wall",
  "Boundary Wall Ex",
  "VAT 15% (1-4)",
  "Mayor Fund",
  "Heart Foundation",
  "Draftsman",
  "Surveyor",
  "Assistant Engineer",
  "Helpers",
  "Municipality Book",
  "Ammonia Print",
  "Mouza Map",
  "Stamp Bond",
  "Ex-Cn Passing",
  "Water Demand",
  "Bank Draft",
  "Architect Sign",
  "Consultancy",
] as const;

function today() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value || "";
  const m = parts.find((p) => p.type === "month")?.value || "";
  const d = parts.find((p) => p.type === "day")?.value || "";
  return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
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
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Request failed."));
  return json.data;
}
function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function matchesStandard(row: LedgerRow, label: string) {
  const target = norm(label);
  const category = norm(row.category || "");
  const description = norm(row.description || "");
  return category === target || description === target || description.startsWith(`${target} `);
}
function blankExpense(category: string, account: string): ExpenseForm {
  return { date: today(), category, amount: "", paidTo: "", account, reference: "", notes: "" };
}

export default function MunicipalityFileExpensePage() {
  const params = useParams<{ fileId: string }>();
  const router = useRouter();
  const fileId = decodeURIComponent(String(params?.fileId || "")).trim().toUpperCase();
  const [data, setData] = useState<LoadData>({ transactions: [], projects: [], accounts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [expense, setExpense] = useState<ExpenseForm>(blankExpense(STANDARD_EXPENSES[0], ""));

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
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load municipality file expenses."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  const project = useMemo(() => data.projects.find((item) => item.id.toUpperCase() === fileId), [data.projects, fileId]);
  const rows = useMemo(() => data.transactions
    .filter((row) => row.projectId.toUpperCase() === fileId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), [data.transactions, fileId]);
  const expenseRows = useMemo(() => rows.filter((row) => row.type === "Expense" && row.sourceType === "EXPENSE"), [rows]);
  const received = rows.reduce((sum, row) => sum + amount(row.credit), 0);
  const spent = rows.reduce((sum, row) => row.sourceType === "MUNICIPALITY_TRANSFER_OUT" ? sum : sum + amount(row.debit), 0);
  const sentMain = rows.reduce((sum, row) => row.sourceType === "MUNICIPALITY_TRANSFER_OUT" ? sum + amount(row.debit) : sum, 0);
  const remaining = rows.reduce((sum, row) => sum + amount(row.credit) - amount(row.debit), 0);

  const checklist = useMemo(() => STANDARD_EXPENSES.map((label) => {
    const matches = expenseRows.filter((row) => matchesStandard(row, label));
    return {
      label,
      total: matches.reduce((sum, row) => sum + amount(row.debit), 0),
      count: matches.length,
      lastDate: matches.map((row) => row.date).sort().at(-1) || "",
    };
  }), [expenseRows]);

  function openAdd(category: string) {
    setMessage("");
    setFormError("");
    setExpense(blankExpense(category, data.accounts[0]?.name || ""));
    setExpenseOpen(true);
  }

  async function saveExpense() {
    const value = amount(expense.amount);
    if (!fileId) return setFormError("Municipality file ID is missing.");
    if (!expense.date) return setFormError("Choose the expense date.");
    if (!(value > 0)) return setFormError("Enter a valid expense amount.");
    if (!expense.account) return setFormError("Choose the account used for payment.");
    setSaving(true);
    setFormError("");
    try {
      await requestJson("/api/municipality-file-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addExpense",
          Project_ID: fileId,
          Expense_Date: expense.date,
          Category: expense.category,
          Description: expense.category,
          Amount: value,
          Paid_To: expense.paidTo.trim(),
          Account: expense.account,
          Reference_No: expense.reference.trim(),
          Notes: expense.notes.trim(),
        }),
      });
      setExpenseOpen(false);
      setMessage(`${expense.category} expense added to ${fileId}.`);
      setRevision((value) => value + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save municipality expense.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="mfd-page">
    <style>{`
      .mfd-page{color:var(--lv-text);padding-bottom:32px}.mfd-page *{box-sizing:border-box}.mfd-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}.mfd-back{border:1px solid var(--lv-border-strong);background:var(--lv-white);color:var(--lv-text);border-radius:9px;padding:9px 12px;font-size:11px;font-weight:900;cursor:pointer}.mfd-kicker{display:block;color:#ed6963;font-size:10px;font-weight:900;letter-spacing:.14em}.mfd-top h1{margin:5px 0 4px;font-size:30px;letter-spacing:-.03em}.mfd-top p{margin:0;color:var(--lv-muted);font-size:11px}.mfd-note{padding:10px 12px;border-radius:9px;margin-bottom:12px;border:1px solid rgba(79,124,89,.28);background:rgba(79,124,89,.08);color:var(--lv-good);font-size:11px}.mfd-note.error{border-color:rgba(191,75,75,.28);background:rgba(191,75,75,.08);color:var(--lv-danger)}.mfd-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.mfd-card{border:1px solid var(--lv-border);background:var(--lv-surface);border-radius:12px;padding:15px}.mfd-card span{display:block;color:var(--lv-muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.mfd-card strong{display:block;margin-top:7px;font-size:20px}.green{color:var(--lv-good)}.red{color:var(--lv-danger)}.blue{color:#4c78a8}.mfd-section{margin-top:14px;border:1px solid var(--lv-border);background:var(--lv-surface);border-radius:12px;overflow:hidden}.mfd-section-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 15px;border-bottom:1px solid var(--lv-border)}.mfd-section-head h2{margin:0;font-size:17px}.mfd-section-head p{margin:3px 0 0;color:var(--lv-muted);font-size:10px}.mfd-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0}.mfd-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:13px 15px;border-bottom:1px solid var(--lv-border)}.mfd-item:nth-child(odd){border-right:1px solid var(--lv-border)}.mfd-item-title{font-size:12px;font-weight:900}.mfd-item-meta{margin-top:4px;color:var(--lv-muted);font-size:9px}.mfd-item-amount{margin-top:4px;font-size:13px;font-weight:900;color:var(--lv-danger)}.mfd-btn{border:1px solid var(--lv-border-strong);background:var(--lv-white);color:var(--lv-text);border-radius:8px;padding:8px 10px;font-size:10px;font-weight:900;cursor:pointer}.mfd-btn.primary{background:#d94b45;border-color:#d94b45;color:#fff}.mfd-btn:disabled{opacity:.45;cursor:not-allowed}.mfd-table-wrap{overflow:auto}.mfd-table{width:100%;border-collapse:collapse;min-width:940px}.mfd-table th,.mfd-table td{padding:10px 12px;border-bottom:1px solid var(--lv-border);text-align:left;font-size:10px}.mfd-table th{background:var(--lv-paper);color:var(--lv-muted);font-size:9px;text-transform:uppercase;letter-spacing:.05em}.mfd-table .num{text-align:right;white-space:nowrap}.mfd-empty{padding:25px;text-align:center;color:var(--lv-muted)}.mfd-backdrop{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.48);display:grid;place-items:center;padding:16px}.mfd-modal{width:min(650px,100%);max-height:92vh;overflow:auto;border:1px solid var(--lv-border-strong);background:var(--lv-surface);color:var(--lv-text);border-radius:12px;padding:20px}.mfd-modal h2{margin:0 0 4px}.mfd-modal>p{margin:0 0 16px;color:var(--lv-muted);font-size:11px}.mfd-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mfd-field{display:flex;flex-direction:column;gap:6px}.mfd-field.full{grid-column:1/-1}.mfd-field label{font-size:9px;font-weight:900;text-transform:uppercase;color:var(--lv-text)}.mfd-field input,.mfd-field select,.mfd-field textarea{background:var(--lv-white);color:var(--lv-text);border:1px solid var(--lv-border-strong);border-radius:8px;padding:10px;min-height:42px;color-scheme:light}.mfd-field textarea{min-height:72px;resize:vertical}.mfd-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}@media(max-width:850px){.mfd-metrics{grid-template-columns:1fr 1fr}.mfd-grid{grid-template-columns:1fr}.mfd-item:nth-child(odd){border-right:0}.mfd-form{grid-template-columns:1fr}.mfd-field.full{grid-column:auto}}@media(max-width:560px){.mfd-top{flex-direction:column}.mfd-metrics{grid-template-columns:1fr}}
    `}</style>

    <header className="mfd-top">
      <div><span className="mfd-kicker">MUNICIPALITY FILE / EXPENSE DETAILS</span><h1>{fileId || "Municipality File"}</h1><p>{project ? `${project.client || project.name || fileId}${project.name && project.name !== project.client ? ` — ${project.name}` : ""}` : "Detailed municipality expenses by file."}</p></div>
      <button className="mfd-back" type="button" onClick={() => router.push("/admin/municipality-accounts")}>← Municipality Ledger</button>
    </header>

    {message && <div className="mfd-note">{message}</div>}
    {error && <div className="mfd-note error">{error}</div>}

    <section className="mfd-metrics">
      <div className="mfd-card"><span>Municipality received</span><strong className="green">{money(received)}</strong></div>
      <div className="mfd-card"><span>Total expenses</span><strong className="red">{money(spent)}</strong></div>
      <div className="mfd-card"><span>Sent to Main Ledger</span><strong className="blue">{money(sentMain)}</strong></div>
      <div className="mfd-card"><span>Remaining balance</span><strong className={remaining < 0 ? "red" : "green"}>{money(remaining)}</strong></div>
    </section>

    <section className="mfd-section">
      <div className="mfd-section-head"><div><h2>Standard municipality expenses</h2><p>Each expense head stays tied to {fileId}. A head can have more than one payment; the amount below is the recorded total.</p></div></div>
      {loading ? <div className="mfd-empty">Loading expense details…</div> : <div className="mfd-grid">{checklist.map((item) => <div className="mfd-item" key={item.label}><div><div className="mfd-item-title">{item.label}</div><div className="mfd-item-amount">{item.total > 0 ? money(item.total) : "Not recorded"}</div><div className="mfd-item-meta">{item.count ? `${item.count} entr${item.count === 1 ? "y" : "ies"}${item.lastDate ? ` · Last ${displayDate(item.lastDate)}` : ""}` : "No expense entry yet"}</div></div><button type="button" className="mfd-btn" disabled={!data.canAddExpense} onClick={() => openAdd(item.label)}>+ Add</button></div>)}</div>}
    </section>

    <section className="mfd-section">
      <div className="mfd-section-head"><div><h2>Expense history</h2><p>All actual municipality expense entries recorded against this file.</p></div></div>
      {loading ? <div className="mfd-empty">Loading history…</div> : expenseRows.length === 0 ? <div className="mfd-empty">No municipality expenses have been recorded for this file yet.</div> : <div className="mfd-table-wrap"><table className="mfd-table"><thead><tr><th>Date</th><th>Expense</th><th>Paid To</th><th>Account / Reference</th><th className="num">Amount</th><th>Added By</th></tr></thead><tbody>{expenseRows.map((row) => <tr key={row.id}><td>{displayDate(row.date)}</td><td><strong>{row.category || row.description}</strong><div style={{color:"var(--lv-muted)",marginTop:3}}>{row.description !== row.category ? row.description : row.sourceId}</div></td><td>{row.paidTo || "—"}</td><td>{row.account || row.method || "—"}<div style={{color:"var(--lv-muted)",marginTop:3}}>{row.reference || "No reference"}</div></td><td className="num red"><strong>{money(row.debit)}</strong></td><td>{row.createdBy || "—"}</td></tr>)}</tbody></table></div>}
    </section>

    {expenseOpen && <div className="mfd-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setExpenseOpen(false); }}><div className="mfd-modal" role="dialog" aria-modal="true"><h2>Add {expense.category}</h2><p>This payment will be posted as a Municipality Account expense for <strong>{fileId}</strong> and will reduce this file&apos;s remaining municipality balance.</p>{formError && <div className="mfd-note error">{formError}</div>}<div className="mfd-form">
      <div className="mfd-field"><label>Expense date</label><input type="date" value={expense.date} onChange={(e) => setExpense((f) => ({...f,date:e.target.value}))}/></div>
      <div className="mfd-field"><label>Expense head</label><select value={expense.category} onChange={(e) => setExpense((f) => ({...f,category:e.target.value}))}>{STANDARD_EXPENSES.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="mfd-field"><label>Amount (BDT)</label><input inputMode="decimal" value={expense.amount} onChange={(e) => setExpense((f) => ({...f,amount:e.target.value.replace(/[^0-9.]/g,"")}))}/></div>
      <div className="mfd-field"><label>Paid to</label><input value={expense.paidTo} onChange={(e) => setExpense((f) => ({...f,paidTo:e.target.value}))} placeholder="Office / person / authority"/></div>
      <div className="mfd-field"><label>Paid from account</label><select value={expense.account} onChange={(e) => setExpense((f) => ({...f,account:e.target.value}))}><option value="">Choose account</option>{data.accounts.map((account) => <option key={`${account.code}-${account.name}`} value={account.name}>{account.name}</option>)}</select></div>
      <div className="mfd-field"><label>Reference</label><input value={expense.reference} onChange={(e) => setExpense((f) => ({...f,reference:e.target.value}))} placeholder="Receipt / memo / transaction ref"/></div>
      <div className="mfd-field full"><label>Notes</label><textarea value={expense.notes} onChange={(e) => setExpense((f) => ({...f,notes:e.target.value}))}/></div>
    </div><div className="mfd-actions"><button className="mfd-btn" disabled={saving} onClick={() => setExpenseOpen(false)}>Cancel</button><button className="mfd-btn primary" disabled={saving} onClick={() => void saveExpense()}>{saving ? "Saving…" : "Save Expense"}</button></div></div></div>}
  </div>;
}
