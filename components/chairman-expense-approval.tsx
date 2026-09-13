"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type Row = Record<string, unknown>;
const CHAIRMAN_ID = "EMP-0001";
const FILTERS = ["All", "Office Income", "Office Expense", "Personal Income", "Personal Draw"] as const;
type Filter = (typeof FILTERS)[number];

function text(value: unknown) { return String(value ?? "").trim(); }
function number(value: unknown) {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money(value: unknown) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(number(value));
}
function keyOf(row: Row) { return text(row.Approval_Key || `${text(row.Source)}:${text(row.Source_ID)}`); }
function typeOf(row: Row) { return text(row.Transaction_Type) || "Finance"; }
function statusOf(row: Row) { return text(row.Approval_Status) || "Pending"; }

async function chairmanQueueApi() {
  const response = await fetch("/api/landview?action=getChairmanPendingApprovals", { method: "GET", credentials: "same-origin", cache: "no-store" });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Could not load chairman approvals."));
  return (json.data || []) as Row[];
}

async function chairmanReviewApi(approvalKey: string, status: "Approved" | "Rejected", note: string) {
  const response = await fetch("/api/landview", {
    method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reviewChairmanPendingApproval", approvalKey, status, note }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || `Could not mark ${approvalKey} as ${status}.`));
  return json.data || {};
}

export default function ChairmanExpenseApproval() {
  const [user, setUser] = useState<any>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const employeeId = text(user?.employeeId || user?.Employee_ID || user?.userId || user?.User_ID).toUpperCase();
  const name = text(user?.name || user?.Name || user?.username || user?.Username).toLowerCase();
  const isChairman = employeeId === CHAIRMAN_ID || name.includes("jamal rony") || name.includes("jamal ahmed bhuiyan");

  async function loadQueue() {
    setLoading(true); setError(""); setMessage("");
    try {
      const data = await chairmanQueueApi();
      setRows(data);
      setMessage(`Loaded ${data.length} September 2026 finance transaction${data.length === 1 ? "" : "s"} for EMP-0001 review.`);
    } catch (e: any) {
      setError(e?.message || "Could not load the September 2026 finance approval queue.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    void landViewApi.getSession().then((session) => {
      setUser(session?.user || null);
      const u = session?.user;
      const id = text(u?.employeeId || u?.Employee_ID || u?.userId || u?.User_ID).toUpperCase();
      const n = text(u?.name || u?.Name || u?.username || u?.Username).toLowerCase();
      if (id === CHAIRMAN_ID || n.includes("jamal rony") || n.includes("jamal ahmed bhuiyan")) void loadQueue();
    }).catch(() => setError("Could not verify the employee session.")).finally(() => setSessionReady(true));
  }, []);

  const pending = useMemo(() => rows.filter((row) => statusOf(row).toLowerCase() === "pending"), [rows]);
  const decided = useMemo(() => rows.filter((row) => statusOf(row).toLowerCase() !== "pending"), [rows]);
  const visible = useMemo(() => pending.filter((row) => filter === "All" || typeOf(row) === filter), [pending, filter]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((item) => [item, item === "All" ? pending.length : pending.filter((row) => typeOf(row) === item).length])), [pending]);
  const officeIncome = pending.filter((row) => typeOf(row) === "Office Income").reduce((sum, row) => sum + number(row.Amount), 0);
  const officeExpense = pending.filter((row) => typeOf(row) === "Office Expense").reduce((sum, row) => sum + number(row.Amount), 0);
  const personalIncome = pending.filter((row) => typeOf(row) === "Personal Income").reduce((sum, row) => sum + number(row.Amount), 0);
  const personalDraw = pending.filter((row) => typeOf(row) === "Personal Draw").reduce((sum, row) => sum + number(row.Amount), 0);

  async function decide(row: Row, status: "Approved" | "Rejected") {
    const key = keyOf(row); if (!key) return;
    setBusy(key); setError(""); setMessage("");
    const reviewNote = text(notes[key]) || `${status} by EMP-0001 · Engr. Jamal Ahmed Bhuiyan`;
    try {
      await chairmanReviewApi(key, status, reviewNote);
      setRows((current) => current.map((item) => keyOf(item) === key ? { ...item, Approval_Status: status, Reviewed_By: CHAIRMAN_ID, Reviewed_At: new Date().toISOString(), Notes: reviewNote } : item));
      setMessage(`${text(row.Source_ID) || key} ${status.toLowerCase()} by EMP-0001.`);
    } catch (e: any) { setError(e?.message || `Could not mark ${key} as ${status}.`); }
    finally { setBusy(""); }
  }

  if (!sessionReady || !isChairman) return null;

  return <section className="chairman-approval" id="chairman-finance-approvals">
    <style>{`
      .chairman-approval{margin-top:22px;padding:20px;border:1px solid #573033;border-radius:14px;background:linear-gradient(180deg,#211315,#111418);color:#f7f7f7}.chairman-approval *{box-sizing:border-box}.cap-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end}.cap-head h2{margin:5px 0 0;font-size:24px}.cap-head p{max-width:720px;margin:0;color:#b7aaac;font-size:11px;line-height:1.6}.cap-badge{display:inline-flex;padding:6px 9px;border-radius:999px;background:#4b181c;color:#ffaaa5;font-size:9px;font-weight:900;letter-spacing:.08em}.cap-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0}.cap-stat{padding:13px;border:1px solid #3d3335;border-radius:9px;background:#14171b}.cap-stat span{display:block;color:#8f8587;font-size:9px;text-transform:uppercase}.cap-stat strong{display:block;margin-top:6px;font-size:20px}.cap-stat small{display:block;margin-top:5px;color:#817a7b;font-size:9px}.cap-filter{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0}.cap-filter button{border:1px solid #3c4147;border-radius:999px;background:#191d22;color:#aaa;padding:7px 10px;font-size:10px;cursor:pointer}.cap-filter button.active{border-color:#87363d;background:#421c20;color:#ffd0cc}.cap-actions-top{display:flex;justify-content:flex-end;margin:0 0 10px}.cap-refresh{border:1px solid #4b4f55;border-radius:7px;background:#20252b;color:#eee;padding:8px 10px;font-size:10px;cursor:pointer}.cap-msg{margin:10px 0;padding:10px 12px;border-radius:8px;font-size:10px}.cap-msg.err{background:#421f22;color:#ffaaaa}.cap-msg.ok{background:#173823;color:#a7e9b9}.cap-list{display:grid;gap:10px}.cap-row{padding:14px;border:1px solid #34393f;border-radius:10px;background:#11151a}.cap-row-top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.cap-type{display:inline-flex;margin-bottom:7px;padding:4px 7px;border-radius:999px;background:#262c32;color:#cbd2d8;font-size:9px;font-weight:800}.cap-type.income{background:#163624;color:#9be3b3}.cap-type.personal{background:#34263b;color:#ddb8ef}.cap-row strong{display:block;font-size:13px}.cap-meta{margin-top:5px;color:#8f989f;font-size:10px;line-height:1.5}.cap-amount{font-size:17px;font-weight:900;color:#fff;white-space:nowrap}.cap-note{width:100%;margin-top:11px;border:1px solid #3d434a;border-radius:7px;background:#0d1115;color:#eee;padding:9px 10px;font-size:10px}.cap-decisions{display:flex;gap:8px;margin-top:9px}.cap-decisions button{border-radius:7px;padding:8px 12px;font-size:10px;font-weight:800;cursor:pointer}.cap-approve{border:1px solid #2b714a;background:#183724;color:#9ae5b3}.cap-reject{border:1px solid #7b363a;background:#391c1e;color:#ffaaaa}.cap-empty{padding:18px;border:1px dashed #3d4247;border-radius:9px;color:#8e979f;text-align:center;font-size:11px}.cap-foot{margin-top:14px;color:#847b7d;font-size:10px;line-height:1.5}@media(max-width:800px){.cap-head{align-items:flex-start;flex-direction:column}.cap-stats{grid-template-columns:1fr 1fr}.cap-row-top{flex-direction:column}}@media(max-width:520px){.cap-stats{grid-template-columns:1fr}}
    `}</style>
    <div className="cap-head"><div><span className="cap-badge">EMP-0001 · FINANCE CONTROL</span><h2>September 2026 approvals</h2></div><p>One queue for LAND VIEW office income, office expenses, personal income and personal draws. Personal income is reviewed for accountability but never enters LAND VIEW business income or cash totals.</p></div>
    <div className="cap-stats">
      <div className="cap-stat"><span>Office income pending</span><strong>{money(officeIncome)}</strong><small>{counts["Office Income"] || 0} records</small></div>
      <div className="cap-stat"><span>Office expense pending</span><strong>{money(officeExpense)}</strong><small>{counts["Office Expense"] || 0} records</small></div>
      <div className="cap-stat"><span>Personal income pending</span><strong>{money(personalIncome)}</strong><small>Does not affect business totals</small></div>
      <div className="cap-stat"><span>Personal draw pending</span><strong>{money(personalDraw)}</strong><small>{decided.length} already decided</small></div>
    </div>
    {error && <div className="cap-msg err">{error}</div>}{message && <div className="cap-msg ok">{message}</div>}
    <div className="cap-actions-top"><button className="cap-refresh" disabled={loading} onClick={() => void loadQueue()}>{loading ? "Refreshing…" : "Refresh finance approvals"}</button></div>
    <div className="cap-filter">{FILTERS.map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item} · {counts[item] || 0}</button>)}</div>
    <div className="cap-list">
      {visible.map((row) => {
        const key = keyOf(row); const type = typeOf(row); const personal = type.startsWith("Personal"); const income = type.includes("Income");
        return <article className="cap-row" key={key}>
          <div className="cap-row-top"><div><span className={`cap-type ${income ? "income" : ""} ${personal ? "personal" : ""}`}>{type}</span><strong>{text(row.Description) || type}</strong><div className="cap-meta">{text(row.Source_ID)}{text(row.Transaction_Date) ? ` · ${text(row.Transaction_Date)}` : ""}{text(row.Category) ? ` · ${text(row.Category)}` : ""}{text(row.Project_ID) ? ` · ${text(row.Project_ID)}` : ""}</div></div><div className="cap-amount">{money(row.Amount)}</div></div>
          <input className="cap-note" value={notes[key] || ""} onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))} placeholder="Optional EMP-0001 review note" />
          <div className="cap-decisions"><button className="cap-approve" disabled={busy === key} onClick={() => void decide(row, "Approved")}>Approve</button><button className="cap-reject" disabled={busy === key} onClick={() => void decide(row, "Rejected")}>Reject</button></div>
        </article>;
      })}
      {!loading && !visible.length && <div className="cap-empty">No pending {filter === "All" ? "finance transactions" : filter.toLowerCase()}.</div>}
    </div>
    <div className="cap-foot">Pending office receipts do not count toward paid/billing totals until approved. Personal income is kept only in the approval register and is never posted as LAND VIEW business income.</div>
  </section>;
}
