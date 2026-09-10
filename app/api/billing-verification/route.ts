import { NextRequest, NextResponse } from "next/server";
import { signBillingVerification, type BillingVerificationPayload } from "@/lib/billing-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "landview_session";

function cleanText(value: unknown, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanMoney(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Invalid billing amount.");
  return Math.round(number * 100) / 100;
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    }

    if (!request.cookies.get(SESSION_COOKIE)?.value) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const input = await request.json();
    const fileId = cleanText(input?.fileId, 30).toUpperCase();
    if (!/^LV-\d+$/.test(fileId)) {
      return NextResponse.json({ success: false, error: "Invalid File ID." }, { status: 400 });
    }

    const categories = Array.isArray(input?.categories) ? input.categories.slice(0, 3).map((category: any) => ({
      name: cleanText(category?.name, 40),
      gross: cleanMoney(category?.gross),
      discount: cleanMoney(category?.discount),
      paid: cleanMoney(category?.paid),
      due: cleanMoney(category?.due),
    })) : [];

    if (categories.length !== 3) {
      return NextResponse.json({ success: false, error: "Incomplete billing categories." }, { status: 400 });
    }

    const payload: BillingVerificationPayload = {
      version: 1,
      fileId,
      clientName: cleanText(input?.clientName, 120),
      projectType: cleanText(input?.projectType, 80),
      issuedAt: new Date().toISOString(),
      totals: {
        gross: cleanMoney(input?.totals?.gross),
        discount: cleanMoney(input?.totals?.discount),
        paid: cleanMoney(input?.totals?.paid),
        due: cleanMoney(input?.totals?.due),
      },
      categories,
    };

    const token = signBillingVerification(payload);
    const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const url = `${origin}/verify/${encodeURIComponent(token)}`;

    return NextResponse.json({ success: true, url, issuedAt: payload.issuedAt }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Could not create verification link." }, { status: 500 });
  }
}
