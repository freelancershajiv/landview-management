"use client";

import Link from "next/link";

export default function PublicInvoiceActions({ summaryUrl }: { summaryUrl?: string | null }) {
  return (
    <div className="publicInvoiceActions">
      {summaryUrl && <Link href={summaryUrl}>← Verification summary</Link>}
      <button type="button" onClick={() => window.print()}>Print / Save PDF</button>
    </div>
  );
}
