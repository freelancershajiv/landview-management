"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState, PageHeader } from "@/components/lv-ui";

type Row = {
  projectId: string;
  projectName: string;
  clientName: string;
  phone: string;
  projectType: string;
  location: string;
  status: string;
  recordType: string;
  proposalId: string;
  billCount: number;
  invoiceCount: number;
  billed: number;
  paid: number;
  due: number;
  blocked: boolean;
};

const money = (value: unknown) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(Number(value) || 0);

const css = `
.reclass-page{display:grid;gap:18px}.reclass-actions{display:flex;gap:8px;flex-wrap:wrap}.reclass-btn{height:40px;padding:0 14px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:#18232d;color:#fff;font-size:12px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.reclass-btn.primary{background:#d61f26;border-color:#d61f26}.reclass-btn:disabled{opacity:.45;cursor:not-allowed}.reclass-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.reclass-tools input{flex:1;min-width:260px;height:42px;padding:0 12px;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:#111b24;color:#eef2f5}.filter-btn{height:38px;padding:0 13px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:#121c25;color:#9ba7b1;font-size:11px;font-weight:800;cursor:pointer}.filter-btn.active{border-color:#d61f26;background:#d61f26;color:#fff}.panel{border:1px solid rgba(255,255,255,.11);border-radius:12px;background:#0e1720;overflow:hidden}.panel-head{padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);background:#141e28}.panel-head strong{display:block;color:#f5f7f8;font-size:13px}.panel-head small{display:block;margin-top:4px;color:#7f8c97;font-size:11px;line-height:1.55}.table-wrap{overflow:auto}.table{width:100%;min-width:1050px;border-collapse:collapse}.table th{padding:11px 12px;background:#141e28;color:#82909b;border-bottom:1px solid rgba(255,255,255,.09);text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase}.table td{padding:12px;border-bottom:1px solid rgba(255,255,255,.07);color:#dfe5e9;font-size:11px;background:#0f1821;vertical-align:top}.table tr:last-child td{border-bottom:0}.id{color:#ff756e;font-weight:900}.muted{display:block;margin-top:4px;color:#7b8993;font-size:10px}.status{display:inline-flex;padding:5px 8px;border-radius:999px;background:#25313a;color:#c6cfd5;font-size:9px;font-weight:900}.status.moved{background:#153a29;color:#9ee5b9}.status.blocked{background:#3c2022;color:#ffaaa6}.message{padding:11px 13px;border:1px solid rgba(255,255,255,.1);border-radius:8px;font-size:11px;line-height:1.55}.message.ok{border-color:rgba(59,190,120,.35);color:#95e2b2}.message.err{border-color:rgba(214,31,38,.35);color:#ff9d96}.empty{padding:28px;text-align:center;color:#7f8b95;font-size:12px}.note{padding:12px 16px;border-top:1px solid rgba(255,255,255,.08);color:#74818c;font-size:11px;line-height:1.6}@media(max-width:700px){.reclass-tools{align-items:stretch}.reclass-tools input{min-width:0;width:100%}}
`;

