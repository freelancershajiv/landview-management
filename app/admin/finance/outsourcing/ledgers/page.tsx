"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type Data = {
  parties: Row[];
  jobs: Row[];
  payments: Row[];
};

type LedgerEntry = {
  id: string;
  date: string;
  sort: number;
  type: "Job" | "Payment";
  project: string;
  service: string;
  reference: string;
  debit: number;
  credit: number;
  status: string;
  method: string;
  running: number;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return text(value).toLowerCase();
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return `BDT ${amount.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function activePayment(row: Row) {
  return normalize(row.status) !== "void";
}

export default function OutsourcingVendorLedgersPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedPartyId, setSelectedPartyId] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch("/api/outsourcing", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load vendor ledgers."));
        if (cancelled) return;
        const snapshot = json.data as Data;
        setData(snapshot);
        const first = (snapshot.parties || []).find((row) => row.active !== false) || snapshot.parties?.[0];
        if (first?.id) setSelectedPartyId(String(first.id));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load vendor ledgers.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const parties = data?.parties || [];
  const jobs = data?.jobs || [];
  const payments = data?.payments || [];

  const visibleParties = useMemo(() => {
    const term = normalize(query);
    if (!term) return parties;
    return parties.filter((row) => [row.name, row.party_code, row.party_type, row.phone, row.expertise]
      .map(text).join(" ").toLowerCase().includes(term));
  }, [parties, query]);

  const selectedParty = parties.find((row) => String(row.id) === selectedPartyId) || visibleParties[0] || null;

  const vendorJobs = useMemo(() => {
    if (!selectedParty) return [];
    return jobs.filter((row) => String(row.party_id) === String(selectedParty.id));
  }, [jobs, selectedParty]);

  const vendorJobIds = useMemo(() => new Set(vendorJobs.map((row) => String(row.id))), [vendorJobs]);

  const vendorPayments = useMemo(() => payments.filter((row) => vendorJobIds.has(String(row.job_id))), [payments, vendorJobIds]);

  const totals = useMemo(() => {
    const effectiveJobs = vendorJobs.filter((row) => normalize(row.status) !== "cancelled");
    const agreed = effectiveJobs.reduce((sum, row) => sum + Number(row.agreed_amount || 0), 0);
    const paid = vendorPayments.filter(activePayment).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const due = Math.max(0, agreed - paid);
    const activeJobs = effectiveJobs.filter((row) => normalize(row.status) !== "completed").length;
    return { agreed, paid, due, activeJobs };
  }, [vendorJobs, vendorPayments]);

  const ledgerEntries = useMemo<LedgerEntry[]>(() => {
    const base: Omit<LedgerEntry, "running">[] = [];
    const jobById = new Map(vendorJobs.map((row) => [String(row.id), row]));

    for (const job of vendorJobs) {
      const cancelled = normalize(job.status) === "cancelled";
      base.push({
        id: `job:${job.id}`,
        date: text(job.assigned_date || job.created_at),
        sort: 0,
        type: "Job",
        project: [text(job.project_code), text(job.project_name)].filter(Boolean).join(" — ") || "General",
        service: text(job.service_type) || "Outsourcing",
        reference: text(job.job_code),
        debit: cancelled ? 0 : Number(job.agreed_amount || 0),
        credit: 0,
        status: text(job.status),
        method: "",
      });
    }

    for (const payment of vendorPayments) {
      const job = jobById.get(String(payment.job_id)) || {};
      const isVoid = normalize(payment.status) === "void";
      base.push({
        id: `payment:${payment.id}`,
        date: text(payment.payment_date || payment.created_at),
        sort: 1,
        type: "Payment",
        project: [text(job.project_code || payment.project_code), text(job.project_name)].filter(Boolean).join(" — ") || "General",
        service: text(job.service_type || payment.service_type) || "Outsourcing",
        reference: text(payment.payment_code),
        debit: 0,
        credit: isVoid ? 0 : Number(payment.amount || 0),
        status: text(payment.status),
        method: text(payment.payment_method),
      });
    }

    base.sort((a, b) => {
      const dateOrder = a.date.localeCompare(b.date);
      if (dateOrder) return dateOrder;
      const typeOrder = a.sort - b.sort;
      if (typeOrder) return typeOrder;
      return a.reference.localeCompare(b.reference, undefined, { numeric: true, sensitivity: "base" });
    });

    let running = 0;
    return base.map((entry) => {
      running += entry.debit - entry.credit;
      return { ...entry, running: Math.max(0, running) };
    });
  }, [vendorJobs, vendorPayments]);

  function chooseParty(id: string) {
    setSelectedPartyId(id);
  }

  return (
    <main className="vendor-ledger-page">
      <style>{`
        .vendor-ledger-page{display:grid;gap:14px;padding-bottom:44px;color:var(--lv-text,#dbe3e8)}
        .vl-hero{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:20px;border:1px solid var(--lv-border,#313b44);border-radius:15px;background:linear-gradient(135deg,var(--lv-surface-1,#11181e),var(--lv-surface-2,#151d24))}
        .vl-hero h1{margin:4px 0 6px;font-size:24px;color:var(--lv-text-strong,#fff)}.vl-hero p{margin:0;max-width:720px;color:var(--lv-text-muted,#9da8b0);font-size:10px;line-height:1.6}.vl-kicker{font-size:8px;font-weight:950;letter-spacing:.16em;text-transform:uppercase;color:var(--lv-brand-primary,#d94b45)}
        .vl-back{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 11px;border:1px solid var(--lv-border,#36414a);border-radius:8px;background:var(--lv-surface-2,#151d24);color:var(--lv-text,#dbe3e8);text-decoration:none;font-size:9px;font-weight:900;white-space:nowrap}
        .vl-grid{display:grid;grid-template-columns:minmax(240px,310px) minmax(0,1fr);gap:14px;align-items:start}.vl-sidebar,.vl-main{border:1px solid var(--lv-border,#313b44);border-radius:14px;background:var(--lv-surface-1,#11181e);overflow:hidden}
        .vl-sidebar-head{padding:12px;border-bottom:1px solid var(--lv-border,#313b44);background:var(--lv-surface-2,#151d24)}.vl-search{width:100%;height:36px;padding:0 10px;border:1px solid var(--lv-border,#36414a);border-radius:8px;background:var(--lv-bg,#0d1318);color:var(--lv-text,#dbe3e8);font-size:10px;outline:none}
        .vl-party-list{max-height:72vh;overflow:auto}.vl-party{width:100%;display:grid;gap:4px;padding:12px;border:0;border-bottom:1px solid rgba(255,255,255,.055);background:transparent;color:inherit;text-align:left;cursor:pointer}.vl-party:hover,.vl-party.active{background:rgba(217,75,69,.08)}.vl-party strong{font-size:10px;color:var(--lv-text-strong,#fff)}.vl-party span{font-size:8px;color:var(--lv-text-muted,#9da8b0)}.vl-party-stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px}.vl-party-stats em{font-style:normal;font-size:7px;font-weight:900;color:#ffbf59}
        .vl-main-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:16px;border-bottom:1px solid var(--lv-border,#313b44);background:var(--lv-surface-2,#151d24)}.vl-main-head h2{margin:0 0 5px;font-size:18px;color:var(--lv-text-strong,#fff)}.vl-main-head p{margin:0;color:var(--lv-text-muted,#9da8b0);font-size:9px}.vl-code{font-size:8px;font-weight:900;color:#ef8d87}
        .vl-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:14px}.vl-card{padding:12px;border:1px solid var(--lv-border,#313b44);border-radius:10px;background:rgba(255,255,255,.018)}.vl-card span{display:block;color:var(--lv-text-muted,#9da8b0);font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.vl-card strong{display:block;margin-top:6px;font-size:14px;color:var(--lv-text-strong,#fff)}.vl-card.paid strong{color:#78d6a2}.vl-card.due strong{color:#ffbf59}
        .vl-section{padding:0 14px 14px}.vl-section-title{display:flex;justify-content:space-between;gap:8px;align-items:center;margin:3px 0 8px}.vl-section-title h3{margin:0;font-size:11px;color:var(--lv-text-strong,#fff)}.vl-section-title span{font-size:8px;color:var(--lv-text-muted,#9da8b0)}
        .vl-table-wrap{overflow:auto;border:1px solid var(--lv-border,#313b44);border-radius:10px}.vl-table{width:100%;min-width:860px;border-collapse:collapse}.vl-table th{padding:9px 10px;background:rgba(255,255,255,.025);border-bottom:1px solid var(--lv-border,#313b44);color:var(--lv-text-muted,#9da8b0);font-size:7px;text-transform:uppercase;letter-spacing:.06em;text-align:left;white-space:nowrap}.vl-table td{padding:10px;border-bottom:1px solid rgba(255,255,255,.05);font-size:9px;vertical-align:top}.vl-table tr:last-child td{border-bottom:0}.num{text-align:right!important;font-variant-numeric:tabular-nums}.vl-debit{color:#ff9b95}.vl-credit{color:#78d6a2}.vl-running{font-weight:950;color:#ffbf59}.vl-sub{display:block;margin-top:3px;color:var(--lv-text-muted,#9da8b0);font-size:7px}.vl-pill{display:inline-flex;align-items:center;min-height:22px;padding:0 6px;border:1px solid var(--lv-border,#36414a);border-radius:999px;font-size:7px;font-weight:900}.vl-pill.payment{color:#78d6a2;border-color:rgba(120,214,162,.35)}.vl-pill.job{color:#7cc4ff;border-color:rgba(124,196,255,.35)}.vl-empty{padding:30px;text-align:center;color:var(--lv-text-muted,#9da8b0);font-size:10px}.vl-alert{padding:11px 13px;border:1px solid rgba(255,92,85,.35);border-radius:9px;background:rgba(255,92,85,.08);color:#ffaaa5;font-size:10px}
        @media(max-width:980px){.vl-grid{grid-template-columns:1fr}.vl-party-list{max-height:300px}.vl-cards{grid-template-columns:1fr 1fr}}
        @media(max-width:620px){.vl-hero,.vl-main-head{flex-direction:column}.vl-cards{grid-template-columns:1fr}.vl-table{min-width:760px}}
      `}</style>

      <section className="vl-hero">
        <div>
          <div className="vl-kicker">Outsourcing · Vendor Accounts</div>
          <h1>Separate Vendor Ledgers</h1>
          <p>Every outsourcing person or firm has an independent payable ledger. Jobs increase that vendor&apos;s payable balance; recorded payments reduce it without creating a second Main Accounts expense.</p>
        </div>
        <Link className="vl-back" href="/admin/finance/outsourcing">← Back to Outsourcing</Link>
      </section>

      {error && <div className="vl-alert">{error}</div>}

      {loading ? (
        <div className="vl-empty">Loading vendor ledgers…</div>
      ) : (
        <section className="vl-grid">
          <aside className="vl-sidebar">
            <div className="vl-sidebar-head">
              <input className="vl-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search person, firm, phone, expertise…" />
            </div>
            <div className="vl-party-list">
              {visibleParties.map((party) => (
                <button key={party.id} type="button" className={`vl-party ${String(selectedParty?.id) === String(party.id) ? "active" : ""}`} onClick={() => chooseParty(String(party.id))}>
                  <strong>{party.name || "Unnamed vendor"}</strong>
                  <span>{party.party_type || "Vendor"}{party.phone ? ` · ${party.phone}` : ""}</span>
                  <div className="vl-party-stats">
                    <em>Work {money(party.agreed_amount)}</em>
                    <em>Due {money(party.due_amount)}</em>
                  </div>
                </button>
              ))}
              {visibleParties.length === 0 && <div className="vl-empty">No outsourcing vendor found.</div>}
            </div>
          </aside>

          <section className="vl-main">
            {!selectedParty ? (
              <div className="vl-empty">Select an outsourcing person or firm.</div>
            ) : (
              <>
                <header className="vl-main-head">
                  <div>
                    <div className="vl-code">{selectedParty.party_code || "VENDOR"}</div>
                    <h2>{selectedParty.name}</h2>
                    <p>{[selectedParty.party_type, selectedParty.phone, selectedParty.expertise].map(text).filter(Boolean).join(" · ") || "Outsourcing vendor"}</p>
                  </div>
                  <span className="vl-pill">{selectedParty.active === false ? "Inactive" : "Active"}</span>
                </header>

                <div className="vl-cards">
                  <div className="vl-card"><span>Total Work Value</span><strong>{money(totals.agreed)}</strong></div>
                  <div className="vl-card paid"><span>Total Paid</span><strong>{money(totals.paid)}</strong></div>
                  <div className="vl-card due"><span>Total Due</span><strong>{money(totals.due)}</strong></div>
                  <div className="vl-card"><span>Active Jobs</span><strong>{totals.activeJobs}</strong></div>
                </div>

                <div className="vl-section">
                  <div className="vl-section-title"><h3>Vendor Ledger</h3><span>{ledgerEntries.length} entries</span></div>
                  <div className="vl-table-wrap">
                    <table className="vl-table">
                      <thead><tr><th>Date</th><th>Type</th><th>Project / Service</th><th>Reference</th><th>Status / Method</th><th className="num">Work · Debit</th><th className="num">Payment · Credit</th><th className="num">Payable Balance</th></tr></thead>
                      <tbody>
                        {ledgerEntries.map((entry) => (
                          <tr key={entry.id}>
                            <td>{displayDate(entry.date)}</td>
                            <td><span className={`vl-pill ${entry.type === "Payment" ? "payment" : "job"}`}>{entry.type}</span></td>
                            <td><strong>{entry.project}</strong><span className="vl-sub">{entry.service}</span></td>
                            <td>{entry.reference || "—"}</td>
                            <td>{entry.status || "—"}<span className="vl-sub">{entry.method || ""}</span></td>
                            <td className="num vl-debit">{entry.debit ? money(entry.debit) : "—"}</td>
                            <td className="num vl-credit">{entry.credit ? money(entry.credit) : "—"}</td>
                            <td className="num vl-running">{money(entry.running)}</td>
                          </tr>
                        ))}
                        {ledgerEntries.length === 0 && <tr><td colSpan={8} className="vl-empty">No jobs or payments for this vendor yet.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="vl-section">
                  <div className="vl-section-title"><h3>Jobs</h3><span>{vendorJobs.length} total</span></div>
                  <div className="vl-table-wrap">
                    <table className="vl-table">
                      <thead><tr><th>Project</th><th>Service</th><th>Assigned</th><th>Status</th><th className="num">Agreed</th><th className="num">Paid</th><th className="num">Due</th></tr></thead>
                      <tbody>
                        {vendorJobs.map((job) => (
                          <tr key={job.id}>
                            <td><strong>{job.project_code || "General"}</strong><span className="vl-sub">{job.project_name || ""}</span></td>
                            <td>{job.service_type || "Outsourcing"}<span className="vl-sub">{job.job_code || ""}</span></td>
                            <td>{displayDate(job.assigned_date)}</td>
                            <td>{job.status || "—"}</td>
                            <td className="num">{money(job.agreed_amount)}</td>
                            <td className="num vl-credit">{money(job.paid_amount)}</td>
                            <td className="num vl-running">{money(job.due_amount)}</td>
                          </tr>
                        ))}
                        {vendorJobs.length === 0 && <tr><td colSpan={7} className="vl-empty">No jobs for this vendor.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="vl-section">
                  <div className="vl-section-title"><h3>Payment History</h3><span>{vendorPayments.length} records</span></div>
                  <div className="vl-table-wrap">
                    <table className="vl-table">
                      <thead><tr><th>Date</th><th>Project</th><th>Service</th><th>Payment</th><th>Method</th><th>Reference</th><th>Status</th><th className="num">Amount</th></tr></thead>
                      <tbody>
                        {vendorPayments.map((payment) => (
                          <tr key={payment.id}>
                            <td>{displayDate(payment.payment_date)}</td>
                            <td>{payment.project_code || "General"}</td>
                            <td>{payment.service_type || "Outsourcing"}</td>
                            <td>{payment.payment_code || "—"}</td>
                            <td>{payment.payment_method || "—"}</td>
                            <td>{payment.reference_no || "—"}</td>
                            <td>{payment.status || "—"}</td>
                            <td className={`num ${activePayment(payment) ? "vl-credit" : ""}`}>{money(payment.amount)}</td>
                          </tr>
                        ))}
                        {vendorPayments.length === 0 && <tr><td colSpan={8} className="vl-empty">No payments for this vendor yet.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        </section>
      )}
    </main>
  );
}
