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
