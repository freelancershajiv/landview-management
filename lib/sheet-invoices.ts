import type { FinanceSheetData } from "./api";
import { sortServicesByStandardOrder } from "./service-order";

export const invoiceTabs = ["Summary", "File List", "Design Bill", "Design Deposit", "Design Books Bill", "Design Books Deposit", "Supervision Bill", "S Deposit", "Others Bill", "Others Bill Deposit"];

export function normalizeFileId(value: string) {
  const match = value.trim().match(/^(?:LV\s*-?\s*)?0*(\d+)$/i);
  return match ? String(Number(match[1])) : "";
}

export function sheetAmount(value: string | undefined) {
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text === "—") return 0;
  const clean = text.replace(/BDT|Tk\.?|৳|,/gi, "").replace(/\s/g, "");
  const number = Number(/^\(.*\)$/.test(clean) ? `-${clean.slice(1, -1)}` : clean);
  if (!Number.isFinite(number)) throw new Error("A billing amount is invalid. Check the billing database.");
  return number;
}

function cleanBillDescription(value: unknown) {
  return String(value || "")
    .replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "")
    .trim();
}

export function buildSheetInvoices(sheets: FinanceSheetData[], input: string) {
  const id = normalizeFileId(input);
  if (!id) throw new Error("Enter a valid File ID, such as 209 or LV-209.");

  const matching = (tab: string) => {
    const sheet = sheets.find((item) => item.tab === tab);
    if (!sheet) throw new Error(`Could not load ${tab}. Please retry.`);
    return sheet.rows.filter((row) => normalizeFileId(row[0]) === id);
  };

  const files = matching("File List");
  const summaries = matching("Summary");
  if (files.length !== 1) {
    throw new Error(files.length > 1 ? "Duplicate File ID in project data." : `File LV-${id} was not found.`);
  }

  const file = files[0];
  const summary = summaries[0] || [];
  const fileListSheet = sheets.find((item) => item.tab === "File List");
  const normalizedHeader = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const fileField = (aliases: string[]) => {
    const headers = fileListSheet?.headers || [];
    for (const alias of aliases) {
      const wanted = normalizedHeader(alias);
      const index = headers.findIndex((header) => normalizedHeader(header) === wanted);
      if (index >= 0) {
        const value = String(file[index] ?? "").trim();
        if (value) return value;
      }
    }
    return "";
  };
  const categories = [
    { name: "Engineering", bill: "Design Bill", deposit: "Design Deposit", discountIndex: 4 },
    { name: "Design Books", bill: "Design Books Bill", deposit: "Design Books Deposit", discountIndex: 16 },
    { name: "Supervision", bill: "Supervision Bill", deposit: "S Deposit", discountIndex: 8 },
    { name: "Others", bill: "Others Bill", deposit: "Others Bill Deposit", discountIndex: 12 },
  ];

  const invoices = categories.map((category) => {
    const items = sortServicesByStandardOrder(matching(category.bill).map((row) => ({
      service: cleanBillDescription(row[1]),
      price: row[2],
      quantity: row[3],
      amount: sheetAmount(row[4]),
    })));

    const payments = matching(category.deposit).map((row) => ({
      date: row[1],
      details: row[2],
      amount: sheetAmount(row[3]),
      verification: row[4] === "Verified" ? "Verified" : "Unverified",
      incomeId: String(row[5] || "").trim(),
    }));

    const gross = items.reduce((total, row) => total + row.amount, 0);
    const paid = payments.reduce((total, row) => total + row.amount, 0);
    const discount = summary.length > category.discountIndex ? sheetAmount(summary[category.discountIndex]) : 0;
    const due = gross - discount - paid;

    return { name: category.name, items, payments, gross, discount, paid, due };
  });

  return {
    id: `LV-${id}`,
    client: {
      fileId: `LV-${id}`,
      name: file[1],
      address: file[2],
      phone: file[3],
      floor: file[4],
      type: file[5],
      area: file[6],
      referredBy: fileField(["Referred By", "Referred_By", "Referral", "Referral Source", "Ref By", "Reference", "Source"]),
      refContact: fileField(["Ref. Contact", "Ref Contact", "Reference Contact", "Referral Contact", "Referral Phone", "Ref Phone", "Reference Phone"]),
      issueDate: "",
      status: "",
    },
    invoices,
    totals: {
      gross: invoices.reduce((total, item) => total + item.gross, 0),
      discount: invoices.reduce((total, item) => total + item.discount, 0),
      paid: invoices.reduce((total, item) => total + item.paid, 0),
      due: invoices.reduce((total, item) => total + item.due, 0),
    },
  };
}

