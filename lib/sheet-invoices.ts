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
  const number = Number(/^\(.*\)$/.test(clean) ? `-${clean.slice(1,-1)}` : clean);
  if (!Number.isFinite(number)) throw new Error("An invoice amount is invalid. Check the Google Sheet.");
  return number;
}
export function buildSheetInvoices(sheets: FinanceSheetData[], input: string) {
  const id = normalizeFileId(input);
  if (!id) throw new Error("Enter a valid File ID, such as 209 or LV-209.");
  const matching = (tab: string) => {
    const sheet = sheets.find(s => s.tab === tab);
    if (!sheet) throw new Error(`Could not load ${tab}. Please retry.`);
    return sheet.rows.filter(row => normalizeFileId(row[0]) === id);
  };
  const files = matching("File List"), summaries = matching("Summary");
  if (files.length !== 1 || summaries.length !== 1) throw new Error(files.length > 1 || summaries.length > 1 ? "Duplicate File ID in the workbook. Resolve it before printing." : `File LV-${id} was not found in File List and Summary.`);
  const file = files[0], summary = summaries[0];
  const categories = [
    { name: "Design", bill: "Design Bill", deposit: "Design Deposit", offset: 3 },
    { name: "Supervision", bill: "Supervision Bill", deposit: "S Deposit", offset: 7 },
    { name: "Others", bill: "Others Bill", deposit: "Others Bill Deposit", offset: 11 },
  ];
  const invoices = categories.map(category => {
    const items = matching(category.bill).map(row => ({ service: row[1], price: row[2], quantity: row[3], amount: sheetAmount(row[4]) }));
    const payments = matching(category.deposit).map(row => ({ date: row[1], details: row[2], amount: sheetAmount(row[3]) }));
    const [gross,discount,paid,due] = summary.slice(category.offset,category.offset+4).map(sheetAmount);
    const sum = (rows: {amount:number}[]) => rows.reduce((total,row) => total+row.amount,0);
    if (Math.abs(sum(items)-gross) > .01 || Math.abs(sum(payments)-paid) > .01 || Math.abs(gross-discount-paid-due) > .01) throw new Error(`${category.name} totals do not match the bill and deposit records. Refresh, then check the Google Sheet if this continues.`);
    return { name:category.name, items, payments, gross, discount, paid, due };
  });
  return { id:`LV-${id}`, client:{name:file[1],address:file[2],phone:file[3],floor:file[4],type:file[5],area:file[6]}, invoices };
}
export type SheetInvoices = ReturnType<typeof buildSheetInvoices>;
