from pathlib import Path
import re

CODE = Path("Code.gs")
COMPONENT = Path("components/chairman-expense-approval.tsx")

s = CODE.read_text(encoding="utf-8")

# Route the existing public API action names to the unified finance implementation.
s = s.replace(
    'case "getChairmanPendingApprovals": return getChairmanPendingApprovalsCore_(params);',
    'case "getChairmanPendingApprovals": return getChairmanFinanceApprovalsCore_(params);',
)
s = s.replace(
    'case "reviewChairmanPendingApproval": return reviewChairmanPendingApprovalCore_(params);',
    'case "reviewChairmanPendingApproval": return reviewChairmanFinanceApprovalCore_(params);',
)

unified = r'''
/* =========================================================
   CHAIRMAN UNIFIED FINANCE APPROVALS
   Office income + office expense + personal income + personal draw.
   Personal income is approval-visible but never treated as LAND VIEW income.
========================================================= */

function isSeptember2026PaymentCore_(row) {
  const raw = firstValue(row || {}, ["Payment_Date", "Payment Date", "Date"]);
  const text = String(raw || "").trim();
  if (/^2026-09-/.test(text)) return true;
  const date = raw instanceof Date ? raw : new Date(text);
  return !isNaN(date.getTime()) && date.getFullYear() === 2026 && date.getMonth() === 8;
}

function approvalHeadersCore_(sheet, required) {
  return ensureHeaders_(sheet, required);
}

function september2026IncomeSeedsCore_() {
  return [
    { id: "SEP-2026-INC-001", ref: "LEGACY-INCOME-2026-09-R001", date: "2026-09-02", description: "3 No Office Rent Collection", amount: 5500, category: "Rent Income" },
    { id: "SEP-2026-INC-002", ref: "LEGACY-INCOME-2026-09-R002", date: "2026-09-02", projectId: "LV-134", description: "LV-134 - Khusipur - Site Visit Bill", amount: 10000, category: "Site Visit" },
    { id: "SEP-2026-INC-003", ref: "LEGACY-INCOME-2026-09-R003", date: "2026-09-03", projectId: "LV-279", description: "LV-279 - Khodeza - Luddar Par - Soil Test", amount: 15000, category: "Soil Test" },
    { id: "SEP-2026-INC-004", ref: "LEGACY-INCOME-2026-09-R004", date: "2026-09-03", description: "Sika Chemicle Sale", amount: 2000, category: "Material / Product Sale" },
    { id: "SEP-2026-INC-005", ref: "LEGACY-INCOME-2026-09-R005", date: "2026-09-06", projectId: "LV-280", description: "LV-280 - Nurul Huda - Silonia - Soil Test", amount: 14500, category: "Soil Test" },
    { id: "SEP-2026-INC-006", ref: "LEGACY-INCOME-2026-09-R006", date: "2026-09-06", description: "Somrat Bhai Site Visit Bill", amount: 5000, category: "Site Visit" },
    { id: "SEP-2026-INC-007", ref: "LEGACY-INCOME-2026-09-R007", date: "2026-09-06", projectId: "LV-209", description: "LV-209 - Razu - 1st & 2nd Floro R.C.C Bill", amount: 40000, category: "Supervision Bill" },
    { id: "SEP-2026-INC-008", ref: "LEGACY-INCOME-2026-09-R008", date: "2026-09-07", description: "8 No Office Rent Collection", amount: 7000, category: "Rent Income" },
    { id: "SEP-2026-INC-009", ref: "LEGACY-INCOME-2026-09-R009", date: "2026-09-09", projectId: "LV-219", description: "LV-219 - Hassan - 1st Floor R.C.C Bill", amount: 18000, category: "Supervision Bill" },
    { id: "SEP-2026-INC-010", ref: "LEGACY-INCOME-2026-09-R010", date: "2026-09-09", projectId: "LV-048", description: "LV-048 - Bablu - Finishing Supervision Bill", amount: 20000, category: "Supervision Bill" },
    { id: "SEP-2026-INC-011", ref: "LEGACY-INCOME-2026-09-R011", date: "2026-09-12", description: "Tamim Bhai Printing", amount: 200, category: "Printing / Documentation" },
    { id: "SEP-2026-INC-012", ref: "LEGACY-INCOME-2026-09-R012", date: "2026-09-12", projectId: "LV-276", description: "LV-276 - Ali - Gillabaria - Site Visit", amount: 1500, category: "Site Visit" }
  ];
}

function ensureSeptember2026IncomeCore_() {
  const sheet = getSheet(CONFIG.SHEETS.PAYMENTS);
  const headers = approvalHeadersCore_(sheet, [
    "Payment_ID", "Project_ID", "Payment_Date", "Amount", "Payment_Method", "Reference_No",
    "Received_By", "Notes", "Created_At", "Payment_For", "Income_Category", "Transaction_Type",
    "Affects_Business_Balance", "Approval_Status", "Reviewed_By", "Reviewed_At", "Review_Notes",
    "Approved_By", "Approved_At", "Created_By"
  ]);
  const idIndex = headers.indexOf("Payment_ID");
  const refIndex = headers.indexOf("Reference_No");
  const existing = {};

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues().forEach(function(row) {
      const id = String(row[idIndex] || "").trim();
      const ref = refIndex >= 0 ? String(row[refIndex] || "").trim() : "";
      if (id) existing[id] = true;
      if (ref) existing[ref] = true;
    });
  }

  let created = 0;
  september2026IncomeSeedsCore_().forEach(function(seed) {
    if (existing[seed.id] || existing[seed.ref]) return;
    const record = {
      Payment_ID: seed.id,
      Project_ID: seed.projectId || "",
      Payment_Date: seed.date,
      Amount: seed.amount,
      Payment_Method: "",
      Reference_No: seed.ref,
      Received_By: "Not recorded",
      Notes: "Management-provided September 2026 LAND VIEW ledger. Requires EMP-0001 approval before affecting business totals.",
      Created_At: new Date().toISOString(),
      Created_By: "Historical Import",
      Payment_For: seed.description,
      Income_Category: seed.category,
      Transaction_Type: "Office Income",
      Affects_Business_Balance: true,
      Approval_Status: "Pending",
      Reviewed_By: "",
      Reviewed_At: "",
      Review_Notes: "",
      Approved_By: "",
      Approved_At: ""
    };
    sheet.appendRow(headers.map(function(header) { return record[header] === undefined ? "" : record[header]; }));
    existing[seed.id] = true;
    existing[seed.ref] = true;
    created++;
  });
  return created;
}

function ensureSeptember2026PersonalIncomeCore_() {
  const sheet = getSheet(CONFIG.SHEETS.APPROVALS);
  const headers = approvalHeadersCore_(sheet, [
    "Approval_ID", "Project_ID", "Approval_Type", "Status", "Decision_Notes", "Requested_At",
    "Decided_At", "Created_At", "Created_By", "Transaction_Type", "Transaction_Date",
    "Description", "Amount", "Category", "Affects_Business_Balance", "Reviewed_By", "Reviewed_At",
    "Review_Notes", "Approved_By", "Approved_At"
  ]);
  const id = "PERSONAL-SEP-2026-INC-001";
  const existing = readSheet(CONFIG.SHEETS.APPROVALS).some(function(row) {
    return String(firstValue(row, ["Approval_ID", "Approval ID"]) || "").trim() === id;
  });
  if (existing) return 0;

  const record = {
    Approval_ID: id,
    Project_ID: "",
    Approval_Type: "Personal Income",
    Status: "Pending",
    Decision_Notes: "",
    Requested_At: new Date().toISOString(),
    Decided_At: "",
    Created_At: new Date().toISOString(),
    Created_By: "Management Ledger",
    Transaction_Type: "Personal Income",
    Transaction_Date: "2026-09-07",
    Description: "Hazari Road Shop Rent",
    Amount: 13000,
    Category: "Personal Rental Income",
    Affects_Business_Balance: false,
    Reviewed_By: "",
    Reviewed_At: "",
    Review_Notes: "",
    Approved_By: "",
    Approved_At: ""
  };
  sheet.appendRow(headers.map(function(header) { return record[header] === undefined ? "" : record[header]; }));
  return 1;
}

function paymentIsFinanciallyEffective_(payment) {
  const type = String(firstValue(payment || {}, ["Transaction_Type", "Transaction Type"]) || "").trim().toLowerCase();
  if (type === "personal income") return false;

  const impact = firstValue(payment || {}, ["Affects_Business_Balance", "Affects Business Balance"]);
  if (impact === false) return false;
  const impactText = String(impact === null || impact === undefined ? "" : impact).trim().toLowerCase();
  if (["false", "no", "0"].indexOf(impactText) >= 0) return false;

  const status = String(firstValue(payment || {}, ["Approval_Status", "Approval Status"]) || "").trim().toLowerCase();
  return !status || status === "approved";
}

function effectiveBusinessPayments_(payments) {
  return (payments || []).filter(paymentIsFinanciallyEffective_);
}

function preparePaymentForApproval_(params, session) {
  const sheet = getSheet(CONFIG.SHEETS.PAYMENTS);
  approvalHeadersCore_(sheet, [
    "Payment_ID", "Project_ID", "Payment_Date", "Amount", "Payment_Method", "Reference_No",
    "Received_By", "Notes", "Created_At", "Payment_For", "Income_Category", "Transaction_Type",
    "Affects_Business_Balance", "Approval_Status", "Reviewed_By", "Reviewed_At", "Review_Notes",
    "Approved_By", "Approved_At", "Created_By"
  ]);
  const record = cleanParams(params);
  record.Transaction_Type = String(record.Transaction_Type || "Office Income").trim() || "Office Income";
  if (record.Affects_Business_Balance === undefined || record.Affects_Business_Balance === "") {
    record.Affects_Business_Balance = record.Transaction_Type.toLowerCase() !== "personal income";
  }
  record.Approval_Status = "Pending";
  record.Reviewed_By = "";
  record.Reviewed_At = "";
  record.Review_Notes = "";
  record.Approved_By = "";
  record.Approved_At = "";
  record.Created_At = record.Created_At || new Date().toISOString();
  record.Created_By = record.Created_By || session.userId || session.username || "";
  return record;
}

function financeApprovalStatusCore_(row) {
  return String(firstValue(row || {}, ["Approval_Status", "Approval Status", "Status"]) || "Pending").trim() || "Pending";
}

function financeApprovalFromExpenseCore_(row) {
  const id = String(firstValue(row, ["Expense_ID", "Expense ID", "ExpenseId"]) || "").trim();
  const ref = String(firstValue(row, ["Reference", "Reference_No", "Reference No"]) || "").trim();
  const classification = String(firstValue(row, ["Classification", "Notes"]) || "").toLowerCase();
  const personal = ref.indexOf("RONY-SEP-2026-") === 0 || classification.indexOf("personal draw") >= 0 || classification.indexOf("salary draw") >= 0;
  return {
    Approval_Key: "expense:" + id,
    Source: "Expenses",
    Source_ID: id,
    Transaction_Type: personal ? "Personal Draw" : "Office Expense",
    Transaction_Date: firstValue(row, ["Expense_Date", "Expense Date", "Date"]),
    Project_ID: firstValue(row, ["Project_ID", "Project ID", "ProjectId"]),
    Description: firstValue(row, ["Description", "Particulars", "Expense"]),
    Amount: firstValue(row, ["Amount", "Expense_Amount", "Expense Amount"]),
    Category: firstValue(row, ["Category", "Expense_Category", "Expense Category"]),
    Approval_Status: financeApprovalStatusCore_(row),
    Notes: firstValue(row, ["Notes", "Review_Notes", "Review Notes"]),
    Reviewed_By: firstValue(row, ["Reviewed_By", "Reviewed By"]),
    Reviewed_At: firstValue(row, ["Reviewed_At", "Reviewed At"]),
    Affects_Business_Balance: personal ? false : true
  };
}

function financeApprovalFromPaymentCore_(row) {
  const id = String(firstValue(row, ["Payment_ID", "Payment ID", "PaymentId"]) || "").trim();
  const type = String(firstValue(row, ["Transaction_Type", "Transaction Type"]) || "Office Income").trim() || "Office Income";
  return {
    Approval_Key: "payment:" + id,
    Source: "Payments",
    Source_ID: id,
    Transaction_Type: type,
    Transaction_Date: firstValue(row, ["Payment_Date", "Payment Date", "Date"]),
    Project_ID: firstValue(row, ["Project_ID", "Project ID", "ProjectId"]),
    Description: firstValue(row, ["Payment_For", "Payment For", "Description", "Particulars"]),
    Amount: firstValue(row, ["Amount", "Payment_Amount", "Payment Amount"]),
    Category: firstValue(row, ["Income_Category", "Income Category", "Category"]),
    Approval_Status: financeApprovalStatusCore_(row),
    Notes: firstValue(row, ["Notes", "Review_Notes", "Review Notes"]),
    Reviewed_By: firstValue(row, ["Reviewed_By", "Reviewed By"]),
    Reviewed_At: firstValue(row, ["Reviewed_At", "Reviewed At"]),
    Affects_Business_Balance: firstValue(row, ["Affects_Business_Balance", "Affects Business Balance"])
  };
}

function financeApprovalFromPersonalCore_(row) {
  const id = String(firstValue(row, ["Approval_ID", "Approval ID"]) || "").trim();
  return {
    Approval_Key: "personal:" + id,
    Source: "Approvals",
    Source_ID: id,
    Transaction_Type: String(firstValue(row, ["Transaction_Type", "Approval_Type"]) || "Personal Income"),
    Transaction_Date: firstValue(row, ["Transaction_Date", "Date"]),
    Project_ID: firstValue(row, ["Project_ID", "Project ID"]),
    Description: firstValue(row, ["Description", "Decision_Notes"]),
    Amount: firstValue(row, ["Amount"]),
    Category: firstValue(row, ["Category"]),
    Approval_Status: financeApprovalStatusCore_(row),
    Notes: firstValue(row, ["Review_Notes", "Decision_Notes"]),
    Reviewed_By: firstValue(row, ["Reviewed_By", "Reviewed By"]),
    Reviewed_At: firstValue(row, ["Reviewed_At", "Reviewed At"]),
    Affects_Business_Balance: false
  };
}

function getChairmanFinanceApprovalsCore_(params) {
  chairmanApprovalSessionCore_(params);
  ensureSeptember2026PendingExpensesCore_();
  ensureSeptember2026IncomeCore_();
  ensureSeptember2026PersonalIncomeCore_();

  const expenses = readSheet(CONFIG.SHEETS.EXPENSES)
    .filter(isSeptember2026ExpenseCore_)
    .map(financeApprovalFromExpenseCore_);
  const payments = readSheet(CONFIG.SHEETS.PAYMENTS)
    .filter(isSeptember2026PaymentCore_)
    .map(financeApprovalFromPaymentCore_);
  const personal = readSheet(CONFIG.SHEETS.APPROVALS)
    .filter(function(row) {
      return String(firstValue(row, ["Approval_ID", "Approval ID"]) || "").indexOf("PERSONAL-SEP-2026-") === 0;
    })
    .map(financeApprovalFromPersonalCore_);

  const data = expenses.concat(payments, personal).sort(function(a, b) {
    const ad = new Date(String(a.Transaction_Date || 0)).getTime() || 0;
    const bd = new Date(String(b.Transaction_Date || 0)).getTime() || 0;
    if (ad !== bd) return ad - bd;
    return String(a.Approval_Key || "").localeCompare(String(b.Approval_Key || ""));
  });

  return { success: true, data: data };
}

function reviewChairmanFinanceApprovalCore_(params) {
  const session = chairmanApprovalSessionCore_(params);
  ensureSeptember2026PendingExpensesCore_();
  ensureSeptember2026IncomeCore_();
  ensureSeptember2026PersonalIncomeCore_();

  let key = String((params && (params.approvalKey || params.Approval_Key)) || "").trim();
  let source = String((params && (params.source || params.Source)) || "").trim().toLowerCase();
  let id = String((params && (params.id || params.Source_ID || params.Expense_ID || params.Payment_ID || params.Approval_ID)) || "").trim();
  if (key && key.indexOf(":") > 0) {
    const parts = key.split(":");
    source = String(parts.shift() || "").toLowerCase();
    id = parts.join(":");
  }
  const status = String((params && (params.status || params.Status)) || "").trim();
  if (!id) throw new Error("Approval record ID is required.");
  if (["Approved", "Rejected", "Returned"].indexOf(status) < 0) throw new Error("Invalid approval decision.");

  let sheetName;
  let idHeader;
  if (source === "expense" || source === "expenses") {
    sheetName = CONFIG.SHEETS.EXPENSES;
    idHeader = "Expense_ID";
  } else if (source === "payment" || source === "payments" || source === "income") {
    sheetName = CONFIG.SHEETS.PAYMENTS;
    idHeader = "Payment_ID";
  } else if (source === "personal" || source === "approvals" || source === "approval") {
    sheetName = CONFIG.SHEETS.APPROVALS;
    idHeader = "Approval_ID";
  } else {
    throw new Error("Unknown approval source.");
  }

  const sheet = getSheet(sheetName);
  const headers = approvalHeadersCore_(sheet, [
    idHeader, "Status", "Approval_Status", "Reviewed_By", "Reviewed_At", "Review_Notes",
    "Approved_By", "Approved_At", "Decision_Notes", "Decided_At"
  ]);
  const idIndex = headers.indexOf(idHeader);
  if (idIndex < 0 || sheet.getLastRow() < 2) throw new Error("Approval record was not found.");
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  let rowIndex = -1;
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][idIndex] || "").trim() === id) { rowIndex = i + 2; break; }
  }
  if (rowIndex < 0) throw new Error("Approval record was not found.");

  function setValue(header, value) {
    const index = headers.indexOf(header);
    if (index >= 0) sheet.getRange(rowIndex, index + 1).setValue(value);
  }

  const now = new Date().toISOString();
  const reviewer = session.employeeId || session.userId || "EMP-0001";
  const note = String((params && (params.note || params.Review_Notes)) || (status + " by EMP-0001 / Engr. Jamal Ahmed Bhuiyan")).trim();
  setValue("Status", status);
  setValue("Approval_Status", status);
  setValue("Reviewed_By", reviewer);
  setValue("Reviewed_At", now);
  setValue("Review_Notes", note);
  setValue("Decision_Notes", note);
  setValue("Decided_At", now);
  setValue("Approved_By", status === "Approved" ? "EMP-0001" : "");
  setValue("Approved_At", status === "Approved" ? now : "");

  try { auditSecurityEvent_(session, "FINANCE_APPROVAL", source + ":" + id, status.toUpperCase(), note); } catch (error) {}

  return { success: true, data: { Approval_Key: source + ":" + id, Source_ID: id, Status: status, Reviewed_By: reviewer, Reviewed_At: now } };
}

'''

