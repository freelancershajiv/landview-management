"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { landViewApi } from "@/lib/api";
import {
  BILL_CATEGORIES,
  BILL_SERVICE_CATALOG,
  type BillCategory,
  type BillEntryMode,
  entryModeFromStored,
  normalizedBillPricing,
  numberValue,
  serviceDefinition,
} from "@/lib/billing-entry";

type Row = Record<string, unknown>;
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
  entryMode: BillEntryMode;
  quantity: string;
  unitPrice: string;
  gross: string;
  discount: string;
  savedDiscount: number;
  notes: string;
  currentNet: number;
  originalDate: string;
  originalStoredDate: string;
  originalStatus: string;
  originalCategory: BillCategory;
  originalService: string;
  originalNotes: string;
  originalGross: number;
  originalQuantity: number;
  originalUnitPrice: number;
};

function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown) { return numberValue(value); }
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
  return match ? `LV-${String(Number(match[1])).padStart(3, "0")}` : "";
}
function billId(row: Row) { return text(pick(row, "Bill_ID", "bill_code")); }
function billStatus(row: Row) { return text(pick(row, "Status", "status")) || "Issued"; }
function isDraft(row: Row) { return billStatus(row).toLowerCase() === "draft"; }
function categoryOf(row: Row): BillCategory {
  const raw = text(pick(row, "Billing_Category", "billing_category", "Category", "category"));
  if (raw === "Design Books") return "Engineering Bill";
  return BILL_CATEGORIES.includes(raw as BillCategory) ? raw as BillCategory : "Engineering Bill";
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
function categoryRank(category: BillCategory) { return BILL_CATEGORIES.indexOf(category); }
function catalogRank(service: string) {
  const key = serviceKey(service);
  const index = BILL_SERVICE_CATALOG.findIndex((item) => serviceKey(item.service) === key);
  return index < 0 ? 999 : index;
}
function editableGross(line: EditLine) {
  if (!line.isNew && !line.isDraft) return Math.max(0, num(line.gross));
  return normalizedBillPricing({ mode: line.entryMode, quantity: line.quantity, unitPrice: line.unitPrice, amount: line.gross }).gross;
}
function pricingFor(line: EditLine) {
  if (!line.isNew && !line.isDraft) {
    const gross = Math.max(0, num(line.gross));
    return {
      gross,
      quantity: line.originalQuantity > 0 ? line.originalQuantity : 1,
      unitPrice: line.originalUnitPrice > 0 ? line.originalUnitPrice : gross,
    };
  }
  return normalizedBillPricing({ mode: line.entryMode, quantity: line.quantity, unitPrice: line.unitPrice, amount: line.gross });
}
function linesForProject(records: Row[], adjustments: Row[]): EditLine[] {
  const existing = records.map((row) => {
    const storedDate = text(pick(row, "Bill_Date", "bill_date")).slice(0, 10);
    const date = storedDate || today();
    const category = categoryOf(row);
    const service = serviceText(pick(row, "Description", "description"));
    const discount = Math.max(0, num(pick(row, "Discount", "discount")));
    const notes = text(pick(row, "Notes", "notes"));
    const gross = Math.max(0, num(pick(row, "Amount", "amount")));
    const quantity = Math.max(0, num(pick(row, "Quantity", "quantity", "QTY")));
    const unitPrice = Math.max(0, num(pick(row, "Unit_Price", "unit_price", "Rate")));
    const mode = entryModeFromStored(quantity, unitPrice);
    return {
      key: billId(row), billId: billId(row), isNew: false, isDraft: isDraft(row), template: false, removed: false,
      date, category, service, entryMode: mode,
      quantity: String(quantity || 1), unitPrice: unitPrice > 0 ? String(unitPrice) : "", gross: String(gross),
      discount: String(discount), savedDiscount: discount, notes,
      currentNet: effectiveNet(row, adjustments),
      originalDate: date, originalStoredDate: storedDate, originalStatus: billStatus(row), originalCategory: category, originalService: service, originalNotes: notes,
      originalGross: gross, originalQuantity: quantity, originalUnitPrice: unitPrice,
    } satisfies EditLine;
  });

  const used = new Set(existing.map((line) => serviceKey(line.service)).filter(Boolean));
  const defaultDraft = records.length ? records.every(isDraft) : true;
  const defaultDate = existing.map((line) => line.date).filter(Boolean).sort().at(-1) || today();
  const templates = BILL_SERVICE_CATALOG.filter((item) => !used.has(serviceKey(item.service))).map((item, index) => ({
    key: `template-${index}-${serviceKey(item.service)}`,
    billId: "", isNew: true, isDraft: defaultDraft, template: true, removed: false,
    date: defaultDate, category: item.category, service: item.service, entryMode: item.defaultMode,
    quantity: "1", unitPrice: "", gross: "", discount: "0", savedDiscount: 0, notes: "", currentNet: 0,
    originalDate: defaultDate, originalStoredDate: "", originalStatus: "", originalCategory: item.category, originalService: item.service, originalNotes: "",
    originalGross: 0, originalQuantity: 0, originalUnitPrice: 0,
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
  const gross = editableGross(line);
  const desiredDiscount = Math.min(gross, Math.max(0, num(line.discount)));
  if (line.isNew || line.isDraft) return Math.max(0, gross - desiredDiscount);
  return Math.max(0, line.currentNet - (desiredDiscount - line.savedDiscount));
}
function isUsedLine(line: EditLine) {
  return !line.removed && (!line.isNew || editableGross(line) > 0);
}
function metadataChanged(line: EditLine) {
  return line.date !== line.originalDate
    || line.category !== line.originalCategory
    || line.service.trim() !== line.originalService.trim()
    || line.notes.trim() !== line.originalNotes.trim();
}
function pricingChanged(line: EditLine) {
  const pricing = pricingFor(line);
  return Math.abs(pricing.gross - line.originalGross) > .009
    || Math.abs(pricing.quantity - line.originalQuantity) > .009
    || Math.abs(pricing.unitPrice - line.originalUnitPrice) > .009;
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
  const [lines, setLines] = useState<EditLine[]>([]);
  const [wholeDiscount, setWholeDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [search, setSearch] = useState("");
  const [showUnused, setShowUnused] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [revisions, setRevisions] = useState<Row[]>([]);
  const [pendingNotice, setPendingNotice] = useState(false);
  const pendingRevision = useRef<{ id: string; fingerprint: string; projectCode: string } | null>(null);
  const savingRef = useRef(false);
  const pendingStorageKey = "lv-full-bill-editor-42";
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(pendingStorageKey);
      const item = saved ? JSON.parse(saved) : null;
      if (item && typeof item.id === "string" && typeof item.fingerprint === "string" &&
          typeof item.projectCode === "string" && item.createdAt > Date.now() - 86400000) {
        pendingRevision.current = { id: item.id, fingerprint: item.fingerprint, projectCode: item.projectCode };
        window.setTimeout(() => setPendingNotice(true), 0);
      }
    } catch { /* Browser storage may be disabled; in-memory identity still works. */ }
  }, []);
  function forgetPendingRevision() {
    pendingRevision.current = null;
    setPendingNotice(false);
    try { window.sessionStorage.removeItem(pendingStorageKey); } catch { /* Ignore storage restrictions. */ }
  }
  async function verifyPendingRevision() {
    const pending = pendingRevision.current;
    if (!pending) return;
    setError(""); setMessage(""); setLoading(true);
    try {
      const url = `/api/billing/full-revision-v42?projectId=${encodeURIComponent(pending.projectCode)}&requestId=${encodeURIComponent(pending.id)}`;
      const result = await readJson(await fetch(url, { credentials: "same-origin", cache: "no-store" }), "Could not verify earlier revision.") as Row;
      if (result.found) {
        forgetPendingRevision();
        await load(pending.projectCode);
        setMessage("The previous atomic revision is already recorded. No duplicate service rows were created.");
      } else {
        setError("No matching revision was recorded. Retry the SAME unchanged revision or inspect the invoice history before starting a different save.");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not confirm earlier revision."); }
    finally { setLoading(false); }
  }
  function startDifferentRevisionAfterReview() {
    if (!window.confirm("Confirm you checked the bill and invoice history for the prior save. Start a different revision?")) return;
    forgetPendingRevision();
    setError("Previous request cleared after review. Confirm the loaded bill amounts before submitting another revision.");
  }

  const summary = useMemo(() => {
    const active = lines.filter(isUsedLine);
    return {
      services: active.length,
      gross: active.reduce((sum, line) => sum + editableGross(line), 0),
      discount: active.reduce((sum, line) => sum + Math.max(0, num(line.discount)), 0),
      current: lines.filter((line) => !line.isNew && !line.removed).reduce((sum, line) => sum + line.currentNet, 0),
      revised: active.reduce((sum, line) => sum + targetNet(line), 0),
    };
  }, [lines]);

  const visibleLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((line) => showUnused || !line.isNew || editableGross(line) > 0).filter((line) => {
      if (!q) return true;
      return [line.service, line.category, line.billId, line.notes].some((value) => text(value).toLowerCase().includes(q));
    });
  }, [lines, search, showUnused]);

  const load = useCallback(async (raw: string) => {
    const id = projectCode(raw);
    if (!id) { setError("Enter a valid File ID, for example LV-157."); return; }
    setFileId(id); setLoading(true); setError(""); setMessage("");
    try {
      const [billRowsRaw, adjustmentRowsRaw, revisionHistory] = await Promise.all([
        landViewApi.getBillingRecords(id),
        readJson(await fetch(`/api/billing/adjustments?projectId=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" }), "Could not load bill adjustments."),
        readJson(await fetch(`/api/billing/full-revision-v42?projectId=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" }), "Could not load bill revision history."),
      ]);
      const billRows = Array.isArray(billRowsRaw)
        ? billRowsRaw.filter((row) => !/credit note|debit note/i.test(text(pick(row as Row, "Created_Via", "created_via")))
            && !["void","voided","cancelled","canceled"].includes(billStatus(row as Row).toLowerCase())) as Row[]
        : [];
      const adjustmentRows = Array.isArray(adjustmentRowsRaw) ? adjustmentRowsRaw as Row[] : [];
      setRecords(billRows);
      setLines(linesForProject(billRows, adjustmentRows));
      setRevisions(Array.isArray((revisionHistory as Row)?.revisions) ? (revisionHistory as Row).revisions as Row[] : []);
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
  function patchService(key: string, service: string) {
    setLines((current) => current.map((line) => {
      if (line.key !== key) return line;
      const definition = serviceDefinition(service);
      if (!definition || (!line.isNew && !line.isDraft)) return { ...line, service };
      return { ...line, service, category: definition.category, entryMode: definition.defaultMode };
    }));
  }
  function patchCategory(key: string, category: BillCategory) {
    setLines((current) => current.map((line) => {
      if (line.key !== key) return line;
      if (serviceDefinition(line.service)) return line;
      return { ...line, category, entryMode: (line.isNew || line.isDraft) && category === "Other Services Bill" && !line.gross && !line.unitPrice ? "quantity_rate" : line.entryMode };
    }));
  }
  function addCustomLine() {
    const defaultDraft = records.length ? records.every(isDraft) : true;
    const date = lines[0]?.date || today();
    setLines((current) => [...current, {
      key: `custom-${crypto.randomUUID()}`, billId: "", isNew: true, isDraft: defaultDraft, template: false, removed: false,
      date, category: "Engineering Bill", service: "", entryMode: "flat_amount", quantity: "1", unitPrice: "", gross: "", discount: "0", savedDiscount: 0, notes: "", currentNet: 0,
      originalDate: date, originalStoredDate: "", originalStatus: "", originalCategory: "Engineering Bill", originalService: "", originalNotes: "", originalGross: 0, originalQuantity: 0, originalUnitPrice: 0,
    }]);
  }
  function applyDateToAll(date: string) {
    if (!date) return;
    setLines((current) => current.map((line) => ({ ...line, date })));
  }
  function clearNewLine(key: string) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, quantity: "1", unitPrice: "", gross: "", discount: "0", notes: "", removed: false } : line));
  }
  function applyWholeDiscount() {
    const amount = Math.round(Math.max(0, num(wholeDiscount)) * 100) / 100;
    const candidates = lines.filter((line) => isUsedLine(line) && Math.max(0, editableGross(line) - num(line.discount)) > 0.009);
    const capacity = candidates.reduce((sum, line) => sum + Math.max(0, editableGross(line) - num(line.discount)), 0);
    if (!candidates.length || !(amount > 0) || amount > capacity + .01) {
      setError("Enter an additional bill discount greater than zero and not more than the remaining gross value.");
      return;
    }
    const shares = new Map<string, number>();
    let allocated = 0;
    candidates.forEach((line, index) => {
      const lineCapacity = Math.max(0, editableGross(line) - num(line.discount));
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
    if (!fileId || !lines.length || savingRef.current || saving) return;
    const active = lines.filter(isUsedLine);
    for (const line of active) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(line.date)) { setError(`Choose a valid date for ${line.service || "the service"}.`); return; }
      if (!line.service.trim()) { setError("Every active service row needs a service / description."); return; }
      const pricing = pricingFor(line);
      const discount = num(line.discount);
      if ((line.isNew || line.isDraft) && line.entryMode === "quantity_rate" && !(num(line.quantity) > 0)) { setError(`Quantity for ${line.service} must be greater than zero.`); return; }
      if ((line.isNew || line.isDraft) && line.entryMode === "quantity_rate" && !(num(line.unitPrice) > 0)) { setError(`Enter a valid unit rate for ${line.service}.`); return; }
      if (!(pricing.gross > 0)) { setError(`Enter a valid amount for ${line.service}.`); return; }
      if (discount < 0 || discount > pricing.gross) { setError(`Discount for ${line.service} must be between zero and ${money(pricing.gross)}.`); return; }
    }
    const reason = revisionReason.trim();
    if (reason.length < 12) { setError("Enter an evidence-based revision reason (at least 12 characters)."); return; }

    const operations: Row[] = [];
    for (const line of lines) {
      const newGross = editableGross(line);
      const pricing = pricingFor(line);
      if (line.isNew && (line.removed || newGross < .01)) continue;
      const next = {
        date: (!line.isNew && !line.isDraft && line.date === line.originalDate) ? line.originalStoredDate : line.date,
        category: line.category,
        service: line.service.trim(),
        notes: line.notes.trim(),
        gross: line.isNew || line.isDraft ? pricing.gross : line.originalGross,
        discount: Math.round(num(line.discount) * 100) / 100,
        quantity: line.isNew || line.isDraft ? pricing.quantity : line.originalQuantity,
        unitPrice: line.isNew || line.isDraft ? pricing.unitPrice : line.originalUnitPrice,
        status: line.isNew ? (line.isDraft ? "Draft" : "Issued") : line.originalStatus,
      };
      if (line.isNew) {
        operations.push({ kind: "create", next });
        continue;
      }
      const expected = {
        status: line.originalStatus, date: line.originalStoredDate, category: line.originalCategory,
        service: line.originalService, notes: line.originalNotes,
        gross: line.originalGross, discount: line.savedDiscount,
        quantity: line.originalQuantity, unitPrice: line.originalUnitPrice,
        effectiveNet: line.currentNet,
      };
      if (line.isDraft) {
        if (line.removed) operations.push({ kind: "draft_void", billCode: line.billId, expected });
        else if (Math.abs(num(line.discount) - line.savedDiscount) > .009 || metadataChanged(line) || pricingChanged(line))
          operations.push({ kind: "draft_update", billCode: line.billId, expected, next });
      } else if (line.removed) {
        if (line.currentNet > .009) operations.push({ kind: "issued_remove", billCode: line.billId, expected });
      } else if (Math.abs(num(line.discount) - line.savedDiscount) > .009 || metadataChanged(line)) {
        operations.push({ kind: "issued_revision", billCode: line.billId, expected, next });
      }
    }
    if (!operations.length) { setError(""); setMessage("No changes are needed. The full bill is already up to date."); return; }
    if (operations.length > 60) { setError("Only 60 changed service rows may be submitted in one revision."); return; }

    savingRef.current = true;
    setSaving(true); setError(""); setMessage("");
    try {
      const body = { projectId: fileId, reason, operations };
      const bytes = new TextEncoder().encode(JSON.stringify(body));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const fingerprint = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
      const previous = pendingRevision.current;
      if (previous && (previous.projectCode !== fileId || previous.fingerprint !== fingerprint))
        throw new Error("An earlier revision is unresolved. Check that revision before editing a different project or amount.");

      const requestId = previous?.id || crypto.randomUUID();
      const endpoint = "/api/billing/full-revision-v42";
      const request = (preview: boolean) => fetch(endpoint, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, requestId, preview }),
      });
      const preview = await readJson(await request(true), "Revision preview failed.") as Row;
      if (!preview?.valid) throw new Error("Server could not validate all changed rows. Nothing was saved.");
      if (!window.confirm(`Apply ${operations.length} change${operations.length === 1 ? "" : "s"} as ONE atomic revision for ${fileId}?\n\nRevised total: ${money(summary.revised)}\nOriginal bill records and audit history are retained. This cannot be undone automatically.`)) return;

      if (!previous) {
        pendingRevision.current = { id: requestId, fingerprint, projectCode: fileId };
        setPendingNotice(true);
        try { window.sessionStorage.setItem(pendingStorageKey, JSON.stringify({
          id: requestId, fingerprint, projectCode: fileId, createdAt: Date.now(),
        })); } catch { /* In-memory identity remains. */ }
      }
      const saved = await readJson(await request(false), "The full bill revision could not be confirmed.") as Row;
      forgetPendingRevision();
      await load(fileId);
      setRevisionReason("");
      setMessage(saved.recovered
        ? `Revision ${requestId} was already recorded. No duplicate invoice or credit note was created.`
        : `Atomic revision saved: ${saved.changeCount || operations.length} change${operations.length === 1 ? "" : "s"} with before/after history. All changes committed together.`);
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Could not confirm the full bill revision."} No partial revision is allowed. Verify revision history before another submission.`);
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <main className="fbe">
    <style>{`
      .fbe{max-width:1700px;margin:0 auto;color:var(--lv-text-primary)}.fbe *{box-sizing:border-box}.fbe-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;margin-bottom:14px}.fbe-head small{display:block;color:var(--lv-brand-text);font-size:8px;font-weight:950;letter-spacing:.13em}.fbe-head h1{margin:5px 0 3px;font-size:28px}.fbe-head p{margin:0;color:var(--lv-text-muted);font-size:9px;max-width:900px;line-height:1.55}.fbe-actions,.fbe-toolbar-left,.fbe-discount{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.fbe-btn{min-height:36px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px;font-weight:900;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.fbe-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.fbe-btn.danger{color:var(--lv-danger);border-color:var(--lv-danger)}.fbe-btn:disabled{opacity:.5;cursor:not-allowed}.fbe input,.fbe select,.fbe textarea{border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font:inherit}.fbe-picker{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:7px;padding:11px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);margin-bottom:12px}.fbe-picker input{min-height:39px;padding:8px 10px}.fbe-msg{padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:9px}.fbe-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.fbe-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.fbe-panel{border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);overflow:hidden}.fbe-toolbar{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 11px;border-bottom:1px solid var(--lv-border-default);flex-wrap:wrap}.fbe-toolbar input,.fbe-discount input{min-height:34px;padding:6px 8px;font-size:8px}.fbe-toolbar-search{min-width:220px}.fbe-discount{padding:9px 11px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-brand-soft)}.fbe-discount input.amount{width:140px}.fbe-discount input.reason{min-width:260px;flex:1}.fbe-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;padding:10px 11px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.fbe-kpi{padding:8px;border:1px solid var(--lv-border-subtle);border-radius:7px;background:var(--lv-surface-panel)}.fbe-kpi span{display:block;font-size:6px;text-transform:uppercase;color:var(--lv-text-muted);font-weight:950}.fbe-kpi strong{display:block;margin-top:4px;font-size:12px}.fbe-kpi.revised strong{color:var(--lv-brand-text)}.fbe-table-wrap{overflow:auto}.fbe-table{width:100%;border-collapse:collapse;min-width:1550px}.fbe-table th,.fbe-table td{padding:7px;border-bottom:1px solid var(--lv-border-subtle);vertical-align:top}.fbe-table th{background:var(--lv-surface-muted);font-size:7px;text-transform:uppercase;color:var(--lv-text-muted);text-align:left;position:sticky;top:0;z-index:1}.fbe-table input,.fbe-table select,.fbe-table textarea{width:100%;min-height:35px;padding:6px 7px;font-size:8px}.fbe-table input:disabled,.fbe-table select:disabled{opacity:.58}.fbe-table textarea{min-height:42px;resize:vertical}.fbe-service{min-width:190px}.fbe-money{width:115px}.fbe-qty{width:78px}.fbe-mode{width:130px}.fbe-date{width:118px}.fbe-category{width:150px}.fbe-state{width:120px}.fbe-notes{min-width:180px}.fbe-action{width:82px}.fbe-lock{font-size:7px;color:var(--lv-text-muted);line-height:1.35}.fbe-badge{display:inline-flex;min-height:22px;align-items:center;padding:0 7px;border-radius:999px;background:var(--lv-surface-muted);font-size:7px;font-weight:950}.fbe-badge.issued{color:var(--lv-warning)}.fbe-badge.available{color:var(--lv-text-muted)}.fbe-line-template{background:color-mix(in srgb,var(--lv-surface-muted) 45%,transparent)}.fbe-line-removed{opacity:.5}.fbe-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px}.fbe-footer small{color:var(--lv-text-muted);font-size:8px;max-width:900px}@media(max-width:850px){.fbe-head{align-items:flex-start;flex-direction:column}.fbe-actions{width:100%}.fbe-actions .fbe-btn{flex:1}.fbe-kpis{grid-template-columns:repeat(2,1fr)}.fbe-picker{grid-template-columns:1fr}.fbe-footer{align-items:stretch;flex-direction:column}.fbe-footer .fbe-btn{width:100%}.fbe-discount{display:grid;grid-template-columns:1fr}.fbe-discount input.amount,.fbe-discount input.reason{width:100%;min-width:0}.fbe-toolbar{align-items:stretch}.fbe-toolbar-left{width:100%}.fbe-toolbar-search{flex:1;min-width:140px}}
      /* Billing 4.2 readability overrides: keep full tables scrollable on phones. */
      .fbe-head small{font-size:11px}.fbe-head p{font-size:13px;line-height:1.5}
      .fbe .fbe-btn{min-height:42px;font-size:12px;padding:8px 13px}
      .fbe .fbe-kpi span,.fbe .fbe-badge,.fbe .fbe-lock,.fbe .fbe-panel small{font-size:11px}
      .fbe .fbe-kpi strong{font-size:17px}
      .fbe .fbe-table th,.fbe .fbe-table td{font-size:12px}
      .fbe .fbe-table th{font-size:11px}
      .fbe .fbe-table input,.fbe .fbe-table select,.fbe .fbe-table textarea,
      .fbe .fbe-toolbar input,.fbe .fbe-discount input,.fbe .fbe-picker input{min-height:42px;font-size:13px}
      .fbe .fbe-msg{font-size:12px}
      .fbe .fbe-revision-panel{margin-top:14px;padding:16px;border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel)}
      .fbe .fbe-revision-panel h2{margin:0 0 7px;font-size:18px}
      .fbe .fbe-revision-panel p,.fbe .fbe-revision-panel label{font-size:12px;color:var(--lv-text-secondary);line-height:1.5}
      .fbe .fbe-revision-reason{width:100%;min-height:76px;padding:10px 12px;font-size:14px;resize:vertical}
      .fbe .fbe-revision-list details{border:1px solid var(--lv-border-default);border-radius:8px;margin-top:8px;padding:10px}
      .fbe .fbe-revision-list summary{cursor:pointer;font-size:13px;font-weight:750}
      .fbe .fbe-revision-list .fbe-history-grid{overflow-x:auto;margin-top:10px}
      .fbe .fbe-revision-list table{border-collapse:collapse;width:100%;min-width:720px}
      .fbe .fbe-revision-list th,.fbe .fbe-revision-list td{text-align:left;padding:9px;border:1px solid var(--lv-border-subtle);font-size:12px}
      .fbe .fbe-revision-list th{background:var(--lv-surface-muted)}
      .fbe .fbe-revision-guard{font-size:12px;line-height:1.5;padding:12px;border-left:3px solid var(--lv-brand-primary);margin-bottom:12px;background:var(--lv-surface-muted)}
      @media(max-width:640px){.fbe .fbe-table input,.fbe .fbe-table select,.fbe .fbe-table textarea,
        .fbe .fbe-revision-reason{font-size:16px}}
    `}</style>

    <header className="fbe-head">
      <div><small>BILLING / ATOMIC FULL BILL CONTROL · V4.2</small><h1>Full Bill Editor</h1><p>Review every service for a File ID, then save all changes together. Issued gross values remain locked; removal of an unpaid issued service creates an auditable credit note. The database commits the entire revision or none of it.</p></div>
      <div className="fbe-actions"><Link className="fbe-btn" href="/admin/billing/direct-bill">+ New Full Bill</Link><Link className="fbe-btn" href="/admin/billing/invoices">Generate Invoice</Link><Link className="fbe-btn" href="/admin/billing/service-payments">Add Payment</Link></div>
    </header>

    <section className="fbe-picker">
      <input value={fileId} onChange={(event) => setFileId(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(fileId); }} placeholder="Enter File ID — e.g. LV-157"/>
      <button className="fbe-btn primary" onClick={() => void load(fileId)} disabled={loading}>{loading ? "Loading…" : "Open Full Bill"}</button>
    </section>

    {pendingNotice && <div className="fbe-revision-guard" role="status">
      <strong>An earlier revision submission needs confirmation.</strong> Check its history before changing amounts or retrying a different batch.
      <div className="fbe-actions" style={{marginTop:9}}>
        <button type="button" className="fbe-btn primary" onClick={() => void verifyPendingRevision()} disabled={saving || loading}>Check earlier revision</button>
        <button type="button" className="fbe-btn" onClick={startDifferentRevisionAfterReview} disabled={saving || loading}>Start different revision after review</button>
      </div>
    </div>}
    {error ? <div className="fbe-msg bad" role="alert">{error}</div> : null}
    {message ? <div className="fbe-msg good" role="status">{message}</div> : null}

    <section className="fbe-panel">
      <div className="fbe-toolbar">
        <div className="fbe-toolbar-left">
          <button className="fbe-btn" onClick={addCustomLine} disabled={!fileId}>+ Custom Service</button>
          <input type="date" defaultValue={lines[0]?.date || ""} onChange={(event) => applyDateToAll(event.target.value)} title="Apply this date to every service row"/>
          <input className="fbe-toolbar-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search service / bill"/>
          <button className="fbe-btn" onClick={() => setShowUnused((value) => !value)} disabled={!lines.length}>{showUnused ? "Hide Unused Services" : "Show All Services"}</button>
        </div>
        <button className="fbe-btn primary" onClick={() => void save()} disabled={saving || loading || !lines.length || revisionReason.trim().length < 12}>{saving ? "Checking / Saving…" : "Preview & Save Revision"}</button>
      </div>

      <div className="fbe-discount">
        <strong style={{fontSize:12}}>Additional Whole Bill Discount</strong>
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

      <datalist id="fbe-service-list">{BILL_SERVICE_CATALOG.map((item) => <option key={item.service} value={item.service}/>)}</datalist>
      <div className="fbe-table-wrap">
        {!lines.length ? <div style={{padding:28,textAlign:"center",fontSize:9,color:"var(--lv-text-muted)"}}>Open a File ID to load its complete bill.</div> : <table className="fbe-table">
          <thead><tr><th>State</th><th>Date</th><th>Category</th><th>Service</th><th>Entry Type</th><th>Qty</th><th>Rate / Flat</th><th>Gross</th><th>Discount</th><th>Net</th><th>Notes</th><th>Action</th></tr></thead>
          <tbody>{visibleLines.map((line) => {
            const pricing = pricingFor(line);
            const editablePricing = line.isNew || line.isDraft;
            const activeNew = editableGross(line) > 0;
            return <tr key={line.key} className={`${line.template && !activeNew ? "fbe-line-template" : ""} ${line.removed ? "fbe-line-removed" : ""}`}>
              <td className="fbe-state">
                <span className={`fbe-badge ${line.isNew ? "available" : line.isDraft ? "" : "issued"}`}>{line.isNew ? (activeNew ? (line.isDraft ? "NEW DRAFT" : "NEW ISSUE") : "AVAILABLE") : line.isDraft ? "DRAFT" : "ISSUED"}</span>
                <div className="fbe-lock" style={{marginTop:5}}>{line.billId || (line.isDraft ? "Enter pricing to add as Draft" : "Enter pricing to add as Issued")}</div>
              </td>
              <td className="fbe-date"><input type="date" value={line.date} disabled={line.removed} onChange={(event) => patchLine(line.key,{date:event.target.value})}/></td>
              <td className="fbe-category"><select value={line.category} disabled={line.removed || Boolean(serviceDefinition(line.service))} onChange={(event) => patchCategory(line.key,event.target.value as BillCategory)}>{BILL_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></td>
              <td className="fbe-service"><input list="fbe-service-list" value={line.service} disabled={line.removed} onChange={(event) => patchService(line.key,event.target.value)}/></td>
              <td className="fbe-mode">{editablePricing ? <select value={line.entryMode} disabled={line.removed} onChange={(event) => patchLine(line.key,{entryMode:event.target.value as BillEntryMode})}><option value="quantity_rate">Qty × Rate</option><option value="flat_amount">Flat Amount</option></select> : <><strong>{line.entryMode === "quantity_rate" ? "Qty × Rate" : "Flat Amount"}</strong><div className="fbe-lock">Issued pricing locked</div></>}</td>
              <td className="fbe-qty">{editablePricing ? <input inputMode="decimal" value={line.entryMode === "quantity_rate" ? line.quantity : "1"} disabled={line.removed || line.entryMode === "flat_amount"} onChange={(event) => patchLine(line.key,{quantity:event.target.value})}/> : <><strong>{pricing.quantity || 1}</strong><div className="fbe-lock">Qty</div></>}</td>
              <td className="fbe-money">{editablePricing ? <input inputMode="decimal" placeholder="0" value={line.entryMode === "quantity_rate" ? line.unitPrice : line.gross} disabled={line.removed} onChange={(event) => patchLine(line.key,line.entryMode === "quantity_rate" ? {unitPrice:event.target.value} : {gross:event.target.value})}/> : <><strong>{money(pricing.unitPrice)}</strong><div className="fbe-lock">{line.entryMode === "quantity_rate" ? "Unit rate" : "Flat amount"}</div></>}</td>
              <td className="fbe-money"><strong>{money(pricing.gross)}</strong>{!editablePricing ? <div className="fbe-lock">Issued gross preserved</div> : <div className="fbe-lock">Calculated gross</div>}</td>
              <td className="fbe-money"><input inputMode="decimal" value={line.discount} disabled={line.removed || (line.isNew && !activeNew)} onChange={(event) => patchLine(line.key,{discount:event.target.value})}/><div className="fbe-lock">Direct service discount</div></td>
              <td className="fbe-money"><strong>{money(targetNet(line))}</strong>{!line.isNew ? <div className="fbe-lock">Current {money(line.currentNet)}</div> : null}</td>
              <td className="fbe-notes"><textarea value={line.notes} disabled={line.removed} placeholder="Optional note" onChange={(event) => patchLine(line.key,{notes:event.target.value})}/></td>
              <td className="fbe-action">{line.isNew ? (activeNew || (!line.template && (line.service || line.notes)) ? <button className="fbe-btn" onClick={() => clearNewLine(line.key)}>Clear</button> : <span className="fbe-lock">Ready</span>) : <button className={`fbe-btn ${line.removed ? "" : "danger"}`} onClick={() => patchLine(line.key,{removed:!line.removed})}>{line.removed ? "Restore" : "Remove"}</button>}</td>
            </tr>;
          })}</tbody>
        </table>}
      </div>

      <div className="fbe-footer">
        <small>All revisions are validated against the loaded bill snapshot. Changed draft rows, new services, discounts and eligible credit notes commit together. Previously issued gross values cannot be directly edited.</small>
        <button type="button" className="fbe-btn primary" onClick={() => void save()} disabled={saving || loading || !lines.length || revisionReason.trim().length < 12}>{saving ? "Checking / Saving…" : "Preview & Save Revision"}</button>
      </div>
    </section>

    <section className="fbe-revision-panel">
      <h2>Revision reason &amp; approval</h2>
      <p>Every service update, draft void, new bill or issued-service credit is included in one database revision. Describe the instruction or supporting documentation before submitting.</p>
      <label htmlFor="fbe-revision-reason">Reason for this full bill revision (required)</label>
      <textarea id="fbe-revision-reason" className="fbe-revision-reason" maxLength={1200} value={revisionReason}
        onChange={event => setRevisionReason(event.target.value)}
        placeholder="Example: Client approved revised service discounts and the attached updated service schedule."/>
      <p>Issued services with payment allocations cannot be removed automatically. Use reviewed financial corrections or refund procedures. Previously issued invoices retain their bill IDs and a before/after audit trail.</p>
    </section>

    <section className="fbe-revision-panel fbe-revision-list">
      <h2>Full bill revision history</h2>
      <p>{revisions.length} recent atomic revisions recorded for this project. Expand one to compare original and revised details.</p>
      {!revisions.length && <p>No Full Bill Editor 4.2 revision has been recorded for this File ID.</p>}
      {revisions.map((revision, index) => {
        const changes = Array.isArray(revision.changes) ? revision.changes as Row[] : [];
        return <details key={text(revision.revisionId) || String(index)}>
          <summary>{text(revision.at).slice(0, 19).replace("T", " ")} · {text(revision.actor)} · {changes.length} changed service{changes.length === 1 ? "" : "s"}</summary>
          <p><strong>Revision:</strong> {text(revision.revisionId)} · <strong>Reason:</strong> {text(revision.reason)}</p>
          <div className="fbe-history-grid"><table>
            <thead><tr><th>Operation</th><th>Bill ID</th><th>Original gross / discount</th><th>Revised gross / discount</th><th>Original status</th><th>Revised status / adjustment</th></tr></thead>
            <tbody>{changes.map((change, changeIndex) => {
              const before = change.before && typeof change.before === "object" ? change.before as Row : {};
              const after = change.after && typeof change.after === "object" ? change.after as Row : {};
              return <tr key={changeIndex}>
                <td>{text(change.kind).replaceAll("_", " ")}</td>
                <td>{text(after.billCode || before.billCode)}</td>
                <td>{before.billCode ? `${money(before.gross)} / ${money(before.discount)}` : "New service"}</td>
                <td>{`${money(after.gross)} / ${money(after.discount)}`}</td>
                <td>{text(before.status) || "—"}</td>
                <td>{text(after.status)}{after.creditNoteCode ? ` · Credit ${text(after.creditNoteCode)}` : ""}</td>
              </tr>;
            })}</tbody>
          </table></div>
        </details>;
      })}
    </section>
  </main>;
}
