"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type Row = Record<string, unknown>;
type BillCategory = "Engineering Bill" | "Design Books" | "Supervision Bill" | "Other Services Bill";
type ApiEnvelope = { success?: boolean; error?: string; data?: unknown };
type EditLine = {
  key: string;
  billId: string;
  isNew: boolean;
  isDraft: boolean;
  template: boolean;
  removed: boolean;
  date: string;
  category: BillCategory;
  service: string;
  gross: string;
  discount: string;
  savedDiscount: number;
  notes: string;
  currentNet: number;
  originalDate: string;
  originalCategory: BillCategory;
  originalService: string;
  originalNotes: string;
};

type CatalogItem = { category: BillCategory; service: string };

const CATEGORIES: BillCategory[] = ["Engineering Bill", "Design Books", "Supervision Bill", "Other Services Bill"];
const SERVICE_CATALOG: CatalogItem[] = [
  { category: "Engineering Bill", service: "Architectural Design" },
  { category: "Engineering Bill", service: "Structural Design" },
  { category: "Engineering Bill", service: "3D Design – Exterior" },
  { category: "Engineering Bill", service: "3D Design – Interior" },
  { category: "Engineering Bill", service: "Electrical Design" },
  { category: "Engineering Bill", service: "Fire Safety Design" },
  { category: "Engineering Bill", service: "Plumbing Design" },
  { category: "Engineering Bill", service: "Plan Approval Design" },
  { category: "Engineering Bill", service: "Estimate & Costing" },
  { category: "Engineering Bill", service: "Design Books" },
  { category: "Engineering Bill", service: "Re-Design Fees" },
  { category: "Other Services Bill", service: "Municipality Land NOC" },
  { category: "Other Services Bill", service: "Fire Service Approval" },
  { category: "Other Services Bill", service: "Municipality Approval" },
  { category: "Other Services Bill", service: "District Vetting Committee Approval" },
  { category: "Other Services Bill", service: "Consultancy Fees" },
  { category: "Other Services Bill", service: "Submission Fees" },
  { category: "Other Services Bill", service: "Soil Test" },
  { category: "Other Services Bill", service: "Digital Survey" },
  { category: "Other Services Bill", service: "Municipality File Pass" },
  { category: "Supervision Bill", service: "Site Supervision" },
  { category: "Supervision Bill", service: "Supervision / Consultancy" },
];

function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money(value: unknown) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(num(value));
}
function pick(row: Row, ...keys: string[]) {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null && text(row[key])) return row[key];
  return "";
}
function projectCode(value: unknown) {
  const raw = text(value).toUpperCase();
  const match = raw.match(/^(?:LV[\s_-]*)?0*(\d+)$/i);
  return match ? `LV-${Number(match[1])}` : "";
}
function billId(row: Row) { return text(pick(row, "Bill_ID", "bill_code")); }
function billStatus(row: Row) { return text(pick(row, "Status", "status")) || "Issued"; }
function isDraft(row: Row) { return billStatus(row).toLowerCase() === "draft"; }
function categoryOf(row: Row): BillCategory {
  const raw = text(pick(row, "Billing_Category", "billing_category", "Category", "category"));
  return CATEGORIES.includes(raw as BillCategory) ? raw as BillCategory : "Engineering Bill";
}
function serviceText(value: unknown) {
  return text(value)
    .replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "")
    .replace(/\s+—\s+(Credit Note|Debit Note).*$/i, "")
    .trim();
}
function serviceKey(value: unknown) {
  return serviceText(value).toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}
