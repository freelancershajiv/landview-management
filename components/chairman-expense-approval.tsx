"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ApprovalRow = {
  Approval_Key?: string;
  Source?: string;
  Source_ID?: string;
  Transaction_Type?: string;
  Transaction_Date?: string;
  Project_ID?: string;
  Description?: string;
  Amount?: number | string;
  Category?: string;
  Approval_Status?: string;
  Notes?: string;
  Reviewed_By?: string;
  Reviewed_At?: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function amount(value: unknown) {
  const number = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(amount(value));
}

function displayDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "—";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

async function loadApprovals() {
  const url = new URL("/api/landview", window.location.origin);
  url.searchParams.set("action", "getChairmanPendingApprovals");
  const response = await fetch(url.toString(), { credentials: "same-origin", cache: "no-store" });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Could not load finance acknowledgements."));
  return (Array.isArray(json.data) ? json.data : []) as ApprovalRow[];
}

async function markSeen(row: ApprovalRow) {
  const response = await fetch("/api/landview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      action: "reviewChairmanPendingApproval",
      approvalKey: row.Approval_Key || `payment:${text(row.Source_ID)}`,
      source: "Payments",
      id: row.Source_ID,
      status: "Approved",
      acknowledgeOnly: true,
      note: "Seen by EMP-0001 — Master Admin payment acknowledgement.",
    }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Could not mark this payment as seen."));
}

export default function ChairmanExpenseApproval() {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await loadApprovals());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load finance acknowledgements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const unseen = useMemo(() => rows
    .filter((row) => text(row.Source).toLowerCase() === "payments")
    .filter((row) => text(row.Approval_Status).toLowerCase() === "approved")
    .filter((row) => {
      const reviewer = text(row.Reviewed_By).toUpperCase();
      return Boolean(reviewer) && reviewer !== "EMP-0001";
    })
    .sort((a, b) => text(b.Transaction_Date).localeCompare(text(a.Transaction_Date)) || text(b.Source_ID).localeCompare(text(a.Source_ID))), [rows]);

  async function acknowledge(row: ApprovalRow) {
    const id = text(row.Source_ID);
    if (!id || busy) return;
    setBusy(id);
    setError("");
    try {
      await markSeen(row);
      setRows((current) => current.map((item) => text(item.Source_ID) === id ? { ...item, Reviewed_By: "EMP-0001", Reviewed_At: new Date().toISOString() } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark this payment as seen.");
    } finally {
      setBusy("");
    }
  }

  if (!loading && !error && unseen.length === 0) return null;

  return <section className="lv-ack" aria-label="Master Admin payment acknowledgements">
    <style>{`
      .lv-ack{margin:0 0 18px;border:1px solid #39434c;border-radius:14px;background:#10171d;color:#eef3f6;overflow:hidden;box-shadow:0 16px 42px rgba(0,0,0,.18)}
      .lv-ack *{box-sizing:border-box}.lv-ack-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid #303a43;background:linear-gradient(110deg,#121b22,#181315)}
      .lv-ack-kicker{display:block;color:#ff8179;font-size:10px;font-weight:900;letter-spacing:.13em;margin-bottom:3px}.lv-ack h2{margin:0;font-size:18px}.lv-ack-head p{margin:4px 0 0;color:#aab5bd;font-size:11px;line-height:1.45}
      .lv-ack-count{min-width:34px;height:34px;display:grid;place-items:center;border-radius:999px;background:#d94b45;color:#fff;font-weight:900}
      .lv-ack-body{padding:10px}.lv-ack-row{display:grid;grid-template-columns:105px 95px minmax(170px,1fr) 125px 115px;gap:10px;align-items:center;padding:11px 10px;border-bottom:1px solid #29333b}.lv-ack-row:last-child{border-bottom:0}
      .lv-ack-cell small{display:block;color:#8f9ba4;font-size:9px;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px}.lv-ack-cell strong{display:block;color:#f5f8fa;font-size:12px}.lv-ack-amount strong{font-size:14px}.lv-ack-meta{color:#aeb9c1;font-size:10px;margin-top:2px}
      .lv-ack-btn{border:1px solid #486152;background:#183124;color:#b9e8c7;border-radius:8px;padding:9px 12px;font-weight:900;cursor:pointer}.lv-ack-btn:hover{background:#21402f}.lv-ack-btn:disabled{opacity:.55;cursor:wait}
      .lv-ack-msg{padding:13px 16px;color:#aab5bd}.lv-ack-error{margin:10px;border:1px solid #713d38;background:#321f1d;color:#ffb2ac;border-radius:8px;padding:10px 12px;font-size:11px}.lv-ack-refresh{border:1px solid #3b4650;background:#151e25;color:#e9eef1;border-radius:8px;padding:8px 11px;font-weight:800;cursor:pointer}
      @media(max-width:850px){.lv-ack-row{grid-template-columns:1fr 1fr}.lv-ack-cell.details{grid-column:1/-1}.lv-ack-btn{width:100%}}
    `}</style>
    <header className="lv-ack-head">
      <div><span className="lv-ack-kicker">EMP-0001 / FINANCE REVIEW</span><h2>Master Admin payments awaiting acknowledgement</h2><p>These payments are already approved and posted to Billing and the ledger. “Mark Seen” is acknowledgement only and does not change the financial amount or approver.</p></div>
      <div style={{display:"flex",alignItems:"center",gap:8}}><button className="lv-ack-refresh" type="button" onClick={() => void load()} disabled={loading}>Refresh</button><span className="lv-ack-count">{unseen.length}</span></div>
    </header>
    {error && <div className="lv-ack-error">{error}</div>}
    {loading ? <div className="lv-ack-msg">Loading finance acknowledgements…</div> : unseen.length === 0 ? <div className="lv-ack-msg">No unseen Master Admin payments.</div> : <div className="lv-ack-body">
      {unseen.map((row) => <div className="lv-ack-row" key={text(row.Approval_Key) || text(row.Source_ID)}>
        <div className="lv-ack-cell"><small>Date</small><strong>{displayDate(row.Transaction_Date)}</strong></div>
        <div className="lv-ack-cell"><small>Project</small><strong>{text(row.Project_ID) || "—"}</strong></div>
        <div className="lv-ack-cell details"><small>Payment</small><strong>{text(row.Category || row.Description) || "Client payment"}</strong><div className="lv-ack-meta">{text(row.Source_ID)} · entered/approved by {text(row.Reviewed_By) || "Master Admin"}</div></div>
        <div className="lv-ack-cell lv-ack-amount"><small>Amount</small><strong>{money(row.Amount)}</strong></div>
        <button className="lv-ack-btn" type="button" disabled={busy === text(row.Source_ID)} onClick={() => void acknowledge(row)}>{busy === text(row.Source_ID) ? "Saving…" : "Mark Seen"}</button>
      </div>)}
    </div>}
  </section>;
}
