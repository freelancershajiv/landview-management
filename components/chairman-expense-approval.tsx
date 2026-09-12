"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type Row = Record<string, unknown>;
const CHAIRMAN_ID = "EMP-0001";
const RONY_SEEDS = [
  { ref: "RONY-SEP-2026-001", date: "2026-09-03", description: "Eng Rony Mobile Recharge", amount: 639 },
  { ref: "RONY-SEP-2026-002", date: "2026-09-03", description: "Nisha Bhabi Piali Dress Buying", amount: 1300 },
  { ref: "RONY-SEP-2026-003", date: "2026-09-05", description: "Send Money to 01408080400", amount: 10020 },
  { ref: "RONY-SEP-2026-004", date: "2026-09-07", description: "Hazari Road Shop Rent", amount: 20000, note: "Eng Rony personal cost / salary draw from LAND VIEW. Source personal ledger also showed BDT 13,000 income; that is not LAND VIEW income." },
  { ref: "RONY-SEP-2026-005", date: "2026-09-07", description: "Fu Teacher Account", amount: 7000 },
  { ref: "RONY-SEP-2026-006", date: "2026-09-09", description: "Nisha Bhabi Send Money", amount: 10704.25 },
  { ref: "RONY-SEP-2026-007", date: "2026-09-09", projectId: "LV-048", description: "LV-048 - Daudpool Bill to Eng Rony Bkash", amount: 20000 },
] as const;