export type SheetInvoices = ReturnType<typeof buildSheetInvoices>;

type InvoiceCategoryName = "Engineering" | "Design Books" | "Supervision" | "Others";

function recordValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function categoryFromWorkspaceValue(value: unknown): InvoiceCategoryName | "" {
  const text = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (text === "design books" || text === "design book") return "Design Books";
  if (text === "engineering bill" || text === "engineering") return "Engineering";
  if (text === "supervision bill" || text === "supervision") return "Supervision";
  if (text === "other services bill" || text === "others bill" || text === "other services" || text === "others") return "Others";
  return "";
}

function recalculateBilling(billing: SheetInvoices) {
  for (const category of billing.invoices) {
    category.items = sortServicesByStandardOrder(category.items);\n    category.gross = category.items.reduce((sum, item) => sum + item.amount, 0);
    category.paid = category.payments.reduce((sum, payment) => sum + payment.amount, 0);
    category.due = category.gross - category.discount - category.paid;
  }
  billing.totals.gross = billing.invoices.reduce((sum, category) => sum + category.gross, 0);
  billing.totals.discount = billing.invoices.reduce((sum, category) => sum + category.discount, 0);
  billing.totals.paid = billing.invoices.reduce((sum, category) => sum + category.paid, 0);
  billing.totals.due = billing.invoices.reduce((sum, category) => sum + category.due, 0);
  return billing;
}

