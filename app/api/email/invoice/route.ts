import { NextRequest, NextResponse } from "next/server";
import { EmailServiceConfigurationError, sendTransactionalEmail } from "@/lib/email-service";
import { insertRows } from "@/lib/supabase-data";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EmailCategory = {
  name: string;
  gross: number;
  discount: number;
  paid: number;
  due: number;
};

type EmailTotals = {
  gross: number;
  discount: number;
  paid: number;
  due: number;
};

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

function cleanText(value: unknown, max = 250) {
  return String(value ?? "").trim().slice(0, max);
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function validEmail(value: unknown) {
  const email = cleanText(value, 254).toLowerCase();
  if (!email || /[\r\n]/.test(email)) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(value: number) {
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(Math.round(Number(value || 0)));
}

function verificationLink(request: NextRequest, value: unknown) {
  const raw = cleanText(value, 1200);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const allowedHosts = new Set([
      request.nextUrl.host.toLowerCase(),
      "app.landview.com.bd",
      "landview.com.bd",
      "www.landview.com.bd",
    ]);
    if (!allowedHosts.has(url.host.toLowerCase())) return "";
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return "";
    if (!url.pathname.startsWith("/verify/")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizedCategories(value: unknown): EmailCategory[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      name: cleanText(row.name, 80) || "Billing",
      gross: numberValue(row.gross),
      discount: numberValue(row.discount),
      paid: numberValue(row.paid),
      due: Math.max(0, numberValue(row.due)),
    };
  });
}

function normalizedTotals(value: unknown): EmailTotals {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    gross: numberValue(row.gross),
    discount: numberValue(row.discount),
    paid: numberValue(row.paid),
    due: Math.max(0, numberValue(row.due)),
  };
}

