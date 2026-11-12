import type { InvoiceReceivableState, ProjectReceivableState } from "@/lib/billing-receivable-authority";
import { invoiceReminderEligibility } from "@/lib/invoice-reminders";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
const round = (value: number) => Math.round(value * 100) / 100;

export type InvoiceCenterStatus = "issued" | "partial" | "paid" | "review";

export function invoiceCenterStatus(invoice: Pick<InvoiceReceivableState, "settledByBill" | "amount" | "allocated" | "dueBeforeRelief">): InvoiceCenterStatus {
  // A historical Paid marker with insufficient allocations is a reconciliation
  // exception, not an automatic new debt and not an unquestioned paid receipt.
  if (invoice.settledByBill && invoice.allocated + 0.01 < invoice.amount) return "review";
  if (invoice.settledByBill || invoice.dueBeforeRelief <= 0.009) return "paid";
  if (invoice.allocated > 0.009) return "partial";
  return "issued";
}

export function invoiceCenterRow(invoice: InvoiceReceivableState, project: Row, projectState: ProjectReceivableState | undefined, description = "") {
  const status = invoiceCenterStatus(invoice);
  return {
    invoiceCode: invoice.invoiceCode,
    billCode: invoice.billCode,
    projectCode: text(project.project_code),
    projectName: text(project.project_name),
    clientName: text(project.client_name_snapshot),
    category: invoice.category,
    service: text(description || invoice.row.description || invoice.row.category || invoice.category),
    issueDate: text(invoice.row.issue_date),
    dueDate: text(invoice.row.due_date),
    amount: round(invoice.amount),
    allocated: round(invoice.allocated),
    invoiceUnallocatedBalance: round(invoice.dueBeforeRelief),
    projectCollectibleDue: round(projectState?.totalDue || 0),
    status,
    reminderEligible: invoiceReminderEligibility(project, projectState?.totalDue || 0).eligible,
    source: text(invoice.row.created_via),
  };
}

export function invoiceCenterSummary(rows: ReturnType<typeof invoiceCenterRow>[], totals: {
  billed: number; paid: number; due: number; remainingUnallocated: number;
  engineeringDue: number; supervisionDue: number; otherDue: number;
}) {
  const counts = { issued: 0, partial: 0, paid: 0, review: 0 };
  for (const row of rows) counts[row.status] += 1;
  return {
    invoiceCount: rows.length,
    invoiceValue: round(rows.reduce((sum, row) => sum + row.amount, 0)),
    invoiceAllocated: round(rows.reduce((sum, row) => sum + row.allocated, 0)),
    projectBilled: round(totals.billed),
    projectPaid: round(totals.paid),
    collectibleDue: round(totals.due),
    availableAdvances: round(totals.remainingUnallocated),
    engineeringDue: round(totals.engineeringDue),
    supervisionDue: round(totals.supervisionDue),
    otherDue: round(totals.otherDue),
    counts,
  };
}
