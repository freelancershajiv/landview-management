"use client";

import { useMemo } from "react";
import ProjectBillingDocument from "@/components/project-billing-document";
import { type ProposalBundle, type ProposalItem } from "@/lib/proposal-api";
import type { SheetInvoices } from "@/lib/sheet-invoices";
import styles from "@/app/admin/finance/invoices/invoice.module.css";
import { sortServicesByStandardOrder, standardServiceLabel } from "@/lib/service-order";

const ENGINEERING_SERVICES = new Set([
  "architectural design","structural design","3d design","3d design exterior","3d design - exterior","re-design fees","electrical design","plumbing design","estimate & costing","plan approval design","architectural & structural design book","a4 site book","3d design book","electrical design book","plumbing design book","soil test book","site visit - soil test day","municipality approval sheet","digital survey report",
]);
const SUPERVISION_SERVICES = new Set(["site supervision","supervision"]);

function normalize(value: unknown) { return String(value ?? "").trim().toLowerCase(); }
function firstText(record: Record<string, unknown> | null | undefined, keys: string[]) { if (!record) return ""; for (const key of keys) { const value = String(record[key] ?? "").trim(); if (value) return value; } return ""; }
function isEngineering(item: ProposalItem) { const service = normalize(item.Service); const category = normalize(item.Category); return category === "engineering" || category === "design books" || ENGINEERING_SERVICES.has(service); }
function isSupervision(item: ProposalItem) { const service = normalize(item.Service); const category = normalize(item.Category); return category === "supervision" || SUPERVISION_SERVICES.has(service); }
function isOtherService(item: ProposalItem) { const category = normalize(item.Category); return category === "others" || (!isEngineering(item) && !isSupervision(item)); }
function grossOf(item: ProposalItem) { return Math.max(0, (Number(item.Quantity) || 0) * (Number(item.Rate) || 0)); }
function serviceDiscountOf(item: ProposalItem) { const gross = grossOf(item); return Math.min(gross, Math.max(0, Number(item.Discount) || 0)); }
function roundMoney(value: number) { return Math.round(value * 100) / 100; }
function allocateDiscount(base: number, totalBase: number, totalDiscount: number, remainder: number, isLast: boolean) {
  if (totalDiscount <= 0 || base <= 0) return 0;
  if (isLast) return Math.min(base, Math.max(0, roundMoney(remainder)));
  if (totalBase <= 0) return 0;
  return Math.min(base, roundMoney(totalDiscount * (base / totalBase)));
}

export function toFinanceInvoice(bundle: ProposalBundle, proposalId: string): SheetInvoices {
  const proposal = bundle.proposal;
  const engineeringItems = sortServicesByStandardOrder(bundle.items.filter(isEngineering));
  const supervisionItems = sortServicesByStandardOrder(bundle.items.filter(isSupervision));
  const otherItems = sortServicesByStandardOrder(bundle.items.filter(isOtherService));

  const sourceGroups = [
    { name: "Engineering", items: engineeringItems },
    { name: "Supervision", items: supervisionItems },
    { name: "Others", items: otherItems },
  ].filter((group) => group.items.length > 0);

  const totalGross = sourceGroups.reduce((sum, group) => sum + group.items.reduce((inner, item) => inner + grossOf(item), 0), 0);
  const totalServiceDiscount = sourceGroups.reduce((sum, group) => sum + group.items.reduce((inner, item) => inner + serviceDiscountOf(item), 0), 0);
  const combinedDiscount = Math.min(totalGross, Math.max(0, Number(proposal.Discount) || 0));
  const additionalDiscount = Math.max(0, Math.min(totalGross - totalServiceDiscount, combinedDiscount - totalServiceDiscount));
  const totalBaseAfterServiceDiscount = Math.max(0, totalGross - totalServiceDiscount);
  let additionalRemaining = additionalDiscount;

  const invoices = sourceGroups.map((group, index) => {
    const gross = group.items.reduce((sum, item) => sum + grossOf(item), 0);
    const serviceDiscount = group.items.reduce((sum, item) => sum + serviceDiscountOf(item), 0);
    const base = Math.max(0, gross - serviceDiscount);
    const allocatedAdditional = allocateDiscount(base, totalBaseAfterServiceDiscount, additionalDiscount, additionalRemaining, index === sourceGroups.length - 1);
    additionalRemaining = Math.max(0, roundMoney(additionalRemaining - allocatedAdditional));
    const discount = Math.min(gross, roundMoney(serviceDiscount + allocatedAdditional));

    return {
      name: group.name,
      items: group.items.map((item) => {
        const itemDiscount = serviceDiscountOf(item);
        const label = item.Description ? `${standardServiceLabel(item.Service) || item.Service} — ${item.Description}` : (standardServiceLabel(item.Service) || item.Service);
        return {
          service: itemDiscount > 0 ? `${label} · Discount ৳${itemDiscount.toLocaleString("en-BD")}` : label,
          price: String(Number(item.Rate) || 0),
          quantity: String(Number(item.Quantity) || 0),
          amount: grossOf(item),
        };
      }),
      payments: [],
      gross,
      discount,
      paid: 0,
      due: Math.max(0, roundMoney(gross - discount)),
    };
  });

  return {
    id: proposal.Proposal_ID || proposalId,
    client: {
      fileId: proposal.Converted_Project_ID || "Not assigned yet",
      name: proposal.Client_Name || "",
      address: proposal.Address || proposal.Project_Location || "",
      phone: proposal.Phone || "",
      floor: proposal.Floors || "",
      type: proposal.Project_Type || "",
      area: proposal.Plot_Area || "",
      referredBy: proposal.Referred_By || firstText(bundle.prospect, ["referred_by", "Referred_By", "Referred By"]) || proposal.Source || firstText(bundle.prospect, ["source", "Source"]),
      refContact: proposal.Ref_Contact || firstText(bundle.prospect, ["ref_contact", "Ref_Contact", "Ref. Contact", "Ref Contact", "Referral_Contact", "Referral Contact", "Referral_Phone", "Referral Phone", "Reference_Contact", "Reference Contact"]),
      issueDate: proposal.Created_At || "",
      status: proposal.Converted_Project_ID ? "Converted to Project" : (proposal.Status || "Proposal"),
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
  const financeInvoice = useMemo(() => toFinanceInvoice(bundle, bundle.proposal.Proposal_ID || ""), [bundle]);
  return (
    <section className="proposal-finance-billing" id="proposal-preview">
      <style>{`
        .proposal-finance-billing{margin-top:18px}
        .proposal-finance-billing .proposal-note{margin:0 0 10px;padding:10px 12px;border:1px solid #35414a;border-radius:8px;background:#101820;color:#9aa6af;font-size:10px}
        .proposal-finance-billing .${styles.verificationBlock}{display:none!important}
        @media print{.proposal-finance-billing .proposal-note{display:none!important}}
      `}</style>
      <p className="proposal-note">Review the saved proposal below before printing. Service discounts are included in the billing totals. A verification QR is issued once the proposal becomes a project.</p>
      <ProjectBillingDocument result={financeInvoice} verificationUrl="" verificationError="" />
    </section>
  );
}
