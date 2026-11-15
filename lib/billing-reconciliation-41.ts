/** Read-only Billing 4.1 classifications.
 * These labels identify evidence and reconciliation work, NEVER debt or missing cash.
 */
export type ReconciliationSeverity = "review" | "historical" | "info";
export type ReconciliationCaseType =
  | "receipt_not_issued" | "ledger_transaction_unlinked"
  | "ledger_amount_mismatch" | "ledger_scope_mismatch" | "ledger_project_mismatch"
  | "receipt_amount_mismatch" | "receipt_project_mismatch"
  | "payment_overallocated" | "unallocated_advance" | "historical_evidence";

export type PaymentFacts = {
  amount: number;
  effective: boolean;
  historical: boolean;
  issuedReceipt: boolean;
  receiptAmount: number | null;
  receiptProjectMatches: boolean;
  linkedLedger: boolean;
  ledgerAmount: number | null;
  paymentScope: string;
  ledgerScope: string;
  ledgerProjectMatches: boolean;
  allocated: number;
};

export type DetectedIssue = {
  type: ReconciliationCaseType;
  severity: ReconciliationSeverity;
  explanation: string;
  difference: number;
};

const round = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
export function paymentReconciliationIssues(facts: PaymentFacts): DetectedIssue[] {
  const amount = round(facts.amount);
  const allocated = round(facts.allocated);
  if (amount < 0) return [{ type: "payment_overallocated", severity: "review", explanation: "The recorded payment amount is negative; investigate the original transaction.", difference: Math.abs(amount) }];
  // Excluded historical/legacy entries are not current receivables.
  // We show one informational case instead of multiplying historic anomalies.
  if (!facts.effective || facts.historical) {
    if (!facts.historical || (facts.issuedReceipt && facts.linkedLedger)) return [];
    return [{ type: "historical_evidence", severity: "historical",
      explanation: "Legacy/excluded payment lacks a current receipt or ledger reference. Verify historical source records; do not create a new receivable.",
      difference: 0 }];
  }
  const result: DetectedIssue[] = [];
  if (!facts.issuedReceipt) result.push({
    type: "receipt_not_issued", severity: "review",
    explanation: "An effective project payment has no currently issued, nonvoided receipt record. Check its receipt and verification history before considering reissue.", difference: 0,
  });
  if (facts.issuedReceipt && facts.receiptAmount != null && Math.abs(round(facts.receiptAmount) - amount) > .01)
    result.push({ type: "receipt_amount_mismatch", severity: "review", explanation: "The issued receipt and recorded payment have different amounts. Review receipt snapshots before reissuing.", difference: Math.abs(round(facts.receiptAmount) - amount) });
  if (facts.issuedReceipt && !facts.receiptProjectMatches)
    result.push({ type: "receipt_project_mismatch", severity: "review", explanation: "Receipt and payment reference different projects. Verify source identity.", difference: 0 });
  if (!facts.linkedLedger) result.push({
    type: "ledger_transaction_unlinked", severity: "review",
    explanation: "An effective payment has no matching linked ledger transaction by stored ID or canonical payment reference. Search legacy references before adjustments.", difference: 0,
  });
  else {
    if (facts.ledgerAmount != null && Math.abs(round(facts.ledgerAmount) - amount) > .01)
      result.push({ type: "ledger_amount_mismatch", severity: "review",
        explanation: "A linked ledger transaction and the original payment have different amounts. Investigate the journal; this does not establish a new client due.",
        difference: Math.abs(round(facts.ledgerAmount) - amount),
      });
    if (!facts.ledgerProjectMatches)
      result.push({ type: "ledger_project_mismatch", severity: "review", explanation: "Linked ledger transaction references a different project. Verify ledger routing.", difference: 0 });
    if (facts.paymentScope && facts.ledgerScope && facts.paymentScope !== facts.ledgerScope)
      result.push({ type: "ledger_scope_mismatch", severity: "review",
        explanation: "Payment and ledger transaction are assigned to different finance scopes. Review routing without changing the payment amount.",
        difference: 0 });
  }
  if (allocated > amount + .01)
    result.push({ type: "payment_overallocated", severity: "review",
      explanation: "Invoice allocations exceed the recorded payment amount. Freeze further transfers and review original allocation references.",
      difference: round(allocated - amount) });
  if (amount - allocated > .01)
    result.push({ type: "unallocated_advance", severity: "info",
      explanation: "Some received money is not assigned to an invoice. It may be a legitimate advance, not an overdue balance.",
      difference: round(amount - allocated) });
  return result;
}

export function reviewStatus(events: Array<{action:string; actor:string; fingerprint:string; createdAt:string; decision?:string}>,
 fingerprint: string) {
  const scoped = events.filter(e => e.fingerprint === fingerprint).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  const last = scoped[scoped.length - 1];
  if (!last) return "open" as const;
  if (last.action === "requested") return "pending" as const;
  if (last.action === "reviewed") return "reviewed" as const;
  if (last.action === "rejected") return "rejected" as const;
  return "open" as const;
}
