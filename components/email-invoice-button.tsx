"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SheetInvoices } from "@/lib/sheet-invoices";
import { billingIssueDate, hasBillingData } from "./project-billing-document";

type Props = {
  result: SheetInvoices;
  verificationUrl: string;
  className?: string;
};

export default function EmailInvoiceButton({ result, verificationUrl, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  function close() {
    if (busy) return;
    setOpen(false);
    setError("");
    setSuccess("");
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!verificationUrl || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/email/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          email: recipient,
          fileId: result.id,
          clientName: result.client.name || "",
          issueDate: billingIssueDate(result),
          verificationUrl,
          categories: result.invoices.filter(hasBillingData).map((category) => ({
            name: category.name,
            gross: Number(category.gross || 0),
            discount: Number(category.discount || 0),
            paid: Number(category.paid || 0),
            due: Number(category.due || 0),
          })),
          totals: {
            gross: Number(result.totals.gross || 0),
            discount: Number(result.totals.discount || 0),
            paid: Number(result.totals.paid || 0),
            due: Number(result.totals.due || 0),
          },
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not send the invoice email."));
      setSuccess(`Invoice sent to ${recipient.trim()}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the invoice email.");
    } finally {
      setBusy(false);
    }
  }

  const ready = Boolean(verificationUrl);

  return (
    <>
      <button
        className={className}
        type="button"
        disabled={!ready}
        title={ready ? "Email this verified billing statement" : "Preparing the invoice verification link…"}
        onClick={() => {
          setError("");
          setSuccess("");
          setOpen(true);
        }}
      >
        Email Invoice
      </button>

      {open && (
        <div
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "grid",
            placeItems: "center",
            padding: 18,
            background: "rgba(3, 10, 16, .72)",
            backdropFilter: "blur(4px)",
          }}
        >
          <form
            onSubmit={send}
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-invoice-title"
            style={{
              width: "min(480px, 100%)",
              border: "1px solid rgba(148, 163, 184, .24)",
              borderRadius: 16,
              background: "#11181d",
              boxShadow: "0 28px 70px rgba(0,0,0,.42)",
              padding: 22,
              color: "#f8fafc",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
              <div>
                <span style={{ display: "block", fontSize: 10, letterSpacing: "1.2px", color: "#94a3ad", marginBottom: 5 }}>LAND VIEW / BILLING EMAIL</span>
                <h2 id="email-invoice-title" style={{ margin: 0, fontSize: 20 }}>Email {result.id} invoice</h2>
                <p style={{ margin: "7px 0 0", color: "#aeb9c2", fontSize: 13, lineHeight: 1.5 }}>
                  Sends the client a branded billing summary with the permanent LAND VIEW verification link.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close email dialog"
                onClick={close}
                disabled={busy}
                style={{ border: 0, background: "transparent", color: "#cbd5e1", fontSize: 24, cursor: busy ? "default" : "pointer", lineHeight: 1 }}
              >×</button>
            </div>

            <label htmlFor="invoice-email-recipient" style={{ display: "block", marginTop: 20, marginBottom: 7, fontSize: 12, fontWeight: 700, color: "#d8e0e6" }}>
              Client email address
            </label>
            <input
              ref={inputRef}
              id="invoice-email-recipient"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="client@example.com"
              value={recipient}
              onChange={(event) => {
                setRecipient(event.target.value);
                setError("");
                setSuccess("");
              }}
              disabled={busy}
              style={{
                boxSizing: "border-box",
                width: "100%",
                border: "1px solid #3b4852",
                borderRadius: 9,
                background: "#0c1216",
                color: "#f8fafc",
                padding: "11px 12px",
                outline: "none",
                fontSize: 14,
              }}
            />

            <div style={{ marginTop: 13, borderRadius: 9, background: "#0c1216", border: "1px solid #26323a", padding: "11px 12px", fontSize: 12, color: "#aeb9c2", lineHeight: 1.55 }}>
              <strong style={{ color: "#e7edf1" }}>{result.client.name || "Client"}</strong><br />
              Total bill: BDT {new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(result.totals.gross || 0)} · Due: BDT {new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(Math.max(0, result.totals.due || 0))}
            </div>

            {error && <div role="alert" style={{ marginTop: 13, borderRadius: 8, padding: "10px 11px", background: "rgba(190,24,93,.13)", border: "1px solid rgba(251,113,133,.34)", color: "#fecdd3", fontSize: 12, lineHeight: 1.5 }}>{error}</div>}
            {success && <div role="status" style={{ marginTop: 13, borderRadius: 8, padding: "10px 11px", background: "rgba(5,150,105,.13)", border: "1px solid rgba(52,211,153,.32)", color: "#a7f3d0", fontSize: 12, lineHeight: 1.5 }}>{success}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 20 }}>
              <button
                type="button"
                onClick={close}
                disabled={busy}
                style={{ border: "1px solid #3b4852", borderRadius: 8, background: "transparent", color: "#e2e8f0", padding: "9px 13px", cursor: busy ? "default" : "pointer", fontWeight: 700 }}
              >
                {success ? "Close" : "Cancel"}
              </button>
              {!success && (
                <button
                  type="submit"
                  disabled={busy || !recipient.trim()}
                  style={{ border: 0, borderRadius: 8, background: "#e21f2f", color: "#ffffff", padding: "9px 14px", cursor: busy ? "default" : "pointer", fontWeight: 800, opacity: busy || !recipient.trim() ? .62 : 1 }}
                >
                  {busy ? "Sending…" : "Send Invoice"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
