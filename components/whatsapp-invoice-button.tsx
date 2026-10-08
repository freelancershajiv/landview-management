"use client";

import { useState } from "react";
import type { SheetInvoices } from "@/lib/sheet-invoices";
import { billingIssueDate } from "./project-billing-document";
import { createBillingPdf } from "@/lib/create-billing-pdf-parity";

type Props = {
  result: SheetInvoices;
  verificationUrl: string;
  className?: string;
};

export default function WhatsAppInvoiceButton({ result, verificationUrl, className = "" }: Props) {
  const [busy, setBusy] = useState(false);
  const phone = String(result.client.phone || "").trim();
  const ready = Boolean(phone && verificationUrl);

  async function send() {
    if (!ready || busy) return;
    const clientName = String(result.client.name || "Client").trim() || "Client";
    if (!window.confirm(`Send ${result.id} invoice PDF to ${clientName} on WhatsApp (${phone})?`)) return;

    setBusy(true);
    try {
      const pdf = await createBillingPdf(result);
      const params = new URLSearchParams({
        phoneNumber: phone,
        fileId: result.id,
        fileName: pdf.filename,
        clientName,
        issueDate: billingIssueDate(result),
        verificationUrl,
      });
      const response = await fetch(`/api/admin/whatsapp/invoice?${params.toString()}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/pdf" },
        body: pdf.blob,
      });
      const json = await response.json().catch(() => null) as any;
      if (!response.ok || !json?.success) {
        throw new Error(String(json?.error || "Could not send the invoice PDF to WhatsApp."));
      }
      const sentTo = String(json?.data?.normalizedPhone || phone);
      window.alert(`Invoice PDF sent to WhatsApp ${sentTo}.`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not send the invoice PDF to WhatsApp.");
    } finally {
      setBusy(false);
    }
  }

  const title = !phone
    ? "No client mobile / WhatsApp number is saved on this invoice."
    : !verificationUrl
      ? "Preparing the invoice verification QR before WhatsApp sending…"
      : `Send this invoice PDF to ${phone} through the connected LAND VIEW Admin WhatsApp account.`;

  return (
    <button className={className} type="button" onClick={() => void send()} disabled={!ready || busy} title={title}>
      {busy ? "Sending PDF…" : "Send PDF to WhatsApp"}
    </button>
  );
}
