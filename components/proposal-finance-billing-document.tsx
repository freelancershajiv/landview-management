"use client";

import { useMemo } from "react";
import ProjectBillingDocument from "@/components/project-billing-document";
import { type ProposalBundle, type ProposalItem } from "@/lib/proposal-api";
import type { SheetInvoices } from "@/lib/sheet-invoices";
import styles from "@/app/admin/finance/invoices/invoice.module.css";

const ENGINEERING_SERVICES = new Set([
  "architectural design",
  "structural design",
  "3d design",
  "3d design exterior",
  "electrical design",
  "plumbing design",
  "estimate & costing",
  "plan approval design",
]);

const SUPERVISION_SERVICES = new Set([
  "site supervision",
  "supervision",
]);

const OTHER_SERVICES = new Set([
  "soil test",
  "digital survey",
  "municipality file pass",
]);

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isEngineering(item: ProposalItem) {
  const service = normalize(item.Service);
  const category = normalize(item.Category);
  return category === "engineering" || ENGINEERING_SERVICES.has(service);
}

function isSupervision(item: ProposalItem) {
  const service = normalize(item.Service);
  const category = normalize(item.Category);
  return category === "supervision" || SUPERVISION_SERVICES.has(service);
}

function isOtherService(item: ProposalItem) {
  const service = normalize(item.Service);
  const category = normalize(item.Category);
  return OTHER_SERVICES.has(service) || category === "others" || (!isEngineering(item) && !isSupervision(item));
}

function allocateDiscount(gross: number, totalGross: number, totalDiscount: number, remainder: number, isLast: boolean) {
  if (isLast) return Math.max(0, remainder);
  if (totalGross <= 0 || totalDiscount <= 0) return 0;
  return Math.min(gross, Math.round(totalDiscount * (gross / totalGross)));
}

export function toFinanceInvoice(bundle: ProposalBundle, proposalId: string): SheetInvoices {
  const proposal = bundle.proposal;
  const engineeringItems = bundle.items.filter(isEngineering);
  const supervisionItems = bundle.items.filter(isSupervision);
  const otherItems = bundle.items.filter(isOtherService);

  const sourceGroups = [
    { name: "Engineering", items: engineeringItems },
    { name: "Supervision", items: supervisionItems },
    { name: "Others", items: otherItems },
  ].filter((group) => group.items.length > 0);

  const totalGross = sourceGroups.reduce(
    (sum, group) => sum + group.items.reduce((inner, item) => inner + (Number(item.Quantity) || 0) * (Number(item.Rate) || 0), 0),
    0,
  );
  const totalDiscount = Math.max(0, Number(proposal.Discount) || 0);
  let discountRemaining = totalDiscount;

  const invoices = sourceGroups.map((group, index) => {
    const gross = group.items.reduce(
      (sum, item) => sum + (Number(item.Quantity) || 0) * (Number(item.Rate) || 0),
      0,
    );
    const discount = allocateDiscount(gross, totalGross, totalDiscount, discountRemaining, index === sourceGroups.length - 1);
    discountRemaining = Math.max(0, discountRemaining - discount);

    return {
      name: group.name,
      items: group.items.map((item) => ({
        service: item.Description ? `${item.Service} — ${item.Description}` : item.Service,
        price: String(Number(item.Rate) || 0),
        quantity: String(Number(item.Quantity) || 0),
        amount: (Number(item.Quantity) || 0) * (Number(item.Rate) || 0),
      })),
      payments: [],
      gross,
      discount,
      paid: 0,
      due: Math.max(0, gross - discount),
    };
  });

  return {
    id: proposal.Proposal_ID || proposalId,
    client: {
      name: proposal.Client_Name || "",
      address: proposal.Address || proposal.Project_Location || "",
      phone: proposal.Phone || "",
      floor: proposal.Floors || "",
      type: proposal.Project_Type || "",
      area: proposal.Plot_Area || "",
    },
    invoices,
    totals: {
      gross: invoices.reduce((sum, item) => sum + item.gross, 0),
      discount: invoices.reduce((sum, item) => sum + item.discount, 0),
      paid: 0,
      due: invoices.reduce((sum, item) => sum + item.due, 0),
    },
  };
}

export default function ProposalFinanceBillingDocument({ bundle }: { bundle: ProposalBundle }) {
  const financeInvoice = useMemo(
    () => toFinanceInvoice(bundle, bundle.proposal.Proposal_ID || ""),
    [bundle],
  );

  return (
    <section className="proposal-finance-billing" id="proposal-preview">
      <style>{`
        .proposal-finance-billing{margin-top:18px}
        .proposal-finance-billing .proposal-note{margin:0 0 10px;padding:10px 12px;border:1px solid #35414a;border-radius:8px;background:#101820;color:#9aa6af;font-size:10px}
        .proposal-finance-billing .${styles.verificationBlock}{display:none!important}
        @media print{
          .proposal-finance-billing .proposal-note{display:none!important}
        }
      `}</style>
      <p className="proposal-note">
        Review the saved proposal below before printing. A verification QR is issued once the proposal becomes a project.
      </p>
      <ProjectBillingDocument result={financeInvoice} verificationUrl="" verificationError="" />
    </section>
  );
}
