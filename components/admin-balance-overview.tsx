"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type BalanceData = {
  currentBalance?: number;
  municipalityBalance?: number;
  mainEntries?: number;
  municipalityEntries?: number;
  generatedAt?: string;
};

function money(value: unknown) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export default function AdminBalanceOverview() {
  const [data, setData] = useState<BalanceData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin-balance-overview", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load balances."));
      setData(json.data || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load balances.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const current = Number(data?.currentBalance ?? 0);
  const municipality = Number(data?.municipalityBalance ?? 0);

  return (
    <section className="lv-balance-overview" aria-label="Account balance overview">
      <style>{`
        .lv-balance-overview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 14px}.lv-balance-card{position:relative;display:block;min-height:112px;padding:16px 18px;border:1px solid var(--theme-line-_2e3942,#2e3942);border-radius:13px;background:linear-gradient(145deg,var(--theme-bg-_151c22,#151c22),var(--theme-bg-_0e1419,#0e1419));overflow:hidden;text-decoration:none}.lv-balance-card:before{content:"";position:absolute;left:0;top:0;width:54px;height:3px;background:#d61f26}.lv-balance-card.municipality:before{background:#4c78a8}.lv-balance-card:hover{border-color:var(--theme-line-_4b5661,#4b5661)}.lv-balance-card small{display:block;color:#89959f;font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.lv-balance-card strong{display:block;margin-top:9px;color:#fff;font-size:27px;line-height:1}.lv-balance-card strong.negative{color:#ff7176}.lv-balance-card p{margin:8px 0 0;color:#74818b;font-size:9px;line-height:1.4}.lv-balance-card span{position:absolute;right:16px;top:16px;color:#6f7b85;font-size:9px;font-weight:800}.lv-balance-error{grid-column:1/-1;padding:10px 12px;border:1px solid rgba(226,31,39,.35);border-radius:9px;background:rgba(226,31,39,.08);color:#ff8a8f;font-size:10px}.lv-balance-loading{grid-column:1/-1;padding:13px;border:1px solid var(--theme-line-_2e3942,#2e3942);border-radius:10px;color:#85919b;font-size:10px;background:var(--theme-bg-_10161c,#10161c)}@media(max-width:680px){.lv-balance-overview{grid-template-columns:1fr}.lv-balance-card{min-height:100px}.lv-balance-card strong{font-size:23px}}
      `}</style>

      {loading && !data ? <div className="lv-balance-loading">Loading live account balances…</div> : null}
      {error ? <div className="lv-balance-error">{error}</div> : null}

      {data ? <>
        <Link href="/admin/accounts" className="lv-balance-card">
          <small>Current Balance</small>
          <strong className={current < 0 ? "negative" : ""}>{money(current)}</strong>
          <p>Main Accounts Ledger live closing balance · {data.mainEntries ?? 0} included ledger entries</p>
          <span>MAIN ACCOUNTS →</span>
        </Link>
        <Link href="/admin/municipality-accounts" className="lv-balance-card municipality">
          <small>Municipality Balance</small>
          <strong className={municipality < 0 ? "negative" : ""}>{money(municipality)}</strong>
          <p>Municipality credits less expenses and transferred balances · {data.municipalityEntries ?? 0} entries</p>
          <span>MUNICIPALITY →</span>
        </Link>
      </> : null}
    </section>
  );
}
