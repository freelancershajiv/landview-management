from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f"{label}: already patched")
        return text
    if old not in text:
        raise SystemExit(f"{label}: target block not found")
    return text.replace(old, new, 1)


lib_path = Path("lib/sheet-invoices.ts")
lib = lib_path.read_text()
old_tail = '''export type SheetInvoices = ReturnType<typeof buildSheetInvoices>;
'''
new_tail = '''export type SheetInvoices = ReturnType<typeof buildSheetInvoices>;

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

  let match = text.match(/^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;

  match = text.match(/^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{2}|\\d{4})$/);
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
'''
lib = replace_once(lib, old_tail, new_tail, "sheet invoice live verification")
lib_path.write_text(lib)

page_path = Path("app/admin/finance/invoices/page.tsx")
page = page_path.read_text()
old_import = '''  buildSheetInvoices,
  invoiceTabs,
  normalizeFileId,
  type SheetInvoices,
'''
new_import = '''  buildSheetInvoices,
  invoiceTabs,
  normalizeFileId,
  verifySheetInvoicesWithPayments,
  type SheetInvoices,
'''
page = replace_once(page, old_import, new_import, "invoice page import")

old_load = '''    try {
      const billing = buildSheetInvoices(await loadFinanceTabs(), id);
      if (version === request.current) {
'''
new_load = '''    try {
      const [financeTabs, databasePayments] = await Promise.all([
        loadFinanceTabs(),
        landViewApi.getPayments(`LV-${id}`).catch(() => [] as Record<string, unknown>[]),
      ]);
      const billing = verifySheetInvoicesWithPayments(
        buildSheetInvoices(financeTabs, id),
        databasePayments,
      );
      if (version === request.current) {
'''
page = replace_once(page, old_load, new_load, "invoice page live payment lookup")
page_path.write_text(page)

print("Invoice live payment verification fallback patched")