function baseNet(row: Row) {
  const explicit = pick(row, "Net_Amount", "net_amount");
  return text(explicit) ? num(explicit) : Math.max(0, num(pick(row, "Amount", "amount")) - num(pick(row, "Discount", "discount")));
}
function activeAdjustment(row: Row) {
  return !["void", "voided", "cancelled", "canceled"].includes(text(row.status).toLowerCase());
}
function today() { return new Date().toISOString().slice(0, 10); }
function effectiveNet(row: Row, adjustments: Row[]) {
  const id = billId(row);
  let debit = 0;
  let credit = 0;
  for (const adjustment of adjustments) {
    if (!activeAdjustment(adjustment) || text(adjustment.bill_code) !== id) continue;
    const amount = Math.max(0, num(adjustment.amount));
    if (text(adjustment.adjustment_type) === "Debit Note") debit += amount;
    if (text(adjustment.adjustment_type) === "Credit Note") credit += amount;
  }
  return Math.max(0, baseNet(row) + debit - credit);
}
function categoryRank(category: BillCategory) {
  return CATEGORIES.indexOf(category);
}
function catalogRank(service: string) {
  const key = serviceKey(service);
  const index = SERVICE_CATALOG.findIndex((item) => serviceKey(item.service) === key);
  return index < 0 ? 999 : index;
}
function linesForProject(records: Row[], adjustments: Row[]): EditLine[] {
  const existing = records.map((row) => {
    const date = text(pick(row, "Bill_Date", "bill_date")).slice(0, 10) || today();
    const category = categoryOf(row);
    const service = serviceText(pick(row, "Description", "description"));
    const discount = Math.max(0, num(pick(row, "Discount", "discount")));
    const notes = text(pick(row, "Notes", "notes"));
    return {
      key: billId(row), billId: billId(row), isNew: false, isDraft: isDraft(row), template: false, removed: false,
      date, category, service,
      gross: String(Math.max(0, num(pick(row, "Amount", "amount")))),
      discount: String(discount), savedDiscount: discount, notes,
      currentNet: effectiveNet(row, adjustments),
      originalDate: date, originalCategory: category, originalService: service, originalNotes: notes,
    } satisfies EditLine;
  });

  const used = new Set(existing.map((line) => serviceKey(line.service)).filter(Boolean));
  const defaultDraft = records.length ? records.every(isDraft) : true;
  const defaultDate = existing.map((line) => line.date).filter(Boolean).sort().at(-1) || today();
  const templates = SERVICE_CATALOG.filter((item) => !used.has(serviceKey(item.service))).map((item, index) => ({
    key: `template-${index}-${serviceKey(item.service)}`,
    billId: "", isNew: true, isDraft: defaultDraft, template: true, removed: false,
    date: defaultDate, category: item.category, service: item.service, gross: "", discount: "0", savedDiscount: 0, notes: "", currentNet: 0,
    originalDate: defaultDate, originalCategory: item.category, originalService: item.service, originalNotes: "",
  } satisfies EditLine));

  return [...existing, ...templates].sort((a, b) =>
    categoryRank(a.category) - categoryRank(b.category)
    || catalogRank(a.service) - catalogRank(b.service)
    || a.service.localeCompare(b.service)
    || a.date.localeCompare(b.date)
  );
}
function targetNet(line: EditLine) {
  if (line.removed) return 0;
  const gross = Math.max(0, num(line.gross));
  const desiredDiscount = Math.min(gross, Math.max(0, num(line.discount)));
  if (line.isNew || line.isDraft) return Math.max(0, gross - desiredDiscount);
  return Math.max(0, line.currentNet - (desiredDiscount - line.savedDiscount));
}
function isUsedLine(line: EditLine) {
  return !line.removed && (!line.isNew || num(line.gross) > 0);
}
function metadataChanged(line: EditLine) {
  return line.date !== line.originalDate
    || line.category !== line.originalCategory
    || line.service.trim() !== line.originalService.trim()
    || line.notes.trim() !== line.originalNotes.trim();
}
async function readJson(response: Response, fallback: string): Promise<unknown> {
  const raw = await response.text();
  let json: ApiEnvelope | null = null;
  try { json = raw ? JSON.parse(raw) as ApiEnvelope : null; } catch { json = null; }
  if (!response.ok || !json?.success) throw new Error(json?.error || fallback);
  return json.data ?? json;
}