if 'function getChairmanFinanceApprovalsCore_(' not in s:
    anchor = 'function splitIds(value) {'
    if anchor not in s:
        raise SystemExit("splitIds anchor not found")
    s = s.replace(anchor, unified + anchor, 1)

# New business payments are Pending until chairman approval and the extra fields
# must exist before appendRecord maps the row against headers.
old_save = '''function savePayment(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  return appendRecord(
    CONFIG.SHEETS.PAYMENTS,
    cleanParams(params),
    "PAY-",
    "Payment_ID"
  );

}'''
new_save = '''function savePayment(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  return appendRecord(
    CONFIG.SHEETS.PAYMENTS,
    preparePaymentForApproval_(params, session),
    "PAY-",
    "Payment_ID"
  );

}'''
s = s.replace(old_save, new_save)

old_create = '''function createPayment(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  return appendRecord(
    CONFIG.SHEETS.PAYMENTS,
    cleanParams(params),
    "PAY-",
    "Payment_ID"
  );

}'''
new_create = '''function createPayment(params) {

  const session = requireSession(params);
  if (!isAdminRole(session.role)) throw new Error("Access denied.");

  return appendRecord(
    CONFIG.SHEETS.PAYMENTS,
    preparePaymentForApproval_(params, session),
    "PAY-",
    "Payment_ID"
  );

}'''
s = s.replace(old_create, new_create)

