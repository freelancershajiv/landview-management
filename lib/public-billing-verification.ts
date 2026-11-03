import { handleLandviewDataAction, normalizeProjectCode, selectRows } from "@/lib/supabase-data";
import { loadReceivableAuthority } from "@/lib/billing-receivable-authority";

type Row = Record<string, any>;
export type PublicBillingCategoryName = "Engineering Bill" | "Supervision Bill" | "Other Services Bill";

export type PublicBillingItem = {
  billId: string;
  date: string;
  description: string;
  rate: number;
  quantity: number;
  amount: number;
  discount: number;
  net: number;
};

export type PublicBillingPayment = {
  paymentId: string;
  date: string;
  amount: number;
  method: string;
  reference: string;
  status: string;
};

export type PublicBillingCategory = {
  name: PublicBillingCategoryName;
  gross: number;
  discount: number;
  paid: number;
  due: number;
  items: PublicBillingItem[];
  payments: PublicBillingPayment[];
};

export type PublicBillingVerification = {
  fileId: string;
  invoiceId: string;
  invoiceDate: string;
  clientName: string;
  projectName: string;
  projectType: string;
  floors: string;
  address: string;
  phone: string;
  status: "DUE" | "UNPAID" | "PARTIALLY PAID" | "FULL PAID";
  categories: PublicBillingCategory[];
  totals: { gross: number; discount: number; paid: number; due: number };
  lastPayment: PublicBillingPayment | null;
  updatedAt: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const parsed = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function billingCategory(row: Row): PublicBillingCategoryName {
  const source = text(row.Billing_Category || row.Category || row.Payment_For || row.Income_Category || row.Description).toLowerCase();
  if (/supervision/.test(source)) return "Supervision Bill";
  if (/other|soil|survey|municipality|file pass/.test(source)) return "Other Services Bill";
  return "Engineering Bill";
}

function activeBill(row: Row) {
  return !["void", "voided", "cancelled", "canceled", "rejected"].includes(text(row.Status).toLowerCase());
}

function activePayment(row: Row) {
  if (text(row.Transaction_Type).toLowerCase() === "personal income" || row.Affects_Business_Balance === false) return false;
  const status = text(row.Approval_Status || row.Status).toLowerCase().replace(/[_-]+/g, " ");
  return !status || ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid", "posted"].includes(status);
}

function dateValue(value: unknown) {
  const parsed = new Date(text(value));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export async function loadPublicBillingVerification(rawFileId: string): Promise<PublicBillingVerification> {
  const fileId = normalizeProjectCode(rawFileId);
  if (!/^LV-\d+$/.test(fileId)) throw new Error("Invalid File ID.");

  const [project, billing, invoices] = await Promise.all([
    handleLandviewDataAction("getProject", { projectId: fileId }, null) as Promise<Row>,
    handleLandviewDataAction("getProjectBilling", { projectId: fileId }, null) as Promise<Row>,
    handleLandviewDataAction("getInvoices", { projectId: fileId }, null).catch(() => []) as Promise<Row[]>,
  ]);

  const bills = (Array.isArray(billing?.bills) ? billing.bills : []).filter(activeBill) as Row[];
  const payments = (Array.isArray(billing?.payments) ? billing.payments : []).filter(activePayment) as Row[];

  const categoryNames: PublicBillingCategoryName[] = ["Engineering Bill", "Supervision Bill", "Other Services Bill"];
  const categories = categoryNames.map((name): PublicBillingCategory => {
    const categoryBills = bills.filter((row) => billingCategory(row) === name);
    const categoryPayments = payments.filter((row) => billingCategory(row) === name);
    const gross = categoryBills.reduce((sum, row) => sum + num(row.Amount), 0);
    const discount = categoryBills.reduce((sum, row) => sum + num(row.Discount), 0);
    const paid = categoryPayments.reduce((sum, row) => sum + num(row.Amount), 0);

    return {
      name,
      gross,
      discount,
      paid,
      due: Math.max(0, gross - discount - paid),
      items: categoryBills.map((row) => ({
        billId: text(row.Bill_ID),
        date: text(row.Bill_Date),
        description: text(row.Description) || name,
        rate: num(row.Unit_Price),
        quantity: num(row.Quantity),
        amount: num(row.Amount),
        discount: num(row.Discount),
        net: num(row.Amount) - num(row.Discount),
      })),
      payments: categoryPayments.map((row) => ({
        paymentId: text(row.Payment_ID),
        date: text(row.Payment_Date),
        amount: num(row.Amount),
        method: text(row.Payment_Method) || "Client Payment",
        reference: text(row.Reference_No),
        status: text(row.Approval_Status || row.Status) || "Approved",
      })),
    };
  });

  const totals = categories.reduce(
    (sum, category) => ({
      gross: sum.gross + category.gross,
      discount: sum.discount + category.discount,
      paid: sum.paid + category.paid,
      due: sum.due + category.due,
    }),
    { gross: 0, discount: 0, paid: 0, due: 0 },
  );

  const sortedPayments = categories
    .flatMap((category) => category.payments)
    .sort((a, b) => dateValue(b.date) - dateValue(a.date));
  const latestBillDate = bills.map((row) => text(row.Bill_Date)).sort((a, b) => dateValue(b) - dateValue(a))[0] || "";
  const latestInvoice = (Array.isArray(invoices) ? invoices : [invoices])
    .filter(Boolean)
    .sort((a, b) => dateValue(b.Issue_Date || b.Created_At) - dateValue(a.Issue_Date || a.Created_At))[0] as Row | undefined;

  const invoiceId = text(latestInvoice?.Invoice_No || latestInvoice?.Invoice_ID) || `INV-${fileId.replace(/^LV-/, "")}-01`;
  const updatedAt = new Date().toISOString();
  const invoiceDate = text(latestInvoice?.Issue_Date) || sortedPayments[0]?.date || latestBillDate || updatedAt;

  return {
    fileId,
    invoiceId,
    invoiceDate,
    clientName: text(project?.Client_Name),
    projectName: text(project?.Project_Name),
    projectType: text(project?.Project_Type),
    floors: text(project?.Floors),
    address: text(project?.Location),
    phone: text(project?.Phone_Number),
    status: totals.due > 0.009 ? "DUE" : "FULL PAID",
    categories,
    totals,
    lastPayment: sortedPayments[0] || null,
    updatedAt,
  };
}

/**
 * Public invoice-scoped verification. It intentionally reads only the selected
 * bill's actual invoice allocations; project-level deposits must never be
 * presented as payments for this bill.
 */
export async function loadPublicBillVerification(rawFileId: string, rawBillCode: string): Promise<PublicBillingVerification> {
  const fileId = normalizeProjectCode(rawFileId);
  const billCode = text(rawBillCode).toUpperCase();
  if (!/^LV-\d+$/.test(fileId) || !/^BILL-[A-Z0-9-]{5,100}$/.test(billCode)) throw new Error("Invalid invoice reference.");

  const project = (await selectRows("projects", { filters: { project_code: fileId }, limit: 1 }))[0];
  if (!project) throw new Error("Project not found.");
  const [authority, bills, allocations] = await Promise.all([
    loadReceivableAuthority({ projectId: text(project.id) }),
    selectRows("bills", { filters: { project_id: project.id, bill_code: billCode }, limit: 1 }),
    selectRows("payment_invoice_allocations", {
      select: "payment_id,invoice_id,allocated_amount",
      filters: { project_id: project.id },
      limit: 20000,
    }),
  ]);
  const bill = bills[0];
  const state = authority.billByCode.get(billCode);
  const invoice = authority.invoices.find((entry) => entry.billCode === billCode);
  if (!bill || !state || !invoice || !state.invoiceIds.length) throw new Error("This invoice is not available for verification.");

  const paymentsById = new Map(authority.payments.filter((entry) => entry.effective).map((entry) => [entry.paymentId, entry]));
  const invoiceIds = new Set(state.invoiceIds);
  const linkedPayments: PublicBillingPayment[] = allocations
    .filter((entry: Row) => invoiceIds.has(text(entry.invoice_id)))
    .flatMap((entry: Row) => {
      const payment = paymentsById.get(text(entry.payment_id));
      const amount = Math.max(0, num(entry.allocated_amount));
      if (!payment || amount <= 0.009) return [];
      return [{
        paymentId: payment.paymentCode,
        date: text(payment.row.payment_date),
        amount,
        method: text(payment.row.payment_method) || "Client Payment",
        reference: text(payment.row.reference_no),
        status: "Verified",
      }];
    })
    .sort((left, right) => dateValue(right.date) - dateValue(left.date));

  const gross = state.gross + state.debitAdjustment;
  const discount = state.effectiveDiscount;
  const paid = state.paidForReceivable;
  const due = state.dueBeforeRelief;
  const name: PublicBillingCategoryName = state.category === "supervision"
    ? "Supervision Bill" : state.category === "other" ? "Other Services Bill" : "Engineering Bill";
  const item: PublicBillingItem = {
    billId: billCode,
    date: text(bill.bill_date || invoice.row.issue_date),
    description: text(bill.description).replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "") || name,
    rate: num(bill.unit_price),
    quantity: num(bill.quantity),
    amount: gross,
    discount,
    net: state.effectiveAmount,
  };
  const category: PublicBillingCategory = {
    name, gross, discount, paid, due, items: [item], payments: linkedPayments,
  };
  const generatedNow = new Date().toISOString();
  return {
    fileId,
    invoiceId: invoice.invoiceCode,
    invoiceDate: text(invoice.row.issue_date || bill.bill_date || generatedNow),
    clientName: text(project.client_name_snapshot || project.project_name),
    projectName: text(project.project_name),
    projectType: text(project.project_type),
    floors: text(project.number_of_stories_text || project.floors),
    address: text(project.location),
    phone: text(project.phone_number_snapshot),
    status: due > 0.009 ? paid > 0.009 ? "PARTIALLY PAID" : "UNPAID" : "FULL PAID",
    categories: [category],
    totals: { gross, discount, paid, due },
    lastPayment: linkedPayments[0] || null,
    updatedAt: generatedNow,
  };
}
