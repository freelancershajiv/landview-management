import { NextRequest, NextResponse } from "next/server";
import { signProjectVerification, type VerificationSnapshot } from "@/lib/billing-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "landview_session";

function cleanText(value: unknown, max = 30) {
  return String(value ?? "").trim().slice(0, max);
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
    const fileId = cleanText(input?.fileId).toUpperCase();
    if (!/^LV-\d+$/.test(fileId)) {
      return NextResponse.json({ success: false, error: "Invalid File ID." }, { status: 400 });
    }

    const billing = input?.billing as VerificationSnapshot | undefined;
    if (!billing || !Array.isArray(billing?.categories) || !billing?.totals) {
      return NextResponse.json({ success: false, error: "Billing snapshot is required for verification." }, { status: 400 });
    }

    // The public QR contains a signed, read-only billing snapshot. Scanners do not
    // need a LAND VIEW login and cannot use the token to edit any project data.
    const token = signProjectVerification(fileId, billing);
    const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const url = `${origin}/verify/${encodeURIComponent(token)}`;

    return NextResponse.json({ success: true, url, fileId }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Could not create verification link." }, { status: 500 });
  }
}
