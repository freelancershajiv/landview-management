"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { landViewApi } from "@/lib/api";
import {
  normalizeFileId,
  verifySheetInvoicesWithPayments,
  type SheetInvoices,
} from "@/lib/sheet-invoices";
import ProjectBillingDocument, {
  billingVerificationSnapshot,
  printBillingPdf,
} from "@/components/project-billing-document";
import styles from "@/app/admin/finance/invoices/invoice.module.css";

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
type ClientAccessData = { projects?: ClientProject[] };

const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => Number(text(value).replace(/BDT|Tk\.?|৳|,/gi, "").replace(/[^0-9.-]/g, "")) || 0;
const pick = (row: Row, keys: string[]) => {
  for (const key of keys) if (text(row?.[key])) return row[key];
  return "";
};
const supplied = (value: unknown) => value !== undefined && value !== null && text(value) !== "";

function rowsFor(billing: Record<string, Row[]> | undefined, names: string[]) {
  if (!billing) return [];
  for (const name of names) {
    const direct = billing[name];
    if (Array.isArray(direct)) return direct;
    const compact = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = Object.keys(billing).find((candidate) => candidate.toLowerCase().replace(/[^a-z0-9]/g, "") === compact);
    if (key && Array.isArray(billing[key])) return billing[key];
  }
  return [];
}

function buildClientBilling(project: ClientProject): SheetInvoices {
  const finance = project.finance || {};
  const billing = project.billing || {};
  const specs = [
    { name: "Engineering", billNames: ["Design Bill", "Engineering Bill"], payNames: ["Design Deposit", "Engineering Deposit"], grossRaw: finance.engineeringBill, paidRaw: finance.engineeringPaid, dueRaw: finance.engineeringDue },
    { name: "Supervision", billNames: ["Supervision Bill"], payNames: ["S Deposit", "Supervision Deposit"], grossRaw: finance.supervisionBill, paidRaw: finance.supervisionPaid, dueRaw: finance.supervisionDue },
    { name: "Others", billNames: ["Others Bill", "Other Bill"], payNames: ["Others Bill Deposit", "Others Deposit"], grossRaw: finance.othersBill, paidRaw: finance.othersPaid, dueRaw: finance.othersDue },
  ];

  const invoices = specs.map((spec) => {
    const items = rowsFor(billing, spec.billNames).map((row) => ({
      service: text(pick(row, ["Service Name", "Services", "Service", "Description", "Item", "Details"])) || "LAND VIEW service",
      price: text(pick(row, ["Rate", "Price", "Unit_Rate", "Unit Rate"])),
      quantity: text(pick(row, ["Qty", "Quantity", "QTY"])),
      amount: num(pick(row, ["Amount", "Total", "Bill", "Bill_Amount", "Bill Amount"])),
    })).filter((row) => row.amount || row.service);

    const payments = rowsFor(billing, spec.payNames).map((row) => ({
      date: text(pick(row, ["Date", "Payment_Date", "Payment Date", "Deposit Date"])),
      details: text(pick(row, ["Details", "Description", "Payment_For", "Payment For", "Reference", "Notes"])) || "Payment received",
      amount: num(pick(row, ["Amount", "Paid", "Deposit", "Payment_Amount", "Payment Amount"])),
      verification: text(pick(row, ["Verification", "Match_Status"])) === "Verified" ? "Verified" : "Unverified",
      incomeId: text(pick(row, ["Linked Income ID", "Matched_Income_ID", "Income_ID", "Income ID"])),
    })).filter((row) => row.amount || row.details);

    const detailGross = items.reduce((sum, row) => sum + row.amount, 0);
    const detailPaid = payments.reduce((sum, row) => sum + row.amount, 0);
    const gross = supplied(spec.grossRaw) ? num(spec.grossRaw) : detailGross;
    const paid = supplied(spec.paidRaw) ? num(spec.paidRaw) : detailPaid;
    const due = supplied(spec.dueRaw) ? num(spec.dueRaw) : Math.max(0, gross - paid);
    const discount = Math.max(0, gross - paid - due);
    return { name: spec.name, items, payments, gross, discount, paid, due };
  });

  const gross = supplied(finance.totalBill) ? num(finance.totalBill) : invoices.reduce((sum, row) => sum + row.gross, 0);
  const paid = supplied(finance.totalPaid) ? num(finance.totalPaid) : invoices.reduce((sum, row) => sum + row.paid, 0);
  const due = supplied(finance.due) ? num(finance.due) : invoices.reduce((sum, row) => sum + row.due, 0);
  const discount = Math.max(0, gross - paid - due);
  const normalized = normalizeFileId(text(project.projectId));

  return {
    id: normalized ? `LV-${normalized}` : text(project.projectId),
    client: {
      fileId: normalized ? `LV-${normalized}` : text(project.projectId),
      name: text(project.clientName),
      address: text(project.location),
      phone: text(project.mobile),
      floor: "",
      type: text(project.projectName),
      area: "",
      referredBy: "",
      refContact: "",
      issueDate: "",
      status: "",
    },
    invoices,
    totals: { gross, discount, paid, due },
  };
}

