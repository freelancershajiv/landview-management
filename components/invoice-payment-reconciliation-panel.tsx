"use client";

import Link from "next/link";

export type InvoicePaymentReconciliation = {
  complete: boolean;
  bills: {
    billCode: string;
    invoiceCode: string;
    service: string;
    category: string;
    netAmount: number;
    recordedPaid: number;
    recordedDue: number;
    allocatedAmount: number;
    status: "unpaid" | "partial" | "paid" | "review";
    reason: string;
    payments: {
      billCode: string;
      invoiceCode: string;
      paymentCode: string;
      date: string;
      amount: number;
      details: string;
    }[];
  }[];
  summary: {
    linkedAmount: number;
    unallocatedAmount: number;
    collectibleDue: number;
    reviewCount: number;
    excessivePaymentAllocations: string[];
  };
};

const amount = (value: number) => "৳" + Number(value || 0).toLocaleString("en-BD", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const statusLabel: Record<InvoicePaymentReconciliation["bills"][number]["status"], string> = {
  unpaid: "UNPAID",
  partial: "PARTIALLY PAID",
  paid: "FULLY PAID",
  review: "REVIEW REQUIRED",
};

export default function InvoicePaymentReconciliationPanel({ data }: { data: InvoicePaymentReconciliation }) {
  const cards: [string, number][] = [
    ["Linked to invoices", data.summary.linkedAmount],
    ["Unallocated payments", data.summary.unallocatedAmount],
    ["Project collectible due", data.summary.collectibleDue],
    ["Items needing review", data.summary.reviewCount],
  ];

  return (
    <section className="lvReconciliationPanel" aria-labelledby="lv-reconciliation-heading">
      <div className="lvReconciliationHeading">
        <div>
          <span className="lvReconciliationEyebrow">INVOICE SYSTEM 3.1 · FINANCIAL CONTROL</span>
          <h2 id="lv-reconciliation-heading">Payment reconciliation</h2>
          <p>Read-only comparison of issued bills, verified invoice-linked payments and recorded balances. Unallocated advances are not silently applied to individual bills.</p>
        </div>
        <Link href="/admin/finance/integrity">Open financial integrity review</Link>
      </div>
      <div className="lvReconciliationCards">
        {cards.map(([label, value], index) => (
          <div className={index === 3 && value > 0 ? "lvReconciliationAlertCard" : ""} key={label}>
            <span>{label}</span>
            <strong>{index === 3 ? value.toLocaleString("en-BD") : amount(value)}</strong>
          </div>
        ))}
      </div>
      {!data.complete && <div className="lvReconciliationWarning" role="alert">The finance query reached a source limit. Reconciliation is incomplete; do not rely on this view to certify a balance.</div>}
      {data.summary.reviewCount > 0 && (
        <div className="lvReconciliationWarning" role="status">
          {data.summary.reviewCount} reconciliation exception(s) need checking. Historical Paid entries are not automatically converted into new debts.
        </div>
      )}
      {data.summary.excessivePaymentAllocations.length > 0 && (
        <p className="lvReconciliationNote">
          Payments allocated above their recorded amount: {data.summary.excessivePaymentAllocations.join(", ")}.
        </p>
      )}
      <div className="lvReconciliationTableWrap">
        <table className="lvReconciliationTable">
          <thead><tr><th>Bill / Invoice</th><th>Service & linked payments</th><th>Net billed</th><th>Linked payments</th><th>Recorded paid</th><th>Recorded due</th><th>Status</th></tr></thead>
          <tbody>
            {data.bills.map((bill, index) => (
              <tr key={bill.billCode || String(index)}>
                <td><strong>{bill.billCode || "Unlinked bill"}</strong><small>{bill.invoiceCode || "Invoice ID unavailable"}</small></td>
                <td>
                  <strong>{bill.service || bill.category}</strong>
                  <small>{bill.category}</small>
                  {!!bill.payments.length && (
                    <details>
                      <summary>{bill.payments.length} linked payment reference(s)</summary>
                      <div className="lvReconciliationProofs">
                        {bill.payments.map((payment, paymentIndex) => (
                          <p key={payment.paymentCode + paymentIndex}>
                            <strong>{payment.paymentCode || "No payment code"}</strong> · {payment.date || "Date unavailable"} · {payment.details || "Client payment"} · {amount(payment.amount)}
                          </p>
                        ))}
                      </div>
                    </details>
                  )}
                </td>
                <td className="lvReconciliationAmount">{amount(bill.netAmount)}</td>
                <td className="lvReconciliationAmount">{amount(bill.allocatedAmount)}</td>
                <td className="lvReconciliationAmount">{amount(bill.recordedPaid)}</td>
                <td className="lvReconciliationAmount">{amount(bill.recordedDue)}</td>
                <td>
                  <span className={`lvReconciliationStatus lvReconciliationStatus-${bill.status}`}>{statusLabel[bill.status] || "REVIEW"}</span>
                  {bill.reason && <small className="lvReconciliationReason">{bill.reason}</small>}
                </td>
              </tr>
            ))}
            {!data.bills.length && <tr><td colSpan={7}>No issued bills were found for this project.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="lvReconciliationFootnote">Linked payments are sums of actual invoice allocations. Recorded paid and recorded due remain the canonical receivable values; write-offs or unallocated advances may make the project's collectible due different from the sum of individual invoice balances. This screen does not change financial records.</p>
    </section>
  );
}
