"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { landViewApi, type FinanceSheetData } from "@/lib/api";
import { buildSheetInvoices, invoiceTabs, normalizeFileId, type SheetInvoices } from "@/lib/sheet-invoices";
import styles from "@/app/admin/finance/invoices/invoice.module.css";

const money = (value: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value);

function statementDate() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

async function loadFinanceTabs() {
  const results: FinanceSheetData[] = new Array(invoiceTabs.length);
  let cursor = 0;
  async function worker() {
    while (cursor < invoiceTabs.length) {
      const index = cursor++;
      results[index] = await landViewApi.getFinanceSheet(invoiceTabs[index]);
    }
  }
  await Promise.all(Array.from({ length: 3 }, () => worker()));
  return results;
}

type ClientAccessData = {
  projects?: Array<{ projectId?: string }>;
};

export default function ClientBillingPage() {
  const params = useParams<{ projectId: string }>();
  const rawId = decodeURIComponent(String(params?.projectId || ""));
  const id = normalizeFileId(rawId);
  const [result, setResult] = useState<SheetInvoices | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const generated = useMemo(() => statementDate(), []);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!id) {
        setError("Invalid project File ID.");
        setBusy(false);
        return;
      }

      try {
        const accessResponse = await fetch("/api/client-access", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const accessJson = await accessResponse.json();
        if (!accessResponse.ok || !accessJson?.success) {
          throw new Error(accessJson?.error || "Unable to verify client access.");
        }

        const access = accessJson.data as ClientAccessData;
        const allowed = (access.projects || []).some((project) => normalizeFileId(String(project.projectId || "")) === id);
        if (!allowed) throw new Error("This billing statement is not available for your client account.");

        const billing = buildSheetInvoices(await loadFinanceTabs(), id);
        if (!active) return;
        setResult(billing);

        try {
          const verificationResponse = await fetch("/api/billing-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: billing.id }),
          });
          const verificationJson = await verificationResponse.json();
          if (verificationResponse.ok && verificationJson?.success && verificationJson?.url && active) {
            setVerificationUrl(String(verificationJson.url));
          }
        } catch {
          // Billing remains printable even if verification generation is temporarily unavailable.
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load project billing.");
      } finally {
        if (active) setBusy(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [id]);

  const renderTable = (category: SheetInvoices["invoices"][number], type: "bill" | "deposit") => {
    if (type === "bill") {
      if (!category.items.length) return <p className={styles.empty}>No bill records.</p>;
      return (
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>SL.</th><th>Description</th><th>Rate</th><th>Qty.</th><th>Amount</th></tr></thead>
            <tbody>{category.items.map((item, index) => (
              <tr key={index}><td>{index + 1}</td><td>{item.service || "—"}</td><td>{item.price || "—"}</td><td>{item.quantity || "—"}</td><td>{money(item.amount)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      );
    }

    if (!category.payments.length) return <p className={styles.empty}>No deposit records.</p>;
    return (
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>SL.</th><th>Date</th><th>Details</th><th>Amount</th></tr></thead>
          <tbody>{category.payments.map((payment, index) => (
            <tr key={index}><td>{index + 1}</td><td>{payment.date || "—"}</td><td>{payment.details || "—"}</td><td>{money(payment.amount)}</td></tr>
          ))}</tbody>
        </table>
      </div>
    );
  };

  const statementRef = result ? `INV-${result.id.replace(/^LV-/, "")}-01` : "";
  const projectStatus = result ? (result.totals.due > 0 ? "Partial / Due" : "Full Paid") : "—";
  const qrUrl = verificationUrl ? `/api/billing-verification/qr?data=${encodeURIComponent(verificationUrl)}` : "";

  if (busy) return <div className={styles.loading}>Preparing your LAND VIEW billing statement…</div>;
  if (error) return <div className={styles.workspace}><div className={styles.error} role="alert">{error}</div><Link href="/client">← Back to client portal</Link></div>;
  if (!result) return null;

  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <div>
          <Link href="/client">← Client portal</Link>
          <span className={styles.eyebrow}>LAND VIEW / CLIENT BILLING</span>
          <h1>Project Billing Statement</h1>
          <p>Your live billing statement is generated from the same finance records used by LAND VIEW administration.</p>
        </div>
        <button className={styles.printButton} type="button" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <main className={styles.report}>
        <header className={styles.printHeader}>
          <div><strong>LAND <span>VIEW</span></strong><small>Engineers and Architects</small></div>
          <div><h2>PROJECT BILLING STATEMENT</h2><p>Generated {generated}</p></div>
        </header>

        <section className={styles.projectCard}>
          <div><span>FILE ID</span><strong>{result.id}</strong></div>
          <div><span>CLIENT</span><strong>{result.client.name || "—"}</strong><small>{result.client.phone || "—"}</small></div>
          <div><span>PROJECT TYPE</span><strong>{result.client.type || "—"}</strong><small>{result.client.floor || "—"}</small></div>
          <div className={styles.totalDueCard}><span>TOTAL DUE</span><strong>{money(result.totals.due)}</strong></div>
        </section>

        <section className={styles.categoryGrid}>
          {result.invoices.map((category) => (
            <article className={styles.category} key={category.name}>
              <div className={styles.categoryHeader}>
                <div><span>{category.name.toUpperCase()}</span><h2>{category.name} Billing</h2></div>
                <div className={category.due > 0 ? styles.dueBadge : styles.paidBadge}>{category.due > 0 ? "DUE" : "PAID"}</div>
              </div>
              <div className={styles.metrics}>
                <div><span>Bill</span><strong>{money(category.gross)}</strong></div>
                <div><span>Discount</span><strong>{money(category.discount)}</strong></div>
                <div><span>Deposited</span><strong>{money(category.paid)}</strong></div>
                <div><span>Due</span><strong>{money(category.due)}</strong></div>
              </div>
              <div className={styles.split}>
                <section><h3>{category.name} Bill</h3>{renderTable(category, "bill")}</section>
                <section><h3>{category.name} Deposit</h3>{renderTable(category, "deposit")}</section>
              </div>
              <div className={styles.formula}><span>{money(category.gross)} − {money(category.discount)} − {money(category.paid)}</span><strong>= {money(category.due)}</strong></div>
            </article>
          ))}
        </section>

        <section className={styles.grandSummary}>
          <div><span>Total Bill</span><strong>{money(result.totals.gross)}</strong></div>
          <div><span>Total Discount</span><strong>{money(result.totals.discount)}</strong></div>
          <div><span>Total Deposited</span><strong>{money(result.totals.paid)}</strong></div>
          <div className={styles.grandDue}><span>Grand Total Due</span><strong>{money(result.totals.due)}</strong></div>
        </section>

        <section className={styles.verificationBlock}>
          <div>
            <span className={styles.verificationLabel}>PROJECT QR</span>
            <strong>{verificationUrl ? "Permanent project verification" : "LAND VIEW billing record"}</strong>
            <p>{verificationUrl ? "Scan this QR to open the latest verified billing balance for this project." : "This statement is generated directly from LAND VIEW finance records."}</p>
            {verificationUrl && <a href={verificationUrl} target="_blank" rel="noreferrer">Open live billing ↗</a>}
          </div>
          {qrUrl && <img className={styles.qrCode} src={qrUrl} alt={`Billing QR for ${result.id}`} width={132} height={132} />}
        </section>

        <section className={styles.sheetInfoBoard}>
          <div className={styles.sheetMetaRow}>
            <div className={styles.sheetMetaPair}><span>Invoice ID</span><strong>{statementRef}</strong></div>
            <div className={styles.sheetMetaPair}><span>Issue Date</span><strong>{generated}</strong></div>
          </div>
          <div className={styles.sheetInfoRow}><span>Client</span><strong>{result.client.name || "—"}</strong><span>Status</span><strong>{projectStatus}</strong></div>
          <div className={styles.sheetInfoRow}><span>Address</span><strong>{result.client.address || "—"}</strong><span>Land Area</span><strong>{result.client.area || "—"}</strong></div>
        </section>
      </main>
    </div>
  );
}