function normalizedBillDescription(value: unknown) {
  return cleanBillDescription(value)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Compatibility safeguard for sessions backed by an older Apps Script bundle.
 * Canonical project-billing responses already contain the Bills rows, so this
 * function must never append the same service/amount a second time.
 */
export function mergeBillingWorkspaceBills(billing: SheetInvoices, databaseBills: Record<string, unknown>[]) {
  for (const record of databaseBills || []) {
    const status = String(recordValue(record, ["Status", "Bill_Status", "Bill Status"])).trim().toLowerCase();
    if (["cancelled", "canceled", "void", "voided", "rejected"].includes(status)) continue;

    const description = String(recordValue(record, ["Description", "Service", "Particulars"])).trim();
    const prefix = description.match(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i);
    const notes = String(recordValue(record, ["Notes", "Created_Via", "Created Via"]));
    const explicitCategory = recordValue(record, ["Billing_Category", "Billing Category", "Category"]);
    const workspaceEntry = Boolean(prefix) || /billing workspace/i.test(notes) || /billing workspace/i.test(String(recordValue(record, ["Created_Via", "Created Via"])));
    if (!workspaceEntry) continue;

    const categoryName = categoryFromWorkspaceValue(explicitCategory || prefix?.[1] || "");
    const category = billing.invoices.find((item) => item.name === categoryName);
    const billAmount = Number(String(recordValue(record, ["Amount", "Bill_Amount", "Bill Amount"]) || 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
    if (!category || !Number.isFinite(billAmount) || billAmount <= 0) continue;

    const service = description.replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "").trim() || "Service";
    const alreadyIncluded = category.items.some((item) =>
      normalizedBillDescription(item.service) === normalizedBillDescription(service) && Math.abs(item.amount - billAmount) < 0.01,
    );
    if (alreadyIncluded) continue;

    category.items.push({ service, price: "", quantity: "", amount: billAmount });
  }
  return recalculateBilling(billing);
}

function verificationDateKey(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;

  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return text.toLowerCase();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(parsed);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function verificationAmount(value: unknown) {
  try { return sheetAmount(String(value ?? "")); }
  catch { return Number.NaN; }
}

function workspacePaymentIsEffective(record: Record<string, unknown>) {
  const type = String(recordValue(record, ["Transaction_Type", "Transaction Type", "transaction_type"])).trim().toLowerCase();
  if (type === "personal income") return false;
  const impact = String(recordValue(record, ["Affects_Business_Balance", "Affects Business Balance", "affects_business_balance"])).trim().toLowerCase();
  if (["false", "no", "0"].includes(impact)) return false;
  const status = String(recordValue(record, ["Approval_Status", "Approval Status", "approval_status", "Status", "status"])).trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!status) return true;
  return ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid"].includes(status);
}

export function verifySheetInvoicesWithPayments(billing: SheetInvoices, databasePayments: Record<string, unknown>[]) {
  const candidates = databasePayments.map((record, index) => {
    const incomeCategory = categoryFromWorkspaceValue(recordValue(record, [
      "Income_Category", "Income Category", "income_category", "Category", "category",
    ]));
    const paymentForCategory = categoryFromWorkspaceValue(recordValue(record, [
      "Payment_For", "Payment For", "payment_for",
    ]));

    return {
      index,
      record,
      date: verificationDateKey(recordValue(record, ["Payment_Date", "Payment Date", "payment_date", "Date", "date"])),
      rawDate: String(recordValue(record, ["Payment_Date", "Payment Date", "payment_date", "Date", "date"])).trim(),
      amount: verificationAmount(recordValue(record, ["Amount", "amount", "Payment_Amount", "Payment Amount", "payment_amount"])),
      id: String(recordValue(record, ["Payment_ID", "Payment ID", "PaymentId", "payment_code", "Income_ID", "Income ID", "income_id"])).trim(),
      // Income_Category is the canonical billing bucket. Payment_For may be a
      // human-readable purpose (for example "6th Floor R.C.C Bill"), so only
      // use it as a fallback when no canonical category is present.
      category: incomeCategory || paymentForCategory,
    };
  });
  const used = new Set<number>();

  for (const category of billing.invoices) {
    for (const payment of category.payments) {
      // Canonical compatibility rows carry the Payment_ID directly. Mark that
      // source record consumed even when the row is already verified.
      if (payment.incomeId) {
        const exactIndex = candidates.findIndex((candidate) => !used.has(candidate.index) && candidate.id === payment.incomeId);
        if (exactIndex >= 0) {
          used.add(candidates[exactIndex].index);
          payment.verification = "Verified";
          continue;
        }
      }
      if (payment.verification === "Verified") continue;

      const date = verificationDateKey(payment.date);
      if (!date || !Number.isFinite(payment.amount)) continue;
      const matches = candidates.filter((candidate) =>
        !used.has(candidate.index) &&
        !!candidate.id &&
        candidate.date === date &&
        Number.isFinite(candidate.amount) &&
        Math.abs(candidate.amount - payment.amount) < 0.01,
      );
      if (matches.length === 1) {
        const match = matches[0];
        used.add(match.index);
        payment.verification = "Verified";
        payment.incomeId = match.id;
      }
    }
  }

  for (const candidate of candidates) {
    if (used.has(candidate.index) || !candidate.id || !candidate.category || !Number.isFinite(candidate.amount) || candidate.amount <= 0) continue;
    if (!workspacePaymentIsEffective(candidate.record)) continue;
    const category = billing.invoices.find((item) => item.name === candidate.category);
    if (!category) continue;
    const method = String(recordValue(candidate.record, ["Payment_Method", "Payment Method", "Method"])).trim();
    const reference = String(recordValue(candidate.record, ["Reference_No", "Reference No", "Reference"])).trim();
    category.payments.push({
      date: candidate.rawDate || candidate.date,
      details: [method, reference].filter(Boolean).join(" · ") || "Client Payment",
      amount: candidate.amount,
      verification: "Verified",
      incomeId: candidate.id,
    });
    used.add(candidate.index);
  }

  return recalculateBilling(billing);
}
