"use client";

import Link from "next/link";
import { workScope, workTaskHref } from "@/lib/work-task-links";
import { useEffect, useState } from "react";
import styles from "./billing-exception-queue.module.css";

type BillingException = {
  type: string;
  projectCode: string;
  billCode: string;
  invoiceCode?: string;
  paymentCode: string;
  paymentCodes?: string[];
  service?: string;
  source?: string;
  amount: number;
  explanation: string;
};

type IntegrityScan = {
  complete: boolean;
  exceptionCount: number;
  exceptions: BillingException[];
};

const amountFormat = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 });

export default function BillingExceptionQueue() {
  const [scan, setScan] = useState<IntegrityScan | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/billing/integrity?delivery=1", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || "Billing scan unavailable.");
        if (!controller.signal.aborted) setScan(result.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Could not load the billing exception queue.");
      });
    return () => controller.abort();
  }, [attempt]);

  const search = query.trim().toLowerCase();
  const matches = scan?.exceptions.filter((row) => [
    row.projectCode, row.billCode, row.invoiceCode, row.service, row.source, row.paymentCode,
    ...(row.paymentCodes ?? []),
  ].some((value) => value?.toLowerCase().includes(search))) ?? [];
  const preview = matches.slice(0, 10);

  return (
    <section className={styles.queue} aria-labelledby="billing-exceptions-title">
      <div className={styles.header}>
        <div>
          <h2 id="billing-exceptions-title">Billing exceptions</h2>
          <p>Review owner · Accounts</p>
        </div>
        <Link href="/admin/billing/integrity">Open Invoice Integrity</Link>
      </div>

      {error ? <p role="alert">{error}{" "}
        <button type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Retry</button>
      </p> : !scan ? <p role="status">Checking billing records…</p> : <>
        <p>{scan.exceptionCount} exceptions found. Flagged amounts are for reconciliation review.</p>
        {!scan.complete && <p role="status">The scan reached its record limit. Results may be incomplete.</p>}
        {scan.exceptionCount > scan.exceptions.length && <p>Search covers the first {scan.exceptions.length} exceptions.</p>}
        {scan.exceptions.length > 0 && <label className={styles.search}>
          Filter billing exceptions
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Project, bill, service or payment" />
        </label>}
        {preview.length > 0 ? <ul className={styles.list}>
          {preview.map((row, index) => {
            const scope = workScope("project", row.projectCode);
            const invoiceQuery = row.invoiceCode || row.billCode;
            const paymentCodes = [...new Set([row.paymentCode, ...(row.paymentCodes ?? [])].filter(Boolean))];
            return (
              <li key={`${row.type}:${row.projectCode}:${invoiceQuery}:${row.paymentCode}:${index}`} className={styles.item}>
                <strong>{[row.projectCode, row.service || invoiceQuery].filter(Boolean).join(" · ") || "Billing record"}</strong>
                <p>{row.explanation}</p>
                <div className={styles.links}>
                  {row.amount > 0 && <span>Flagged amount · ৳{amountFormat.format(row.amount)}</span>}
                  {row.type === "missing_invoice" && row.projectCode
                    ? <Link href={`/admin/billing/bills?fileId=${encodeURIComponent(row.projectCode)}`}>Review bill {row.billCode}</Link>
                    : invoiceQuery && <Link href={`/admin/billing/invoice-center?q=${encodeURIComponent(invoiceQuery)}`}>{invoiceQuery}</Link>}
                  {row.projectCode && <Link href={`/admin/projects/${encodeURIComponent(row.projectCode)}`}>Project workflow</Link>}
                  {row.projectCode && <Link href={`/admin/billing/project-statement?fileId=${encodeURIComponent(row.projectCode)}`}>Project statement</Link>}
                  {scope && <Link href={workTaskHref(scope,
                    `Reconcile billing exception · ${invoiceQuery || row.paymentCode || row.service || row.projectCode}`,
                    [row.explanation, invoiceQuery && `Bill or invoice: ${invoiceQuery}`, paymentCodes.length && `Payments: ${paymentCodes.join(", ")}`].filter(Boolean).join("\n"),
                  )}>Assign follow-up task</Link>}
                </div>
                {paymentCodes.length > 0 && <p>Linked payments · {paymentCodes.join(", ")}</p>}
              </li>
            );
          })}
        </ul> : <p>{search ? "No matching exceptions in this scan." : "No billing exceptions in this scan."}</p>}
        {matches.length > preview.length && <p>Showing {preview.length} of {matches.length} matches. Refine the filter or open Invoice Integrity.</p>}
      </>}
    </section>
  );
}
