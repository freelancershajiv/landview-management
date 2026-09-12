"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type Row = Record<string, unknown>;
const CHAIRMAN_ID = "EMP-0001";
const SEPTEMBER_PREFIX = "SEP-2026-EXP-";

type SeptemberSeed = {
  ref: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  projectId?: string;
  classification?: "Office / Project Cost" | "Eng Rony Personal Draw / Salary";
  note?: string;
};

const SEPTEMBER_2026_EXPENSES: SeptemberSeed[] = [
  { ref: `${SEPTEMBER_PREFIX}001`, date: "2026-09-01", description: "Office Wifi Bill", amount: 550, category: "Internet / Phone" },
  { ref: `${SEPTEMBER_PREFIX}002`, date: "2026-09-01", description: "Office Nasta - Halim and Ruti", amount: 520, category: "Refreshment" },
  { ref: `${SEPTEMBER_PREFIX}003`, date: "2026-09-01", description: "Land View Trade License Renew 2026-2027", amount: 4375, category: "Government Fee" },
  { ref: `${SEPTEMBER_PREFIX}004`, date: "2026-09-02", description: "Office Nasta - Halim and Ruti", amount: 420, category: "Refreshment" },
  { ref: `${SEPTEMBER_PREFIX}005`, date: "2026-09-02", description: "Office Cold Drinks - 2 Case", amount: 1890, category: "Refreshment" },
  { ref: `${SEPTEMBER_PREFIX}006`, date: "2026-09-02", description: "3 Office Municipality Holding Tax", amount: 3366, category: "Government Fee" },
  { ref: `${SEPTEMBER_PREFIX}007`, date: "2026-09-02", description: "Eng Shajiv Launch - Municipality", amount: 200, category: "Refreshment" },
  { ref: `${SEPTEMBER_PREFIX}008`, date: "2026-09-02", projectId: "LV-134", description: "LV-134 - Khusipur - Eng Shajiv (15%)", amount: 1500, category: "Staff Commission / Bonus" },
  { ref: `${SEPTEMBER_PREFIX}009`, date: "2026-09-02", projectId: "LV-134", description: "LV-134 - Khusipur - Eng Borhan & Ahad (10%)", amount: 1000, category: "Staff Commission / Bonus" },
  { ref: `${SEPTEMBER_PREFIX}010`, date: "2026-09-03", description: "Office Nasta - Halim and Ruti", amount: 420, category: "Refreshment" },
  { ref: `${SEPTEMBER_PREFIX}011`, date: "2026-09-03", projectId: "LV-279", description: "LV-279 - Khodeza - Luddar Par - Soil Test", amount: 13000, category: "Soil Test / Survey Cost" },
  { ref: `${SEPTEMBER_PREFIX}012`, date: "2026-09-03", projectId: "LV-279", description: "LV-279 - Khodeza - Eng Shajiv", amount: 400, category: "Staff Commission / Bonus" },
  { ref: `${SEPTEMBER_PREFIX}013`, date: "2026-09-03", description: "Launch With Mahtab bhai", amount: 1350, category: "Refreshment" },
  { ref: `${SEPTEMBER_PREFIX}014`, date: "2026-09-03", description: "Sika Chemicle Sale", amount: 400, category: "Sales / Material Cost" },
  { ref: `${SEPTEMBER_PREFIX}015`, date: "2026-09-05", description: "Office Nasta", amount: 100, category: "Refreshment" },
  { ref: `${SEPTEMBER_PREFIX}016`, date: "2026-09-06", projectId: "LV-280", description: "LV-280 - Nurul Huda - Silonia - Soil Test", amount: 12000, category: "Soil Test / Survey Cost" },
  { ref: `${SEPTEMBER_PREFIX}017`, date: "2026-09-06", projectId: "LV-280", description: "LV-280 - Eng Shajiv Commission", amount: 500, category: "Staff Commission / Bonus" },
  { ref: `${SEPTEMBER_PREFIX}018`, date: "2026-09-06", description: "Office Water", amount: 60, category: "Refreshment" },
  { ref: `${SEPTEMBER_PREFIX}019`, date: "2026-09-06", description: "Office Nasta", amount: 100, category: "Refreshment" },
  { ref: `${SEPTEMBER_PREFIX}020`, date: "2026-09-06", description: "Office Nasta - 10 pc chotpoti and puchka", amount: 500, category: "Refreshment" },
  { ref: `${SEPTEMBER_PREFIX}021`, date: "2026-09-06", projectId: "LV-209", description: "LV-209 - Razu - Eng Shajiv Commission (15%)", amount: 6000, category: "Staff Commission / Bonus" },
  { ref: `${SEPTEMBER_PREFIX}022`, date: "2026-09-06", projectId: "LV-209", description: "LV-209 - Razu - Eng Ahad + Borhan (10%)", amount: 4000, category: "Staff Commission / Bonus" },
  { ref: `${SEPTEMBER_PREFIX}023`, date: "2026-09-09", projectId: "LV-219", description: "LV-219 - Hassan - Eng Shajiv Commission (15%)", amount: 2700, category: "Staff Commission / Bonus" },
  { ref: `${SEPTEMBER_PREFIX}024`, date: "2026-09-09", projectId: "LV-219", description: "LV-219 - Hassan - Eng Ahad & Borhan (10%)", amount: 1800, category: "Staff Commission / Bonus" },
  { ref: `${SEPTEMBER_PREFIX}025`, date: "2026-09-09", projectId: "LV-048", description: "LV-048 - Bablu - Eng Shajiv Commission (15%)", amount: 3000, category: "Staff Commission / Bonus" },
  { ref: `${SEPTEMBER_PREFIX}026`, date: "2026-09-09", projectId: "LV-048", description: "LV-048 - Bablu - Eng Ahad & Borhan (10%)", amount: 2000, category: "Staff Commission / Bonus" },
  { ref: `${SEPTEMBER_PREFIX}027`, date: "2026-09-12", projectId: "LV-276", description: "LV-276 - Ali - Eng Shajiv Visit Bonus", amount: 500, category: "Staff Commission / Bonus" },

  { ref: "RONY-SEP-2026-001", date: "2026-09-03", description: "Eng Rony Mobile Recharge", amount: 639, category: "Salary / Wages", classification: "Eng Rony Personal Draw / Salary" },
  { ref: "RONY-SEP-2026-002", date: "2026-09-03", description: "Nisha Bhabi Piali Dress Buying", amount: 1300, category: "Salary / Wages", classification: "Eng Rony Personal Draw / Salary" },
  { ref: "RONY-SEP-2026-003", date: "2026-09-05", description: "Send Money to 01408080400", amount: 10020, category: "Salary / Wages", classification: "Eng Rony Personal Draw / Salary" },
  { ref: "RONY-SEP-2026-004", date: "2026-09-07", description: "Hazari Road Shop Rent", amount: 20000, category: "Salary / Wages", classification: "Eng Rony Personal Draw / Salary", note: "Eng Rony personal cost / salary draw from LAND VIEW. The BDT 13,000 personal-ledger income is not LAND VIEW income." },
  { ref: "RONY-SEP-2026-005", date: "2026-09-07", description: "Fu Teacher Account", amount: 7000, category: "Salary / Wages", classification: "Eng Rony Personal Draw / Salary" },
  { ref: "RONY-SEP-2026-006", date: "2026-09-09", description: "Nisha Bhabi Send Money", amount: 10704.25, category: "Salary / Wages", classification: "Eng Rony Personal Draw / Salary" },
  { ref: "RONY-SEP-2026-007", date: "2026-09-09", projectId: "LV-048", description: "LV-048 - Daudpool Bill to Eng Rony Bkash", amount: 20000, category: "Salary / Wages", classification: "Eng Rony Personal Draw / Salary" },
];

