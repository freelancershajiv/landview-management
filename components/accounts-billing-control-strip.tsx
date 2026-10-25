"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = Record<string, any>;
function money(value: unknown) { return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number(value || 0)); }

export default function AccountsBillingControlStrip() {
  const [summary, setSummary] = useState<Row | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/billing/control", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => { const json = await response.json().catch(() => null); if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load Billing 2.0 summary.")); return json.data?.summary || {}; })
      .then((data) => { if (active) setSummary(data); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Could not load Billing 2.0 summary."); });
    return () => { active = false; };
  }, []);
  if (!summary && !error) return <div className="ab2-loading">Loading Billing 2.0 commercial position…<style>{`.ab2-loading{margin-bottom:12px;padding:10px 12px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-panel);color:var(--lv-text-muted);font-size:9px}`}</style></div>;
  if (error) return <div className="ab2-error">Billing 2.0 summary unavailable: {error}<style>{`.ab2-error{margin-bottom:12px;padding:10px 12px;border:1px solid var(--lv-danger);border-radius:9px;background:var(--lv-danger-soft);color:var(--lv-danger);font-size:9px}`}</style></div>;
  return <section className="ab2"><style>{`
    .ab2{margin-bottom:13px;padding:11px;border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);color:var(--lv-text-primary)}.ab2-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:9px}.ab2-head div small{display:block;color:var(--lv-brand-text);font-size:7px;font-weight:950;letter-spacing:.12em}.ab2-head div strong{display:block;margin-top:3px;font-size:12px}.ab2-links{display:flex;gap:6px}.ab2-links a{min-height:30px;padding:0 8px;display:inline-flex;align-items:center;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px;font-weight:900;text-decoration:none}.ab2-links a.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.ab2-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.ab2-card{padding:9px 10px;border:1px solid var(--lv-border-subtle);border-radius:8px;background:var(--lv-surface-muted)}.ab2-card span{display:block;color:var(--lv-text-muted);font-size:6px;text-transform:uppercase;font-weight:950}.ab2-card b{display:block;margin-top:5px;font-size:12px}.ab2-card.due b{color:var(--lv-danger)}.ab2-card.ready b{color:var(--lv-brand-text)}.ab2-card.paid b{color:var(--lv-success)}@media(max-width:1050px){.ab2-grid{grid-template-columns:repeat(4,1fr)}}@media(max-width:650px){.ab2-head{align-items:flex-start;flex-direction:column}.ab2-links{width:100%}.ab2-links a{flex:1;justify-content:center}.ab2-grid{grid-template-columns:repeat(2,1fr)}}
  `}</style><div className="ab2-head"><div><small>BILLING 2.0 / COMMERCIAL POSITION</small><strong>Contracts, receivables and workflow billing</strong></div><div className="ab2-links"><Link href="/admin/finance/billing-control">Billing Controls</Link><Link className="primary" href="/admin/finance/workspace">Ready to Bill</Link></div></div><div className="ab2-grid"><div className="ab2-card"><span>Contract Value</span><b>{money(summary.contractValue)}</b></div><div className="ab2-card"><span>Billed</span><b>{money(summary.billed)}</b></div><div className="ab2-card paid"><span>Collected</span><b>{money(summary.paid)}</b></div><div className="ab2-card due"><span>Current Due</span><b>{money(summary.due)}</b></div><div className="ab2-card"><span>Future Revenue</span><b>{money(summary.futureRevenue)}</b></div><div className="ab2-card ready"><span>Ready to Bill</span><b>{money(summary.readyToBill)}</b></div><div className="ab2-card"><span>Financially Open</span><b>{Number(summary.financiallyOpen || 0)}</b></div></div></section>;
}
