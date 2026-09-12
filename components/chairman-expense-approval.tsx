"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type Row = Record<string, unknown>;
const CHAIRMAN_EMPLOYEE_ID = "EMP-0001";

function text(value: unknown) { return String(value ?? "").trim(); }
function valueOf(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && text(value)) return value;
  }
  return "";
}
function money(value: unknown) {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
}
function expenseId(row: Row) { return text(valueOf(row, ["Expense_ID", "Expense ID", "ExpenseId"])); }
function expenseStatus(row: Row) { return text(valueOf(row, ["Status", "Approval_Status", "Approval Status"])) || "Pending"; }
function isRonyDraw(row: Row) { return expenseId(row).startsWith("RONY-SEP-2026-") || text(valueOf(row, ["Notes"])).toLowerCase().includes("personal cost / salary draw"); }

async function apiGet(action: string) {
  const response = await fetch(`/api/landview?action=${encodeURIComponent(action)}`, { credentials: "same-origin", cache: "no-store" });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Request failed."));
  return (json.data || []) as Row[];
}

async function apiPost(action: string, body: Record<string, unknown>) {
  const response = await fetch("/api/landview", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Request failed."));
  return json.data;
}

export default function ChairmanExpenseApproval() {
  const [user, setUser] = useState<any>(null);
  const [loadedSession, setLoadedSession] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const employeeId = text(user?.employeeId || user?.Employee_ID || user?.userId || user?.User_ID).toUpperCase();
  const userName = text(user?.name || user?.Name || user?.username || user?.Username).toLowerCase();
  const isChairman = employeeId === CHAIRMAN_EMPLOYEE_ID || userName.includes("jamal rony");

  async function loadQueue() {
    setLoading(true);
    setError("");
    try {
      const [chairmanRows, erpRows] = await Promise.all([
        apiGet("getChairmanPendingApprovals").catch(() => []),
        landViewApi.getErpRecords("expenses").catch(() => []),
      ]);
      const map = new Map<string, Row>();
      [...(erpRows || []), ...(chairmanRows || [])].forEach((row) => {
        const id = expenseId(row);
        if (id) map.set(id, row);
      });
      setRows(Array.from(map.values()));
      if (!chairmanRows.length && !erpRows.length) setError("The approval queue is empty or the Apps Script chairman endpoint has not been deployed yet.");
    } catch (e: any) {
      setError(e?.message || "Could not load the Chairman approval queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void landViewApi.getSession()
      .then((session) => {
        setUser(session?.user || null);
        const id = text(session?.user?.employeeId || session?.user?.Employee_ID || session?.user?.userId || session?.user?.User_ID).toUpperCase();
        const name = text(session?.user?.name || session?.user?.Name || session?.user?.username || session?.user?.Username).toLowerCase();
        if (id === CHAIRMAN_EMPLOYEE_ID || name.includes("jamal rony")) void loadQueue();
      })
      .catch(() => setError("Could not verify the employee session."))
      .finally(() => setLoadedSession(true));
  }, []);

  const pending = useMemo(() => rows.filter((row) => expenseStatus(row).toLowerCase() === "pending"), [rows]);
  const personal = useMemo(() => pending.filter(isRonyDraw), [pending]);
  const office = useMemo(() => pending.filter((row) => !isRonyDraw(row)), [pending]);
  const pendingTotal = pending.reduce((sum, row) => {
    const n = Number(String(valueOf(row, ["Amount", "Expense_Amount", "Expense Amount"]) || 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  async function decide(row: Row, status: "Approved" | "Rejected" | "Returned") {
    const id = expenseId(row);
    if (!id) return;
    setBusy(id); setError(""); setOk("");
    try {
      if (id.startsWith("RONY-SEP-2026-")) {
        await apiPost("reviewChairmanPendingApproval", { id, status, note: text(notes[id]) || `${status} by Chairman Eng Jamal Rony` });
      } else {
        await landViewApi.updateErpRecord("expenses", id, { Status: status, Review_Notes: text(notes[id]) || `${status} by Chairman Eng Jamal Rony` });
      }
      setRows((current) => current.map((item) => expenseId(item) === id ? { ...item, Status: status, Reviewed_By: CHAIRMAN_EMPLOYEE_ID, Reviewed_At: new Date().toISOString() } : item));
      setOk(`${id} ${status.toLowerCase()} successfully.`);
    } catch (e: any) {
      setError(e?.message || `Could not mark ${id} as ${status}.`);
    } finally { setBusy(""); }
  }

  if (!loadedSession || !isChairman) return null;

  const renderRows = (items: Row[], empty: string) => (
    <div className="cap-list">
      {items.map((row) => {
        const id = expenseId(row);
        const date = text(valueOf(row, ["Expense_Date", "Expense Date", "Date"]));
        const description = text(valueOf(row, ["Description", "Particulars", "Expense"])) || "Expense";
        const category = text(valueOf(row, ["Category", "Expense_Category", "Expense Category"]));
        const project = text(valueOf(row, ["Project_ID", "Project ID", "File_ID", "File ID"]));
        return <article className="cap-row" key={id}>
          <div className="cap-row-top"><div><strong>{description}</strong><div className="cap-meta">{id}{date ? ` · ${date}` : ""}{category ? ` · ${category}` : ""}{project ? ` · ${project}` : ""}</div></div><div className="cap-amount">{money(valueOf(row, ["Amount", "Expense_Amount", "Expense Amount"]))}</div></div>
          <input className="cap-note" value={notes[id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [id]: event.target.value }))} placeholder="Optional Chairman review note" />
          <div className="cap-decisions"><button className="cap-approve" disabled={busy === id} onClick={() => void decide(row, "Approved")}>Approve</button><button className="cap-return" disabled={busy === id} onClick={() => void decide(row, "Returned")}>Return</button><button className="cap-reject" disabled={busy === id} onClick={() => void decide(row, "Rejected")}>Reject</button></div>
        </article>;
      })}
      {!loading && !items.length && <div className="cap-empty">{empty}</div>}
    </div>
  );

  return <section className="chairman-approval" id="chairman-expense-approvals">
    <style>{`
      .chairman-approval{margin-top:22px;padding:20px;border:1px solid #573033;border-radius:12px;background:linear-gradient(180deg,#221416,#17191d);color:#f7f7f7}.chairman-approval *{box-sizing:border-box}.cap-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end}.cap-head h2{margin:4px 0 0;font-size:24px}.cap-head p{max-width:650px;margin:0;color:#b3a8aa;font-size:11px;line-height:1.55}.cap-badge{display:inline-flex;padding:6px 9px;border-radius:999px;background:#4b181c;color:#ffaaa5;font-size:9px;font-weight:900;letter-spacing:.08em}.cap-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0}.cap-stat{padding:13px;border:1px solid #3d3335;border-radius:9px;background:#14171b}.cap-stat span{display:block;color:#8f8587;font-size:9px;text-transform:uppercase}.cap-stat strong{display:block;margin-top:6px;font-size:22px}.cap-section-title{margin:22px 0 9px;font-size:12px;color:#ffaaa5;text-transform:uppercase;letter-spacing:.08em}.cap-actions-top{display:flex;justify-content:flex-end;margin:0 0 10px}.cap-refresh{border:1px solid #4b4f55;border-radius:7px;background:#20252b;color:#eee;padding:8px 10px;font-size:10px;cursor:pointer}.cap-msg{margin:10px 0;padding:10px 12px;border-radius:8px;font-size:10px}.cap-msg.err{background:#421f22;color:#ffaaaa}.cap-msg.ok{background:#173823;color:#a7e9b9}.cap-list{display:grid;gap:10px}.cap-row{padding:14px;border:1px solid #34393f;border-radius:10px;background:#11151a}.cap-row-top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.cap-row strong{display:block;font-size:13px}.cap-meta{margin-top:5px;color:#8f989f;font-size:10px;line-height:1.5}.cap-amount{font-size:17px;font-weight:900;color:#fff;white-space:nowrap}.cap-note{width:100%;margin-top:11px;border:1px solid #3d434a;border-radius:7px;background:#0d1115;color:#eee;padding:9px 10px;font-size:10px}.cap-decisions{display:flex;gap:8px;margin-top:9px}.cap-decisions button{border-radius:7px;padding:8px 12px;font-size:10px;font-weight:800;cursor:pointer}.cap-approve{border:1px solid #2b714a;background:#183724;color:#9ae5b3}.cap-return{border:1px solid #665b2b;background:#332f18;color:#f0d985}.cap-reject{border:1px solid #7b363a;background:#391c1e;color:#ffaaaa}.cap-empty{padding:18px;border:1px dashed #3d4247;border-radius:9px;color:#8e979f;text-align:center;font-size:11px}@media(max-width:700px){.cap-head{align-items:flex-start;flex-direction:column}.cap-stats{grid-template-columns:1fr}.cap-row-top{flex-direction:column}}
    `}</style>
    <div className="cap-head"><div><span className="cap-badge">EMP-0001 · CHAIRMAN APPROVAL</span><h2>Expense approval queue</h2></div><p>Office operating expenses remain separate from Eng. Rony personal/salary drawings. Approved personal drawings are recorded as LAND VIEW outflows, not office operating costs.</p></div>
    <div className="cap-stats"><div className="cap-stat"><span>Pending requests</span><strong>{pending.length}</strong></div><div className="cap-stat"><span>Rony personal / salary</span><strong>{personal.length}</strong></div><div className="cap-stat"><span>Pending amount</span><strong>{money(pendingTotal)}</strong></div></div>
    {error && <div className="cap-msg err">{error}</div>}{ok && <div className="cap-msg ok">{ok}</div>}
    <div className="cap-actions-top"><button className="cap-refresh" disabled={loading} onClick={() => void loadQueue()}>{loading ? "Refreshing…" : "Refresh approvals"}</button></div>
    <h3 className="cap-section-title">Eng. Rony personal costs / salary draw</h3>{renderRows(personal, "No Eng. Rony personal/salary drawings are waiting for approval.")}
    <h3 className="cap-section-title">Office costs</h3>{renderRows(office, "No office costs are waiting for approval.")}
  </section>;
}