function text(value: unknown) { return String(value ?? "").trim(); }
function pick(row: Row, keys: string[]) {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null && text(row[key])) return row[key];
  return "";
}
function idOf(row: Row) { return text(pick(row, ["Expense_ID", "Expense ID", "ExpenseId"])); }
function refOf(row: Row) { return text(pick(row, ["Reference", "Reference_No", "Reference No"])); }
function statusOf(row: Row) { return text(pick(row, ["Approval_Status", "Approval Status", "Status"])) || "Pending"; }
function expenseDate(row: Row) { return text(pick(row, ["Expense_Date", "Expense Date", "Date"])); }
function isSeptember2026(row: Row) {
  const raw = expenseDate(row);
  if (!raw) return false;
  const iso = raw.match(/^2026-09-/);
  if (iso) return true;
  const d = new Date(raw);
  return !Number.isNaN(d.getTime()) && d.getFullYear() === 2026 && d.getMonth() === 8;
}
function isRony(row: Row) {
  return refOf(row).startsWith("RONY-SEP-2026-") || text(pick(row, ["Classification", "Notes"])).toLowerCase().includes("personal");
}
function money(value: unknown) {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}

async function chairmanQueueApi() {
  const response = await fetch("/api/landview?action=getChairmanPendingApprovals", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || json?.message || "Could not load chairman approvals."));
  }
  return (json.data || []) as Row[];
}

