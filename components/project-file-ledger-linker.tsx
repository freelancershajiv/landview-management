"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LedgerCandidate = {
  id: string;
  transactionCode: string;
  date: string;
  amount: number;
  projectCode: string;
  category: string;
  description: string;
  reference: string;
  account?: string;
  paymentMethod?: string;
  sourceType: string;
  status: string;
};

type Props = {
  projectCode: string;
  onLinked?: () => void | Promise<void>;
};

function money(value: number) {
  return `BDT ${Number(value || 0).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function inferBillingCategory(row: LedgerCandidate) {
  const text = `${row.category || ""} ${row.description || ""}`.toLowerCase();
  if (text.includes("supervision")) return "Supervision Bill";
  if (/(other|municipality|fire service|land noc|soil|survey|submission|vetting|consultancy|file pass)/i.test(text)) return "Other Services Bill";
  return "Engineering Bill";
}

export default function ProjectFileLedgerLinker({ projectCode, onLinked }: Props) {
  const [rows, setRows] = useState<LedgerCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState<Record<string, boolean>>({});
  const [linkingAll, setLinkingAll] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!projectCode) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ mode: "project", projectCode });
      const response = await fetch(`/api/projects/legacy-ledger?${params.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load File ID ledger income."));
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load File ID ledger income.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [projectCode]);

  useEffect(() => { void load(); }, [load]);

  const total = useMemo(() => rows.reduce((sum, row) => sum + Number(row.amount || 0), 0), [rows]);

  async function linkCandidate(row: LedgerCandidate, quiet = false) {
    setLinking((current) => ({ ...current, [row.id]: true }));
    if (!quiet) { setError(""); setMessage(""); }
    try {
      const billingCategory = inferBillingCategory(row);
      const response = await fetch(`/api/projects/${encodeURIComponent(projectCode)}/finance-editor`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "savePayment",
          payment_date: row.date,
          amount: row.amount,
          payment_method: row.paymentMethod || "Other",
          reference_no: row.reference || "",
          deposit_account: row.account || "",
          payment_for: row.description || row.category || "Historical ledger payment",
          income_category: billingCategory,
          received_from: "",
          received_by: "",
          notes: row.description || "Linked from existing Accounts Ledger entry.",
          ledger_transaction_code: row.transactionCode,
          finance_scope: "main",
          service_type: row.category || row.description || "",
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || `Could not link ${row.transactionCode}.`));
      setRows((current) => current.filter((item) => item.id !== row.id));
      if (!quiet) setMessage(`${row.transactionCode} linked as a verified historical payment.`);
      await onLinked?.();
      return true;
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : `Could not link ${row.transactionCode}.`);
      return false;
    } finally {
      setLinking((current) => ({ ...current, [row.id]: false }));
    }
  }

  async function linkAll() {
    if (!rows.length || linkingAll) return;
    setLinkingAll(true);
    setError("");
    setMessage("");
    const snapshot = [...rows];
    let linked = 0;
    let failed = 0;
    for (const row of snapshot) {
      const ok = await linkCandidate(row, true);
      if (ok) linked += 1;
      else failed += 1;
    }
    await load();
    setMessage(`${linked} ledger income entr${linked === 1 ? "y" : "ies"} linked${failed ? ` · ${failed} need review` : ""}.`);
    if (failed) setError(`${failed} entr${failed === 1 ? "y could" : "ies could"} not be linked automatically. They remain available for manual review.`);
    setLinkingAll(false);
  }

  return <section className="pfl-wrap">
    <style>{styles}</style>
    <div className="pfl-head">
      <div>
        <b>File ID ledger income</b>
        <span>Unused Accounts Ledger Income entries already tagged with <strong>{projectCode}</strong> are loaded automatically. Link them to this project&apos;s payment history without posting income twice.</span>
      </div>
      <div className="pfl-head-actions">
        <button type="button" onClick={() => void load()} disabled={loading || linkingAll}>{loading ? "Loading…" : "Refresh"}</button>
        <button type="button" className="primary" onClick={() => void linkAll()} disabled={loading || linkingAll || rows.length === 0}>{linkingAll ? "Linking…" : `Link All (${rows.length})`}</button>
      </div>
    </div>

    <div className="pfl-summary">
      <span><small>FILE ID</small><b>{projectCode}</b></span>
      <span><small>UNLINKED INCOME</small><b>{rows.length}</b></span>
      <span><small>TOTAL AVAILABLE</small><b>{money(total)}</b></span>
    </div>

    {error && <div className="pfl-msg error">{error}</div>}
    {message && <div className="pfl-msg ok">{message}</div>}

    {!loading && rows.length === 0 ? <div className="pfl-empty">No unused Income ledger entries remain for {projectCode}. Existing linked payments are excluded automatically.</div> : null}

    {!!rows.length && <div className="pfl-list">
      {rows.map((row) => <article className="pfl-row" key={row.id}>
        <div className="pfl-main">
          <div className="pfl-id"><b>{row.transactionCode}</b><span>{row.date || "No date"} · {money(row.amount)}</span></div>
          <div className="pfl-detail"><b>{row.description || row.category || "Income"}</b><span>{[row.category, row.account, row.paymentMethod, row.reference].filter(Boolean).join(" · ") || row.sourceType}</span></div>
        </div>
        <div className="pfl-action">
          <span>{inferBillingCategory(row)}</span>
          <button type="button" className="primary" disabled={linking[row.id] || linkingAll} onClick={() => void linkCandidate(row)}>{linking[row.id] ? "Linking…" : "Link as Payment"}</button>
        </div>
      </article>)}
    </div>}
  </section>;
}

