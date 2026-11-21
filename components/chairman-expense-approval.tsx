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
      .lv-ack{margin:0 0 18px;border:1px solid var(--lv-border-default);border-radius:14px;background:var(--lv-surface-panel);color:var(--lv-text-primary);overflow:hidden;box-shadow:var(--lv-shadow-sm)}
      .lv-ack *{box-sizing:border-box}.lv-ack-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}
      .lv-ack-kicker{display:block;color:var(--lv-brand-text);font-size:10px;font-weight:900;letter-spacing:.13em;margin-bottom:3px}.lv-ack h2{margin:0;font-size:18px}.lv-ack-head p{margin:4px 0 0;color:var(--lv-text-secondary);font-size:11px;line-height:1.45}
      .lv-ack-count{min-width:34px;height:34px;display:grid;place-items:center;border-radius:999px;background:var(--lv-brand-primary);color:#fff;font-weight:900}
      .lv-ack-body{padding:10px}.lv-ack-row{display:grid;grid-template-columns:105px 95px minmax(170px,1fr) 125px 115px;gap:10px;align-items:center;padding:11px 10px;border-bottom:1px solid var(--lv-border-soft)}.lv-ack-row:last-child{border-bottom:0}
      .lv-ack-cell small{display:block;color:var(--lv-text-muted);font-size:9px;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px}.lv-ack-cell strong{display:block;color:var(--lv-text-strong);font-size:12px}.lv-ack-amount strong{font-size:14px}.lv-ack-meta{color:var(--lv-text-secondary);font-size:10px;margin-top:2px}
      .lv-ack-btn{border:1px solid var(--lv-success-border);background:var(--lv-success-soft);color:var(--lv-success);border-radius:8px;padding:9px 12px;font-weight:900;cursor:pointer}.lv-ack-btn:hover{background:color-mix(in srgb,var(--lv-success) 14%,var(--lv-surface-panel))}.lv-ack-btn:disabled{opacity:.55;cursor:wait}
      .lv-ack-msg{padding:13px 16px;color:var(--lv-text-secondary)}.lv-ack-error{margin:10px;border:1px solid var(--lv-danger-border);background:var(--lv-danger-soft);color:var(--lv-danger);border-radius:8px;padding:10px 12px;font-size:11px}.lv-ack-refresh{border:1px solid var(--lv-control-border);background:var(--lv-control-bg);color:var(--lv-text-primary);border-radius:8px;padding:8px 11px;font-weight:800;cursor:pointer}
      @media(max-width:850px){.lv-ack-row{grid-template-columns:1fr 1fr}.lv-ack-cell.details{grid-column:1/-1}.lv-ack-btn{width:100%}}
    `}</style>
    <header className="lv-ack-head">
      <div><span className="lv-ack-kicker">EMP-0001 / FINANCE REVIEW</span><h2>Master Admin payments awaiting acknowledgement</h2><p>These payments are already approved and posted to Billing and the ledger. “Mark Seen” is acknowledgement only and does not change the financial amount or approver.</p></div>
      <div style={{display:"flex",alignItems:"center",gap:8}}><button className="lv-ack-refresh" data-lv-button="secondary" type="button" onClick={() => void load()} disabled={loading}>Refresh</button><span className="lv-ack-count">{unseen.length}</span></div>
    </header>
    {error && <div className="lv-ack-error">{error}</div>}
    {loading ? <div className="lv-ack-msg">Loading finance acknowledgements…</div> : unseen.length === 0 ? <div className="lv-ack-msg">No unseen Master Admin payments.</div> : <div className="lv-ack-body">
      {unseen.map((row) => <div className="lv-ack-row" key={text(row.Approval_Key) || text(row.Source_ID)}>
        <div className="lv-ack-cell"><small>Date</small><strong>{displayDate(row.Transaction_Date)}</strong></div>
        <div className="lv-ack-cell"><small>Project</small><strong>{text(row.Project_ID) || "—"}</strong></div>
        <div className="lv-ack-cell details"><small>Payment</small><strong>{text(row.Category || row.Description) || "Client payment"}</strong><div className="lv-ack-meta">{text(row.Source_ID)} · entered/approved by {text(row.Reviewed_By) || "Master Admin"}</div></div>
        <div className="lv-ack-cell lv-ack-amount"><small>Amount</small><strong>{money(row.Amount)}</strong></div>
        <button className="lv-ack-btn" data-lv-button="success" type="button" disabled={busy === text(row.Source_ID)} onClick={() => void acknowledge(row)}>{busy === text(row.Source_ID) ? "Saving…" : "Mark Seen"}</button>
      </div>)}
    </div>}
  </section>;
}
