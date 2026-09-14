import type { FinanceSheetData } from "./api";

export const invoiceTabs = ["Summary", "File List", "Design Bill", "Design Deposit", "Supervision Bill", "S Deposit", "Others Bill", "Others Bill Deposit"];

export function normalizeFileId(value: string) {
  const match = value.trim().match(/^(?:LV\s*-?\s*)?0*(\d+)$/i);
  return match ? String(Number(match[1])) : "";
}

export function sheetAmount(value: string | undefined) {
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text === "—") return 0;
  const clean = text.replace(/BDT|Tk\.?|৳|,/gi, "").replace(/\s/g, "");
  const number = Number(/^\(.*\)$/.test(clean) ? `-${clean.slice(1, -1)}` : clean);
  if (!Number.isFinite(number)) throw new Error("A billing amount is invalid. Check the Google Sheet.");
  return number;
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
    throw new Error(files.length > 1 ? "Duplicate File ID in File List." : `File LV-${id} was not found in File List.`);
  }

  const file = files[0];
  const summary = summaries[0] || [];
  const categories = [
    { name: "Engineering", bill: "Design Bill", deposit: "Design Deposit", discountIndex: 4 },
    { name: "Supervision", bill: "Supervision Bill", deposit: "S Deposit", discountIndex: 8 },
    { name: "Others", bill: "Others Bill", deposit: "Others Bill Deposit", discountIndex: 12 },
  ];

  const invoices = categories.map((category) => {
    const items = matching(category.bill).map((row) => ({
      service: row[1],
      price: row[2],
      quantity: row[3],
      amount: sheetAmount(row[4]),
    }));

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
      name: file[1],
      address: file[2],
      phone: file[3],
      floor: file[4],
      type: file[5],
      area: file[6],
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

function paymentRecordValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
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
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function verificationAmount(value: unknown) {
  try {
    return sheetAmount(String(value ?? ""));
  } catch {
    return Number.NaN;
  }
}

export function verifySheetInvoicesWithPayments(
  billing: SheetInvoices,
  databasePayments: Record<string, unknown>[],
) {
  const candidates = databasePayments.map((record, index) => ({
    index,
    date: verificationDateKey(paymentRecordValue(record, ["Payment_Date", "Payment Date", "Date"])),
    amount: verificationAmount(paymentRecordValue(record, ["Amount", "Payment_Amount", "Payment Amount"])),
    id: String(paymentRecordValue(record, ["Payment_ID", "Payment ID", "PaymentId", "Income_ID", "Income ID"])).trim(),
  }));
  const used = new Set<number>();

  for (const category of billing.invoices) {
    for (const payment of category.payments) {
      if (payment.verification === "Verified") continue;
      const date = verificationDateKey(payment.date);
      if (!date || !Number.isFinite(payment.amount)) continue;

      const matches = candidates.filter((candidate) =>
        !used.has(candidate.index) &&
        !!candidate.id &&
        candidate.date === date &&
        Number.isFinite(candidate.amount) &&
        Math.abs(candidate.amount - payment.amount) < 0.01
      );

      if (matches.length === 1) {
        const match = matches[0];
        used.add(match.index);
        payment.verification = "Verified";
        payment.incomeId = match.id;
      }
    }
  }

  return billing;
}
