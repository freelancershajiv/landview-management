"use client";

import Link from "next/link";

export default function PublicInvoiceActions({ summaryUrl }: { summaryUrl: string }) {
  return (
    <div className="publicInvoiceActions">
      <Link href={summaryUrl}>← Verification summary</Link>
      <button type="button" onClick={() => window.print()}>Print / Save PDF</button>
    </div>
  );
}
