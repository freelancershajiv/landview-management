"use client";

import type { SheetInvoices } from "@/lib/sheet-invoices";
import ProjectBillingDocument from "./project-billing-document";

export * from "./project-billing-document";

type Props = {
  result: SheetInvoices;
  verificationUrl?: string;
  verificationError?: string;
  dueOnly?: boolean;
};

/**
 * Keep a single invoice renderer for screen and print/PDF output.
 *
 * The previous revamp component maintained a second print-only bill table.
 * That duplicate renderer drifted from the canonical Engineering Bill layout
 * and continued printing RATE / QTY / AMOUNT after service-wise discounts were
 * introduced. Delegating to ProjectBillingDocument keeps invoice preview,
 * printing and PDF generation on the same billing rules and prevents future
 * display inconsistencies.
 */
export default function ProjectBillingDocumentRevamp(props: Props) {
  return <ProjectBillingDocument {...props} />;
}
