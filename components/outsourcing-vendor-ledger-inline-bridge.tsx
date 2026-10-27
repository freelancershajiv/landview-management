"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

type Row = Record<string, any>;
type Snapshot = { parties?: Row[]; jobs?: Row[]; payments?: Row[] };
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

function text(value: unknown) { return String(value ?? "").trim(); }
function normalize(value: unknown) { return text(value).toLowerCase(); }
function money(value: unknown) {
  return `BDT ${Number(value || 0).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function displayDate(value: unknown) {
  const raw = text(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw || "—";
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export default function OutsourcingVendorLedgerInlineBridge() {
  const pathname = usePathname();
  const [tabMount, setTabMount] = useState<HTMLElement | null>(null);
  const [bodyMount, setBodyMount] = useState<HTMLElement | null>(null);
  const [workspace, setWorkspace] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedPartyId, setSelectedPartyId] = useState("");

  const onOutsourcing = pathname === "/admin/finance/outsourcing";

  useEffect(() => {
    if (!onOutsourcing) {
      setActive(false);
      setTabMount(null);
      setBodyMount(null);
      setWorkspace(null);
      return;
    }

    let cancelled = false;
    let observer: MutationObserver | null = null;

    const attach = () => {
      if (cancelled) return true;
      const tabs = document.querySelector<HTMLElement>(".outsource-page .out-tabs");
      const ws = document.querySelector<HTMLElement>(".outsource-page .out-workspace");
      const toolbar = ws?.querySelector<HTMLElement>(":scope > .out-toolbar");
      if (!tabs || !ws || !toolbar) return false;

      let tabHost = tabs.querySelector<HTMLElement>("[data-outsourcing-vendor-ledger-tab]");
      if (!tabHost) {
        tabHost = document.createElement("span");
        tabHost.dataset.outsourcingVendorLedgerTab = "true";
        tabHost.style.display = "contents";
        tabs.appendChild(tabHost);
      }

      let bodyHost = ws.querySelector<HTMLElement>(":scope > [data-outsourcing-vendor-ledger-body]");
      if (!bodyHost) {
        bodyHost = document.createElement("div");
        bodyHost.dataset.outsourcingVendorLedgerBody = "true";
        toolbar.insertAdjacentElement("afterend", bodyHost);
      }

      setTabMount(tabHost);
      setBodyMount(bodyHost);
      setWorkspace(ws);
      return true;
    };

    if (!attach()) {
      observer = new MutationObserver(() => { if (attach()) observer?.disconnect(); });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      document.querySelectorAll("[data-outsourcing-vendor-ledger-tab],[data-outsourcing-vendor-ledger-body]").forEach((node) => node.remove());
    };
  }, [onOutsourcing]);

  useEffect(() => {
    if (!workspace) return;
    workspace.classList.toggle("out-vendor-ledger-active", active);
    const tabs = workspace.querySelector(".out-tabs");
    const handler = (event: Event) => {
      const target = event.target as Element | null;
      const button = target?.closest("button");
      if (!button || button.classList.contains("out-vendor-ledger-tab")) return;
      setActive(false);
    };
    tabs?.addEventListener("click", handler, true);
    return () => {
      workspace.classList.remove("out-vendor-ledger-active");
      tabs?.removeEventListener("click", handler, true);
    };
  }, [workspace, active]);

  useEffect(() => {
    if (!onOutsourcing || data || loading) return;
    setLoading(true);
    setError("");
    fetch("/api/outsourcing", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load vendor ledgers."));
        const snapshot = json.data as Snapshot;
        setData(snapshot);
        const first = (snapshot.parties || []).find((row) => row.active !== false) || snapshot.parties?.[0];
        if (first?.id) setSelectedPartyId(String(first.id));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load vendor ledgers."))
      .finally(() => setLoading(false));
  }, [onOutsourcing, data, loading]);

  const parties = data?.parties || [];
  const jobs = data?.jobs || [];
  const payments = data?.payments || [];
  const visibleParties = useMemo(() => {
    const term = normalize(query);
    if (!term) return parties;
    return parties.filter((row) => [row.name, row.party_code, row.party_type, row.phone, row.expertise].map(text).join(" ").toLowerCase().includes(term));
  }, [parties, query]);

  const selectedParty = parties.find((row) => String(row.id) === selectedPartyId) || visibleParties[0] || null;
  const vendorJobs = useMemo(() => selectedParty ? jobs.filter((row) => String(row.party_id) === String(selectedParty.id)) : [], [jobs, selectedParty]);
  const jobIds = useMemo(() => new Set(vendorJobs.map((row) => String(row.id))), [vendorJobs]);
  const vendorPayments = useMemo(() => payments.filter((row) => jobIds.has(String(row.job_id))), [payments, jobIds]);

  const totals = useMemo(() => {
    const effectiveJobs = vendorJobs.filter((row) => normalize(row.status) !== "cancelled");
    const agreed = effectiveJobs.reduce((sum, row) => sum + Number(row.agreed_amount || 0), 0);
    const paid = vendorPayments.filter((row) => normalize(row.status) !== "void").reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return {
      agreed,
      paid,
      due: Math.max(0, agreed - paid),
      active: effectiveJobs.filter((row) => normalize(row.status) !== "completed").length,
    };
  }, [vendorJobs, vendorPayments]);

  const entries = useMemo<LedgerEntry[]>(() => {
    const rows: Omit<LedgerEntry, "running">[] = [];
    const jobById = new Map(vendorJobs.map((row) => [String(row.id), row]));
    for (const job of vendorJobs) {
      rows.push({
        id: `job:${job.id}`,
        date: text(job.assigned_date || job.created_at),
        sort: 0,
        type: "Job",
        project: [text(job.project_code), text(job.project_name)].filter(Boolean).join(" — ") || "General",
        service: text(job.service_type) || "Outsourcing",
        reference: text(job.job_code),
        debit: normalize(job.status) === "cancelled" ? 0 : Number(job.agreed_amount || 0),
        credit: 0,
        status: text(job.status),
        method: "",
      });
    }
    for (const payment of vendorPayments) {
      const job = jobById.get(String(payment.job_id)) || {};
      rows.push({
        id: `payment:${payment.id}`,
        date: text(payment.payment_date || payment.created_at),
        sort: 1,
        type: "Payment",
        project: [text(job.project_code || payment.project_code), text(job.project_name)].filter(Boolean).join(" — ") || "General",
        service: text(job.service_type || payment.service_type) || "Outsourcing",
        reference: text(payment.payment_code),
        debit: 0,
        credit: normalize(payment.status) === "void" ? 0 : Number(payment.amount || 0),
        status: text(payment.status),
        method: text(payment.payment_method),
      });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.sort - b.sort || a.reference.localeCompare(b.reference, undefined, { numeric: true }));
    let running = 0;
    return rows.map((row) => {
      running += row.debit - row.credit;
      return { ...row, running: Math.max(0, running) };
    });
  }, [vendorJobs, vendorPayments]);

  if (!onOutsourcing || !tabMount || !bodyMount) return null;

  const tab = createPortal(
    <button type="button" className={`out-vendor-ledger-tab ${active ? "active" : ""}`} onClick={() => setActive(true)}>Vendor Ledgers</button>,
    tabMount,
  );

  const body = createPortal(
    active ? <div className="ovl-inline">
      <style>{`
        .out-workspace.out-vendor-ledger-active > .out-table-wrap,.out-workspace.out-vendor-ledger-active > .out-empty{display:none!important}
        .out-workspace.out-vendor-ledger-active .out-toolbar > .out-search{display:none!important}
        .out-workspace.out-vendor-ledger-active .out-tabs > button:not(.out-vendor-ledger-tab){background:transparent!important;border-color:var(--lv-border,#36414a)!important;color:var(--lv-text-muted,#9da8b0)!important}
        .ovl-inline{display:grid;grid-template-columns:280px minmax(0,1fr);min-height:520px;background:var(--lv-surface-1,#11181e)}
        .ovl-side{border-right:1px solid var(--lv-border,#313b44);background:var(--lv-surface-2,#151d24)}
        .ovl-side-head{padding:12px;border-bottom:1px solid var(--lv-border,#313b44)}
        .ovl-search{width:100%;height:36px;padding:0 10px;border:1px solid var(--lv-border,#36414a);border-radius:8px;background:var(--lv-bg,#0d1318);color:var(--lv-text,#dbe3e8);font-size:10px;outline:none}
        .ovl-party-list{max-height:610px;overflow:auto}.ovl-party{width:100%;display:grid;gap:4px;padding:12px;border:0;border-bottom:1px solid rgba(255,255,255,.055);background:transparent;color:inherit;text-align:left;cursor:pointer}.ovl-party:hover,.ovl-party.active{background:rgba(217,75,69,.09)}.ovl-party strong{font-size:10px;color:var(--lv-text-strong,#fff)}.ovl-party span{font-size:8px;color:var(--lv-text-muted,#9da8b0)}
        .ovl-main{min-width:0}.ovl-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:16px;border-bottom:1px solid var(--lv-border,#313b44)}.ovl-head h2{margin:0 0 4px;font-size:17px;color:var(--lv-text-strong,#fff)}.ovl-head p{margin:0;color:var(--lv-text-muted,#9da8b0);font-size:9px}.ovl-code{font-size:8px;font-weight:900;color:#ef8d87}
        .ovl-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:14px}.ovl-card{padding:12px;border:1px solid var(--lv-border,#313b44);border-radius:10px;background:rgba(255,255,255,.018)}.ovl-card span{display:block;color:var(--lv-text-muted,#9da8b0);font-size:7px;font-weight:900;text-transform:uppercase}.ovl-card strong{display:block;margin-top:6px;font-size:14px;color:var(--lv-text-strong,#fff)}.ovl-card.paid strong{color:#78d6a2}.ovl-card.due strong{color:#ffbf59}
        .ovl-table-wrap{margin:0 14px 14px;overflow:auto;border:1px solid var(--lv-border,#313b44);border-radius:10px}.ovl-table{width:100%;min-width:820px;border-collapse:collapse}.ovl-table th{padding:9px 10px;background:rgba(255,255,255,.025);border-bottom:1px solid var(--lv-border,#313b44);color:var(--lv-text-muted,#9da8b0);font-size:7px;text-transform:uppercase;text-align:left;white-space:nowrap}.ovl-table td{padding:10px;border-bottom:1px solid rgba(255,255,255,.05);font-size:9px;vertical-align:top}.ovl-table tr:last-child td{border-bottom:0}.ovl-num{text-align:right!important;font-variant-numeric:tabular-nums}.ovl-debit{color:#ff9b95}.ovl-credit{color:#78d6a2}.ovl-running{color:#ffbf59;font-weight:950}.ovl-sub{display:block;margin-top:3px;color:var(--lv-text-muted,#9da8b0);font-size:7px}.ovl-pill{display:inline-flex;align-items:center;min-height:22px;padding:0 6px;border:1px solid var(--lv-border,#36414a);border-radius:999px;font-size:7px;font-weight:900}.ovl-pill.payment{color:#78d6a2}.ovl-pill.job{color:#7cc4ff}.ovl-empty{padding:30px;text-align:center;color:var(--lv-text-muted,#9da8b0);font-size:10px}.ovl-error{margin:14px;padding:11px;border:1px solid rgba(255,92,85,.35);border-radius:8px;color:#ffaaa5;background:rgba(255,92,85,.08);font-size:10px}
        @media(max-width:900px){.ovl-inline{grid-template-columns:1fr}.ovl-side{border-right:0;border-bottom:1px solid var(--lv-border,#313b44)}.ovl-party-list{max-height:230px}.ovl-cards{grid-template-columns:1fr 1fr}}
        @media(max-width:560px){.ovl-cards{grid-template-columns:1fr}.ovl-head{display:grid}.ovl-table{min-width:760px}}
      `}</style>
      <aside className="ovl-side">
        <div className="ovl-side-head"><input className="ovl-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search person / firm…" /></div>
        <div className="ovl-party-list">
          {visibleParties.map((party) => {
            const partyJobs = jobs.filter((job) => String(job.party_id) === String(party.id) && normalize(job.status) !== "cancelled");
            const partyJobIds = new Set(partyJobs.map((job) => String(job.id)));
            const agreed = partyJobs.reduce((sum, job) => sum + Number(job.agreed_amount || 0), 0);
            const paid = payments.filter((payment) => partyJobIds.has(String(payment.job_id)) && normalize(payment.status) !== "void").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
            return <button key={String(party.id)} type="button" className={`ovl-party ${String(selectedParty?.id) === String(party.id) ? "active" : ""}`} onClick={() => setSelectedPartyId(String(party.id))}>
              <strong>{text(party.name) || "Unnamed Vendor"}</strong>
              <span>{text(party.party_code)} · Due {money(Math.max(0, agreed - paid))}</span>
            </button>;
          })}
          {!visibleParties.length && <div className="ovl-empty">No people or firms found.</div>}
        </div>
      </aside>
      <section className="ovl-main">
        {loading ? <div className="ovl-empty">Loading vendor ledgers…</div> : error ? <div className="ovl-error">{error}</div> : !selectedParty ? <div className="ovl-empty">Select a person or firm.</div> : <>
          <div className="ovl-head"><div><h2>{text(selectedParty.name)}</h2><p>{text(selectedParty.party_type)}{selectedParty.phone ? ` · ${text(selectedParty.phone)}` : ""}{selectedParty.expertise ? ` · ${text(selectedParty.expertise)}` : ""}</p></div><span className="ovl-code">{text(selectedParty.party_code)}</span></div>
          <div className="ovl-cards">
            <div className="ovl-card"><span>Total Work Value</span><strong>{money(totals.agreed)}</strong></div>
            <div className="ovl-card paid"><span>Total Paid</span><strong>{money(totals.paid)}</strong></div>
            <div className="ovl-card due"><span>Total Due</span><strong>{money(totals.due)}</strong></div>
            <div className="ovl-card"><span>Active Jobs</span><strong>{totals.active}</strong></div>
          </div>
          <div className="ovl-table-wrap"><table className="ovl-table"><thead><tr><th>Date</th><th>Type</th><th>Project</th><th>Service / Reference</th><th className="ovl-num">Work</th><th className="ovl-num">Paid</th><th className="ovl-num">Balance Due</th><th>Status</th></tr></thead><tbody>
            {!entries.length && <tr><td colSpan={8}><div className="ovl-empty">No ledger activity for this vendor.</div></td></tr>}
            {entries.map((entry) => <tr key={entry.id}><td>{displayDate(entry.date)}</td><td><span className={`ovl-pill ${entry.type.toLowerCase()}`}>{entry.type}</span></td><td><strong>{entry.project}</strong></td><td><strong>{entry.service}</strong><span className="ovl-sub">{entry.reference}{entry.method ? ` · ${entry.method}` : ""}</span></td><td className="ovl-num ovl-debit">{entry.debit ? money(entry.debit) : "—"}</td><td className="ovl-num ovl-credit">{entry.credit ? money(entry.credit) : "—"}</td><td className="ovl-num ovl-running">{money(entry.running)}</td><td>{entry.status || "—"}</td></tr>)}
          </tbody></table></div>
        </>}
      </section>
    </div> : null,
    bodyMount,
  );

  return <>{tab}{body}</>;
}
