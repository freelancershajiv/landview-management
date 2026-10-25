"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type Row = Record<string, any>;
type BillCategory = "Engineering Bill" | "Design Books" | "Supervision Bill" | "Other Services Bill";
type RevisionMode = "none" | "discount" | "final";
type EditLine = {
  key: string;
  billId: string;
  isNew: boolean;
  isDraft: boolean;
  removed: boolean;
  date: string;
  category: BillCategory;
  service: string;
  gross: string;
  discount: string;
  notes: string;
  currentNet: number;
  revisionMode: RevisionMode;
  revisionValue: string;
  revisionReason: string;
};

const CATEGORIES: BillCategory[] = ["Engineering Bill", "Design Books", "Supervision Bill", "Other Services Bill"];
const SERVICES = [
  "Architectural Design", "Structural Design", "3D Design – Exterior", "3D Design – Interior", "Electrical Design",
  "Fire Safety Design", "Plumbing Design", "Plan Approval Design", "Estimate & Costing", "Design Books",
  "Municipality Land NOC", "Fire Service Approval", "Municipality Approval", "District Vetting Committee Approval",
  "Consultancy Fees", "Submission Fees", "Soil Test", "Digital Survey", "Municipality File Pass", "Supervision / Consultancy",
];

function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown) { const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function money(value: unknown) { return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(num(value)); }
function pick(row: Row, ...keys: string[]) { for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null && text(row[key])) return row[key]; return ""; }
function projectCode(value: unknown) { const raw = text(value).toUpperCase(); const m = raw.match(/^(?:LV[\s_-]*)?0*(\d+)$/i); return m ? `LV-${Number(m[1])}` : ""; }
function billId(row: Row) { return text(pick(row, "Bill_ID", "bill_code")); }
function billStatus(row: Row) { return text(pick(row, "Status", "status")) || "Issued"; }
function isDraft(row: Row) { return billStatus(row).toLowerCase() === "draft"; }
function categoryOf(row: Row): BillCategory {
  const raw = text(pick(row, "Billing_Category", "billing_category", "Category", "category"));
  return CATEGORIES.includes(raw as BillCategory) ? raw as BillCategory : "Engineering Bill";
}
function serviceText(value: unknown) { return text(value).replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "").replace(/\s+—\s+(Credit Note|Debit Note).*$/i, "").trim(); }
function baseNet(row: Row) {
  const explicit = pick(row, "Net_Amount", "net_amount");
  return text(explicit) ? num(explicit) : Math.max(0, num(pick(row, "Amount", "amount")) - num(pick(row, "Discount", "discount")));
}
function groupKey(row: Row) {
  const idem = text(pick(row, "Idempotency_Key", "idempotency_key"));
  const direct = idem.match(/^(direct-full-[0-9a-f-]{36})-\d+$/i);
  if (direct) return direct[1].toLowerCase();
  const grouped = idem.match(/^billgroup:([^:]+):/i);
  if (grouped) return grouped[1].toLowerCase();
  return `bill-${billId(row).toLowerCase()}`;
}
function activeAdjustment(row: Row) { return !["void", "voided", "cancelled", "canceled"].includes(text(row.status).toLowerCase()); }
function today() { return new Date().toISOString().slice(0, 10); }

async function readJson(response: Response, fallback: string) {
  const raw = await response.text(); let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback));
  return json.data ?? json;
}