function invoiceHtml(input: {
  fileId: string;
  clientName: string;
  issueDate: string;
  categories: EmailCategory[];
  totals: EmailTotals;
  verificationUrl: string;
}) {
  const rows = input.categories.length
    ? input.categories.map((category) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700">${escapeHtml(category.name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${money(category.gross)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${money(category.discount)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${money(category.paid)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700">${money(category.due)}</td>
      </tr>`).join("")
    : `<tr><td colspan="5" style="padding:14px;color:#6b7280">No billing categories were included.</td></tr>`;

  const status = input.totals.due > 0.009 ? "DUE" : "FULL PAID";
  const statusBg = input.totals.due > 0.009 ? "#fff1f2" : "#ecfdf5";
  const statusColor = input.totals.due > 0.009 ? "#be123c" : "#047857";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827">
    <div style="max-width:720px;margin:0 auto;padding:28px 16px">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
        <div style="padding:22px 24px;border-bottom:3px solid #e21f2f">
          <div style="font-size:26px;font-weight:800;letter-spacing:.2px">LAND <span style="color:#e21f2f">VIEW</span></div>
          <div style="font-size:11px;letter-spacing:1px;color:#4b5563;margin-top:3px">ENGINEERS AND ARCHITECTS</div>
        </div>
        <div style="padding:24px">
          <h1 style="font-size:20px;margin:0 0 5px">Project Billing Statement</h1>
          <p style="margin:0 0 20px;color:#6b7280">Invoice ${escapeHtml(`INV-${input.fileId.replace(/^LV-/, "")}-01`)} · ${escapeHtml(input.issueDate || "Current")}</p>

          <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:7px 0;color:#6b7280;width:120px">File ID</td><td style="padding:7px 0;font-weight:700">${escapeHtml(input.fileId)}</td></tr>
            <tr><td style="padding:7px 0;color:#6b7280">Client</td><td style="padding:7px 0;font-weight:700">${escapeHtml(input.clientName || "—")}</td></tr>
            <tr><td style="padding:7px 0;color:#6b7280">Status</td><td style="padding:7px 0"><span style="display:inline-block;padding:5px 9px;border-radius:999px;background:${statusBg};color:${statusColor};font-weight:800;font-size:12px">${status}</span></td></tr>
          </table>

          <div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:10px">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="background:#1f2933;color:#ffffff">
                  <th style="padding:10px 12px;text-align:left">Bill</th>
                  <th style="padding:10px 12px;text-align:right">Total</th>
                  <th style="padding:10px 12px;text-align:right">Discount</th>
                  <th style="padding:10px 12px;text-align:right">Paid</th>
                  <th style="padding:10px 12px;text-align:right">Due</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>

          <div style="margin-top:18px;background:#f8fafc;border-radius:10px;padding:15px 16px">
            <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:4px 0;color:#6b7280">Total Bill (BDT)</td><td style="padding:4px 0;text-align:right;font-weight:700">${money(input.totals.gross)}</td></tr>
              <tr><td style="padding:4px 0;color:#6b7280">Discount (BDT)</td><td style="padding:4px 0;text-align:right;font-weight:700">${money(input.totals.discount)}</td></tr>
              <tr><td style="padding:4px 0;color:#6b7280">Paid (BDT)</td><td style="padding:4px 0;text-align:right;font-weight:700">${money(input.totals.paid)}</td></tr>
              <tr><td style="padding:9px 0 2px;font-size:16px;font-weight:800">Due Amount (BDT)</td><td style="padding:9px 0 2px;text-align:right;font-size:18px;font-weight:800;color:${statusColor}">${money(input.totals.due)}</td></tr>
            </table>
          </div>

          <div style="text-align:center;margin:24px 0 8px">
            <a href="${escapeHtml(input.verificationUrl)}" style="display:inline-block;background:#e21f2f;color:#ffffff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:8px">View &amp; Verify Billing Statement</a>
          </div>
          <p style="font-size:12px;line-height:1.6;color:#6b7280;text-align:center;margin:12px 0 0">The verification link is generated by LAND VIEW. For the full printable invoice, open the billing statement in the LAND VIEW portal and use Print / Save PDF.</p>
        </div>
        <div style="padding:16px 24px;background:#111827;color:#d1d5db;font-size:12px;line-height:1.6">
          LAND VIEW — Engineers and Architects<br>
          Feni Sadar, Feni · +88 01902 500 400 · landviewcivil@gmail.com · www.landview.com.bd
        </div>
      </div>
    </div>
  </body>
</html>`;
}

async function auditEmail(input: {
  actor: string;
  fileId: string;
  recipient: string;
  outcome: "sent" | "failed";
  providerMessageId?: string;
  error?: string;
  totals?: EmailTotals;
}) {
  try {
    await insertRows("app_audit_log", {
      actor_user_key: input.actor || null,
      action: "invoice_email",
      target: input.fileId,
      outcome: input.outcome,
      details: {
        provider: "resend",
        recipient: input.recipient,
        provider_message_id: input.providerMessageId || null,
        due_amount: input.totals?.due ?? null,
        error: input.error ? input.error.slice(0, 500) : null,
      },
    });
  } catch (error) {
    console.warn("LAND VIEW email audit log failed", error instanceof Error ? error.message : String(error));
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
  }

  const user = await requireLocalSession(request);
  if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
  const role = roleOf(user);
  if (!["admin", "manager", "accounts"].includes(role)) {
    return NextResponse.json({ success: false, error: "Finance email access is required." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid email request." }, { status: 400 });
  }

  const recipient = validEmail(body.email);
  const fileId = cleanText(body.fileId, 30).toUpperCase();
  const clientName = cleanText(body.clientName, 180);
  const issueDate = cleanText(body.issueDate, 80);
  const verificationUrl = verificationLink(request, body.verificationUrl);
  const requestId = cleanText(body.requestId, 120);
  const categories = normalizedCategories(body.categories);
  const totals = normalizedTotals(body.totals);
  const actor = userIdOf(user);

  if (!recipient) return NextResponse.json({ success: false, error: "Enter a valid client email address." }, { status: 400 });
  if (!/^LV-\d+$/.test(fileId)) return NextResponse.json({ success: false, error: "Invalid File ID." }, { status: 400 });
  if (!verificationUrl) return NextResponse.json({ success: false, error: "The verified billing link is not ready. Refresh the invoice and try again." }, { status: 400 });
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(requestId)) return NextResponse.json({ success: false, error: "Invalid email request ID." }, { status: 400 });

  const subject = `LAND VIEW – Invoice ${fileId}`;
  const html = invoiceHtml({ fileId, clientName, issueDate, categories, totals, verificationUrl });

  try {
    const sent = await sendTransactionalEmail({
      to: recipient,
      subject,
      html,
      idempotencyKey: `invoice/${fileId}/${requestId}`,
    });
    await auditEmail({ actor, fileId, recipient, outcome: "sent", providerMessageId: sent.id, totals });
    return NextResponse.json({ success: true, id: sent.id, provider: sent.provider }, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send invoice email.";
    await auditEmail({ actor, fileId, recipient, outcome: "failed", error: message, totals });
    const status = error instanceof EmailServiceConfigurationError ? 503 : 502;
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