const styles = `
.pfl-wrap{margin-bottom:12px;border:1px solid rgba(214,31,38,.26);border-radius:11px;background:#0d161e;color:#eaf0f3;overflow:hidden}.pfl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(214,31,38,.045)}.pfl-head b{display:block;color:#fff;font-size:12px}.pfl-head span{display:block;margin-top:4px;color:#83909a;font-size:9px;line-height:1.55}.pfl-head span strong{display:inline;color:#ff8b84}.pfl-head-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.pfl-head button,.pfl-action button{border:1px solid rgba(255,255,255,.13);border-radius:7px;background:#18242e;color:#edf2f5;padding:8px 10px;font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap}.pfl-head button.primary,.pfl-action button.primary{background:#d61f26;border-color:#d61f26;color:#fff}.pfl-head button:disabled,.pfl-action button:disabled{opacity:.45;cursor:not-allowed}.pfl-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:10px 12px}.pfl-summary span{padding:9px 10px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:#111c25}.pfl-summary small{display:block;color:#74828d;font-size:7px;font-weight:900;letter-spacing:.08em}.pfl-summary b{display:block;margin-top:5px;color:#fff;font-size:10px}.pfl-list{border-top:1px solid rgba(255,255,255,.07)}.pfl-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border-bottom:1px solid rgba(255,255,255,.065)}.pfl-row:last-child{border-bottom:0}.pfl-main{display:grid;grid-template-columns:minmax(150px,.8fr) minmax(230px,2fr);gap:14px;min-width:0;flex:1}.pfl-id b,.pfl-detail b{display:block;color:#eef2f5;font-size:9px}.pfl-id span,.pfl-detail span{display:block;margin-top:4px;color:#778590;font-size:8px;line-height:1.45;overflow-wrap:anywhere}.pfl-action{display:flex;align-items:center;gap:8px;flex-shrink:0}.pfl-action>span{padding:4px 6px;border-radius:999px;background:rgba(255,255,255,.065);color:#9ba7af;font-size:7px;font-weight:900;white-space:nowrap}.pfl-empty{padding:14px;text-align:center;color:#788691;font-size:9px;border-top:1px solid rgba(255,255,255,.06)}.pfl-msg{margin:0 12px 10px;padding:9px 10px;border-radius:7px;font-size:9px}.pfl-msg.ok{border:1px solid rgba(55,177,105,.3);background:rgba(55,177,105,.07);color:#9eddb6}.pfl-msg.error{border:1px solid rgba(214,31,38,.32);background:rgba(214,31,38,.07);color:#ff9b95}@media(max-width:800px){.pfl-head,.pfl-row{flex-direction:column;align-items:stretch}.pfl-head-actions,.pfl-action{justify-content:flex-start}.pfl-main{grid-template-columns:1fr}.pfl-summary{grid-template-columns:1fr}.pfl-action{flex-wrap:wrap}}
`;