export default function FullBillEditorPage() {
  const [fileId, setFileId] = useState("");
  const [records, setRecords] = useState<Row[]>([]);
  const [adjustments, setAdjustments] = useState<Row[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const adjustmentByBill = useMemo(() => {
    const map = new Map<string, { debit: number; credit: number }>();
    for (const row of adjustments.filter(activeAdjustment)) {
      const key = text(row.bill_code);
      if (!key) continue;
      const current = map.get(key) || { debit: 0, credit: 0 };
      const amount = Math.max(0, num(row.amount));
      if (text(row.adjustment_type) === "Debit Note") current.debit += amount;
      if (text(row.adjustment_type) === "Credit Note") current.credit += amount;
      map.set(key, current);
    }
    return map;
  }, [adjustments]);

  function effectiveNet(row: Row) {
    const adj = adjustmentByBill.get(billId(row)) || { debit: 0, credit: 0 };
    return Math.max(0, baseNet(row) + adj.debit - adj.credit);
  }

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of records) {
      const key = groupKey(row);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries()).map(([key, rows]) => {
      rows.sort((a, b) => billId(a).localeCompare(billId(b), undefined, { numeric: true }));
      const date = text(pick(rows[0], "Bill_Date", "bill_date")).slice(0, 10);
      const draft = rows.every(isDraft);
      const gross = rows.reduce((sum, row) => sum + Math.max(0, num(pick(row, "Amount", "amount"))), 0);
      const net = rows.reduce((sum, row) => sum + effectiveNet(row), 0);
      return { key, rows, date, draft, gross, net, services: rows.length, firstBill: billId(rows[0]) };
    }).sort((a, b) => b.date.localeCompare(a.date) || b.firstBill.localeCompare(a.firstBill));
  }, [records, adjustmentByBill]);

  function hydrate(key: string) {
    const group = groups.find((item) => item.key === key);
    if (!group) { setSelectedGroup(""); setLines([]); return; }
    setSelectedGroup(group.key);
    setLines(group.rows.map((row) => ({
      key: billId(row),
      billId: billId(row),
      isNew: false,
      isDraft: isDraft(row),
      removed: false,
      date: text(pick(row, "Bill_Date", "bill_date")).slice(0, 10) || today(),
      category: categoryOf(row),
      service: serviceText(pick(row, "Description", "description")),
      gross: String(Math.max(0, num(pick(row, "Amount", "amount")))),
      discount: String(Math.max(0, num(pick(row, "Discount", "discount")))),
      notes: text(pick(row, "Notes", "notes")),
      currentNet: effectiveNet(row),
      revisionMode: "none",
      revisionValue: "",
      revisionReason: "",
    })));
  }

  async function load(raw = fileId, preferredGroup = selectedGroup) {
    const id = projectCode(raw);
    if (!id) return setError("Enter a valid File ID, for example LV-157.");
    setFileId(id); setLoading(true); setError(""); setMessage("");
    try {
      const [billRows, adjustmentRows] = await Promise.all([
        landViewApi.getBillingRecords(id),
        readJson(await fetch(`/api/billing/adjustments?projectId=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" }), "Could not load bill adjustments."),
      ]);
      const nextRecords = Array.isArray(billRows) ? billRows.filter((row) => !/credit note|debit note/i.test(text(pick(row, "Created_Via", "created_via")))) : [];
      setRecords(nextRecords);
      setAdjustments(Array.isArray(adjustmentRows) ? adjustmentRows : []);
      const url = new URL(window.location.href); url.searchParams.set("fileId", id); window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
      setSelectedGroup(preferredGroup || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the finance record."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const id = projectCode(new URLSearchParams(window.location.search).get("fileId") || "");
    if (id) { setFileId(id); void load(id, ""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!groups.length) { setLines([]); return; }
    const wanted = groups.some((g) => g.key === selectedGroup) ? selectedGroup : groups[0].key;
    hydrate(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, adjustments]);

  function patchLine(key: string, patch: Partial<EditLine>) { setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line)); }
  function addLine() {
    const group = groups.find((item) => item.key === selectedGroup);
    const draft = group?.draft !== false;
    setLines((current) => [...current, {
      key: `new-${crypto.randomUUID()}`, billId: "", isNew: true, isDraft: draft, removed: false,
      date: current[0]?.date || group?.date || today(), category: "Engineering Bill", service: "", gross: "", discount: "0", notes: "",
      currentNet: 0, revisionMode: "none", revisionValue: "", revisionReason: "",
    }]);
  }
  function applyDateToAll(date: string) { if (!date) return; setLines((current) => current.map((line) => ({ ...line, date }))); }

  function targetNet(line: EditLine) {
    if (line.removed) return 0;
    if (line.isNew || line.isDraft) return Math.max(0, num(line.gross) - num(line.discount));
    if (line.revisionMode === "discount") return Math.max(0, line.currentNet - Math.max(0, num(line.revisionValue)));
    if (line.revisionMode === "final") return Math.max(0, num(line.revisionValue));
    return line.currentNet;
  }

  const summary = useMemo(() => {
    const active = lines.filter((line) => !line.removed);
    return {
      services: active.length,
      current: lines.reduce((sum, line) => sum + line.currentNet, 0),
      revised: lines.reduce((sum, line) => sum + targetNet(line), 0),
      gross: active.reduce((sum, line) => sum + Math.max(0, num(line.gross)), 0),
      draftDiscount: active.filter((line) => line.isDraft || line.isNew).reduce((sum, line) => sum + Math.max(0, num(line.discount)), 0),
    };
  }, [lines]);

  async function save() {
    if (!fileId || !selectedGroup || !lines.length || saving) return;
    for (const line of lines.filter((item) => !item.removed)) {
      if (!line.date || !/^\d{4}-\d{2}-\d{2}$/.test(line.date)) return setError("Every service row needs a valid date.");
      if (!line.service.trim()) return setError("Every active service row needs a service / description.");
      if (line.isNew || line.isDraft) {
        if (!(num(line.gross) > 0)) return setError(`Enter a valid amount for ${line.service}.`);
        if (num(line.discount) < 0 || num(line.discount) > num(line.gross)) return setError(`Discount for ${line.service} must be between zero and its gross amount.`);
      }
      if (!line.isDraft && line.revisionMode === "discount") {
        const discount = num(line.revisionValue);
        if (!(discount > 0) || discount > line.currentNet + .01) return setError(`Discount for ${line.service} must be greater than zero and cannot exceed ${money(line.currentNet)}.`);
      }
    }

    setSaving(true); setError(""); setMessage(""); let completed = 0;
    try {
      for (const line of lines) {
        if (line.isNew) {
          if (line.removed) continue;
          await readJson(await fetch("/api/billing/write", {
            method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "saveBill", Project_ID: fileId, Bill_Date: line.date, Billing_Category: line.category, Category: line.category,
              Description: `[${line.category}] ${line.service.trim()}`, Amount: num(line.gross), Discount: num(line.discount),
              Status: groups.find((item) => item.key === selectedGroup)?.draft === false ? "Issued" : "Draft",
              Notes: line.notes.trim(), Idempotency_Key: `billgroup:${selectedGroup}:${crypto.randomUUID()}`,
            }),
          }), "Could not add the new service row.");
          completed += 1; continue;
        }

        if (line.isDraft) {
          if (line.removed) {
            await readJson(await fetch("/api/billing/bills", {
              method: "DELETE", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ Bill_ID: line.billId, Project_ID: fileId }),
            }), "Could not remove a draft service row.");
          } else {
            await readJson(await fetch("/api/billing/bills", {
              method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ Bill_ID: line.billId, Project_ID: fileId, Bill_Date: line.date, Billing_Category: line.category, Description: line.service.trim(), Amount: num(line.gross), Discount: num(line.discount), Notes: line.notes.trim() }),
            }), "Could not update a draft service row.");
          }
          completed += 1; continue;
        }

        await readJson(await fetch("/api/billing/bills/metadata", {
          method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ Bill_ID: line.billId, Project_ID: fileId, Bill_Date: line.date, Billing_Category: line.category, Description: line.service.trim(), Notes: line.notes.trim() }),
        }), "Could not update issued bill details.");

        if (line.removed && line.currentNet > .009) {
          await readJson(await fetch("/api/billing/adjustments", {
            method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create", projectId: fileId, billCode: line.billId, type: "Credit Note", amount: line.currentNet, reason: "Full bill revision — service removed", notes: line.revisionReason.trim() || "Removed from the commercial bill through Full Bill Editor." }),
          }), "Could not remove an issued service financially.");
        } else if (!line.removed && line.revisionMode === "discount") {
          const amount = Math.max(0, num(line.revisionValue));
          if (amount > .009) await readJson(await fetch("/api/billing/adjustments", {
            method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create", projectId: fileId, billCode: line.billId, type: "Credit Note", amount, reason: `Service discount${line.revisionReason.trim() ? ` — ${line.revisionReason.trim()}` : " — Full bill editor"}`, notes: "Discount applied from Full Bill Editor." }),
          }), "Could not apply the service discount.");
        } else if (!line.removed && line.revisionMode === "final") {
          const target = Math.max(0, num(line.revisionValue));
          const delta = Math.round((target - line.currentNet) * 100) / 100;
          if (Math.abs(delta) >= .01) await readJson(await fetch("/api/billing/adjustments", {
            method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create", projectId: fileId, billCode: line.billId, type: delta > 0 ? "Debit Note" : "Credit Note", amount: Math.abs(delta), reason: `Full bill revision${line.revisionReason.trim() ? ` — ${line.revisionReason.trim()}` : ""}`, notes: `Final billed value revised to ${money(target)}.` }),
          }), "Could not post the billed-value correction.");
        }
        completed += 1;
      }
      await load(fileId, selectedGroup);
      setMessage(`Full bill saved. ${completed} service row${completed === 1 ? "" : "s"} processed. Issued financial changes were preserved through credit/debit notes.`);
    } catch (e) {
      setError(`${completed ? `${completed} row${completed === 1 ? " was" : "s were"} processed before the error. ` : ""}${e instanceof Error ? e.message : "Could not save the full bill."}`);
      await load(fileId, selectedGroup).catch(() => null);
    } finally { setSaving(false); }
  }

  return <main className="fbe">
    <style>{`
      .fbe{max-width:1550px;margin:0 auto;color:var(--lv-text-primary)}.fbe *{box-sizing:border-box}.fbe-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;margin-bottom:14px}.fbe-head small{display:block;color:var(--lv-brand-text);font-size:8px;font-weight:950;letter-spacing:.13em}.fbe-head h1{margin:5px 0 3px;font-size:28px}.fbe-head p{margin:0;color:var(--lv-text-muted);font-size:9px;max-width:780px}.fbe-actions{display:flex;gap:6px;flex-wrap:wrap}.fbe-btn{min-height:36px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px;font-weight:900;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.fbe-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.fbe-btn.danger{color:var(--lv-danger);border-color:var(--lv-danger)}.fbe-btn:disabled{opacity:.5;cursor:not-allowed}.fbe-picker{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:7px;padding:11px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);margin-bottom:12px}.fbe-picker input,.fbe input,.fbe select,.fbe textarea{border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font:inherit}.fbe-picker input{min-height:39px;padding:8px 10px}.fbe-msg{padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:9px}.fbe-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.fbe-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.fbe-grid{display:grid;grid-template-columns:285px minmax(0,1fr);gap:12px}.fbe-panel{border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);overflow:hidden}.fbe-panel-title{padding:10px 11px;border-bottom:1px solid var(--lv-border-default);font-size:9px;font-weight:950;text-transform:uppercase;color:var(--lv-text-muted)}.fbe-groups{max-height:660px;overflow:auto}.fbe-group{width:100%;display:block;text-align:left;padding:11px;border:0;border-bottom:1px solid var(--lv-border-subtle);background:transparent;color:var(--lv-text-primary);cursor:pointer}.fbe-group.active{background:var(--lv-brand-soft)}.fbe-group strong{display:block;font-size:10px}.fbe-group span{display:block;margin-top:4px;font-size:8px;color:var(--lv-text-muted)}.fbe-group b{display:inline-flex;margin-top:6px;padding:3px 6px;border-radius:999px;background:var(--lv-surface-muted);font-size:7px}.fbe-group b.issued{color:var(--lv-warning)}.fbe-toolbar{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 11px;border-bottom:1px solid var(--lv-border-default);flex-wrap:wrap}.fbe-toolbar-left{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.fbe-toolbar input{min-height:34px;padding:6px 8px;font-size:8px}.fbe-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;padding:10px 11px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.fbe-kpi{padding:8px;border:1px solid var(--lv-border-subtle);border-radius:7px;background:var(--lv-surface-panel)}.fbe-kpi span{display:block;font-size:6px;text-transform:uppercase;color:var(--lv-text-muted);font-weight:950}.fbe-kpi strong{display:block;margin-top:4px;font-size:12px}.fbe-kpi.revised strong{color:var(--lv-brand-text)}.fbe-table-wrap{overflow:auto}.fbe-table{width:100%;border-collapse:collapse;min-width:1260px}.fbe-table th,.fbe-table td{padding:7px;border-bottom:1px solid var(--lv-border-subtle);vertical-align:top}.fbe-table th{background:var(--lv-surface-muted);font-size:7px;text-transform:uppercase;color:var(--lv-text-muted);text-align:left}.fbe-table input,.fbe-table select,.fbe-table textarea{width:100%;min-height:35px;padding:6px 7px;font-size:8px}.fbe-table textarea{min-height:50px;resize:vertical}.fbe-service{min-width:190px}.fbe-money{width:115px}.fbe-date{width:120px}.fbe-category{width:150px}.fbe-revision{min-width:180px}.fbe-remove{width:80px}.fbe-lock{font-size:7px;color:var(--lv-text-muted);line-height:1.35}.fbe-line-removed{opacity:.5}.fbe-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px}.fbe-footer small{color:var(--lv-text-muted);font-size:8px;max-width:700px}@media(max-width:1000px){.fbe-grid{grid-template-columns:1fr}.fbe-groups{max-height:230px}.fbe-kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:650px){.fbe-head{align-items:flex-start;flex-direction:column}.fbe-actions{width:100%}.fbe-actions .fbe-btn{flex:1}.fbe-picker{grid-template-columns:1fr}.fbe-kpis{grid-template-columns:1fr 1fr}.fbe-footer{align-items:stretch;flex-direction:column}.fbe-footer .fbe-btn{width:100%}}
    `}</style>

    <header className="fbe-head"><div><small>FINANCE / COMMERCIAL DOCUMENT CONTROL</small><h1>Full Bill Editor</h1><p>Open one bill as a complete document. Drafts can be rewritten directly; issued bills keep their audit trail while metadata, service discounts and financial corrections remain editable through controlled notes.</p></div><div className="fbe-actions"><Link className="fbe-btn" href="/admin/finance/direct-bill">+ New Full Bill</Link><Link className="fbe-btn" href="/admin/finance/adjustments">Adjustments</Link><Link className="fbe-btn" href="/admin/accounts">Ledger</Link></div></header>

    <section className="fbe-picker"><input value={fileId} onChange={(e) => setFileId(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void load(fileId, ""); }} placeholder="Enter File ID — e.g. LV-157"/><button className="fbe-btn primary" onClick={() => void load(fileId, "")} disabled={loading}>{loading ? "Loading…" : "Open Finance Record"}</button></section>
    {error ? <div className="fbe-msg bad">{error}</div> : null}{message ? <div className="fbe-msg good">{message}</div> : null}

    <div className="fbe-grid">
      <aside className="fbe-panel"><div className="fbe-panel-title">Bills / Commercial Documents</div><div className="fbe-groups">{!groups.length ? <div style={{padding:18,fontSize:9,color:"var(--lv-text-muted)"}}>No bills loaded for this project.</div> : groups.map((group) => <button key={group.key} className={`fbe-group ${selectedGroup === group.key ? "active" : ""}`} onClick={() => hydrate(group.key)}><strong>{group.date || "No date"} · {group.services} service{group.services === 1 ? "" : "s"}</strong><span>{group.firstBill} · Gross {money(group.gross)} · Current {money(group.net)}</span><b className={group.draft ? "" : "issued"}>{group.draft ? "DRAFT — fully editable" : "ISSUED — audited revisions"}</b></button>)}</div></aside>

      <section className="fbe-panel">
        <div className="fbe-toolbar"><div className="fbe-toolbar-left"><button className="fbe-btn" onClick={addLine} disabled={!selectedGroup}>+ Add Service</button><input type="date" defaultValue={lines[0]?.date || today()} onChange={(e) => applyDateToAll(e.target.value)} title="Apply this date to all service rows"/></div><button className="fbe-btn primary" onClick={() => void save()} disabled={saving || !lines.length}>{saving ? "Saving Full Bill…" : "Save Whole Bill"}</button></div>
        <div className="fbe-kpis"><div className="fbe-kpi"><span>Services</span><strong>{summary.services}</strong></div><div className="fbe-kpi"><span>Gross</span><strong>{money(summary.gross)}</strong></div><div className="fbe-kpi"><span>Draft Discounts</span><strong>{money(summary.draftDiscount)}</strong></div><div className="fbe-kpi"><span>Current Net</span><strong>{money(summary.current)}</strong></div><div className="fbe-kpi revised"><span>Revised Net</span><strong>{money(summary.revised)}</strong></div></div>
        <div className="fbe-table-wrap"><table className="fbe-table"><thead><tr><th>Bill / State</th><th>Date</th><th>Category</th><th>Service / Description</th><th>Gross</th><th>Discount / Revision</th><th>Net Preview</th><th>Notes / Reason</th><th>Action</th></tr></thead><tbody>{lines.map((line) => <tr key={line.key} className={line.removed ? "fbe-line-removed" : ""}>
          <td><strong style={{fontSize:8}}>{line.isNew ? "NEW SERVICE" : line.billId}</strong><div className="fbe-lock">{line.isNew ? (line.isDraft ? "Will save as Draft" : "Will save as Issued") : line.isDraft ? "Draft — direct editing" : "Issued — financial history preserved"}</div></td>
          <td className="fbe-date"><input type="date" value={line.date} disabled={line.removed} onChange={(e) => patchLine(line.key,{date:e.target.value})}/></td>
          <td className="fbe-category"><select value={line.category} disabled={line.removed} onChange={(e) => patchLine(line.key,{category:e.target.value as BillCategory})}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></td>
          <td className="fbe-service"><input list="landview-finance-services" value={line.service} disabled={line.removed} onChange={(e) => patchLine(line.key,{service:e.target.value})}/></td>
          <td className="fbe-money">{line.isDraft || line.isNew ? <input inputMode="decimal" value={line.gross} disabled={line.removed} onChange={(e) => patchLine(line.key,{gross:e.target.value})}/> : <><strong>{money(line.gross)}</strong><div className="fbe-lock">Original issued gross remains auditable.</div></>}</td>
          <td className="fbe-revision">{line.isDraft || line.isNew ? <><input inputMode="decimal" value={line.discount} disabled={line.removed} onChange={(e) => patchLine(line.key,{discount:e.target.value})}/><div className="fbe-lock">Service discount</div></> : <><select value={line.revisionMode} disabled={line.removed} onChange={(e) => patchLine(line.key,{revisionMode:e.target.value as RevisionMode,revisionValue:""})}><option value="none">No amount change</option><option value="discount">Add service discount</option><option value="final">Correct final net value</option></select>{line.revisionMode !== "none" ? <input style={{marginTop:5}} inputMode="decimal" placeholder={line.revisionMode === "discount" ? "Discount amount" : "Final net amount"} value={line.revisionValue} onChange={(e) => patchLine(line.key,{revisionValue:e.target.value})}/> : null}</>}</td>
          <td className="fbe-money"><strong>{money(targetNet(line))}</strong>{!line.isDraft && !line.isNew ? <div className="fbe-lock">Current: {money(line.currentNet)}</div> : null}</td>
          <td className="fbe-service"><textarea value={line.revisionReason || line.notes} disabled={line.removed} placeholder={!line.isDraft && line.revisionMode !== "none" ? "Reason for discount/correction" : "Bill notes"} onChange={(e) => !line.isDraft && line.revisionMode !== "none" ? patchLine(line.key,{revisionReason:e.target.value}) : patchLine(line.key,{notes:e.target.value})}/></td>
          <td className="fbe-remove"><button className={`fbe-btn ${line.removed ? "" : "danger"}`} onClick={() => patchLine(line.key,{removed:!line.removed})}>{line.removed ? "Restore" : "Remove"}</button></td>
        </tr>)}</tbody></table><datalist id="landview-finance-services">{SERVICES.map((service) => <option key={service} value={service}/>)}</datalist></div>
        <div className="fbe-footer"><small>Issued bills are never silently overwritten: service metadata can be corrected, while discounts/removals/value changes create Credit or Debit Notes so invoices, dues, client history and ledgers remain traceable.</small><button className="fbe-btn primary" onClick={() => void save()} disabled={saving || !lines.length}>{saving ? "Saving…" : "Save Whole Bill"}</button></div>
      </section>
    </div>
  </main>;
}