# Clients should only see approved/effective business receipts.
s = s.replace(
    'payments = payments.map(record => sanitizeBillingRecordForClient(record, "payment"));',
    'payments = effectiveBusinessPayments_(payments).map(record => sanitizeBillingRecordForClient(record, "payment"));'
)

# Manual billing summaries must not count pending/rejected or personal income.
s = s.replace('  payments.forEach(\n    payment => {', '  effectiveBusinessPayments_(payments).forEach(\n    payment => {')
s = s.replace('  payments.forEach(function(payment) {', '  effectiveBusinessPayments_(payments).forEach(function(payment) {')

# sumAmount is used throughout billing/dashboard/invoice totals. Payment records
# with explicit approval metadata are only effective when approved.
s = s.replace(
'''  return records.reduce(
    (
      total,
      record
    ) => {

      return (
        total +''',
'''  return records.reduce(
    (
      total,
      record
    ) => {

      if (firstValue(record || {}, ["Payment_ID", "Payment ID", "PaymentId"]) && !paymentIsFinanciallyEffective_(record)) {
        return total;
      }

      return (
        total +''',
1
)

CODE.write_text(s, encoding="utf-8")

component = r'''"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type Row = Record<string, unknown>;
const CHAIRMAN_ID = "EMP-0001";
const FILTERS = ["All", "Office Income", "Office Expense", "Personal Income", "Personal Draw"] as const;
type Filter = (typeof FILTERS)[number];

function text(value: unknown) { return String(value ?? "").trim(); }
function number(value: unknown) {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money(value: unknown) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(number(value));
}
function keyOf(row: Row) { return text(row.Approval_Key || `${text(row.Source)}:${text(row.Source_ID)}`); }
function typeOf(row: Row) { return text(row.Transaction_Type) || "Finance"; }
function statusOf(row: Row) { return text(row.Approval_Status) || "Pending"; }

async function chairmanQueueApi() {
  const response = await fetch("/api/landview?action=getChairmanPendingApprovals", { method: "GET", credentials: "same-origin", cache: "no-store" });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Could not load chairman approvals."));
  return (json.data || []) as Row[];
}

async function chairmanReviewApi(approvalKey: string, status: "Approved" | "Rejected", note: string) {
  const response = await fetch("/api/landview", {
    method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reviewChairmanPendingApproval", approvalKey, status, note }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || `Could not mark ${approvalKey} as ${status}.`));
  return json.data || {};
}

export default function ChairmanExpenseApproval() {
  const [user, setUser] = useState<any>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const employeeId = text(user?.employeeId || user?.Employee_ID || user?.userId || user?.User_ID).toUpperCase();
  const name = text(user?.name || user?.Name || user?.username || user?.Username).toLowerCase();
  const isChairman = employeeId === CHAIRMAN_ID || name.includes("jamal rony") || name.includes("jamal ahmed bhuiyan");

  async function loadQueue() {
    setLoading(true); setError(""); setMessage("");
    try {
      const data = await chairmanQueueApi();
      setRows(data);
      setMessage(`Loaded ${data.length} September 2026 finance transaction${data.length === 1 ? "" : "s"} for EMP-0001 review.`);
    } catch (e: any) {
      setError(e?.message || "Could not load the September 2026 finance approval queue.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    void landViewApi.getSession().then((session) => {
      setUser(session?.user || null);
      const u = session?.user;
      const id = text(u?.employeeId || u?.Employee_ID || u?.userId || u?.User_ID).toUpperCase();
      const n = text(u?.name || u?.Name || u?.username || u?.Username).toLowerCase();
      if (id === CHAIRMAN_ID || n.includes("jamal rony") || n.includes("jamal ahmed bhuiyan")) void loadQueue();
    }).catch(() => setError("Could not verify the employee session.")).finally(() => setSessionReady(true));
  }, []);

  const pending = useMemo(() => rows.filter((row) => statusOf(row).toLowerCase() === "pending"), [rows]);
  const decided = useMemo(() => rows.filter((row) => statusOf(row).toLowerCase() !== "pending"), [rows]);
  const visible = useMemo(() => pending.filter((row) => filter === "All" || typeOf(row) === filter), [pending, filter]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((item) => [item, item === "All" ? pending.length : pending.filter((row) => typeOf(row) === item).length])), [pending]);
  const officeIncome = pending.filter((row) => typeOf(row) === "Office Income").reduce((sum, row) => sum + number(row.Amount), 0);
  const officeExpense = pending.filter((row) => typeOf(row) === "Office Expense").reduce((sum, row) => sum + number(row.Amount), 0);
  const personalIncome = pending.filter((row) => typeOf(row) === "Personal Income").reduce((sum, row) => sum + number(row.Amount), 0);
  const personalDraw = pending.filter((row) => typeOf(row) === "Personal Draw").reduce((sum, row) => sum + number(row.Amount), 0);

  async function decide(row: Row, status: "Approved" | "Rejected") {
    const key = keyOf(row); if (!key) return;
    setBusy(key); setError(""); setMessage("");
    const reviewNote = text(notes[key]) || `${status} by EMP-0001 · Engr. Jamal Ahmed Bhuiyan`;
    try {
      await chairmanReviewApi(key, status, reviewNote);
      setRows((current) => current.map((item) => keyOf(item) === key ? { ...item, Approval_Status: status, Reviewed_By: CHAIRMAN_ID, Reviewed_At: new Date().toISOString(), Notes: reviewNote } : item));
      setMessage(`${text(row.Source_ID) || key} ${status.toLowerCase()} by EMP-0001.`);
    } catch (e: any) { setError(e?.message || `Could not mark ${key} as ${status}.`); }
    finally { setBusy(""); }
  }

  if (!sessionReady || !isChairman) return null;

  return <section className="chairman-approval" id="chairman-finance-approvals">
    <style>{`
      .chairman-approval{margin-top:22px;padding:20px;border:1px solid #573033;border-radius:14px;background:linear-gradient(180deg,#211315,#111418);color:#f7f7f7}.chairman-approval *{box-sizing:border-box}.cap-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end}.cap-head h2{margin:5px 0 0;font-size:24px}.cap-head p{max-width:720px;margin:0;color:#b7aaac;font-size:11px;line-height:1.6}.cap-badge{display:inline-flex;padding:6px 9px;border-radius:999px;background:#4b181c;color:#ffaaa5;font-size:9px;font-weight:900;letter-spacing:.08em}.cap-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0}.cap-stat{padding:13px;border:1px solid #3d3335;border-radius:9px;background:#14171b}.cap-stat span{display:block;color:#8f8587;font-size:9px;text-transform:uppercase}.cap-stat strong{display:block;margin-top:6px;font-size:20px}.cap-stat small{display:block;margin-top:5px;color:#817a7b;font-size:9px}.cap-filter{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0}.cap-filter button{border:1px solid #3c4147;border-radius:999px;background:#191d22;color:#aaa;padding:7px 10px;font-size:10px;cursor:pointer}.cap-filter button.active{border-color:#87363d;background:#421c20;color:#ffd0cc}.cap-actions-top{display:flex;justify-content:flex-end;margin:0 0 10px}.cap-refresh{border:1px solid #4b4f55;border-radius:7px;background:#20252b;color:#eee;padding:8px 10px;font-size:10px;cursor:pointer}.cap-msg{margin:10px 0;padding:10px 12px;border-radius:8px;font-size:10px}.cap-msg.err{background:#421f22;color:#ffaaaa}.cap-msg.ok{background:#173823;color:#a7e9b9}.cap-list{display:grid;gap:10px}.cap-row{padding:14px;border:1px solid #34393f;border-radius:10px;background:#11151a}.cap-row-top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.cap-type{display:inline-flex;margin-bottom:7px;padding:4px 7px;border-radius:999px;background:#262c32;color:#cbd2d8;font-size:9px;font-weight:800}.cap-type.income{background:#163624;color:#9be3b3}.cap-type.personal{background:#34263b;color:#ddb8ef}.cap-row strong{display:block;font-size:13px}.cap-meta{margin-top:5px;color:#8f989f;font-size:10px;line-height:1.5}.cap-amount{font-size:17px;font-weight:900;color:#fff;white-space:nowrap}.cap-note{width:100%;margin-top:11px;border:1px solid #3d434a;border-radius:7px;background:#0d1115;color:#eee;padding:9px 10px;font-size:10px}.cap-decisions{display:flex;gap:8px;margin-top:9px}.cap-decisions button{border-radius:7px;padding:8px 12px;font-size:10px;font-weight:800;cursor:pointer}.cap-approve{border:1px solid #2b714a;background:#183724;color:#9ae5b3}.cap-reject{border:1px solid #7b363a;background:#391c1e;color:#ffaaaa}.cap-empty{padding:18px;border:1px dashed #3d4247;border-radius:9px;color:#8e979f;text-align:center;font-size:11px}.cap-foot{margin-top:14px;color:#847b7d;font-size:10px;line-height:1.5}@media(max-width:800px){.cap-head{align-items:flex-start;flex-direction:column}.cap-stats{grid-template-columns:1fr 1fr}.cap-row-top{flex-direction:column}}@media(max-width:520px){.cap-stats{grid-template-columns:1fr}}
    `}</style>
    <div className="cap-head"><div><span className="cap-badge">EMP-0001 · FINANCE CONTROL</span><h2>September 2026 approvals</h2></div><p>One queue for LAND VIEW office income, office expenses, personal income and personal draws. Personal income is reviewed for accountability but never enters LAND VIEW business income or cash totals.</p></div>
    <div className="cap-stats">
      <div className="cap-stat"><span>Office income pending</span><strong>{money(officeIncome)}</strong><small>{counts["Office Income"] || 0} records</small></div>
      <div className="cap-stat"><span>Office expense pending</span><strong>{money(officeExpense)}</strong><small>{counts["Office Expense"] || 0} records</small></div>
      <div className="cap-stat"><span>Personal income pending</span><strong>{money(personalIncome)}</strong><small>Does not affect business totals</small></div>
      <div className="cap-stat"><span>Personal draw pending</span><strong>{money(personalDraw)}</strong><small>{decided.length} already decided</small></div>
    </div>
    {error && <div className="cap-msg err">{error}</div>}{message && <div className="cap-msg ok">{message}</div>}
    <div className="cap-actions-top"><button className="cap-refresh" disabled={loading} onClick={() => void loadQueue()}>{loading ? "Refreshing…" : "Refresh finance approvals"}</button></div>
    <div className="cap-filter">{FILTERS.map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item} · {counts[item] || 0}</button>)}</div>
    <div className="cap-list">
      {visible.map((row) => {
        const key = keyOf(row); const type = typeOf(row); const personal = type.startsWith("Personal"); const income = type.includes("Income");
        return <article className="cap-row" key={key}>
          <div className="cap-row-top"><div><span className={`cap-type ${income ? "income" : ""} ${personal ? "personal" : ""}`}>{type}</span><strong>{text(row.Description) || type}</strong><div className="cap-meta">{text(row.Source_ID)}{text(row.Transaction_Date) ? ` · ${text(row.Transaction_Date)}` : ""}{text(row.Category) ? ` · ${text(row.Category)}` : ""}{text(row.Project_ID) ? ` · ${text(row.Project_ID)}` : ""}</div></div><div className="cap-amount">{money(row.Amount)}</div></div>
          <input className="cap-note" value={notes[key] || ""} onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))} placeholder="Optional EMP-0001 review note" />
          <div className="cap-decisions"><button className="cap-approve" disabled={busy === key} onClick={() => void decide(row, "Approved")}>Approve</button><button className="cap-reject" disabled={busy === key} onClick={() => void decide(row, "Rejected")}>Reject</button></div>
        </article>;
      })}
      {!loading && !visible.length && <div className="cap-empty">No pending {filter === "All" ? "finance transactions" : filter.toLowerCase()}.</div>}
    </div>
    <div className="cap-foot">Pending office receipts do not count toward paid/billing totals until approved. Personal income is kept only in the approval register and is never posted as LAND VIEW business income.</div>
  </section>;
}
'''

COMPONENT.write_text(component, encoding="utf-8")
print("Unified chairman finance approval backend and UI patched")
