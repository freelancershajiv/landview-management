"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi, type BillingBookData } from "@/lib/api";

const BILL_CATEGORIES = ["Engineering Bill", "Supervision Bill", "Other Services Bill"] as const;
type BillCategory = typeof BILL_CATEGORIES[number];
type BillingFilter = "due" | "paid" | "written" | "all";
type CategoryDueFilter = "all" | "eb" | "sb" | "ob";
type BillingProject = BillingBookData["projects"][number];
type ProjectRow = Record<string, unknown>;
type CategoryNumbers = { gross: number; discount: number; billed: number; paid: number; writtenOff: number; due: number };
type AdjustedProject = Omit<BillingProject, "categories" | "due"> & {
  categories: Record<string, CategoryNumbers>;
  writtenOff: number;
  due: number;
  phone: string;
  address: string;
};
type WriteOffEvent = {
  id: string;
  writeoffCode: string;
  projectId: string;
  projectName: string;
  clientName: string;
  category: string;
  eventType: "write_off" | "recovery";
  amount: number;
  date: string;
  reason: string;
  notes: string;
  createdBy: string;
  paymentId: string;
  createdAt: string;
};

type BillingForm = { projectId: string; category: BillCategory; service: string; amount: string; discount: string; date: string; notes: string };
type PaymentForm = { projectId: string; category: BillCategory; amount: string; date: string; method: string; account: string; reference: string; notes: string };
type WriteOffForm = { projectId: string; category: BillCategory; amount: string; date: string; reason: string; notes: string };
type RecoveryForm = { projectId: string; category: BillCategory; amount: string; date: string; method: string; account: string; reference: string; notes: string };

const CATEGORY_DUE_FILTERS = [
  { key: "eb", label: "EB Due", category: "Engineering Bill" },
  { key: "sb", label: "SB Due", category: "Supervision Bill" },
  { key: "ob", label: "OB Due", category: "Other Services Bill" },
] as const;
const WRITE_OFF_REASONS = ["Client dispute", "Client unreachable", "Project cancelled", "Discount / settlement", "Legal recovery impractical", "Management decision", "Other"];

