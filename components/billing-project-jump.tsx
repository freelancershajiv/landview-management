"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

function normalizedId(input: string) {
  const trimmed = input.trim().toUpperCase();
  const match = trimmed.match(/^(?:LV[\s_-]*)?0*(\d{1,8})$/);
  return match ? "LV-" + match[1].padStart(3, "0") : "";
}
export default function BillingProjectJump() {
  const [entered, setEntered] = useState("");
  const code = useMemo(() => normalizedId(entered), [entered]);
  const encoded = encodeURIComponent(code);
  return <section className="bv4-jump" aria-label="Open a project's billing records">
    <style>{`
      .bv4-jump{padding:17px;border:1px solid var(--lv-border-default);border-radius:13px;background:var(--lv-surface-panel);display:grid;gap:12px}
      .bv4-jump h2{font-size:17px;margin:0}.bv4-jump p{color:var(--lv-text-secondary);font-size:12px;line-height:1.5;margin:0}
      .bv4-jump-row{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
      .bv4-jump input{flex:1 1 220px;max-width:430px;min-height:45px;padding:9px 12px;color:var(--lv-text-primary);background:var(--lv-surface-input);border:1px solid var(--lv-border-default);border-radius:8px;font:inherit;font-size:14px}
      .bv4-jump-links{display:flex;gap:7px;flex-wrap:wrap}
      .bv4-jump-links a{display:inline-flex;align-items:center;justify-content:center;min-height:41px;padding:8px 12px;font-size:12px;font-weight:800;text-decoration:none;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-muted);color:var(--lv-text-primary)}
      .bv4-jump-links a.primary{background:var(--lv-brand-primary);color:var(--lv-text-inverse);border-color:var(--lv-brand-border)}
      .bv4-jump-links a[aria-disabled=true]{opacity:.45;pointer-events:none}
      @media(max-width:650px){.bv4-jump-links a{flex:1 1 140px}.bv4-jump input{max-width:100%}}
    `}</style>
    <div><h2>Find project billing</h2><p>Enter a File ID to open its bills, invoices or receipts.</p></div>
    <div className="bv4-jump-row">
      <input aria-label="LAND VIEW File ID" value={entered} onChange={(event) => setEntered(event.target.value)} placeholder="e.g. LV-157" autoComplete="off" />
      <span style={{ fontSize: 12, color: "var(--lv-text-secondary)" }}>{code ? `Selected: ${code}` : entered ? "Enter a valid LV number" : ""}</span>
    </div>
    <div className="bv4-jump-links">
      <Link className="primary" aria-disabled={!code} tabIndex={code ? 0 : -1} href={code ? `/admin/billing/workspace?fileId=${encoded}` : "/admin/billing"}>Project Billing</Link>
      <Link aria-disabled={!code} tabIndex={code ? 0 : -1} href={code ? `/admin/billing/invoices?fileId=${encoded}` : "/admin/billing"}>Invoices / Print</Link>
      <Link aria-disabled={!code} tabIndex={code ? 0 : -1} href={code ? `/admin/billing/project-statement?fileId=${encoded}` : "/admin/billing"}>Statements & Receipts</Link>
    </div>
  </section>;
}
