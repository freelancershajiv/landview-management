/** Pure guardrails for a single existing invoice-allocation reassignment.
 * No payment amount, ledger entry, bill, or issued invoice is ever rewritten.
 */
export type CorrectionTarget = { id: string; projectId: string; category: string; billCode: string; amount: number; allocated: number; settled: boolean; active: boolean };
export type CorrectionPayment = { id: string; projectId: string; category: string; amount: number; effective: boolean };
export type CorrectionAllocation = { id: string; projectId: string; paymentId: string; invoiceId: string; amount: number };

export function allocationMoveError(
  allocation: CorrectionAllocation | undefined,
  payment: CorrectionPayment | undefined,
  source: CorrectionTarget | undefined,
  destination: CorrectionTarget | undefined,
): string {
  if (!allocation || !payment || !source || !destination) return "The allocation, payment or invoice no longer exists.";
  if (!payment.effective) return "Only effective posted payments may be reassigned.";
  if (!source.active || !destination.active) return "Draft, void or cancelled invoices cannot receive corrections.";
  if (source.id === destination.id) return "Choose a different invoice.";
  if ([allocation.projectId, payment.projectId, source.projectId, destination.projectId].some((id) => !id || id !== payment.projectId))
    return "Cross-project allocation changes are prohibited.";
  if (allocation.paymentId !== payment.id || allocation.invoiceId !== source.id) return "The source allocation has changed.";
  if (source.category !== destination.category || source.category !== payment.category)
    return "An allocation can move only between invoices and payments of the same billing category.";
  if (!(allocation.amount > 0.009) || !Number.isFinite(allocation.amount)) return "Invalid allocation amount.";
  if (source.settled || destination.settled)
    return "A historical settled bill requires separate manual reconciliation; its allocations cannot be moved here.";
  if (destination.allocated + allocation.amount > destination.amount + 0.01)
    return "The destination invoice does not have enough unallocated capacity.";
  return "";
}

export function invoiceLedgerComparison(input: {
  paymentAmount: number; transactionAmount?: number;
  transactionFound: boolean; historical: boolean;
  paymentScope: string; ledgerScope?: string;
}) {
  if (input.historical) return { status: "historical" as const, reason: "Historical ledger entry requires source review." };
  if (!input.transactionFound) return { status: "review" as const, reason: "Effective payment has no matching TXN-PAY ledger transaction." };
  if (Math.abs(input.paymentAmount - (input.transactionAmount ?? 0)) > 0.01)
    return { status: "review" as const, reason: "Received payment and ledger transaction amounts differ." };
  if (input.ledgerScope && input.paymentScope && input.ledgerScope !== input.paymentScope)
    return { status: "review" as const, reason: "Payment routing and ledger scope differ." };
  return { status: "matched" as const, reason: "" };
}
