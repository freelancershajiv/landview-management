"use client";

// Production refresh: client-safe billing feed (no direct getFinanceSheet access).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { normalizeFileId } from "@/lib/sheet-invoices";
import styles from "@/app/client/billing/client-billing.module.css";

type Row = Record<string, unknown>;
type ClientProject = {
  projectId?: string;
  clientName?: string;
  projectName?: string;
  location?: string;
  mobile?: string;
  status?: string;
  finance?: {
    totalBill?: number; totalPaid?: number; due?: number;
    engineeringBill?: number; engineeringPaid?: number; engineeringDue?: number;
    supervisionBill?: number; supervisionPaid?: number; supervisionDue?: number;
    othersBill?: number; othersPaid?: number; othersDue?: number;
  };
  billing?: Record<string, Row[]>;
};
type ClientAccessData = { projects?: ClientProject[]; client?: { name?: string } };
type BillItem = { service: string; price: string; quantity: string; amount: number };
type PaymentItem = { date: string; details: string; amount: number };
type BillingCategory = { name: string; items: BillItem[]; payments: PaymentItem[]; gross: number; discount: number; paid: number; due: number };
type ClientBilling = {
  id: string;
  client: { name: string; address: string; phone: string; floor: string; type: string; area: string };
  invoices: BillingCategory[];
  totals: { gross: number; discount: number; paid: number; due: number };
};

const money = (value: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number(value || 0));
const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => Number(text(value).replace(/BDT|Tk\.?|৳|,/gi, "").replace(/[^0-9.-]/g, "")) || 0;
const pick = (row: Row, keys: string[]) => { for (const key of keys) if (text(row?.[key])) return row[key]; return ""; };

function statementDate() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric" }).format(new Date());
}