async function chairmanReviewApi(id: string, status: "Approved" | "Rejected", note: string) {
  const response = await fetch("/api/landview", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reviewChairmanPendingApproval", id, status, note }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || json?.message || `Could not mark ${id} as ${status}.`));
  }
  return json.data || {};
}

export default function ChairmanExpenseApproval() {
  const [user, setUser] = useState<any>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const employeeId = text(user?.employeeId || user?.Employee_ID || user?.userId || user?.User_ID).toUpperCase();
  const name = text(user?.name || user?.Name || user?.username || user?.Username).toLowerCase();
  const isChairman = employeeId === CHAIRMAN_ID || name.includes("jamal rony") || name.includes("jamal ahmed bhuiyan");

  async function loadQueue() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const expenses = await chairmanQueueApi();
      setRows(expenses || []);
      setMessage(`Loaded ${expenses.length} September 2026 expense record${expenses.length === 1 ? "" : "s"} for EMP-0001 review.`);
    } catch (e: any) {
      setError(e?.message || "Could not load the September 2026 approval queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void landViewApi.getSession()
      .then((session) => {
        setUser(session?.user || null);
        const u = session?.user;
        const id = text(u?.employeeId || u?.Employee_ID || u?.userId || u?.User_ID).toUpperCase();
        const n = text(u?.name || u?.Name || u?.username || u?.Username).toLowerCase();
        if (id === CHAIRMAN_ID || n.includes("jamal rony") || n.includes("jamal ahmed bhuiyan")) void loadQueue();
      })
      .catch(() => setError("Could not verify the employee session."))
      .finally(() => setSessionReady(true));
  }, []);

  const septemberRows = useMemo(() => rows.filter(isSeptember2026), [rows]);
  const pending = useMemo(() => septemberRows.filter((row) => statusOf(row).toLowerCase() === "pending"), [septemberRows]);
  const personal = useMemo(() => pending.filter(isRony), [pending]);
  const office = useMemo(() => pending.filter((row) => !isRony(row)), [pending]);
  const decided = useMemo(() => septemberRows.filter((row) => statusOf(row).toLowerCase() !== "pending"), [septemberRows]);
  const pendingTotal = pending.reduce((sum, row) => {
    const n = Number(String(pick(row, ["Amount", "Expense_Amount", "Expense Amount"]) || 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  async function decide(row: Row, status: "Approved" | "Rejected") {
    const id = idOf(row);
    if (!id) return;
    setBusy(id); setError(""); setMessage("");
    const now = new Date().toISOString();
    const reviewNote = text(notes[id]) || `${status} by EMP-0001 · Engr. Jamal Ahmed Bhuiyan`;
    try {
      await chairmanReviewApi(id, status, reviewNote);
      setRows((current) => current.map((item) => idOf(item) === id ? {
        ...item,
        Status: status,
        Approval_Status: status,
        Approved_By: status === "Approved" ? CHAIRMAN_ID : "",
        Approved_At: status === "Approved" ? now : "",
        Reviewed_By: CHAIRMAN_ID,
        Reviewed_At: now,
        Review_Notes: reviewNote,
      } : item));
      setMessage(`${id} ${status.toLowerCase()} by EMP-0001.`);
    } catch (e: any) {
      setError(e?.message || `Could not mark ${id} as ${status}.`);
    } finally {
      setBusy("");
    }
  }

  if (!sessionReady || !isChairman) return null;

  const render = (items: Row[], empty: string) => <div className="cap-list">
    {items.map((row) => {
      const id = idOf(row);
      const date = expenseDate(row);
      const description = text(pick(row, ["Description", "Particulars", "Expense"])) || "Expense";
      const category = text(pick(row, ["Category", "Expense_Category", "Expense Category"]));
      const project = text(pick(row, ["Project_ID", "Project ID", "File_ID", "File ID"]));
      return <article className="cap-row" key={id || refOf(row)}>
        <div className="cap-row-top"><div><strong>{description}</strong><div className="cap-meta">{id || refOf(row)}{date ? ` · ${date}` : ""}{category ? ` · ${category}` : ""}{project ? ` · ${project}` : ""}</div></div><div className="cap-amount">{money(pick(row, ["Amount", "Expense_Amount", "Expense Amount"]))}</div></div>
        <input className="cap-note" value={notes[id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [id]: event.target.value }))} placeholder="Optional EMP-0001 review note" />
        <div className="cap-decisions"><button className="cap-approve" disabled={busy === id} onClick={() => void decide(row, "Approved")}>Approve</button><button className="cap-reject" disabled={busy === id} onClick={() => void decide(row, "Rejected")}>Reject</button></div>
      </article>;
    })}
    {!loading && !items.length && <div className="cap-empty">{empty}</div>}
  </div>;

  return <section className="chairman-approval" id="chairman-expense-approvals">
    <style>{`
      .chairman-approval{margin-top:22px;padding:20px;border:1px solid #573033;border-radius:12px;background:linear-gradient(180deg,#221416,#17191d);color:#f7f7f7}.chairman-approval *{box-sizing:border-box}.cap-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end}.cap-head h2{margin:4px 0 0;font-size:24px}.cap-head p{max-width:680px;margin:0;color:#b3a8aa;font-size:11px;line-height:1.55}.cap-badge{display:inline-flex;padding:6px 9px;border-radius:999px;background:#4b181c;color:#ffaaa5;font-size:9px;font-weight:900;letter-spacing:.08em}.cap-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0}.cap-stat{padding:13px;border:1px solid #3d3335;border-radius:9px;background:#14171b}.cap-stat span{display:block;color:#8f8587;font-size:9px;text-transform:uppercase}.cap-stat strong{display:block;margin-top:6px;font-size:22px}.cap-section-title{margin:22px 0 9px;font-size:12px;color:#ffaaa5;text-transform:uppercase;letter-spacing:.08em}.cap-actions-top{display:flex;justify-content:flex-end;margin:0 0 10px}.cap-refresh{border:1px solid #4b4f55;border-radius:7px;background:#20252b;color:#eee;padding:8px 10px;font-size:10px;cursor:pointer}.cap-msg{margin:10px 0;padding:10px 12px;border-radius:8px;font-size:10px}.cap-msg.err{background:#421f22;color:#ffaaaa}.cap-msg.ok{background:#173823;color:#a7e9b9}.cap-list{display:grid;gap:10px}.cap-row{padding:14px;border:1px solid #34393f;border-radius:10px;background:#11151a}.cap-row-top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.cap-row strong{display:block;font-size:13px}.cap-meta{margin-top:5px;color:#8f989f;font-size:10px;line-height:1.5}.cap-amount{font-size:17px;font-weight:900;color:#fff;white-space:nowrap}.cap-note{width:100%;margin-top:11px;border:1px solid #3d434a;border-radius:7px;background:#0d1115;color:#eee;padding:9px 10px;font-size:10px}.cap-decisions{display:flex;gap:8px;margin-top:9px}.cap-decisions button{border-radius:7px;padding:8px 12px;font-size:10px;font-weight:800;cursor:pointer}.cap-approve{border:1px solid #2b714a;background:#183724;color:#9ae5b3}.cap-reject{border:1px solid #7b363a;background:#391c1e;color:#ffaaaa}.cap-empty{padding:18px;border:1px dashed #3d4247;border-radius:9px;color:#8e979f;text-align:center;font-size:11px}@media(max-width:800px){.cap-head{align-items:flex-start;flex-direction:column}.cap-stats{grid-template-columns:1fr 1fr}.cap-row-top{flex-direction:column}}@media(max-width:520px){.cap-stats{grid-template-columns:1fr}}
    `}</style>
    <div className="cap-head"><div><span className="cap-badge">EMP-0001 · SEPTEMBER 2026 APPROVAL</span><h2>All September expenses</h2></div><p>Every LAND VIEW expense dated September 2026 must remain Pending until EMP-0001 reviews it. This includes office/project costs and Eng. Rony personal/salary drawings.</p></div>
    <div className="cap-stats"><div className="cap-stat"><span>September expenses</span><strong>{septemberRows.length}</strong></div><div className="cap-stat"><span>Pending approval</span><strong>{pending.length}</strong></div><div className="cap-stat"><span>Already decided</span><strong>{decided.length}</strong></div><div className="cap-stat"><span>Pending amount</span><strong>{money(pendingTotal)}</strong></div></div>
    {error && <div className="cap-msg err">{error}</div>}{message && <div className="cap-msg ok">{message}</div>}
    <div className="cap-actions-top"><button className="cap-refresh" disabled={loading} onClick={() => void loadQueue()}>{loading ? "Refreshing…" : "Refresh September approvals"}</button></div>
    <h3 className="cap-section-title">Office & project expenses</h3>{render(office, "No September office/project expenses are waiting for approval.")}
    <h3 className="cap-section-title">Eng. Rony personal costs / salary draw</h3>{render(personal, "No Eng. Rony September personal/salary drawings are waiting for approval.")}
  </section>;
}