export default function ReclassifyProjectsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<{kind:"ok"|"err"; text:string}|null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"Candidates"|"Moved">("Candidates");
  const [moving, setMoving] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/projects/reclassify", { credentials: "same-origin", cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load projects."));
      setRows(json.data || []);
    } catch (e:any) {
      setError(e?.message || "Could not load projects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const candidates = useMemo(() => rows.filter(row => row.recordType !== "proposal" && row.billCount > 0), [rows]);
  const moved = useMemo(() => rows.filter(row => row.recordType === "proposal"), [rows]);
  const shown = useMemo(() => {
    const source = view === "Moved" ? moved : candidates;
    const term = query.trim().toLowerCase();
    if (!term) return source;
    return source.filter(row => [row.projectId,row.projectName,row.clientName,row.phone,row.projectType,row.location,row.proposalId].join(" ").toLowerCase().includes(term));
  }, [view,moved,candidates,query]);

  async function move(row: Row) {
    if (row.blocked || moving) return;
    const ok = window.confirm(`Move ${row.projectId} to Proposals?\n\n${money(row.billed)} of imported billing will be converted into proposal value and the old bill/invoice rows will be voided from Finance. Historical rows will remain for audit.`);
    if (!ok) return;
    setMoving(row.projectId);
    setMessage(null);
    try {
      const response = await fetch("/api/projects/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ projectId: row.projectId }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not move the project."));
      const proposalId = String(json.data?.proposalId || "");
      setMessage({ kind: "ok", text: `${row.projectId} was moved to ${proposalId || "Proposals"}. Its old proposal-like bills no longer count as live billing or receivables.` });
      await load();
      setView("Moved");
    } catch (e:any) {
      setMessage({ kind: "err", text: e?.message || "Could not move the project to Proposals." });
    } finally {
      setMoving("");
    }
  }

  if (loading && !rows.length) return <LoadingState label="Checking projects and finance records..." />;
  if (error && !rows.length) return <ErrorState message={error} onRetry={load} />;

  return <>
    <style dangerouslySetInnerHTML={{__html:css}} />
    <div className="reclass-page">
      <PageHeader eyebrow="LAND VIEW DATA CLEANUP" title="Move Projects to Proposals" description="Use this only for old records that were proposals but were mistakenly entered as invoice/billing projects. Their original bill and invoice rows remain as voided audit records." action={<div className="reclass-actions"><Link className="reclass-btn" href="/admin/projects">← Projects</Link><button className="reclass-btn" type="button" onClick={()=>void load()}>Refresh</button></div>} />
      {message && <div className={`message ${message.kind}`}>{message.text}</div>}
      {error && <div className="message err">{error}</div>}
      <div className="reclass-tools">
        <button className={`filter-btn ${view==="Candidates"?"active":""}`} onClick={()=>setView("Candidates")}>Candidates · {candidates.length}</button>
        <button className={`filter-btn ${view==="Moved"?"active":""}`} onClick={()=>setView("Moved")}>Moved · {moved.length}</button>
        <input type="search" placeholder="Search project, client, phone, type or location" value={query} onChange={e=>setQuery(e.target.value)} />
      </div>
      <section className="panel">
        <div className="panel-head"><strong>{view === "Candidates" ? "Projects with imported billing" : "Already moved to Proposals"}</strong><small>{view === "Candidates" ? "A project with real received payments is protected and cannot be moved until those payments are resolved." : "These source project rows are retained only as audit links to the proposal they created."}</small></div>
        <div className="table-wrap"><table className="table"><thead><tr><th>Project</th><th>Client / Type</th><th>Billing</th><th>Payments</th><th>Due</th><th>Invoices</th><th>Status</th><th></th></tr></thead><tbody>
          {shown.map(row => <tr key={row.projectId}>
            <td><span className="id">{row.projectId}</span><strong className="muted" style={{color:"#dfe5e9"}}>{row.projectName || row.clientName || "—"}</strong><span className="muted">{row.location || "—"}</span></td>
            <td>{row.clientName || "—"}<span className="muted">{row.projectType || "—"}</span></td>
            <td><strong>{money(row.billed)}</strong><span className="muted">{row.billCount} active bill item(s)</span></td>
            <td><strong>{money(row.paid)}</strong>{row.blocked && <span className="muted" style={{color:"#ffaaa6"}}>Real payment detected</span>}</td>
            <td><strong>{money(row.due)}</strong></td>
            <td>{row.invoiceCount}</td>
            <td>{row.recordType === "proposal" ? <><span className="status moved">Moved</span><span className="muted">{row.proposalId}</span></> : row.blocked ? <span className="status blocked">Payment protected</span> : <span className="status">Ready</span>}</td>
            <td>{row.recordType === "proposal" && row.proposalId ? <Link className="reclass-btn" href={`/admin/proposals/${encodeURIComponent(row.proposalId)}`}>Open Proposal</Link> : <button className="reclass-btn primary" type="button" disabled={row.blocked || Boolean(moving)} onClick={()=>void move(row)}>{moving===row.projectId?"Moving…":"Move to Proposal"}</button>}</td>
          </tr>)}
          {!shown.length && <tr><td colSpan={8}><div className="empty">No projects match this view.</div></td></tr>}
        </tbody></table></div>
        <div className="note">Moving a record does not delete history. The proposal receives the old bill service lines and values; the mistaken bill/invoice rows are marked void so they stop affecting active billing and receivables.</div>
      </section>
    </div>
  </>;
}