function text(value: unknown) { return String(value ?? "").trim(); }
function pick(row: Row, keys: string[]) {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null && text(row[key])) return row[key];
  return "";
}
function idOf(row: Row) { return text(pick(row, ["Expense_ID", "Expense ID", "ExpenseId"])); }
function refOf(row: Row) { return text(pick(row, ["Reference", "Reference_No", "Reference No"])); }
function statusOf(row: Row) { return text(pick(row, ["Status", "Approval_Status", "Approval Status"])) || "Pending"; }
function isRony(row: Row) {
  return refOf(row).startsWith("RONY-SEP-2026-") || text(pick(row, ["Notes"])).toLowerCase().includes("personal cost / salary draw");
}
function money(value: unknown) {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
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
  const isChairman = employeeId === CHAIRMAN_ID || name.includes("jamal rony");

  async function loadQueue() {
    setLoading(true);
    setError("");
    try {
      let expenses = await landViewApi.getErpRecords("expenses");
      const refs = new Set((expenses || []).map(refOf).filter(Boolean));
      const missing = RONY_SEEDS.filter((seed) => !refs.has(seed.ref));

      for (const seed of missing) {
        await landViewApi.createErpRecord("expenses", {
          Project_ID: "projectId" in seed ? seed.projectId : "",
          Expense_Date: seed.date,
          Category: "Salary / Wages",
          Description: seed.description,
          Amount: seed.amount,
          Reference: seed.ref,
          Status: "Pending",
          Notes: "note" in seed && seed.note ? seed.note : "Eng Rony personal cost / salary draw from LAND VIEW; not an office operating cost.",
        });
      }

      if (missing.length) expenses = await landViewApi.getErpRecords("expenses");
      setRows(expenses || []);
      if (missing.length) setMessage(`${missing.length} Eng. Rony September draw record${missing.length === 1 ? "" : "s"} added to the approval queue.`);
    } catch (e: any) {
      setError(e?.message || "Could not load the live approval queue.");
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
        if (id === CHAIRMAN_ID || n.includes("jamal rony")) void loadQueue();
      })
      .catch(() => setError("Could not verify the employee session."))
      .finally(() => setSessionReady(true));
  }, []);

  const pending = useMemo(() => rows.filter((row) => statusOf(row).toLowerCase() === "pending"), [rows]);
  const personal = useMemo(() => pending.filter(isRony), [pending]);
  const office = useMemo(() => pending.filter((row) => !isRony(row)), [pending]);
  const pendingTotal = pending.reduce((sum, row) => {
    const n = Number(String(pick(row, ["Amount", "Expense_Amount", "Expense Amount"]) || 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  async function decide(row: Row, status: "Approved" | "Rejected") {
    const id = idOf(row);
    if (!id) return;
    setBusy(id); setError(""); setMessage("");
    try {
      await landViewApi.updateErpRecord("expenses", id, {
        Status: status,
        Review_Notes: text(notes[id]) || `${status} by Chairman Eng Jamal Rony`,
      });
      setRows((current) => current.map((item) => idOf(item) === id ? { ...item, Status: status, Reviewed_By: CHAIRMAN_ID, Reviewed_At: new Date().toISOString() } : item));
      setMessage(`${id} ${status.toLowerCase()} successfully.`);
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
      const date = text(pick(row, ["Expense_Date", "Expense Date", "Date"]));
      const description = text(pick(row, ["Description", "Particulars", "Expense"])) || "Expense";
      const category = text(pick(row, ["Category", "Expense_Category", "Expense Category"]));
      const project = text(pick(row, ["Project_ID", "Project ID", "File_ID", "File ID"]));
      return <article className="cap-row" key={id}>
        <div className="cap-row-top"><div><strong>{description}</strong><div className="cap-meta">{id}{date ? ` · ${date}` : ""}{category ? ` · ${category}` : ""}{project ? ` · ${project}` : ""}</div></div><div className="cap-amount">{money(pick(row, ["Amount", "Expense_Amount", "Expense Amount"]))}</div></div>
        <input className="cap-note" value={notes[id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [id]: event.target.value }))} placeholder="Optional Chairman review note" />
        <div className="cap-decisions"><button className="cap-approve" disabled={busy === id} onClick={() => void decide(row, "Approved")}>Approve</button><button className="cap-reject" disabled={busy === id} onClick={() => void decide(row, "Rejected")}>Reject</button></div>
      </article>;
    })}
    {!loading && !items.length && <div className="cap-empty">{empty}</div>}
  </div>;

  return <section className="chairman-approval" id="chairman-expense-approvals">
    <style>{`
      .chairman-approval{margin-top:22px;padding:20px;border:1px solid #573033;border-radius:12px;background:linear-gradient(180deg,#221416,#17191d);color:#f7f7f7}.chairman-approval *{box-sizing:border-box}.cap-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end}.cap-head h2{margin:4px 0 0;font-size:24px}.cap-head p{max-width:650px;margin:0;color:#b3a8aa;font-size:11px;line-height:1.55}.cap-badge{display:inline-flex;padding:6px 9px;border-radius:999px;background:#4b181c;color:#ffaaa5;font-size:9px;font-weight:900;letter-spacing:.08em}.cap-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0}.cap-stat{padding:13px;border:1px solid #3d3335;border-radius:9px;background:#14171b}.cap-stat span{display:block;color:#8f8587;font-size:9px;text-transform:uppercase}.cap-stat strong{display:block;margin-top:6px;font-size:22px}.cap-section-title{margin:22px 0 9px;font-size:12px;color:#ffaaa5;text-transform:uppercase;letter-spacing:.08em}.cap-actions-top{display:flex;justify-content:flex-end;margin:0 0 10px}.cap-refresh{border:1px solid #4b4f55;border-radius:7px;background:#20252b;color:#eee;padding:8px 10px;font-size:10px;cursor:pointer}.cap-msg{margin:10px 0;padding:10px 12px;border-radius:8px;font-size:10px}.cap-msg.err{background:#421f22;color:#ffaaaa}.cap-msg.ok{background:#173823;color:#a7e9b9}.cap-list{display:grid;gap:10px}.cap-row{padding:14px;border:1px solid #34393f;border-radius:10px;background:#11151a}.cap-row-top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.cap-row strong{display:block;font-size:13px}.cap-meta{margin-top:5px;color:#8f989f;font-size:10px;line-height:1.5}.cap-amount{font-size:17px;font-weight:900;color:#fff;white-space:nowrap}.cap-note{width:100%;margin-top:11px;border:1px solid #3d434a;border-radius:7px;background:#0d1115;color:#eee;padding:9px 10px;font-size:10px}.cap-decisions{display:flex;gap:8px;margin-top:9px}.cap-decisions button{border-radius:7px;padding:8px 12px;font-size:10px;font-weight:800;cursor:pointer}.cap-approve{border:1px solid #2b714a;background:#183724;color:#9ae5b3}.cap-reject{border:1px solid #7b363a;background:#391c1e;color:#ffaaaa}.cap-empty{padding:18px;border:1px dashed #3d4247;border-radius:9px;color:#8e979f;text-align:center;font-size:11px}@media(max-width:700px){.cap-head{align-items:flex-start;flex-direction:column}.cap-stats{grid-template-columns:1fr}.cap-row-top{flex-direction:column}}
    `}</style>
    <div className="cap-head"><div><span className="cap-badge">EMP-0001 · CHAIRMAN APPROVAL</span><h2>Expense approval queue</h2></div><p>Pending office expenses and Eng. Rony personal/salary drawings are loaded from the live expense database. This panel does not depend on a separate chairman Apps Script endpoint.</p></div>
    <div className="cap-stats"><div className="cap-stat"><span>Pending requests</span><strong>{pending.length}</strong></div><div className="cap-stat"><span>Rony personal / salary</span><strong>{personal.length}</strong></div><div className="cap-stat"><span>Pending amount</span><strong>{money(pendingTotal)}</strong></div></div>
    {error && <div className="cap-msg err">{error}</div>}{message && <div className="cap-msg ok">{message}</div>}
    <div className="cap-actions-top"><button className="cap-refresh" disabled={loading} onClick={() => void loadQueue()}>{loading ? "Refreshing…" : "Refresh approvals"}</button></div>
    <h3 className="cap-section-title">Eng. Rony personal costs / salary draw</h3>{render(personal, "No Eng. Rony personal/salary drawings are waiting for approval.")}
    <h3 className="cap-section-title">Office costs</h3>{render(office, "No office costs are waiting for approval.")}
  </section>;
}