function rowsFor(billing: Record<string, Row[]> | undefined, names: string[]) {
  if (!billing) return [];
  for (const name of names) {
    const direct = billing[name];
    if (Array.isArray(direct)) return direct;
    const key = Object.keys(billing).find((k) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === name.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (key && Array.isArray(billing[key])) return billing[key];
  }
  return [];
}

function billItems(rows: Row[]): BillItem[] {
  return rows.map((row) => ({
    service: text(pick(row, ["Service Name", "Services", "Service", "Description", "Item", "Details"])) || "LAND VIEW service",
    price: text(pick(row, ["Rate", "Price", "Unit_Rate", "Unit Rate"])),
    quantity: text(pick(row, ["Qty", "Quantity", "QTY"])),
    amount: num(pick(row, ["Amount", "Total", "Bill", "Bill_Amount", "Bill Amount"])),
  })).filter((row) => row.amount || row.service);
}

function paymentItems(rows: Row[]): PaymentItem[] {
  return rows.map((row) => ({
    date: text(pick(row, ["Date", "Payment_Date", "Payment Date", "Deposit Date"])),
    details: text(pick(row, ["Details", "Description", "Payment_For", "Payment For", "Reference", "Notes"])) || "Payment received",
    amount: num(pick(row, ["Amount", "Paid", "Deposit", "Payment_Amount", "Payment Amount"])),
  })).filter((row) => row.amount || row.details);
}

function buildFromClientProject(project: ClientProject): ClientBilling {
  const f = project.finance || {};
  const billing = project.billing || {};
  const specs = [
    { name: "Engineering", billNames: ["Design Bill", "Engineering Bill", "engineeringBill"], payNames: ["Design Deposit", "Engineering Deposit", "engineeringDeposit"], gross: num(f.engineeringBill), paid: num(f.engineeringPaid), due: num(f.engineeringDue) },
    { name: "Supervision", billNames: ["Supervision Bill", "supervisionBill"], payNames: ["S Deposit", "Supervision Deposit", "supervisionDeposit"], gross: num(f.supervisionBill), paid: num(f.supervisionPaid), due: num(f.supervisionDue) },
    { name: "Others", billNames: ["Others Bill", "Other Bill", "othersBill"], payNames: ["Others Bill Deposit", "Others Deposit", "othersDeposit"], gross: num(f.othersBill), paid: num(f.othersPaid), due: num(f.othersDue) },
  ];

  const invoices: BillingCategory[] = specs.map((spec) => {
    const items = billItems(rowsFor(billing, spec.billNames));
    const payments = paymentItems(rowsFor(billing, spec.payNames));
    const detailGross = items.reduce((sum, item) => sum + item.amount, 0);
    const detailPaid = payments.reduce((sum, item) => sum + item.amount, 0);
    const gross = spec.gross || detailGross;
    const paid = spec.paid || detailPaid;
    const due = spec.due;
    const discount = Math.max(0, gross - paid - due);
    return { name: spec.name, items, payments, gross, discount, paid, due };
  });

  const gross = num(f.totalBill) || invoices.reduce((sum, item) => sum + item.gross, 0);
  const paid = num(f.totalPaid) || invoices.reduce((sum, item) => sum + item.paid, 0);
  const due = num(f.due);
  const discount = Math.max(0, gross - paid - due);
  const normalized = normalizeFileId(text(project.projectId));

  return {
    id: normalized ? `LV-${normalized}` : text(project.projectId),
    client: {
      name: text(project.clientName),
      address: text(project.location),
      phone: text(project.mobile),
      floor: "",
      type: text(project.projectName),
      area: "",
    },
    invoices,
    totals: { gross, discount, paid, due },
  };
}

export default function ClientBillingPage() {
  const params = useParams<{ projectId: string }>();
  const rawId = decodeURIComponent(String(params?.projectId || ""));
  const requestedId = rawId.toLowerCase() === "current" ? "" : normalizeFileId(rawId);
  const [result, setResult] = useState<ClientBilling | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const generated = useMemo(() => statementDate(), []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/client-access", { cache: "no-store", credentials: "same-origin" });
        const json = await response.json();
        if (!response.ok || !json?.success) throw new Error(json?.error || "Unable to load your client billing.");
        const access = json.data as ClientAccessData;
        const projects = access.projects || [];
        const project = requestedId
          ? projects.find((p) => normalizeFileId(text(p.projectId)) === requestedId)
          : projects[0];
        if (!project) throw new Error(requestedId ? "This billing statement is not available for your client account." : "No project is linked to this client account.");

        const billing = buildFromClientProject(project);
        if (!active) return;
        setResult(billing);

        try {
          const vr = await fetch("/api/billing-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: billing.id }) });
          const vj = await vr.json();
          if (active && vr.ok && vj?.success && vj?.url) setVerificationUrl(String(vj.url));
        } catch {}
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load project billing.");
      } finally {
        if (active) setBusy(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [requestedId]);

  const renderTable = (category: BillingCategory, type: "bill" | "deposit") => {
    if (type === "bill") {
      if (!category.items.length) return <p className={styles.empty}>No detailed bill rows are available in the client-safe feed.</p>;
      return <div className={styles.tableWrap}><table><thead><tr><th>SL.</th><th>Description</th><th>Rate</th><th>Qty.</th><th>Amount</th></tr></thead><tbody>{category.items.map((item,index)=><tr key={index}><td>{index+1}</td><td>{item.service||"—"}</td><td>{item.price||"—"}</td><td>{item.quantity||"—"}</td><td>{money(item.amount)}</td></tr>)}</tbody></table></div>;
    }
    if (!category.payments.length) return <p className={styles.empty}>No detailed deposit rows are available in the client-safe feed.</p>;
    return <div className={styles.tableWrap}><table><thead><tr><th>SL.</th><th>Date</th><th>Details</th><th>Amount</th></tr></thead><tbody>{category.payments.map((payment,index)=><tr key={index}><td>{index+1}</td><td>{payment.date||"—"}</td><td>{payment.details||"—"}</td><td>{money(payment.amount)}</td></tr>)}</tbody></table></div>;
  };

  const statementRef = result ? `INV-${result.id.replace(/^LV-/, "")}-01` : "";
  const projectStatus = result ? (result.totals.due > 0 ? "Partial / Due" : "Full Paid") : "—";
  const qrUrl = verificationUrl ? `/api/billing-verification/qr?data=${encodeURIComponent(verificationUrl)}` : "";

  if (busy) return <div className={styles.loading}>Preparing your LAND VIEW billing statement…</div>;
  if (error) return <div className={styles.workspace}><div className={styles.error} role="alert">{error}</div><Link href="/client">← Back to client portal</Link></div>;
  if (!result) return null;

  return <div className={styles.workspace}>
    <div className={styles.header}><div><Link href="/client">← Client portal</Link><span className={styles.eyebrow}>LAND VIEW / CLIENT BILLING</span><h1>Project Billing Statement</h1><p>Generated securely from the billing data authorized for your client account.</p></div><button className={styles.printButton} type="button" onClick={()=>window.print()}>Print / Save PDF</button></div>
    <main className={styles.report}>
      <header className={styles.printHeader}><div><strong>LAND <span>VIEW</span></strong><small>Engineers and Architects</small></div><div><h2>PROJECT BILLING STATEMENT</h2><p>Generated {generated}</p></div></header>
      <section className={styles.projectCard}><div><span>FILE ID</span><strong>{result.id}</strong></div><div><span>CLIENT</span><strong>{result.client.name||"—"}</strong><small>{result.client.phone||"—"}</small></div><div><span>PROJECT</span><strong>{result.client.type||"—"}</strong><small>{result.client.address||"—"}</small></div><div className={styles.totalDueCard}><span>TOTAL DUE</span><strong>{money(result.totals.due)}</strong></div></section>
      <section className={styles.categoryGrid}>{result.invoices.map(category=><article className={styles.category} key={category.name}><div className={styles.categoryHeader}><div><span>{category.name.toUpperCase()}</span><h2>{category.name} Billing</h2></div><div className={category.due>0?styles.dueBadge:styles.paidBadge}>{category.due>0?"DUE":"PAID"}</div></div><div className={styles.metrics}><div><span>Bill</span><strong>{money(category.gross)}</strong></div><div><span>Discount</span><strong>{money(category.discount)}</strong></div><div><span>Deposited</span><strong>{money(category.paid)}</strong></div><div><span>Due</span><strong>{money(category.due)}</strong></div></div><div className={styles.split}><section><h3>{category.name} Bill</h3>{renderTable(category,"bill")}</section><section><h3>{category.name} Deposit</h3>{renderTable(category,"deposit")}</section></div><div className={styles.formula}><span>{money(category.gross)} − {money(category.discount)} − {money(category.paid)}</span><strong>= {money(category.due)}</strong></div></article>)}</section>
      <section className={styles.grandSummary}><div><span>Total Bill</span><strong>{money(result.totals.gross)}</strong></div><div><span>Total Discount</span><strong>{money(result.totals.discount)}</strong></div><div><span>Total Deposited</span><strong>{money(result.totals.paid)}</strong></div><div className={styles.grandDue}><span>Grand Total Due</span><strong>{money(result.totals.due)}</strong></div></section>
      <section className={styles.verificationBlock}><div><span className={styles.verificationLabel}>PROJECT QR</span><strong>{verificationUrl?"Permanent project verification":"LAND VIEW billing record"}</strong><p>{verificationUrl?"Scan this QR to open the latest verified billing balance for this project.":"This statement is generated from your authorized client billing feed."}</p>{verificationUrl&&<a href={verificationUrl} target="_blank" rel="noreferrer">Open live billing ↗</a>}</div>{qrUrl&&<img className={styles.qrCode} src={qrUrl} alt={`Billing QR for ${result.id}`} width={132} height={132}/>}</section>
      <section className={styles.sheetInfoBoard}><div className={styles.sheetMetaRow}><div className={styles.sheetMetaPair}><span>Invoice ID</span><strong>{statementRef}</strong></div><div className={styles.sheetMetaPair}><span>Issue Date</span><strong>{generated}</strong></div></div><div className={styles.sheetInfoRow}><span>Client</span><strong>{result.client.name||"—"}</strong><span>Status</span><strong>{projectStatus}</strong></div><div className={styles.sheetInfoRow}><span>Address</span><strong>{result.client.address||"—"}</strong><span>File ID</span><strong>{result.id}</strong></div></section>
    </main>
  </div>;
}