export default function FullBillEditorPage() {
  const [fileId, setFileId] = useState("");
  const [records, setRecords] = useState<Row[]>([]);
  const [adjustments, setAdjustments] = useState<Row[]>([]);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [wholeDiscount, setWholeDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [search, setSearch] = useState("");
  const [showUnused, setShowUnused] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const summary = useMemo(() => {
    const active = lines.filter(isUsedLine);
    return {
      services: active.length,
      gross: active.reduce((sum, line) => sum + Math.max(0, num(line.gross)), 0),
      discount: active.reduce((sum, line) => sum + Math.max(0, num(line.discount)), 0),
      current: lines.filter((line) => !line.isNew && !line.removed).reduce((sum, line) => sum + line.currentNet, 0),
      revised: active.reduce((sum, line) => sum + targetNet(line), 0),
    };
  }, [lines]);

  const visibleLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((line) => showUnused || !line.isNew || num(line.gross) > 0).filter((line) => {
      if (!q) return true;
      return [line.service, line.category, line.billId, line.notes].some((value) => text(value).toLowerCase().includes(q));
    });
  }, [lines, search, showUnused]);

  const load = useCallback(async (raw: string) => {
    const id = projectCode(raw);
    if (!id) { setError("Enter a valid File ID, for example LV-157."); return; }
    setFileId(id); setLoading(true); setError(""); setMessage("");
    try {
      const [billRowsRaw, adjustmentRowsRaw] = await Promise.all([
        landViewApi.getBillingRecords(id),
        readJson(await fetch(`/api/billing/adjustments?projectId=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" }), "Could not load bill adjustments."),
      ]);
      const billRows = Array.isArray(billRowsRaw)
        ? billRowsRaw.filter((row) => !/credit note|debit note/i.test(text(pick(row as Row, "Created_Via", "created_via")))) as Row[]
        : [];
      const adjustmentRows = Array.isArray(adjustmentRowsRaw) ? adjustmentRowsRaw as Row[] : [];
      setRecords(billRows);
      setAdjustments(adjustmentRows);
      setLines(linesForProject(billRows, adjustmentRows));
      setWholeDiscount("");
      setDiscountReason("");
      const url = new URL(window.location.href);
      url.searchParams.set("fileId", id);
      window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the finance record.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const id = projectCode(new URLSearchParams(window.location.search).get("fileId") || "");
    if (!id) return;
    const timer = window.setTimeout(() => { void load(id); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function patchLine(key: string, patch: Partial<EditLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }
  function addCustomLine() {
    const defaultDraft = records.length ? records.every(isDraft) : true;
    const date = lines[0]?.date || today();
    setLines((current) => [...current, {
      key: `custom-${crypto.randomUUID()}`, billId: "", isNew: true, isDraft: defaultDraft, template: false, removed: false,
      date, category: "Engineering Bill", service: "", gross: "", discount: "0", savedDiscount: 0, notes: "", currentNet: 0,
      originalDate: date, originalCategory: "Engineering Bill", originalService: "", originalNotes: "",
    }]);
  }
  function applyDateToAll(date: string) {
    if (!date) return;
    setLines((current) => current.map((line) => ({ ...line, date })));
  }
  function clearNewLine(key: string) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, gross: "", discount: "0", notes: "", removed: false } : line));
  }
  function applyWholeDiscount() {
    const amount = Math.round(Math.max(0, num(wholeDiscount)) * 100) / 100;
    const candidates = lines.filter((line) => isUsedLine(line) && Math.max(0, num(line.gross) - num(line.discount)) > 0.009);
    const capacity = candidates.reduce((sum, line) => sum + Math.max(0, num(line.gross) - num(line.discount)), 0);
    if (!candidates.length || !(amount > 0) || amount > capacity + .01) {
      setError("Enter an additional bill discount greater than zero and not more than the remaining gross value.");
      return;
    }
    const shares = new Map<string, number>();
    let allocated = 0;
    candidates.forEach((line, index) => {
      const lineCapacity = Math.max(0, num(line.gross) - num(line.discount));
      const share = index === candidates.length - 1
        ? Math.round((amount - allocated) * 100) / 100
        : Math.round((amount * lineCapacity / capacity) * 100) / 100;
      allocated += share;
      shares.set(line.key, Math.min(lineCapacity, share));
    });
    setLines((current) => current.map((line) => {
      const share = shares.get(line.key);
      return share === undefined ? line : { ...line, discount: String(Math.round((num(line.discount) + share) * 100) / 100) };
    }));
    setError("");
    setMessage(`${money(amount)} additional discount distributed across ${candidates.length} service${candidates.length === 1 ? "" : "s"}. Review the Discount column, then Save Whole Bill.`);
  }

  async function save() {
    if (!fileId || !lines.length || saving) return;
    const active = lines.filter(isUsedLine);
    for (const line of active) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(line.date)) { setError(`Choose a valid date for ${line.service || "the service"}.`); return; }
      if (!line.service.trim()) { setError("Every active service row needs a service / description."); return; }
      const gross = num(line.gross);
      const discount = num(line.discount);
      if (!(gross > 0)) { setError(`Enter a valid amount for ${line.service}.`); return; }
      if (discount < 0 || discount > gross) { setError(`Discount for ${line.service} must be between zero and ${money(gross)}.`); return; }
    }

    setSaving(true); setError(""); setMessage("");
    let changed = 0;
    try {
      const batchId = crypto.randomUUID();
      for (const [index, line] of lines.entries()) {
        if (line.isNew) {
          if (line.removed || !(num(line.gross) > 0)) continue;
          await readJson(await fetch("/api/billing/write", {
            method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "saveBill", Project_ID: fileId, Bill_Date: line.date,
              Billing_Category: line.category, Category: line.category,
              Description: `[${line.category}] ${line.service.trim()}`,
              Amount: num(line.gross), Discount: num(line.discount),
              Status: line.isDraft ? "Draft" : "Issued", Notes: line.notes.trim(),
              Created_Via: "Full Bill Editor", Idempotency_Key: `direct-full-${batchId}-${index}`,
            }),
          }), "Could not add the new service row.");
          changed += 1;
          continue;
        }

        if (line.isDraft) {
          if (line.removed) {
            await readJson(await fetch("/api/billing/bills", {
              method: "DELETE", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ Bill_ID: line.billId, Project_ID: fileId }),
            }), "Could not remove the draft service row.");
            changed += 1;
            continue;
          }
          const financialChanged = Math.abs(num(line.discount) - line.savedDiscount) > .009 || metadataChanged(line) || Math.abs(num(line.gross) - (line.currentNet + line.savedDiscount)) > .009;
          if (!financialChanged) continue;
          await readJson(await fetch("/api/billing/bills", {
            method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              Bill_ID: line.billId, Project_ID: fileId, Bill_Date: line.date,
              Billing_Category: line.category, Description: line.service.trim(),
              Amount: num(line.gross), Discount: num(line.discount), Notes: line.notes.trim(),
            }),
          }), "Could not update the draft service row.");
          changed += 1;
          continue;
        }

        if (line.removed) {
          if (line.currentNet > .009) {
            await readJson(await fetch("/api/billing/adjustments", {
              method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "create", projectId: fileId, billCode: line.billId,
                type: "Credit Note", amount: line.currentNet,
                reason: "Full bill revision — service removed",
                notes: line.notes.trim() || "Service removed through Full Bill Editor.",
              }),
            }), "Could not remove the issued service financially.");
            changed += 1;
          }
          continue;
        }

        if (metadataChanged(line)) {
          await readJson(await fetch("/api/billing/bills/metadata", {
            method: "PATCH", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              Bill_ID: line.billId, Project_ID: fileId, Bill_Date: line.date,
              Billing_Category: line.category, Description: line.service.trim(), Notes: line.notes.trim(),
            }),
          }), "Could not update issued bill details.");
          changed += 1;
        }

        const desiredDiscount = Math.round(Math.max(0, num(line.discount)) * 100) / 100;
        if (Math.abs(desiredDiscount - line.savedDiscount) > .009) {
          await readJson(await fetch("/api/billing/service-discount", {
            method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: fileId, billCode: line.billId, discount: desiredDiscount,
              reason: discountReason.trim() || "Full Bill Editor service discount",
              notes: line.notes.trim(),
            }),
          }), "Could not update the service discount.");
          changed += 1;
        }
      }

      await load(fileId);
      setMessage(changed
        ? `Full bill saved. ${changed} change${changed === 1 ? "" : "s"} applied across the project in one save.`
        : "No changes were needed. The full bill is already up to date.");
    } catch (cause) {
      const failure = `${changed ? `${changed} change${changed === 1 ? " was" : "s were"} saved before the error. ` : ""}${cause instanceof Error ? cause.message : "Could not save the full bill."}`;
      await load(fileId).catch(() => undefined);
      setError(failure);
    } finally { setSaving(false); }
  }

  return <main className="fbe">
    <style>{`
      .fbe{max-width:1550px;margin:0 auto;color:var(--lv-text-primary)}.fbe *{box-sizing:border-box}.fbe-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;margin-bottom:14px}.fbe-head small{display:block;color:var(--lv-brand-text);font-size:8px;font-weight:950;letter-spacing:.13em}.fbe-head h1{margin:5px 0 3px;font-size:28px}.fbe-head p{margin:0;color:var(--lv-text-muted);font-size:9px;max-width:860px;line-height:1.55}.fbe-actions,.fbe-toolbar-left,.fbe-discount{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.fbe-btn{min-height:36px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px;font-weight:900;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.fbe-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.fbe-btn.danger{color:var(--lv-danger);border-color:var(--lv-danger)}.fbe-btn:disabled{opacity:.5;cursor:not-allowed}.fbe input,.fbe select,.fbe textarea{border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font:inherit}.fbe-picker{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:7px;padding:11px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);margin-bottom:12px}.fbe-picker input{min-height:39px;padding:8px 10px}.fbe-msg{padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:9px}.fbe-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.fbe-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.fbe-panel{border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);overflow:hidden}.fbe-toolbar{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 11px;border-bottom:1px solid var(--lv-border-default);flex-wrap:wrap}.fbe-toolbar input,.fbe-discount input{min-height:34px;padding:6px 8px;font-size:8px}.fbe-toolbar-search{min-width:220px}.fbe-discount{padding:9px 11px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-brand-soft)}.fbe-discount input.amount{width:140px}.fbe-discount input.reason{min-width:260px;flex:1}.fbe-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;padding:10px 11px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.fbe-kpi{padding:8px;border:1px solid var(--lv-border-subtle);border-radius:7px;background:var(--lv-surface-panel)}.fbe-kpi span{display:block;font-size:6px;text-transform:uppercase;color:var(--lv-text-muted);font-weight:950}.fbe-kpi strong{display:block;margin-top:4px;font-size:12px}.fbe-kpi.revised strong{color:var(--lv-brand-text)}.fbe-table-wrap{overflow:auto}.fbe-table{width:100%;border-collapse:collapse;min-width:1160px}.fbe-table th,.fbe-table td{padding:7px;border-bottom:1px solid var(--lv-border-subtle);vertical-align:top}.fbe-table th{background:var(--lv-surface-muted);font-size:7px;text-transform:uppercase;color:var(--lv-text-muted);text-align:left;position:sticky;top:0;z-index:1}.fbe-table input,.fbe-table select,.fbe-table textarea{width:100%;min-height:35px;padding:6px 7px;font-size:8px}.fbe-table textarea{min-height:42px;resize:vertical}.fbe-service{min-width:190px}.fbe-money{width:120px}.fbe-date{width:118px}.fbe-category{width:150px}.fbe-state{width:120px}.fbe-notes{min-width:180px}.fbe-action{width:82px}.fbe-lock{font-size:7px;color:var(--lv-text-muted);line-height:1.35}.fbe-badge{display:inline-flex;min-height:22px;align-items:center;padding:0 7px;border-radius:999px;background:var(--lv-surface-muted);font-size:7px;font-weight:950}.fbe-badge.issued{color:var(--lv-warning)}.fbe-badge.available{color:var(--lv-text-muted)}.fbe-line-template{background:color-mix(in srgb,var(--lv-surface-muted) 45%,transparent)}.fbe-line-removed{opacity:.5}.fbe-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px}.fbe-footer small{color:var(--lv-text-muted);font-size:8px;max-width:760px}@media(max-width:850px){.fbe-head{align-items:flex-start;flex-direction:column}.fbe-actions{width:100%}.fbe-actions .fbe-btn{flex:1}.fbe-kpis{grid-template-columns:repeat(2,1fr)}.fbe-picker{grid-template-columns:1fr}.fbe-footer{align-items:stretch;flex-direction:column}.fbe-footer .fbe-btn{width:100%}.fbe-discount{display:grid;grid-template-columns:1fr}.fbe-discount input.amount,.fbe-discount input.reason{width:100%;min-width:0}.fbe-toolbar{align-items:stretch}.fbe-toolbar-left{width:100%}.fbe-toolbar-search{flex:1;min-width:140px}}
    `}</style>

    <header className="fbe-head">
      <div><small>FINANCE / FULL BILL CONTROL</small><h1>Full Bill Editor</h1><p>Open a File ID once and edit every service bill for that project together. Existing services load automatically, standard missing services are already listed, and service discounts can be typed directly without selecting a separate discount mode.</p></div>
      <div className="fbe-actions"><Link className="fbe-btn" href="/admin/finance/direct-bill">+ New Full Bill</Link><Link className="fbe-btn" href="/admin/finance/invoices">Generate Invoice</Link><Link className="fbe-btn" href="/admin/finance/service-payments">Add Payment</Link></div>
    </header>

    <section className="fbe-picker">
      <input value={fileId} onChange={(event) => setFileId(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(fileId); }} placeholder="Enter File ID — e.g. LV-157"/>
      <button className="fbe-btn primary" onClick={() => void load(fileId)} disabled={loading}>{loading ? "Loading…" : "Open Full Bill"}</button>
    </section>

    {error ? <div className="fbe-msg bad">{error}</div> : null}
    {message ? <div className="fbe-msg good">{message}</div> : null}

    <section className="fbe-panel">
      <div className="fbe-toolbar">
        <div className="fbe-toolbar-left">
          <button className="fbe-btn" onClick={addCustomLine} disabled={!fileId}>+ Custom Service</button>
          <input type="date" defaultValue={lines[0]?.date || ""} onChange={(event) => applyDateToAll(event.target.value)} title="Apply this date to every service row"/>
          <input className="fbe-toolbar-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search service / bill"/>
          <button className="fbe-btn" onClick={() => setShowUnused((value) => !value)} disabled={!lines.length}>{showUnused ? "Hide Unused Services" : "Show All Services"}</button>
        </div>
        <button className="fbe-btn primary" onClick={() => void save()} disabled={saving || !lines.length}>{saving ? "Saving Full Bill…" : "Save Whole Bill"}</button>
      </div>

      <div className="fbe-discount">
        <strong style={{fontSize:8}}>Additional Whole Bill Discount</strong>
        <input className="amount" inputMode="decimal" placeholder="Amount" value={wholeDiscount} onChange={(event) => setWholeDiscount(event.target.value)}/>
        <input className="reason" placeholder="Reason / offer / negotiation note" value={discountReason} onChange={(event) => setDiscountReason(event.target.value)}/>
        <button className="fbe-btn" onClick={applyWholeDiscount} disabled={!summary.services}>Distribute Automatically</button>
      </div>

      <div className="fbe-kpis">
        <div className="fbe-kpi"><span>Active Services</span><strong>{summary.services}</strong></div>
        <div className="fbe-kpi"><span>Gross</span><strong>{money(summary.gross)}</strong></div>
        <div className="fbe-kpi"><span>Discount</span><strong>{money(summary.discount)}</strong></div>
        <div className="fbe-kpi"><span>Current Net</span><strong>{money(summary.current)}</strong></div>
        <div className="fbe-kpi revised"><span>Revised Net</span><strong>{money(summary.revised)}</strong></div>
      </div>

      <div className="fbe-table-wrap">
        {!lines.length ? <div style={{padding:28,textAlign:"center",fontSize:9,color:"var(--lv-text-muted)"}}>Open a File ID to load its complete bill.</div> : <table className="fbe-table">
          <thead><tr><th>State</th><th>Date</th><th>Category</th><th>Service</th><th>Gross</th><th>Discount</th><th>Net</th><th>Notes</th><th>Action</th></tr></thead>
          <tbody>{visibleLines.map((line) => <tr key={line.key} className={`${line.template && !(num(line.gross) > 0) ? "fbe-line-template" : ""} ${line.removed ? "fbe-line-removed" : ""}`}>
            <td className="fbe-state">
              <span className={`fbe-badge ${line.isNew ? "available" : line.isDraft ? "" : "issued"}`}>{line.isNew ? (num(line.gross) > 0 ? (line.isDraft ? "NEW DRAFT" : "NEW ISSUE") : "AVAILABLE") : line.isDraft ? "DRAFT" : "ISSUED"}</span>
              <div className="fbe-lock" style={{marginTop:5}}>{line.billId || (line.isDraft ? "Enter amount to add as Draft" : "Enter amount to add as Issued")}</div>
            </td>
            <td className="fbe-date"><input type="date" value={line.date} disabled={line.removed} onChange={(event) => patchLine(line.key,{date:event.target.value})}/></td>
            <td className="fbe-category"><select value={line.category} disabled={line.removed} onChange={(event) => patchLine(line.key,{category:event.target.value as BillCategory})}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></td>
            <td className="fbe-service"><input value={line.service} disabled={line.removed} onChange={(event) => patchLine(line.key,{service:event.target.value})}/></td>
            <td className="fbe-money">{line.isDraft || line.isNew ? <input inputMode="decimal" placeholder={line.isNew ? "Enter amount if needed" : "Gross"} value={line.gross} disabled={line.removed} onChange={(event) => patchLine(line.key,{gross:event.target.value})}/> : <><strong>{money(line.gross)}</strong><div className="fbe-lock">Issued gross preserved</div></>}</td>
            <td className="fbe-money"><input inputMode="decimal" value={line.discount} disabled={line.removed || (line.isNew && !(num(line.gross) > 0))} onChange={(event) => patchLine(line.key,{discount:event.target.value})}/><div className="fbe-lock">Direct service discount</div></td>
            <td className="fbe-money"><strong>{money(targetNet(line))}</strong>{!line.isNew ? <div className="fbe-lock">Current {money(line.currentNet)}</div> : null}</td>
            <td className="fbe-notes"><textarea value={line.notes} disabled={line.removed} placeholder="Optional note" onChange={(event) => patchLine(line.key,{notes:event.target.value})}/></td>
            <td className="fbe-action">{line.isNew ? (num(line.gross) > 0 || (!line.template && (line.service || line.notes)) ? <button className="fbe-btn" onClick={() => clearNewLine(line.key)}>Clear</button> : <span className="fbe-lock">Ready</span>) : <button className={`fbe-btn ${line.removed ? "" : "danger"}`} onClick={() => patchLine(line.key,{removed:!line.removed})}>{line.removed ? "Restore" : "Remove"}</button>}</td>
          </tr>)}</tbody>
        </table>}
      </div>

      <div className="fbe-footer">
        <small>Normal service discounts are stored directly on the original service bill and remain visible on the invoice line. Blank standard services are ignored until you enter an amount. Save Whole Bill processes only rows that actually changed.</small>
        <button className="fbe-btn primary" onClick={() => void save()} disabled={saving || !lines.length}>{saving ? "Saving…" : "Save Whole Bill"}</button>
      </div>
    </section>
  </main>;
}
