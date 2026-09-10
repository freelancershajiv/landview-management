"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { landViewApi } from "@/lib/api";
import {
  buildSheetInvoices,
  invoiceTabs,
  normalizeFileId,
  type SheetInvoices,
} from "@/lib/sheet-invoices";
import styles from "./invoice.module.css";

const money = (value: number) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(value);

export default function ProjectBillingPage() {
  const [fileId, setFileId] = useState("");
  const [result, setResult] = useState<SheetInvoices | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);

  async function load(event: FormEvent) {
    event.preventDefault();
    const id = normalizeFileId(fileId);
    if (!id) {
      setError("Enter a File ID such as 209 or LV-209.");
      return;
    }

    const version = ++request.current;
    setBusy(true);
    setError("");
    setResult(null);

    try {
      const sheets = await Promise.all(
        invoiceTabs.map((tab) => landViewApi.getFinanceSheet(tab))
      );
      const billing = buildSheetInvoices(sheets, id);
      if (version === request.current) setResult(billing);
    } catch (err) {
      if (version === request.current) {
        setError(err instanceof Error ? err.message : "Could not load project billing.");
      }
    } finally {
      if (version === request.current) setBusy(false);
    }
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <div>
          <Link href="/admin/finance">← Finance</Link>
          <span className={styles.eyebrow}>LAND VIEW / ACCOUNTS</span>
          <h1>Project Billing Lookup</h1>
          <p>Enter a File ID to pull every bill and deposit and calculate the live balance.</p>
        </div>
      </div>

      <form className={styles.lookup} onSubmit={load}>
        <label htmlFor="billing-file">File ID</label>
        <input
          id="billing-file"
          placeholder="209 or LV-209"
          value={fileId}
          onChange={(event) => {
            setFileId(event.target.value);
            setResult(null);
            setError("");
            request.current++;
            setBusy(false);
          }}
          required
          autoComplete="off"
        />
        <button disabled={busy}>{busy ? "Loading…" : "View billing"}</button>
      </form>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {busy && <div className={styles.loading} role="status">Pulling bill and deposit records…</div>}

      {result && (
        <>
          <section className={styles.projectCard}>
            <div>
              <span>FILE ID</span>
              <strong>{result.id}</strong>
            </div>
            <div>
              <span>CLIENT</span>
              <strong>{result.client.name || "—"}</strong>
              <small>{result.client.phone || "—"}</small>
            </div>
            <div>
              <span>PROJECT TYPE</span>
              <strong>{result.client.type || "—"}</strong>
              <small>{result.client.floor || "—"}</small>
            </div>
            <div className={styles.totalDueCard}>
              <span>TOTAL DUE</span>
              <strong>{money(result.totals.due)}</strong>
            </div>
          </section>

          <section className={styles.categoryGrid}>
            {result.invoices.map((category) => (
              <article className={styles.category} key={category.name}>
                <div className={styles.categoryHeader}>
                  <div>
                    <span>{category.name.toUpperCase()}</span>
                    <h2>{category.name} Billing</h2>
                  </div>
                  <div className={category.due > 0 ? styles.dueBadge : styles.paidBadge}>
                    {category.due > 0 ? "DUE" : "PAID"}
                  </div>
                </div>

                <div className={styles.metrics}>
                  <div><span>Bill</span><strong>{money(category.gross)}</strong></div>
                  <div><span>Discount</span><strong>{money(category.discount)}</strong></div>
                  <div><span>Deposited</span><strong>{money(category.paid)}</strong></div>
                  <div><span>Due</span><strong>{money(category.due)}</strong></div>
                </div>

                <div className={styles.split}>
                  <div>
                    <h3>{category.name} Bill</h3>
                    {category.items.length ? (
                      <div className={styles.tableWrap}>
                        <table>
                          <thead><tr><th>Service</th><th>Rate</th><th>Qty</th><th>Amount</th></tr></thead>
                          <tbody>
                            {category.items.map((item, index) => (
                              <tr key={index}>
                                <td>{item.service || "—"}</td>
                                <td>{item.price || "—"}</td>
                                <td>{item.quantity || "—"}</td>
                                <td>{money(item.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <p className={styles.empty}>No bill records.</p>}
                  </div>

                  <div>
                    <h3>{category.name} Deposit</h3>
                    {category.payments.length ? (
                      <div className={styles.tableWrap}>
                        <table>
                          <thead><tr><th>Date</th><th>Details</th><th>Amount</th></tr></thead>
                          <tbody>
                            {category.payments.map((payment, index) => (
                              <tr key={index}>
                                <td>{payment.date || "—"}</td>
                                <td>{payment.details || "—"}</td>
                                <td>{money(payment.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <p className={styles.empty}>No deposit records.</p>}
                  </div>
                </div>

                <div className={styles.formula}>
                  <span>{money(category.gross)} − {money(category.discount)} − {money(category.paid)}</span>
                  <strong>= {money(category.due)}</strong>
                </div>
              </article>
            ))}
          </section>

          <section className={styles.grandSummary}>
            <div><span>Total Bill</span><strong>{money(result.totals.gross)}</strong></div>
            <div><span>Total Discount</span><strong>{money(result.totals.discount)}</strong></div>
            <div><span>Total Deposited</span><strong>{money(result.totals.paid)}</strong></div>
            <div className={styles.grandDue}><span>Grand Total Due</span><strong>{money(result.totals.due)}</strong></div>
          </section>
        </>
      )}
    </div>
  );
}
