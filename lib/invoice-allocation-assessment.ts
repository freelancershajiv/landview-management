/** Presentation-only classification of canonical invoice allocations.
 * A historical Paid flag without linked payments is a review exception, never
 * proof of a new collectible debt. All monetary values stay in source records.
 */
export type InvoiceAllocationStatus = "unpaid" | "partial" | "paid" | "review";
export type InvoiceAllocationAssessment = { status: InvoiceAllocationStatus; reason: string };

export function classifyInvoiceAllocation(input: {
  netAmount: number;
  allocatedAmount: number;
  recordedPaid: number;
  settled: boolean;
  invoiceCount: number;
}): InvoiceAllocationAssessment {
  const net = Math.max(0, Number(input.netAmount) || 0);
  const allocated = Math.max(0, Number(input.allocatedAmount) || 0);
  const recordedPaid = Math.max(0, Number(input.recordedPaid) || 0);
  const tolerance = 0.01;
  if (allocated > net + tolerance) {
    return { status: "review", reason: "Linked payments exceed this bill's net amount." };
  }
  if (input.settled && allocated + tolerance < net) {
    return { status: "review", reason: "Historically marked Paid, but linked allocations do not cover the bill. Do not create new debt automatically." };
  }
  if (Math.abs(recordedPaid - allocated) > tolerance) {
    return { status: "review", reason: "Recorded paid amount differs from invoice-linked payments. Verify the allocation and historical entries." };
  }
  if (net > tolerance && input.invoiceCount === 0) {
    return { status: "review", reason: "No active invoice record is linked to this bill." };
  }
  if (net <= tolerance || allocated + tolerance >= net) return { status: "paid", reason: "" };
  if (allocated > tolerance) return { status: "partial", reason: "" };
  return { status: "unpaid", reason: "" };
}
