import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CertificateType, signCertificate } from "@/lib/certificate-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "landview_session";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

function clean(value: unknown, max = 240) { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function prefix(type: CertificateType) { if (type === "employee") return "EMP"; if (type === "building") return "BLD"; return "PRJ"; }
function dateKey(date: string) { return date.replace(/\D/g, "").slice(0, 8); }
function requireGatewayConfig() { if (!APPS_SCRIPT_URL || !PROXY_SECRET) throw new Error("Certificate registry backend is not configured."); }

async function gatewayRequest(request: NextRequest, flags: Record<string, unknown>, payload: Record<string, unknown>) {
  requireGatewayConfig();
  const token = request.cookies.get(SESSION_COOKIE)?.value || "";
  if (!token) throw new Error("Session expired.");
  const backend = await fetch(APPS_SCRIPT_URL, {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, cache: "no-store", redirect: "follow",
    body: JSON.stringify({ action: "getPublicProjects", token, proxySecret: PROXY_SECRET, ...flags, ...payload }),
  });
  const raw = await backend.text();
  let json: any;
  try { json = JSON.parse(raw); }
  catch { throw new Error(/^\s*</.test(raw) ? "Apps Script returned HTML instead of JSON." : "Certificate backend returned invalid JSON."); }
  if (!json?.success) throw new Error(String(json?.error || json?.message || "Certificate request failed."));
  return json.data || {};
}

function registryRequest(request: NextRequest, payload: Record<string, unknown>) {
  return gatewayRequest(request, { _certificateRegistry: "1" }, payload);
}
function portalRequest(request: NextRequest, payload: Record<string, unknown>) {
  return gatewayRequest(request, { _certificatePortal: "1" }, payload);
}

function certificateUrls(request: NextRequest, token: string) {
  if (!token) return { verificationUrl: "", qrUrl: "" };
  const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const verificationUrl = `${origin}/certificate/verify/${encodeURIComponent(token)}`;
  const qrUrl = `${origin}/api/billing-verification/qr?data=${encodeURIComponent(verificationUrl)}`;
  return { verificationUrl, qrUrl };
}
function validateType(value: unknown) {
  const type = clean(value, 20).toLowerCase() as CertificateType;
  if (!["project", "employee", "building"].includes(type)) throw new Error("Invalid certificate type.");
  return type;
}

export async function GET(request: NextRequest) {
  try {
    if (!request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    const data = await registryRequest(request, { registryOp: "list" });
    const certificates = (Array.isArray(data?.certificates) ? data.certificates : []).map((item: any) => ({ ...item, ...certificateUrls(request, clean(item?.token, 5000)), token: undefined }));
    return NextResponse.json({ success: true, data: { ...data, certificates } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Could not load certificate registry." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    if (!request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    const input = await request.json();
    const type = validateType(input?.type);
    const issuedAt = clean(input?.issuedAt, 40) || new Date().toISOString();
    const key = dateKey(issuedAt) || dateKey(new Date().toISOString());
    const code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
    const certificateId = `LVC-${prefix(type)}-${key}-${code}`;
    const name = clean(input?.name, 120);
    const address = clean(input?.address, 220);
    const position = clean(input?.position, 120);
    const subject = clean(input?.subject, 140);
    const reference = clean(input?.reference, 80);
    const description = clean(input?.description, 900);
    const expiresAt = clean(input?.expiresAt, 40);
    const category = clean(input?.category, 40).toLowerCase();
    const requestId = clean(input?.requestId, 80);
    if (!name) throw new Error("Certificate name is required.");

    let revision = 1;
    let parentId = "";
    const reissueOf = clean(input?.reissueOf, 60).toUpperCase();
    if (reissueOf) {
      const list = await registryRequest(request, { registryOp: "list" });
      const previous = (Array.isArray(list?.certificates) ? list.certificates : []).find((item: any) => String(item?.certificateId || "").toUpperCase() === reissueOf);
      if (!previous) throw new Error("The certificate being reissued was not found.");
      revision = Math.max(1, Number(previous.revision || 1)) + 1;
      parentId = clean(previous.parentId || previous.certificateId, 60).toUpperCase();
    }

    const signedToken = signCertificate({ id: certificateId, t: type, n: name, a: address, p: position, s: subject, r: reference, d: description, i: issuedAt, x: expiresAt || undefined });
    const urls = certificateUrls(request, signedToken);
    await registryRequest(request, {
      registryOp: "create", Certificate_ID: certificateId, Type: type, Category: category, Request_ID: requestId,
      Name: name, Address: address, Position: position, Subject: subject, Reference: reference, Description: description,
      Issued_At: issuedAt, Expires_At: expiresAt, Revision: revision, Parent_ID: parentId, Token: signedToken,
    });
    if (reissueOf) await registryRequest(request, { registryOp: "supersede", certificateId: reissueOf, supersededBy: certificateId });
    if (requestId) await portalRequest(request, { certificatePortalOp: "linkIssued", requestId, certificateId });

    return NextResponse.json({ success: true, data: { certificateId, ...urls, issuedAt, type, category, requestId, name, address, position, subject, reference, description, expiresAt: expiresAt || undefined, status: "Active", revision, parentId } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Could not issue certificate." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    if (!request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    const input = await request.json();
    const action = clean(input?.action, 20).toLowerCase();
    if (!["revoke", "delete"].includes(action)) return NextResponse.json({ success: false, error: "Unknown certificate action." }, { status: 400 });
    const certificateId = clean(input?.certificateId, 60).toUpperCase();
    if (!certificateId) return NextResponse.json({ success: false, error: "Certificate ID is required." }, { status: 400 });
    const data = await registryRequest(request, { registryOp: action, certificateId, reason: clean(input?.reason, 300) });
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Could not update certificate." }, { status: 500 });
  }
}
