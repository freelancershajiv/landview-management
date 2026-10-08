import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 2_600_000;
type Row = Record<string, any>;

function clean(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function deny(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

async function requireAdminOrManager(request: NextRequest) {
  const user = (await requireLocalSession(request)) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Admin or Manager access is required.");
}

function botConfig() {
  const base = clean(process.env.WHATSAPP_BOT_URL, 1000).replace(/\/+$/, "");
  const token = clean(process.env.WHATSAPP_BOT_API_TOKEN, 1000);
  if (!base || !token) throw new Error("WhatsApp bot is not configured.");
  return { base, token };
}

function safeFileName(value: unknown, fallback: string) {
  const safe = clean(value, 180)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (safe || fallback).slice(0, 160).replace(/\.pdf$/i, "") + ".pdf";
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return deny("Invalid request origin.", 403);
  try {
    await requireAdminOrManager(request);
    if (!/application\/pdf/i.test(request.headers.get("content-type") || "")) return deny("A PDF invoice is required.", 415);

    const phoneNumber = clean(request.nextUrl.searchParams.get("phoneNumber"), 100);
    const fileId = clean(request.nextUrl.searchParams.get("fileId"), 100) || "LAND-VIEW";
    const clientName = clean(request.nextUrl.searchParams.get("clientName"), 180) || "Client";
    const issueDate = clean(request.nextUrl.searchParams.get("issueDate"), 80);
    const verificationUrl = clean(request.nextUrl.searchParams.get("verificationUrl"), 1000);
    const fileName = safeFileName(request.nextUrl.searchParams.get("fileName"), `${fileId}-Invoice`);
    if (!phoneNumber) return deny("This invoice does not have a client WhatsApp number.");

    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.byteLength) return deny("Invoice PDF data is missing.");
    if (bytes.byteLength > MAX_PDF_BYTES) return deny("The invoice PDF is too large for direct WhatsApp sending.", 413);
    if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return deny("Invoice PDF data is invalid.");

    const caption = [
      "LAND VIEW Architects & Engineers",
      `Invoice: ${fileId}`,
      `Client: ${clientName}`,
      issueDate ? `Issue date: ${issueDate}` : "",
      verificationUrl ? `Billing verification: ${verificationUrl}` : "",
    ].filter(Boolean).join("\n").slice(0, 1000);

    const { base, token } = botConfig();
    const response = await fetch(`${base}/client/send-document`, {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "x-land-view-bot-token": token,
        "x-client-phone": phoneNumber,
        "x-file-name": fileName,
        "x-caption-b64": Buffer.from(caption, "utf8").toString("base64"),
      },
      body: Buffer.from(bytes),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    const json = await response.json().catch(() => null) as any;
    if (!response.ok || !json?.ok) throw new Error(clean(json?.error || `WhatsApp bot returned HTTP ${response.status}.`, 900));
    return NextResponse.json({ success: true, data: json }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const message = clean(error?.message || "Could not send the invoice PDF to WhatsApp.", 1000);
    const status = /session expired/i.test(message) ? 401 : /Admin or Manager/i.test(message) ? 403 : 500;
    return deny(message, status);
  }
}
