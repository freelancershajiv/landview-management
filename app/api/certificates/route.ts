import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CertificateType, signCertificate } from "@/lib/certificate-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "landview_session";

function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
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

function prefix(type: CertificateType) {
  if (type === "employee") return "EMP";
  if (type === "building") return "BLD";
  return "PRJ";
}

function dateKey(date: string) {
  return date.replace(/\D/g, "").slice(0, 8);
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    if (!request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const input = await request.json();
    const type = clean(input?.type, 20).toLowerCase() as CertificateType;
    if (!["project", "employee", "building"].includes(type)) {
      return NextResponse.json({ success: false, error: "Invalid certificate type." }, { status: 400 });
    }

    const issuedAt = clean(input?.issuedAt, 40) || new Date().toISOString();
    const key = dateKey(issuedAt) || dateKey(new Date().toISOString());
    const code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
    const certificateId = `LVC-${prefix(type)}-${key}-${code}`;

    const token = signCertificate({
      id: certificateId,
      t: type,
      n: clean(input?.name, 120),
      a: clean(input?.address, 220),
      p: clean(input?.position, 120),
      s: clean(input?.subject, 140),
      r: clean(input?.reference, 80),
      d: clean(input?.description, 900),
      i: issuedAt,
      x: clean(input?.expiresAt, 40) || undefined,
    });

    const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const verificationUrl = `${origin}/certificate/verify/${encodeURIComponent(token)}`;
    const qrUrl = `${origin}/api/billing-verification/qr?data=${encodeURIComponent(verificationUrl)}`;

    return NextResponse.json({
      success: true,
      data: { certificateId, verificationUrl, qrUrl, issuedAt, type },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Could not issue certificate." }, { status: 500 });
  }
}