function text(value: unknown) { return String(value ?? "").trim(); }
function field(record: ProjectRow, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}
function normalizeProjectId(value: unknown) {
  const raw = text(value).toUpperCase();
  const match = raw.match(/^(?:LV[\s_-]*)?0*(\d+)$/i);
  return match ? `LV-${Number(match[1])}` : raw;
}
function normalizeStatus(value: unknown) { return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function amount(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money(value: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value || 0);
}
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function projectIsOpen(project: ProjectRow) {
  const status = normalizeStatus(field(project, ["Status", "Project_Status", "Project Status"]));
  return !/cancel|abandon|complete|done|closed|finish/.test(status);
}
function canonicalCategoryName(value: string): BillCategory {
  const normalized = normalizeStatus(value);
  if (normalized === "supervision bill" || normalized === "supervision") return "Supervision Bill";
  if (normalized === "other services bill" || normalized === "others bill" || normalized === "other services" || normalized === "others") return "Other Services Bill";
  // Design Books is part of Engineering Bill, including historical records.
  return "Engineering Bill";
}
function canonicalCategoryKey(key: string, category: BillCategory) { return canonicalCategoryName(key) === category; }
function categoryKey(projectId: string, category: string) { return `${normalizeProjectId(projectId)}::${normalizeStatus(canonicalCategoryName(category))}`; }
function projectCategory(project: AdjustedProject | undefined, category: BillCategory): CategoryNumbers {
  if (!project) return { gross: 0, discount: 0, billed: 0, paid: 0, writtenOff: 0, due: 0 };
  return project.categories?.[category] || { gross: 0, discount: 0, billed: 0, paid: 0, writtenOff: 0, due: 0 };
}

async function parseJson(response: Response, fallback: string) {
  const raw = await response.text();
  let json: any;
  try { json = JSON.parse(raw); }
  catch { throw new Error(/^\s*</.test(raw) ? "The server returned HTML instead of JSON." : fallback); }
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || fallback));
  return json.data;
}
async function writeBilling(action: "saveBill" | "savePayment", payload: Record<string, unknown>) {
  const response = await fetch("/api/billing/write", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store", body: JSON.stringify({ action, ...payload }) });
  return parseJson(response, "Billing write failed.");
}
async function getWriteOffEvents(): Promise<WriteOffEvent[]> {
  const response = await fetch("/api/billing/writeoffs", { credentials: "same-origin", cache: "no-store" });
  return parseJson(response, "Could not load write-offs.");
}
async function writeOffAction(action: "saveWriteOff" | "recoverWriteOff", payload: Record<string, unknown>) {
  const response = await fetch("/api/billing/writeoffs", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store", body: JSON.stringify({ action, ...payload }) });
  return parseJson(response, "Write-off action failed.");
}

export default function BillingPage() {
  const [book, setBook] = useState<BillingBookData | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [writeOffEvents, setWriteOffEvents] = useState<WriteOffEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState<BillingFilter>("due");
  const [categoryFilter, setCategoryFilter] = useState<CategoryDueFilter>("all");
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");
  const [billOpen, setBillOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [billForm, setBillForm] = useState<BillingForm>({ projectId: "", category: "Engineering Bill", service: "", amount: "", discount: "", date: today(), notes: "" });
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({ projectId: "", category: "Engineering Bill", amount: "", date: today(), method: "Bank Transfer", account: "Bank Account", reference: "", notes: "" });
  const [writeOffForm, setWriteOffForm] = useState<WriteOffForm>({ projectId: "", category: "Engineering Bill", amount: "", date: today(), reason: "Client unreachable", notes: "" });
  const [recoveryForm, setRecoveryForm] = useState<RecoveryForm>({ projectId: "", category: "Engineering Bill", amount: "", date: today(), method: "Bank Transfer", account: "Bank Account", reference: "", notes: "" });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([landViewApi.getBillingBook(), landViewApi.getProjects(), getWriteOffEvents()])
      .then(([billingBook, projectRows, events]) => {
        if (!cancelled) { setBook(billingBook); setProjects(projectRows || []); setWriteOffEvents(events || []); }
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load Billing."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  const openProjects = useMemo(() => projects.filter(projectIsOpen).map((project) => {
    const id = normalizeProjectId(field(project, ["Project_ID", "Project ID", "ProjectId"]));
    return { id, projectName: text(field(project, ["Project_Name", "Project Name", "Name"])) || id, clientName: text(field(project, ["Client_Name", "Client Name", "Client"])) };
  }).filter((project) => project.id).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [projects]);

  const projectMeta = useMemo(() => {
    const map = new Map<string, { phone: string; address: string }>();
    for (const project of projects) {
      const id = normalizeProjectId(field(project, ["Project_ID", "Project ID", "ProjectId"]));
      if (!id) continue;
      const phone = text(field(project, ["Phone_Number", "Phone Number", "Phone", "Client_Phone", "Client Phone"]));
      const explicitAddress = text(field(project, ["Address", "Project_Address", "Project Address", "Client_Address", "Client Address"]));
      const location = text(field(project, ["Location", "Project_Location", "Project Location"]));
      const locationTag = text(field(project, ["Location_Tag", "Location Tag"]));
      map.set(id, { phone, address: explicitAddress || [location, locationTag && locationTag.toLowerCase() !== location.toLowerCase() ? locationTag : ""].filter(Boolean).join(" · ") });
    }
    return map;
  }, [projects]);

  const writeOffBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of writeOffEvents) {
      const key = categoryKey(event.projectId, event.category);
      const signed = event.eventType === "write_off" ? amount(event.amount) : -amount(event.amount);
      map.set(key, Math.max(0, (map.get(key) || 0) + signed));
    }
    return map;
  }, [writeOffEvents]);

  const adjustedProjects = useMemo<AdjustedProject[]>(() => (book?.projects || []).map((row) => {
    const categories: Record<string, CategoryNumbers> = {};
    for (const [key, raw] of Object.entries(row.categories || {})) {
      const canonical = canonicalCategoryName(key);
      const target = categories[canonical] || { gross: 0, discount: 0, billed: 0, paid: 0, writtenOff: 0, due: 0 };
      target.gross += amount(raw.gross);
      target.discount += amount(raw.discount);
      target.billed += amount(raw.billed);
      target.paid += amount(raw.paid);
      categories[canonical] = target;
    }
    for (const category of BILL_CATEGORIES) {
      const target = categories[category] || { gross: 0, discount: 0, billed: 0, paid: 0, writtenOff: 0, due: 0 };
      const rawDue = Math.max(0, target.billed - target.paid);
      const activeWriteOff = Math.min(rawDue, writeOffBalances.get(categoryKey(row.projectId, category)) || 0);
      target.writtenOff = activeWriteOff;
      target.due = Math.max(0, rawDue - activeWriteOff);
      if (target.gross > 0 || target.discount > 0 || target.billed > 0 || target.paid > 0 || target.writtenOff > 0) categories[category] = target;
    }
    const meta = projectMeta.get(normalizeProjectId(row.projectId));
    const values = Object.values(categories);
    return { ...row, categories, writtenOff: values.reduce((sum, value) => sum + value.writtenOff, 0), due: values.reduce((sum, value) => sum + value.due, 0), phone: meta?.phone || "", address: meta?.address || "" };
  }), [book, projectMeta, writeOffBalances]);

  const totals = useMemo(() => adjustedProjects.reduce((sum, row) => ({ gross: sum.gross + row.gross, discount: sum.discount + row.discount, billed: sum.billed + row.billed, paid: sum.paid + row.paid, writtenOff: sum.writtenOff + row.writtenOff, due: sum.due + row.due }), { gross: 0, discount: 0, billed: 0, paid: 0, writtenOff: 0, due: 0 }), [adjustedProjects]);
  const categoryTotals = useMemo(() => BILL_CATEGORIES.map((category) => {
    const result: CategoryNumbers = { gross: 0, discount: 0, billed: 0, paid: 0, writtenOff: 0, due: 0 };
    for (const project of adjustedProjects) {
      const values = projectCategory(project, category);
      for (const key of Object.keys(result) as Array<keyof CategoryNumbers>) result[key] += values[key];
    }
    return { category, ...result };
  }), [adjustedProjects]);

  const billingCounts = useMemo(() => {
    const billingProjects = adjustedProjects.filter((row) => row.billed > 0.009 || row.paid > 0.009 || row.writtenOff > 0.009);
    return {
      due: billingProjects.filter((row) => row.due > 0.009).length,
      paid: billingProjects.filter((row) => row.billed > 0.009 && row.due <= 0.009 && row.writtenOff <= 0.009).length,
      written: billingProjects.filter((row) => row.writtenOff > 0.009).length,
      all: billingProjects.length,
      eb: billingProjects.filter((row) => projectCategory(row, "Engineering Bill").due > 0.009).length,
      sb: billingProjects.filter((row) => projectCategory(row, "Supervision Bill").due > 0.009).length,
      ob: billingProjects.filter((row) => projectCategory(row, "Other Services Bill").due > 0.009).length,
    };
  }, [adjustedProjects]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const selectedCategory = CATEGORY_DUE_FILTERS.find((item) => item.key === categoryFilter)?.category;
    return adjustedProjects
      .filter((row) => listFilter === "due" ? row.due > 0.009 : listFilter === "paid" ? row.billed > 0.009 && row.due <= 0.009 && row.writtenOff <= 0.009 : listFilter === "written" ? row.writtenOff > 0.009 : row.billed > 0.009 || row.paid > 0.009 || row.writtenOff > 0.009)
      .filter((row) => !selectedCategory || projectCategory(row, selectedCategory).due > 0.009)
      .filter((row) => !term || [row.projectId, row.projectName, row.clientName, row.phone, row.address].join(" ").toLowerCase().includes(term))
      .sort((a, b) => b.projectId.localeCompare(a.projectId, undefined, { numeric: true }));
  }, [adjustedProjects, query, listFilter, categoryFilter]);

  const dueProjects = useMemo(() => adjustedProjects.filter((project) => project.due > 0.009).map((project) => ({ id: normalizeProjectId(project.projectId), projectName: project.projectName, clientName: project.clientName, due: project.due })).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [adjustedProjects]);
  const writtenProjects = useMemo(() => adjustedProjects.filter((project) => project.writtenOff > 0.009).map((project) => ({ id: normalizeProjectId(project.projectId), projectName: project.projectName, clientName: project.clientName, writtenOff: project.writtenOff })).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })), [adjustedProjects]);
  const findProject = (projectId: string) => adjustedProjects.find((project) => normalizeProjectId(project.projectId) === normalizeProjectId(projectId));
  const selectedPaymentDue = projectCategory(findProject(paymentForm.projectId), paymentForm.category).due;
  const selectedWriteOffDue = projectCategory(findProject(writeOffForm.projectId), writeOffForm.category).due;
  const selectedRecoveryBalance = projectCategory(findProject(recoveryForm.projectId), recoveryForm.category).writtenOff;
  const billGross = Math.max(0, amount(billForm.amount));
  const billDiscount = Math.max(0, amount(billForm.discount));

  function resetMessage() { setMessage(""); setModalError(""); }
  function refresh(successMessage: string) { setMessage(successMessage); setRevision((value) => value + 1); }
  function filterLabel() { return listFilter === "due" ? "due" : listFilter === "paid" ? "fully paid" : listFilter === "written" ? "written-off" : "billing"; }

  async function saveBill() {
    const gross = amount(billForm.amount), discount = amount(billForm.discount);
    if (!billForm.projectId) return setModalError("Choose a project first.");
    if (!billForm.service.trim()) return setModalError("Enter the service or bill description.");
    if (!(gross > 0)) return setModalError("Enter a valid gross bill amount.");
    if (discount < 0 || discount > gross) return setModalError("Discount must be between zero and the gross bill amount.");
    setSaving(true); setModalError("");
    try {
      await writeBilling("saveBill", { Project_ID: billForm.projectId, Bill_Date: billForm.date, Description: `[${billForm.category}] ${billForm.service.trim()}`, Amount: gross, Discount: discount, Status: "Issued", Billing_Category: billForm.category, Category: billForm.category, Created_Via: "Billing Workspace", Notes: billForm.notes.trim(), Idempotency_Key: `web-bill-${crypto.randomUUID()}` });
      setBillOpen(false); refresh(`Bill added successfully. Net bill: ${money(gross - discount)}.`);
    } catch (err) { setModalError(err instanceof Error ? err.message : "Could not add bill."); } finally { setSaving(false); }
  }
  async function savePayment() {
    const value = amount(paymentForm.amount);
    if (!paymentForm.projectId) return setModalError("Choose a project first.");
    if (!(selectedPaymentDue > 0)) return setModalError("This category has no collectible due.");
    if (!(value > 0) || value > selectedPaymentDue + 0.01) return setModalError(`Payment must be between BDT 1 and ${money(selectedPaymentDue)}.`);
    setSaving(true); setModalError("");
    try {
      await writeBilling("savePayment", { Project_ID: paymentForm.projectId, Payment_Date: paymentForm.date, Amount: value, Payment_Method: paymentForm.method, Deposit_Account: paymentForm.account, Reference_No: paymentForm.reference.trim(), Payment_For: paymentForm.category, Income_Category: paymentForm.category, Transaction_Type: "Business Income", Affects_Business_Balance: "Yes", Received_From: findProject(paymentForm.projectId)?.clientName || "", Notes: paymentForm.notes.trim(), Idempotency_Key: `web-payment-${crypto.randomUUID()}` });
      setPaymentOpen(false); refresh("Payment recorded successfully.");
    } catch (err) { setModalError(err instanceof Error ? err.message : "Could not record payment."); } finally { setSaving(false); }
  }
  async function saveWriteOff() {
    const value = amount(writeOffForm.amount);
    if (!writeOffForm.projectId) return setModalError("Choose a project first.");
    if (!(selectedWriteOffDue > 0)) return setModalError("This category has no collectible due to write off.");
    if (!(value > 0) || value > selectedWriteOffDue + 0.01) return setModalError(`Write-off must be between BDT 1 and ${money(selectedWriteOffDue)}.`);
    if (!writeOffForm.reason.trim()) return setModalError("Choose a write-off reason.");
    if (!writeOffForm.notes.trim()) return setModalError("Add a note explaining why this amount is unrecoverable.");
    setSaving(true); setModalError("");
    try {
      await writeOffAction("saveWriteOff", { Project_ID: writeOffForm.projectId, Billing_Category: writeOffForm.category, Amount: value, WriteOff_Date: writeOffForm.date, Reason: writeOffForm.reason, Notes: writeOffForm.notes.trim(), Idempotency_Key: `web-writeoff-${crypto.randomUUID()}` });
      setWriteOffOpen(false); refresh(`${money(value)} marked unrecoverable. It is no longer included in collectible receivables.`);
    } catch (err) { setModalError(err instanceof Error ? err.message : "Could not save write-off."); } finally { setSaving(false); }
  }
  async function saveRecovery() {
    const value = amount(recoveryForm.amount);
    if (!recoveryForm.projectId) return setModalError("Choose a project first.");
    if (!(selectedRecoveryBalance > 0)) return setModalError("This category has no active write-off balance.");
    if (!(value > 0) || value > selectedRecoveryBalance + 0.01) return setModalError(`Recovery must be between BDT 1 and ${money(selectedRecoveryBalance)}.`);
    setSaving(true); setModalError("");
    try {
      await writeOffAction("recoverWriteOff", { Project_ID: recoveryForm.projectId, Billing_Category: recoveryForm.category, Amount: value, Payment_Date: recoveryForm.date, Payment_Method: recoveryForm.method, Deposit_Account: recoveryForm.account, Reference_No: recoveryForm.reference.trim(), Notes: recoveryForm.notes.trim(), Idempotency_Key: `web-recovery-${crypto.randomUUID()}` });
      setRecoveryOpen(false); refresh(`${money(value)} recovered from a previous write-off and posted as collected cash.`);
    } catch (err) { setModalError(err instanceof Error ? err.message : "Could not record recovery."); } finally { setSaving(false); }
  }

  return <div className="billing-page">
    <style>{`
      .billing-page{color:#e8edf1;line-height:1.45}.billing-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:22px}.billing-head small{display:block;color:#ef6c66;font-weight:900;letter-spacing:.11em}.billing-head h1{font-size:34px;margin:5px 0 0;color:#f8fafc}.billing-actions{display:flex;gap:8px;flex-wrap:wrap}.billing-btn{border:1px solid #3b454e;background:#151d24;color:#edf1f4;padding:10px 13px;border-radius:8px;font-weight:800;cursor:pointer;text-decoration:none;min-height:40px;display:inline-flex;align-items:center;justify-content:center;line-height:1.1}.billing-btn:hover:not(:disabled){border-color:#67737d;background:#1b252d}.billing-btn.primary{background:#d94b45;border-color:#d94b45;color:#fff}.billing-btn.warn{background:#5b2d29;border-color:#8a4740;color:#ffd4cf}.billing-btn.recover{background:#183125;border-color:#315d43;color:#bfe7ca}.billing-btn:disabled{opacity:.55;cursor:not-allowed}.billing-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:18px}.billing-card{background:#151d24;border:1px solid #313b44;border-radius:10px;padding:16px}.billing-card span{display:block;color:#89959e;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.billing-card strong{display:block;margin-top:7px;font-size:21px}.billing-card .metric-sub{margin-top:6px;color:#9da9b2;font-size:10px;text-transform:none;letter-spacing:0}.billing-writeoff{color:#f3b26f!important}.billing-due{color:#ff8f87!important;font-weight:900}.billing-ok{color:#9fd7ae!important;font-weight:900}.billing-cats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:18px}.billing-cat h3{margin:0 0 12px;color:#f8fafc}.billing-cat dl{display:grid;grid-template-columns:1fr auto;gap:7px 12px;margin:0;font-size:12px}.billing-cat dt{color:#89959e}.billing-cat dd{margin:0;font-weight:800}.billing-cat .discount-value{color:#f3b26f}.billing-cat button{margin-top:13px}.billing-panel{background:#11181e;border:1px solid #313b44;border-radius:10px;overflow:hidden}.billing-toolbar{display:flex;justify-content:space-between;gap:12px;padding:14px;border-bottom:1px solid #313b44;align-items:center}.billing-toolbar strong{color:#f8fafc}.billing-toolbar-right{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex:1;flex-wrap:wrap}.billing-toolbar input{min-width:240px;max-width:390px;width:100%;background:#0d141a;color:#fff;border:1px solid #36414a;border-radius:7px;padding:10px}.billing-filter-group,.billing-category-filter-group{display:flex;gap:5px;flex-wrap:wrap}.billing-filter{border:1px solid #3b454e;background:#151d24;color:#aeb7be;padding:9px 10px;border-radius:7px;font-weight:900;cursor:pointer;white-space:nowrap}.billing-filter:hover{border-color:#59656f;color:#eef3f6}.billing-filter.active{background:#d94b45;border-color:#d94b45;color:#fff}.billing-filter.written-active{background:#5b3d20;border-color:#95672e;color:#ffd49a}.billing-table{overflow:auto}.billing-table table{width:100%;border-collapse:collapse;min-width:1450px}.billing-table th,.billing-table td{text-align:left;padding:11px 12px;border-bottom:1px solid #27313a;font-size:12px}.billing-table th{color:#8f9aa3;text-transform:uppercase;font-size:10px;letter-spacing:.06em}.billing-table td{color:#e7edf2;vertical-align:middle}.billing-table tbody tr:hover{background:#151f27}.billing-row-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.billing-project-cell{min-width:260px}.billing-client-line{display:block;margin-top:3px;color:#c6d0d7;font-size:11px}.billing-contact-line{display:flex;gap:7px 12px;flex-wrap:wrap;margin-top:5px;color:#85939d;font-size:10px}.billing-contact-line .billing-address{max-width:340px}.billing-discount{color:#f3b26f;font-weight:800}.billing-breakdown{display:grid;gap:4px;min-width:190px}.billing-breakdown-line{display:grid;grid-template-columns:26px minmax(0,1fr) minmax(0,1fr);gap:6px;align-items:center}.billing-breakdown-line span{display:inline-flex;align-items:center;justify-content:center;padding:2px 4px;border:1px solid #39444d;border-radius:5px;color:#9ba7b0;font-size:9px;font-weight:900}.billing-breakdown-line strong{font-size:10px!important;text-align:right}.billing-breakdown-line em{font-style:normal;color:#f3b26f;font-size:9px;text-align:right}.billing-breakdown-line.has-due span{border-color:#713d38;background:#321f1d;color:#ffaaa3}.billing-status{display:inline-flex;align-items:center;justify-content:center;border:1px solid;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:900;white-space:nowrap}.billing-status.due{color:#ffaaa3;border-color:#713d38;background:#321f1d}.billing-status.paid{color:#a9deb8;border-color:#31513d;background:#18281f}.billing-status.written{color:#ffd49a;border-color:#7b572c;background:#34291b}.billing-status.partial{color:#ffd0cc;border-color:#82504a;background:#34211f}.billing-note{margin:0 0 14px;padding:11px 13px;border:1px solid #31513d;background:#18281f;color:#a9deb8;border-radius:8px}.billing-note.error{border-color:#67352f;background:#34201e;color:#ffaaa3}.billing-help{font-size:11px;color:#b7c1c9;line-height:1.5}.billing-empty{padding:28px;color:#8f9aa3;text-align:center}.billing-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:100;display:grid;place-items:center;padding:20px}.billing-modal{width:min(650px,100%);max-height:90vh;overflow:auto;background:#151d24;color:#f5f7f9;border:1px solid #3a4650;border-radius:12px;padding:20px;box-shadow:0 24px 80px rgba(0,0,0,.45)}.billing-modal h2{margin:0 0 5px}.billing-modal-intro{color:#9ba7b0;font-size:11px;margin:0 0 16px}.billing-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.billing-field{display:flex;flex-direction:column;gap:6px}.billing-field.full{grid-column:1/-1}.billing-field label{font-size:11px;color:#c7d0d7;font-weight:800;text-transform:uppercase}.billing-field input,.billing-field select,.billing-field textarea{background:#0d141a;color:#fff;border:1px solid #36414a;border-radius:7px;padding:10px;min-height:44px;color-scheme:dark}.billing-field textarea{min-height:82px;resize:vertical}.billing-preview{grid-column:1/-1;display:flex;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #3f4b55;border-radius:8px;background:#0f171d}.billing-preview span{color:#9da9b2;font-size:11px;font-weight:800;text-transform:uppercase}.billing-preview strong{font-size:18px}.billing-inline-error{margin:0 0 14px;padding:10px 12px;border:1px solid #8b4039;border-radius:8px;background:#3a211f;color:#ffd0cc;font-size:12px;font-weight:800}.billing-modal-actions{display:flex;justify-content:flex-end;gap:9px;position:sticky;bottom:-20px;margin:18px -20px -20px;padding:14px 20px 20px;background:linear-gradient(180deg,rgba(21,29,36,.78),#151d24 30%);border-top:1px solid #2f3942}@media(max-width:1100px){.billing-metrics{grid-template-columns:repeat(3,1fr)}.billing-toolbar{align-items:flex-start;flex-direction:column}.billing-toolbar-right{width:100%;justify-content:flex-start}}@media(max-width:900px){.billing-metrics{grid-template-columns:1fr 1fr}.billing-cats{grid-template-columns:1fr}.billing-head{align-items:flex-start;flex-direction:column}.billing-grid{grid-template-columns:1fr}.billing-field.full,.billing-preview{grid-column:auto}}@media(max-width:640px){.billing-metrics{grid-template-columns:1fr}.billing-toolbar-right{align-items:stretch;flex-direction:column}.billing-toolbar input{min-width:0;max-width:none}.billing-filter-group,.billing-category-filter-group{width:100%}.billing-filter{flex:1}.billing-actions{width:100%}.billing-actions .billing-btn{flex:1 1 calc(50% - 6px)}.billing-modal-backdrop{padding:10px}.billing-modal{padding:16px}.billing-modal-actions{bottom:-16px;margin:18px -16px -16px;padding:12px 16px 16px}}
    `}</style>

    <header className="billing-head">
      <div><small>LAND VIEW / CLIENT BILLING</small><h1>Billing</h1></div>
      <div className="billing-actions">
        <button className="billing-btn primary" disabled={saving} onClick={() => { resetMessage(); setBillForm({ projectId: "", category: "Engineering Bill", service: "", amount: "", discount: "", date: today(), notes: "" }); setBillOpen(true); }}>+ Add Bill</button>
        <button className="billing-btn" disabled={saving} onClick={() => { resetMessage(); setPaymentForm({ projectId: "", category: "Engineering Bill", amount: "", date: today(), method: "Bank Transfer", account: "Bank Account", reference: "", notes: "" }); setPaymentOpen(true); }}>+ Add Payment</button>
        <button className="billing-btn warn" disabled={saving} onClick={() => { resetMessage(); setWriteOffForm({ projectId: "", category: "Engineering Bill", amount: "", date: today(), reason: "Client unreachable", notes: "" }); setWriteOffOpen(true); }}>Write Off Due</button>
        <button className="billing-btn recover" disabled={saving || writtenProjects.length === 0} onClick={() => { resetMessage(); setRecoveryForm({ projectId: "", category: "Engineering Bill", amount: "", date: today(), method: "Bank Transfer", account: "Bank Account", reference: "", notes: "" }); setRecoveryOpen(true); }}>Recover Write-off</button>
        <Link className="billing-btn" href="/admin/finance/invoices">Generate Invoice</Link>
        <Link className="billing-btn" href="/admin/accounts">Accounts</Link>
      </div>
    </header>

    {message && <div className="billing-note">{message}</div>}
    {error && <div className="billing-note error">{error}</div>}

    <section className="billing-metrics">
      <div className="billing-card"><span>Net billed</span><strong>{money(totals.billed)}</strong><span className="metric-sub">Gross {money(totals.gross)} · Discount {money(totals.discount)}</span></div>
      <div className="billing-card"><span>Cash collected</span><strong>{money(totals.paid)}</strong></div>
      <div className="billing-card"><span>Written off</span><strong className="billing-writeoff">{money(totals.writtenOff)}</strong><span className="metric-sub">Unrecoverable balance kept separate from payments</span></div>
      <div className="billing-card"><span>Collectible receivables</span><strong className={totals.due > 0 ? "billing-due" : "billing-ok"}>{money(totals.due)}</strong></div>
      <div className="billing-card"><span>Projects with billing</span><strong>{billingCounts.all}</strong><span className="metric-sub">{billingCounts.written} with active write-off</span></div>
    </section>

    <section className="billing-cats">
      {categoryTotals.map((item) => <div className="billing-card billing-cat" key={item.category}>
        <h3>{item.category}</h3><dl>
          <dt>Gross</dt><dd>{money(item.gross)}</dd><dt>Discount</dt><dd className="discount-value">{money(item.discount)}</dd><dt>Net billed</dt><dd>{money(item.billed)}</dd><dt>Collected</dt><dd>{money(item.paid)}</dd><dt>Written off</dt><dd className="billing-writeoff">{money(item.writtenOff)}</dd><dt>Collectible due</dt><dd className={item.due > 0 ? "billing-due" : "billing-ok"}>{money(item.due)}</dd>
        </dl>
        <button className="billing-btn" onClick={() => { resetMessage(); setBillForm({ projectId: "", category: item.category, service: "", amount: "", discount: "", date: today(), notes: "" }); setBillOpen(true); }}>Add {item.category}</button>
      </div>)}
    </section>

    <section className="billing-panel">
      <div className="billing-toolbar">
        <div><strong>Project receivables</strong><div className="billing-help">Due means still collectible. Written-off amounts remain visible for audit but are excluded from receivables and never counted as collected cash.</div></div>
        <div className="billing-toolbar-right">
          <div className="billing-category-filter-group">{CATEGORY_DUE_FILTERS.map((filter) => <button key={filter.key} className={`billing-filter ${categoryFilter === filter.key ? "active" : ""}`} onClick={() => { setListFilter("due"); setCategoryFilter((current) => current === filter.key ? "all" : filter.key); }}>{filter.label} · {billingCounts[filter.key]}</button>)}</div>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search File ID, project, client, phone or address..."/>
          <div className="billing-filter-group">
            <button className={`billing-filter ${listFilter === "due" && categoryFilter === "all" ? "active" : ""}`} onClick={() => { setListFilter("due"); setCategoryFilter("all"); }}>Due · {billingCounts.due}</button>
            <button className={`billing-filter ${listFilter === "paid" ? "active" : ""}`} onClick={() => { setListFilter("paid"); setCategoryFilter("all"); }}>Paid · {billingCounts.paid}</button>
            <button className={`billing-filter ${listFilter === "written" ? "written-active" : ""}`} onClick={() => { setListFilter("written"); setCategoryFilter("all"); }}>Written Off · {billingCounts.written}</button>
            <button className={`billing-filter ${listFilter === "all" ? "active" : ""}`} onClick={() => { setListFilter("all"); setCategoryFilter("all"); }}>All · {billingCounts.all}</button>
          </div>
        </div>
      </div>

      {loading ? <div className="billing-empty">Loading canonical billing and write-off data…</div> : rows.length === 0 ? <div className="billing-empty">{query.trim() ? `No matching ${filterLabel()} records.` : `No ${filterLabel()} records.`}</div> : <div className="billing-table"><table>
        <thead><tr><th>File ID</th><th>Client / Project</th><th>Gross</th><th>Discount</th><th>Net billed</th><th>Collected</th><th>Written off</th><th>Collectible due</th><th>Category breakdown</th><th>Status</th><th>Invoice</th></tr></thead>
        <tbody>{rows.map((row) => {
          const eb = projectCategory(row, "Engineering Bill"), sb = projectCategory(row, "Supervision Bill"), ob = projectCategory(row, "Other Services Bill");
          const status = row.due > 0.009 && row.writtenOff > 0.009 ? "Partially Written Off" : row.due > 0.009 ? "Due" : row.writtenOff > 0.009 ? "Written Off" : "Full Paid";
          const statusClass = status === "Due" ? "due" : status === "Full Paid" ? "paid" : status === "Written Off" ? "written" : "partial";
          return <tr key={row.projectId}>
            <td><strong>{normalizeProjectId(row.projectId)}</strong></td>
            <td className="billing-project-cell"><strong>{row.clientName || row.projectName || row.projectId}</strong><span className="billing-client-line">{row.projectName && row.projectName !== row.clientName ? row.projectName : "—"}</span>{(row.phone || row.address) && <div className="billing-contact-line">{row.phone && <span>Phone: {row.phone}</span>}{row.address && <span className="billing-address">Address: {row.address}</span>}</div>}</td>
            <td>{money(row.gross)}</td><td className={row.discount > 0.009 ? "billing-discount" : ""}>{money(row.discount)}</td><td>{money(row.billed)}</td><td>{money(row.paid)}</td><td className={row.writtenOff > 0.009 ? "billing-writeoff" : ""}>{money(row.writtenOff)}</td><td className={row.due > 0.009 ? "billing-due" : "billing-ok"}>{money(row.due)}</td>
            <td><div className="billing-breakdown">{[["EB",eb],["SB",sb],["OB",ob]].map(([label, values]) => { const v = values as CategoryNumbers; return <div className={`billing-breakdown-line ${v.due > 0.009 ? "has-due" : ""}`} key={label as string}><span>{label as string}</span><strong>{money(v.due)} due</strong><em>{v.writtenOff > 0.009 ? `${money(v.writtenOff)} W/O` : ""}</em></div>; })}</div></td>
            <td><span className={`billing-status ${statusClass}`}>{status}</span></td><td><div className="billing-row-actions"><Link className="billing-btn" href={`/admin/finance/invoices?fileId=${encodeURIComponent(normalizeProjectId(row.projectId))}`}>Open</Link><Link className="billing-btn" href={`/admin/finance/bills?fileId=${encodeURIComponent(normalizeProjectId(row.projectId))}`}>Edit bills</Link></div></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </section>

    {billOpen && <Modal title="Add Bill" intro="Create a bill. A bill discount reduces the bill itself; it is different from a later write-off." error={modalError} saving={saving} onClose={() => setBillOpen(false)} onSave={saveBill} saveLabel="Save Bill">
      <div className="billing-field full"><label>Project</label><select value={billForm.projectId} onChange={(e) => setBillForm((f) => ({ ...f, projectId: e.target.value }))}><option value="">Choose active project</option>{openProjects.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.clientName || p.projectName}{p.projectName && p.projectName !== p.clientName ? ` — ${p.projectName}` : ""}</option>)}</select></div>
      <CategoryDate category={billForm.category} date={billForm.date} dateLabel="Bill date" onCategory={(category) => setBillForm((f) => ({ ...f, category }))} onDate={(date) => setBillForm((f) => ({ ...f, date }))}/>
      <div className="billing-field full"><label>Service / description</label><input value={billForm.service} onChange={(e) => setBillForm((f) => ({ ...f, service: e.target.value }))} placeholder="e.g. Structural Design"/></div>
      <div className="billing-field"><label>Gross amount (BDT)</label><input inputMode="decimal" value={billForm.amount} onChange={(e) => setBillForm((f) => ({ ...f, amount: e.target.value }))}/></div><div className="billing-field"><label>Discount (BDT)</label><input inputMode="decimal" value={billForm.discount} onChange={(e) => setBillForm((f) => ({ ...f, discount: e.target.value }))}/></div>
      <div className="billing-preview"><span>Net bill after discount</span><strong>{money(Math.max(0, billGross - billDiscount))}</strong></div><div className="billing-field full"><label>Notes</label><textarea value={billForm.notes} onChange={(e) => setBillForm((f) => ({ ...f, notes: e.target.value }))}/></div>
    </Modal>}

    {paymentOpen && <Modal title="Add Payment" intro="Only actual cash received is recorded as a payment. Written-off balances are not selectable here." error={modalError} saving={saving} onClose={() => setPaymentOpen(false)} onSave={savePayment} saveLabel="Save Payment">
      <div className="billing-field full"><label>Project with collectible receivable</label><select value={paymentForm.projectId} onChange={(e) => setPaymentForm((f) => ({ ...f, projectId: e.target.value }))}><option value="">Choose project</option>{dueProjects.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.clientName || p.projectName} — Due {money(p.due)}</option>)}</select></div>
      <CategoryDate category={paymentForm.category} date={paymentForm.date} dateLabel="Payment date" onCategory={(category) => setPaymentForm((f) => ({ ...f, category }))} onDate={(date) => setPaymentForm((f) => ({ ...f, date }))}/><div className="billing-preview"><span>Category collectible due</span><strong>{money(selectedPaymentDue)}</strong></div>
      <div className="billing-field"><label>Amount received</label><input inputMode="decimal" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}/></div><PaymentFields method={paymentForm.method} account={paymentForm.account} reference={paymentForm.reference} onMethod={(method) => setPaymentForm((f) => ({ ...f, method }))} onAccount={(account) => setPaymentForm((f) => ({ ...f, account }))} onReference={(reference) => setPaymentForm((f) => ({ ...f, reference }))}/><div className="billing-field full"><label>Notes</label><textarea value={paymentForm.notes} onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}/></div>
    </Modal>}

    {writeOffOpen && <Modal title="Write Off Unrecoverable Due" intro="This does not create a payment. It moves an amount out of collectible receivables while preserving the original bill and audit trail." error={modalError} saving={saving} onClose={() => setWriteOffOpen(false)} onSave={saveWriteOff} saveLabel="Confirm Write-off" warn>
      <div className="billing-field full"><label>Project with collectible receivable</label><select value={writeOffForm.projectId} onChange={(e) => setWriteOffForm((f) => ({ ...f, projectId: e.target.value }))}><option value="">Choose project</option>{dueProjects.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.clientName || p.projectName} — Due {money(p.due)}</option>)}</select></div>
      <CategoryDate category={writeOffForm.category} date={writeOffForm.date} dateLabel="Write-off date" onCategory={(category) => setWriteOffForm((f) => ({ ...f, category }))} onDate={(date) => setWriteOffForm((f) => ({ ...f, date }))}/><div className="billing-preview"><span>Maximum write-off for category</span><strong className="billing-due">{money(selectedWriteOffDue)}</strong></div>
      <div className="billing-field"><label>Amount unrecoverable</label><input inputMode="decimal" value={writeOffForm.amount} onChange={(e) => setWriteOffForm((f) => ({ ...f, amount: e.target.value }))}/></div><div className="billing-field"><label>Reason</label><select value={writeOffForm.reason} onChange={(e) => setWriteOffForm((f) => ({ ...f, reason: e.target.value }))}>{WRITE_OFF_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></div><div className="billing-field full"><label>Required note</label><textarea value={writeOffForm.notes} onChange={(e) => setWriteOffForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Explain why collection is no longer expected..."/></div>
    </Modal>}

    {recoveryOpen && <Modal title="Recover Previous Write-off" intro="Use this only when money is actually received after a write-off. The amount will be posted as cash collected and the active write-off will reduce by the same amount." error={modalError} saving={saving} onClose={() => setRecoveryOpen(false)} onSave={saveRecovery} saveLabel="Record Recovery">
      <div className="billing-field full"><label>Project with active write-off</label><select value={recoveryForm.projectId} onChange={(e) => setRecoveryForm((f) => ({ ...f, projectId: e.target.value }))}><option value="">Choose project</option>{writtenProjects.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.clientName || p.projectName} — Written off {money(p.writtenOff)}</option>)}</select></div>
      <CategoryDate category={recoveryForm.category} date={recoveryForm.date} dateLabel="Recovery date" onCategory={(category) => setRecoveryForm((f) => ({ ...f, category }))} onDate={(date) => setRecoveryForm((f) => ({ ...f, date }))}/><div className="billing-preview"><span>Active category write-off</span><strong className="billing-writeoff">{money(selectedRecoveryBalance)}</strong></div>
      <div className="billing-field"><label>Amount recovered</label><input inputMode="decimal" value={recoveryForm.amount} onChange={(e) => setRecoveryForm((f) => ({ ...f, amount: e.target.value }))}/></div><PaymentFields method={recoveryForm.method} account={recoveryForm.account} reference={recoveryForm.reference} onMethod={(method) => setRecoveryForm((f) => ({ ...f, method }))} onAccount={(account) => setRecoveryForm((f) => ({ ...f, account }))} onReference={(reference) => setRecoveryForm((f) => ({ ...f, reference }))}/><div className="billing-field full"><label>Notes</label><textarea value={recoveryForm.notes} onChange={(e) => setRecoveryForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional recovery note"/></div>
    </Modal>}
  </div>;
}

