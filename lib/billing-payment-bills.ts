import { loadReceivableAuthority, receivableBillIsSettled, receivableStatus, type ReceivableCategoryKey } from "@/lib/billing-receivable-authority";
import { selectRows } from "@/lib/supabase-data";
import { workflowServiceKey } from "@/lib/service-workflow";

export const categoryNames = {
  engineering: "Engineering Bill", other: "Other Services Bill", supervision: "Supervision Bill",
} as const;
export type PaymentCategory = typeof categoryNames[ReceivableCategoryKey];
export type PaymentBillTarget = { bill_id: string; amount: number };

export async function getPaymentBills(projectCode: string) {
  const [project] = await selectRows("projects", {
    select: "id,project_code,client_name_snapshot", filters: { project_code: projectCode }, limit: 1,
  });
  if (!project) throw new Error("Project not found.");
  const authority = await loadReceivableAuthority({ projectId: String(project.id) });
  if (!authority.complete) throw new Error("The full project balance could not be verified.");
  const state = authority.projects.get(String(project.id));
  const categories = Object.fromEntries(Object.entries(categoryNames).map(([key, name]) => {
    const category = key as ReceivableCategoryKey;
    const bills = authority.bills.filter((bill) => bill.category === category);
    const total = (field: "gross" | "effectiveDiscount" | "effectiveAmount" | "paidForReceivable" | "dueBeforeRelief") =>
      bills.reduce((sum, bill) => sum + bill[field], 0);
    const due = state?.[`${category}Due`] ?? 0;
    return [name, { gross: total("gross"), discount: total("effectiveDiscount"), net: total("effectiveAmount"),
      paid: total("paidForReceivable"), relief: Math.max(0, total("dueBeforeRelief") - due), due }];
  })) as Record<PaymentCategory, { gross: number; discount: number; net: number; paid: number; relief: number; due: number }>;

  // Look up the issued line so identically named bills remain distinct.
  const invoices = new Map(authority.invoices.map((invoice) => [invoice.invoiceId, invoice]));
  const ids = [...invoices.keys()];
  const requests = [];
  for (let index = 0; index < ids.length; index += 60) {
    requests.push(selectRows("invoice_items", {
      select: "invoice_id,bill_id,service_name,service_key", inFilters: { invoice_id: ids.slice(index, index + 60) }, limit: 10000,
    }));
  }
  const items = new Map<string, Record<string, unknown>[]>();
  for (const row of (await Promise.all(requests)).flat()) {
    const invoice = invoices.get(String(row.invoice_id));
    if (!invoice || receivableStatus(invoice.status) === "adjusted" || receivableBillIsSettled(invoice.row)) continue;
    const id = String(row.bill_id);
    items.set(id, [...(items.get(id) ?? []), row]);
  }
  const bills = authority.bills.map((bill) => {
    const candidates = (items.get(bill.billId) ?? []).filter((item) => bill.invoiceIds.includes(String(item.invoice_id)));
    const item = candidates.length === 1 ? candidates[0] : undefined;
    const category = categoryNames[bill.category];
    const description = String(bill.row.description || "").replace(/^\[(?:Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "").trim();
    const invoice = item && invoices.get(String(item.invoice_id));
    const currentInvoiceDue = invoice ? Math.max(0, Number(invoice.row.amount ?? invoice.amount) - invoice.allocated) : 0;
    return { billId: bill.billId, billCode: bill.billCode, category,
      name: description || String(item?.service_name || bill.billCode), serviceName: String(item?.service_name || ""),
      net: bill.effectiveAmount, paid: bill.paidForReceivable,
      available: Math.min(bill.dueBeforeRelief, categories[category].due, currentInvoiceDue),
      needsReview: !item && bill.dueBeforeRelief > 0 && categories[category].due > 0,
    };
  }).sort((a, b) => a.billCode.localeCompare(b.billCode));
  return { projectCode, ownerName: String(project.client_name_snapshot || ""), projectDue: state?.totalDue ?? 0, categories, bills };
}

export type PaymentBillOptions = Awaited<ReturnType<typeof getPaymentBills>>;

export function paymentCents(value: unknown) {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  return /^\d+(\.\d{1,2})?$/.test(raw) && Number.isSafeInteger(Math.round(Number(raw) * 100))
    ? Math.round(Number(raw) * 100) : -1;
}

type InputRow = Record<string, unknown>;
export function resolvePaymentTargets(snapshot: PaymentBillOptions, category: PaymentCategory, amount: unknown,
  selected: InputRow[] | undefined, legacy: InputRow[], serviceType: string) {
  const total = paymentCents(amount);
  if (total <= 0) throw new Error("Enter a positive payment amount with up to two decimal places.");
  if (total > paymentCents(snapshot.categories[category].due.toFixed(2))) {
    throw new Error("Payment exceeds the current collectible balance. Refresh the project or choose Receive Advance.");
  }
  const bills = snapshot.bills.filter((bill) => bill.category === category && bill.available > 0);
  const matchLegacy = (row: InputRow) => {
    const name = String(row.serviceName || row.service || "");
    if (!name) throw new Error("Choose an issued bill for this payment.");
    const key = workflowServiceKey(name === "Municipality File Pass" ? "Municipality Approval Contract" : name);
    const matches = bills.filter((bill) => [bill.name, bill.serviceName].some((label) => workflowServiceKey(label) === key));
    if (matches.length !== 1) throw new Error("Choose the exact bill in Receive Payment and submit again.");
    return { billId: matches[0].billId, amount: row.amount ?? row.allocatedAmount };
  };
  const rows = selected ?? (legacy.length ? legacy : [{ serviceName: serviceType, amount }]).map(matchLegacy);
  if (!rows.length) throw new Error("Choose at least one issued bill.");
  if (category !== "Engineering Bill" && rows.length !== 1) throw new Error("Choose one bill for this category.");
  const used = new Set<string>();
  const targets = rows.map((row) => {
    const bill = bills.find((item) => item.billId === row.billId);
    const cents = paymentCents(row.amount);
    if (!bill || used.has(bill.billId)) throw new Error("Choose a distinct collectible bill for each allocation.");
    if (cents <= 0 || cents > Math.round(bill.available * 100)) throw new Error(`Invalid allocation for ${bill.billCode}. Check its current collectible amount.`);
    used.add(bill.billId);
    return { bill_id: bill.billId, amount: cents / 100 };
  });
  if (targets.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) !== total) {
    throw new Error("Bill allocations must exactly equal the payment amount.");
  }
  return targets;
}
