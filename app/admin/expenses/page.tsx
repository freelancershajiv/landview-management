"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type Row = Record<string, any>;

const accountingUrl = "https://docs.google.com/spreadsheets/d/1E1hCMKn3fGl7LUov1FS60IJNVnZTJUlf6CCO4pFMQw4/edit";
const APPROVER_CODE = "EMP-0001";

function t(value: any) {
  return String(value ?? "").trim();
}

function money(value: any) {
  const number = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(number) ? `৳${number.toLocaleString("en-BD")}` : "৳0";
}

function approvalStatus(row: Row) {
  return t(row.Approval_Status || row.approval_status || row.Status || row.status) || "Pending";
}

function currentActorCode(session: any) {
  return t(
    session?.user?.employeeCode ||
      session?.user?.Employee_Code ||
      session?.user?.employeeId ||
      session?.user?.Employee_ID ||
      session?.user?.userId ||
      session?.user?.User_ID
  ).toUpperCase();
}

export default function ExpensesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [expenses, currentSession] = await Promise.all([
        landViewApi.getErpRecords("expenses"),
        landViewApi.getSession(),
      ]);
      setRows(expenses || []);
      setSession(currentSession);
    } catch (loadError: any) {
      setError(loadError?.message || "Could not load expenses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const actorCode = currentActorCode(session);
  const canApprove = actorCode === APPROVER_CODE;
  const pending = useMemo(() => rows.filter((row) => approvalStatus(row).toLowerCase() === "pending"), [rows]);
  const approved = useMemo(() => rows.filter((row) => approvalStatus(row).toLowerCase() === "approved"), [rows]);
  const totals = {
    pending: pending.reduce((sum, row) => sum + Number(row.Amount || 0), 0),
    approved: approved.reduce((sum, row) => sum + Number(row.Amount || 0), 0),
  };

  async function decide(row: Row, decision: "Approved" | "Rejected") {
    const id = t(row.Expense_ID || row["Expense ID"]);
    if (!id || !canApprove || busy) return;

    let note = "";
    if (decision === "Rejected") {
      const entered = window.prompt("Reason for rejecting this expense:", "");
      if (entered === null) return;
      note = entered.trim();
    }

    setBusy(id);
    setError("");
    try {
      const response = await fetch("/api/expenses/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ expenseId: id, decision, note }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(String(result?.error || "Could not update expense approval."));
      }
      await load();
    } catch (decisionError: any) {
      setError(decisionError?.message || "Could not update expense approval.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="expense-page">
      <style>{`
        .expense-page{color:var(--theme-ink-_eef2f5,#eef2f5)}
        .expense-head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:20px}
        .expense-head h1{margin:5px 0 0;font-size:34px}
        .expense-head p{max-width:700px;color:var(--theme-ink-_95a1ab,#95a1ab);font-size:12px;line-height:1.6}
        .expense-head-actions{display:flex;flex-direction:column;align-items:flex-end;gap:9px}
        .ledger-link{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 12px;border:1px solid var(--theme-line-_52606b,#52606b);border-radius:8px;background:var(--theme-bg-_17222b,#17222b);color:var(--theme-ink-_fff,#fff);text-decoration:none;font-size:10px;font-weight:800;white-space:nowrap}
        .ledger-note{max-width:360px;text-align:right;color:var(--theme-ink-_71808b,#71808b);font-size:9px;line-height:1.45}
        .approval-rule{margin:0 0 18px;padding:12px 14px;border:1px solid var(--theme-line-_33404a,#33404a);border-radius:9px;background:var(--theme-bg-_111a22,#111a22);font-size:11px;line-height:1.5}
        .approval-rule strong{color:var(--theme-ink-_fff,#fff)}
        .expense-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}
        .expense-stat{padding:16px;border:1px solid var(--theme-line-_33404a,#33404a);border-radius:10px;background:var(--theme-bg-_111a22,#111a22)}
        .expense-stat span{display:block;color:var(--theme-ink-_87949e,#87949e);font-size:10px}
        .expense-stat strong{display:block;margin-top:7px;font-size:25px}
        .expense-card{border:1px solid var(--theme-line-_33404a,#33404a);border-radius:11px;background:var(--theme-bg-_101820,#101820);overflow:hidden}
        .expense-row{display:grid;grid-template-columns:120px minmax(220px,1.5fr) 140px 130px 200px;gap:12px;align-items:center;padding:13px 15px;border-bottom:1px solid var(--theme-line-_29343d,#29343d)}
        .expense-row:last-child{border-bottom:0}
        .expense-row.head{background:var(--theme-bg-_17222b,#17222b);color:var(--theme-ink-_84929d,#84929d);font-size:10px;text-transform:uppercase;font-weight:800}
        .expense-row strong,.expense-row small{display:block}
        .expense-row small{margin-top:4px;color:var(--theme-ink-_7f8c96,#7f8c96)}
        .badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:var(--theme-bg-_2d3740,#2d3740);font-size:10px}
        .badge.pending{background:var(--theme-bg-_4b3b1b,#4b3b1b);color:var(--theme-ink-_ffd77d,#ffd77d)}
        .badge.approved{background:var(--theme-bg-_183c2b,#183c2b);color:var(--theme-ink-_8be0ad,#8be0ad)}
        .badge.rejected{background:var(--theme-bg-_452022,#452022);color:var(--theme-ink-_ff9d9d,#ff9d9d)}
        .actions{display:flex;gap:7px}
        .actions button{border:1px solid var(--theme-line-_49545e,#49545e);background:var(--theme-bg-_18232c,#18232c);color:var(--theme-ink-_fff,#fff);border-radius:7px;padding:7px 9px;font-size:10px;cursor:pointer}
        .actions button:disabled{opacity:.55;cursor:not-allowed}
        .actions .approve{border-color:var(--theme-line-_2d6a49,#2d6a49);color:var(--theme-ink-_8ee2ad,#8ee2ad)}
        .actions .reject{border-color:var(--theme-line-_7d373a,#7d373a);color:var(--theme-ink-_ff9e9e,#ff9e9e)}
        .err{padding:11px 13px;margin-bottom:14px;background:var(--theme-bg-_3b1d1e,#3b1d1e);border:1px solid var(--theme-line-_78373a,#78373a);border-radius:8px;color:var(--theme-ink-_ffb0b0,#ffb0b0)}
        @media(max-width:900px){.expense-head{align-items:flex-start;flex-direction:column}.expense-head-actions{align-items:flex-start}.ledger-note{text-align:left}.expense-stats{grid-template-columns:1fr}.expense-card{overflow:auto}.expense-row{min-width:900px}}
      `}</style>

      <div className="expense-head">
        <div>
          <small>OFFICE OPERATIONS</small>
          <h1>Expense approvals</h1>
          <p>Every LAND VIEW expense, including expenses entered by Admin, stays Pending until EMP-0001 approves it.</p>
        </div>
        <div className="expense-head-actions">
          <a className="ledger-link" href={accountingUrl} target="_blank" rel="noopener noreferrer">Open income & expense database ↗</a>
          <span className="ledger-note">Approved expenses are posted only after EMP-0001 makes the decision.</span>
        </div>
      </div>

      <div className="approval-rule">
        <strong>Approval authority: EMP-0001 only.</strong>{" "}
        {canApprove ? "You can approve or reject Pending expenses from this page." : "You can review the records here, but approval controls are reserved for EMP-0001."}
      </div>

      {error && <div className="err">{error}</div>}

      <div className="expense-stats">
        <div className="expense-stat"><span>PENDING EMP-0001 APPROVAL</span><strong>{money(totals.pending)}</strong><small>{pending.length} expense(s)</small></div>
        <div className="expense-stat"><span>APPROVED TOTAL</span><strong>{money(totals.approved)}</strong><small>{approved.length} approved</small></div>
        <div className="expense-stat"><span>RECORDS</span><strong>{rows.length}</strong><small>{canApprove ? "EMP-0001 approval access" : "View-only approval access"}</small></div>
      </div>

      {loading ? (
        <div>Loading expenses…</div>
      ) : (
        <div className="expense-card">
          <div className="expense-row head"><div>Date</div><div>Expense</div><div>Amount</div><div>Status</div><div>Decision</div></div>
          {[...rows].reverse().map((row, index) => {
            const id = t(row.Expense_ID || row["Expense ID"]) || String(index);
            const state = approvalStatus(row);
            const stateKey = state.toLowerCase();
            const decisionBy = t(row.Approved_By || row.Reviewed_By);
            return (
              <div className="expense-row" key={id}>
                <div>{t(row.Expense_Date || row["Expense Date"]) || "—"}</div>
                <div>
                  <strong>{t(row.Description) || t(row.Category) || "Office expense"}</strong>
                  <small>{t(row.Category)}{row.Created_By ? ` · entered by ${t(row.Created_By)}` : ""}{row.Project_ID ? ` · ${t(row.Project_ID)}` : ""}</small>
                </div>
                <div><strong>{money(row.Amount)}</strong><small>{t(row.Payment_Method)}</small></div>
                <div><span className={`badge ${stateKey}`}>{state}</span></div>
                <div>
                  {canApprove && stateKey === "pending" ? (
                    <div className="actions">
                      <button className="approve" disabled={busy === id} onClick={() => void decide(row, "Approved")}>Approve</button>
                      <button className="reject" disabled={busy === id} onClick={() => void decide(row, "Rejected")}>Reject</button>
                    </div>
                  ) : stateKey === "pending" ? (
                    <small>Awaiting EMP-0001</small>
                  ) : (
                    <small>{decisionBy ? `${state} by ${decisionBy}` : state}</small>
                  )}
                </div>
              </div>
            );
          })}
          {!rows.length && <div style={{ padding: 20, color: "var(--theme-ink-_8996a0,#8996a0)" }}>No office expenses recorded yet.</div>}
        </div>
      )}
    </div>
  );
}