function mergeProjectDetails(billing: SheetInvoices, detail: Record<string, unknown>) {
  const next = { ...billing, client: { ...billing.client } };
  next.client.name = text(pick(detail, ["Client_Name", "Client Name", "Name"])) || next.client.name;
  next.client.address = text(pick(detail, ["Location", "Address", "Project_Location", "Project Location"])) || next.client.address;
  next.client.phone = text(pick(detail, ["Phone_Number", "Phone Number", "Contact", "Mobile"])) || next.client.phone;
  next.client.floor = text(pick(detail, ["Floors", "Floor", "Floor_Story", "Floor/Story", "Number_of_Stories"])) || next.client.floor;
  next.client.type = text(pick(detail, ["Project_Type", "Project Type", "Type", "Project_Name", "Project Name"])) || next.client.type;
  next.client.area = text(pick(detail, ["Plot_Area", "Plot Area", "Land_Area", "Land Area", "Project_Area"])) || next.client.area;
  next.client.referredBy = text(pick(detail, ["Referred_By", "Referred By", "Referral", "Referral_Source", "Referral Source", "Source"])) || next.client.referredBy;
  next.client.refContact = text(pick(detail, ["Ref_Contact", "Ref. Contact", "Ref Contact", "Referral_Contact", "Referral Contact", "Referral_Phone", "Referral Phone"])) || next.client.refContact;
  return next;
}

export default function ClientBillingPage() {
  const params = useParams<{ projectId: string }>();
  const rawId = decodeURIComponent(String(params?.projectId || ""));
  const requestedId = rawId.toLowerCase() === "current" ? "" : normalizeFileId(rawId);
  const [result, setResult] = useState<SheetInvoices | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [verificationError, setVerificationError] = useState("");

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
          ? projects.find((candidate) => normalizeFileId(text(candidate.projectId)) === requestedId)
          : projects[0];
        if (!project) throw new Error(requestedId ? "This billing statement is not available for your client account." : "No project is linked to this client account.");

        let billing = buildClientBilling(project);
        try {
          const detail = await landViewApi.getProject(billing.id);
          billing = mergeProjectDetails(billing, detail);
        } catch {
          // Auto Invoice data remains the source of truth if the management project record is unavailable.
        }
        try {
          const databasePayments = await landViewApi.getPayments(billing.id);
          billing = verifySheetInvoicesWithPayments(billing, databasePayments);
        } catch {
          // The statement still renders safely; unavailable matches remain Unverified.
        }

        if (!active) return;
        setResult(billing);

        try {
          const verificationResponse = await fetch("/api/billing-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: billing.id, billing: billingVerificationSnapshot(billing) }),
          });
          const verificationJson = await verificationResponse.json();
          if (!verificationResponse.ok || !verificationJson?.success || !verificationJson?.url) throw new Error(verificationJson?.error || "Could not create verification link.");
          if (active) setVerificationUrl(String(verificationJson.url));
        } catch (err) {
          if (active) setVerificationError(err instanceof Error ? err.message : "Could not create verification link.");
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load project billing.");
      } finally {
        if (active) setBusy(false);
      }
    }

    void load();
    return () => { active = false; };
  }, [requestedId]);

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
          <p>This is the same LAND VIEW billing statement format used by the Accounts/Admin portal, limited to your authorized project.</p>
        </div>
        <button className={styles.printButton} type="button" onClick={() => printBillingPdf(result)}>Print / Save PDF</button>
      </div>
      <ProjectBillingDocument result={result} verificationUrl={verificationUrl} verificationError={verificationError} />
    </div>
  );
}
