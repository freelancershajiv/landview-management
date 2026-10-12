"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Snapshot = {
  projectCode: string;
  projectName: string;
  fundsReceived: number;
  cashExpenses: number;
  supplierAdvancesPaid: number;
  supplierAdvanceOutstanding: number;
  chequeOnHold: number;
  cashInHand: number;
  ledgerCashInHand: number;
  entries: number;
};

const num = (value: unknown) => {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const money = (value: number) => new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 2,
}).format(value || 0);

function projectIdFromLocation() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("projectId") || "";
}

function buildSnapshot(data: any): Snapshot {
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const fundsReceived = entries.reduce((sum: number, row: any) => sum + num(row.debit), 0);
  const cashExpenses = entries.reduce((sum: number, row: any) => sum + num(row.credit), 0);
  const supplierAdvancesPaid = entries.reduce((sum: number, row: any) => sum + num(row.supplier_allocation), 0);
  const chequeOnHold = entries.reduce((sum: number, row: any) => sum + num(row.cheque_on_hold), 0);
  const cashInHand = Math.round((fundsReceived - cashExpenses - supplierAdvancesPaid - chequeOnHold) * 100) / 100;
  const chronological = entries.slice().sort((a: any, b: any) => {
    const date = String(a.entry_date || "").localeCompare(String(b.entry_date || ""));
    if (date) return date;
    const created = String(a.created_at || "").localeCompare(String(b.created_at || ""));
    if (created) return created;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  const last = chronological[chronological.length - 1];

  return {
    projectCode: String(data?.selectedProject?.projectCode || ""),
    projectName: String(data?.selectedProject?.projectName || ""),
    fundsReceived,
    cashExpenses,
    supplierAdvancesPaid,
    supplierAdvanceOutstanding: num(data?.summary?.supplierAdvance),
    chequeOnHold,
    cashInHand,
    ledgerCashInHand: last ? num(last.available_cash_balance) : 0,
    entries: entries.length,
  };
}

export default function ProjectFinanceSummaryV2() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    let currentProject = "";
    let legacySummary: HTMLElement | null = null;
    let portalHost: HTMLDivElement | null = null;
    let observer: MutationObserver | null = null;
    let refreshTimer = 0;

    const ensureMount = () => {
      if (disposed || portalHost?.isConnected) return;
      legacySummary = document.querySelector<HTMLElement>(".pm-finance-summary");
      if (!legacySummary) return;
      legacySummary.style.display = "none";
      portalHost = document.createElement("div");
      portalHost.className = "pf-summary-v2-host";
      legacySummary.parentElement?.insertBefore(portalHost, legacySummary);
      setMount(portalHost);
    };

    const load = async (forcedProject = "") => {
      const projectId = forcedProject || projectIdFromLocation();
      const requestKey = projectId || "__default__";
      if (requestKey === currentProject && snapshot) return;
      currentProject = requestKey;
      setLoading(true);
      setError("");
      try {
        const url = projectId
          ? `/api/project-management?projectId=${encodeURIComponent(projectId)}`
          : "/api/project-management";
        const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Could not load project finance.");
        if (!disposed) setSnapshot(buildSnapshot(payload.data));
      } catch (err: any) {
        if (!disposed) setError(err?.message || "Could not load project finance.");
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    const scheduleRefresh = (projectId = "") => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        currentProject = "";
        void load(projectId);
      }, 80);
    };

    const onChange = (event: Event) => {
      const select = (event.target as HTMLElement | null)?.closest<HTMLSelectElement>(".pm-project-select select");
      if (select) scheduleRefresh(select.value);
    };

    const onClick = (event: MouseEvent) => {
      const choice = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(".pm-project-option");
      if (!choice) return;
      const code = String(choice.querySelector(".pm-option-code")?.textContent || "").trim();
      if (code) scheduleRefresh(code);
    };

    ensureMount();
    void load();
    document.addEventListener("change", onChange, true);
    document.addEventListener("click", onClick, true);
    observer = new MutationObserver(() => ensureMount());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      window.clearTimeout(refreshTimer);
      observer?.disconnect();
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("click", onClick, true);
      if (legacySummary) legacySummary.style.display = "";
      portalHost?.remove();
    };
  }, []);

  const reconciled = useMemo(() => {
    if (!snapshot) return true;
    return Math.abs(snapshot.cashInHand - snapshot.ledgerCashInHand) <= 0.01;
  }, [snapshot]);

  if (!mount) return null;

  return createPortal(
    <section className="pf-summary-v2" aria-label="Project finance summary">
      <div className="pf-summary-v2-head">
        <div>
          <span className="pf-summary-v2-kicker">PROJECT CASH POSITION</span>
          <h2>Finance Snapshot</h2>
          <p>One accounting model: funds received − cash expenses − supplier advances − uncleared cheques = cash in hand.</p>
        </div>
        <div className={`pf-summary-v2-status ${reconciled ? "is-balanced" : "is-warning"}`}>
          <span>{reconciled ? "RECONCILED" : "CHECK REQUIRED"}</span>
          <strong>{snapshot?.projectCode || "—"}</strong>
        </div>
      </div>

      {error ? <div className="pf-summary-v2-error">{error}</div> : null}

      <div className="pf-summary-v2-grid" aria-busy={loading}>
        <article>
          <span>Total Funds Received</span>
          <strong>{snapshot ? money(snapshot.fundsReceived) : "—"}</strong>
          <small>All project money received</small>
        </article>
        <article>
          <span>Cash Expenses Paid</span>
          <strong>{snapshot ? money(snapshot.cashExpenses) : "—"}</strong>
          <small>Actual expenses paid from project funds</small>
        </article>
        <article>
          <span>Supplier Advances Paid</span>
          <strong>{snapshot ? money(snapshot.supplierAdvancesPaid) : "—"}</strong>
          <small>Cash already transferred to suppliers</small>
        </article>
        <article>
          <span>Supplier Advance Remaining</span>
          <strong>{snapshot ? money(snapshot.supplierAdvanceOutstanding) : "—"}</strong>
          <small>Advance not yet converted into delivered material</small>
        </article>
        <article>
          <span>Cheque on Hold</span>
          <strong>{snapshot ? money(snapshot.chequeOnHold) : "—"}</strong>
          <small>Recorded funds not yet available as cash</small>
        </article>
        <article className="is-primary">
          <span>Eng Shajiv · Cash in Hand</span>
          <strong>{snapshot ? money(snapshot.cashInHand) : "—"}</strong>
          <small>{snapshot ? `${snapshot.entries.toLocaleString("en-BD")} ledger entries · ${reconciled ? "matches running cash balance" : `ledger shows ${money(snapshot.ledgerCashInHand)}`}` : "Loading finance position…"}</small>
        </article>
      </div>

      <div className="pf-summary-v2-equation">
        <span>Funds Received</span><b>−</b><span>Cash Expenses</span><b>−</b><span>Supplier Advances</span><b>−</b><span>Cheque Hold</span><b>=</b><strong>Cash in Hand</strong>
      </div>
    </section>,
    mount,
  );
}