function CategoryDate({ category, date, dateLabel, onCategory, onDate }: { category: BillCategory; date: string; dateLabel: string; onCategory: (value: BillCategory) => void; onDate: (value: string) => void }) {
  return <><div className="billing-field"><label>Category</label><select value={category} onChange={(e) => onCategory(e.target.value as BillCategory)}>{BILL_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></div><div className="billing-field"><label>{dateLabel}</label><input type="date" value={date} onChange={(e) => onDate(e.target.value)}/></div></>;
}
function PaymentFields({ method, account, reference, onMethod, onAccount, onReference }: { method: string; account: string; reference: string; onMethod: (value: string) => void; onAccount: (value: string) => void; onReference: (value: string) => void }) {
  return <><div className="billing-field"><label>Method</label><select value={method} onChange={(e) => onMethod(e.target.value)}><option>Bank Transfer</option><option>Cash</option><option>bKash</option><option>Nagad</option><option>Cheque</option><option>Other</option></select></div><div className="billing-field"><label>Deposit account</label><select value={account} onChange={(e) => onAccount(e.target.value)}><option>Bank Account</option><option>Cash</option></select></div><div className="billing-field full"><label>Reference</label><input value={reference} onChange={(e) => onReference(e.target.value)}/></div></>;
}
function Modal({ title, intro, error, saving, onClose, onSave, saveLabel, warn = false, children }: { title: string; intro: string; error: string; saving: boolean; onClose: () => void; onSave: () => void; saveLabel: string; warn?: boolean; children: React.ReactNode }) {
  return <div className="billing-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) onClose(); }}><div className="billing-modal" role="dialog" aria-modal="true" aria-label={title}><h2>{title}</h2><p className="billing-modal-intro">{intro}</p>{error && <div className="billing-inline-error" role="alert">{error}</div>}<div className="billing-grid">{children}</div><div className="billing-modal-actions"><button className="billing-btn" disabled={saving} onClick={onClose}>Cancel</button><button className={`billing-btn ${warn ? "warn" : "primary"}`} disabled={saving} onClick={onSave}>{saving ? "Saving…" : saveLabel}</button></div></div></div>;
}
