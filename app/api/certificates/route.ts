import { billingQrSvg } from "@/lib/billing-qr";
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CertificateType, signCertificate, verifyCertificate } from "@/lib/certificate-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SESSION_COOKIE = "landview_session";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const GATEWAY_TIMEOUT_MS = 50_000;
const REDIRECT_RETRY_DELAYS_MS = [0, 250, 700];

function clean(value: unknown, max = 240) { return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function prefix(type: CertificateType) { if (type === "employee") return "EMP"; if (type === "building") return "BLD"; return "PRJ"; }
function dateKey(date: string) { return date.replace(/\D/g, "").slice(0, 8); }
function requireGatewayConfig() { if (!APPS_SCRIPT_URL || !PROXY_SECRET) throw new Error("Certificate registry backend is not configured."); }
function inferCategory(type: CertificateType, subject: string, explicit: unknown) {
  const value = clean(explicit, 40).toLowerCase();
  if (value) return value;
  if (type === "employee") return "employee";
  if (type === "building") return "building";
  const s = subject.toLowerCase();
  if (s.includes("structural")) return "structural_design";
  if (s.includes("supervision")) return "supervision";
  return "project";
}

function safeUpstreamUrl(value: string) {
  try { const url = new URL(value); return `${url.hostname}${url.pathname}`; } catch { return "invalid-upstream-url"; }
}
function safeBodyPreview(text: string) { return text.replace(/\s+/g, " ").slice(0, 180); }
type ParsedGatewayResponse = { response: Response; raw: string; json: any | null; };
async function parseGatewayResponse(response: Response, phase: string): Promise<ParsedGatewayResponse> {
  const raw = await response.text(); let json: any | null = null;
  try { json = JSON.parse(raw); } catch { console.error("certificate gateway returned non-JSON", { phase, status: response.status, contentType: response.headers.get("content-type") || "", upstream: safeUpstreamUrl(response.url || APPS_SCRIPT_URL), bodyPreview: safeBodyPreview(raw) }); }
  return { response, raw, json };
}
async function followContentServiceRedirect(location: string, signal: AbortSignal): Promise<ParsedGatewayResponse> {
  let last: ParsedGatewayResponse | null = null;
  for (let index = 0; index < REDIRECT_RETRY_DELAYS_MS.length; index += 1) {
    const delay = REDIRECT_RETRY_DELAYS_MS[index]; if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const response = await fetch(location, { method: "GET", cache: "no-store", redirect: "follow", signal });
    const parsed = await parseGatewayResponse(response, `redirect-${index + 1}`); last = parsed;
    if (parsed.json !== null) return parsed;
    const retryable = response.status === 404 || response.status === 429 || response.status >= 500; if (!retryable) return parsed;
  }
  return last!;
}
async function postGateway(payload: Record<string, unknown>): Promise<ParsedGatewayResponse> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
  try {
    const initial = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, cache: "no-store", redirect: "manual", body: JSON.stringify(payload), signal: controller.signal });
    if ([301,302,303,307,308].includes(initial.status)) { const location = initial.headers.get("location") || ""; if (!location) return parseGatewayResponse(initial, "redirect-missing-location"); return followContentServiceRedirect(location, controller.signal); }
    return parseGatewayResponse(initial, "initial");
  } catch (error: any) {
    const timedOut = error?.name === "AbortError"; console.error("certificate gateway request failed", { timedOut, error: String(error?.message || error || "Unknown error").slice(0,180) });
    throw new Error(timedOut ? "The certificate server is responding slowly. Please try again." : "Certificate backend is temporarily unavailable.");
  } finally { clearTimeout(timer); }
}
async function gatewayRequest(request: NextRequest, flags: Record<string, unknown>, payload: Record<string, unknown>) {
  requireGatewayConfig(); const token = request.cookies.get(SESSION_COOKIE)?.value || ""; if (!token) throw new Error("Session expired.");
  const parsed = await postGateway({ action: "getPublicProjects", token, proxySecret: PROXY_SECRET, ...flags, ...payload }); const json = parsed.json;
  if (json === null) throw new Error(/^\s*</.test(parsed.raw) ? "Certificate server returned a temporary HTML response. Please retry." : "Certificate backend returned invalid JSON.");
  if (!parsed.response.ok && !json?.success) throw new Error(String(json?.error || json?.message || `Certificate backend returned HTTP ${parsed.response.status}.`));
  if (!json?.success) throw new Error(String(json?.error || json?.message || "Certificate request failed.")); return json.data || {};
}
function registryRequest(request: NextRequest, payload: Record<string, unknown>) { return gatewayRequest(request, { _certificateRegistry: "1" }, payload); }
function portalRequest(request: NextRequest, payload: Record<string, unknown>) { return gatewayRequest(request, { _certificatePortal: "1" }, payload); }
function certificateUrls(request: NextRequest, token: string, certificateId = "") {
  if (!token) return { verificationUrl: "", qrUrl: "" };
  const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const verificationUrl = `${origin}/certificate/verify/${encodeURIComponent(token)}`;
  // QR carries the signed token itself. This keeps verification self-contained and
  // prevents a registry lookup failure from making a valid printed certificate invalid.
  const qrUrl = `${origin}/api/billing-verification/qr?data=${encodeURIComponent(verificationUrl)}`;
  return { verificationUrl, qrUrl };
}
function validateType(value: unknown) { const type = clean(value,20).toLowerCase() as CertificateType; if (!["project","employee","building"].includes(type)) throw new Error("Invalid certificate type."); return type; }

export async function GET(request: NextRequest) {
  try {
    if (!request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.json({ success:false,error:"Unauthorized." },{status:401});
    const data = await registryRequest(request,{registryOp:"list"});
    const certificates=(Array.isArray(data?.certificates)?data.certificates:[]).map((item:any)=>{const signed=clean(item?.token,5000);const verified=signed?verifyCertificate(signed):null;return {...item,fatherName:clean(item?.fatherName||item?.Father_Name||verified?.f,120),motherName:clean(item?.motherName||item?.Mother_Name||verified?.m,120),nidNo:clean(item?.nidNo||item?.NID_No||verified?.nid,40),...certificateUrls(request,signed,clean(item?.certificateId||item?.Certificate_ID,60))};});
    return NextResponse.json({success:true,data:{...data,certificates}},{headers:{"Cache-Control":"no-store"}});
  } catch(error:any){const message=String(error?.message||"Could not load certificates.");const status=/session expired|unauthorized/i.test(message)?401:/access denied|permission/i.test(message)?403:502;return NextResponse.json({success:false,error:message},{status});}
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({success:false,error:"Invalid request origin."},{status:403});
    const body=await request.json(); const type=validateType(body?.type); const issuedAt=clean(body?.issuedAt||new Date().toISOString(),40); const certificateId=`LVC-${prefix(type)}-${dateKey(issuedAt)}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const payload={id:certificateId,t:type,n:clean(body?.name,120),a:clean(body?.address,220),p:clean(body?.position,120),s:clean(body?.subject,140),r:clean(body?.reference,80),d:String(body?.description??"").trim(),f:clean(body?.fatherName,120),m:clean(body?.motherName,120),nid:clean(body?.nidNo,40),i:issuedAt,x:clean(body?.expiresAt,40)};
    const token=signCertificate(payload); const record={certificateId,type,name:payload.n,address:payload.a,position:payload.p,subject:payload.s,reference:payload.r,description:payload.d,fatherName:payload.f,motherName:payload.m,nidNo:payload.nid,issuedAt,expiresAt:payload.x||"",category:inferCategory(type,payload.s,body?.category),token};
    const data=await registryRequest(request,{registryOp:"create",certificate:record});
    return NextResponse.json({success:true,data:{...data,certificate:{...record,...(data?.certificate||{}),...certificateUrls(request,token,certificateId)}}},{headers:{"Cache-Control":"no-store"}});
  } catch(error:any){const message=String(error?.message||"Could not create certificate.");const status=/session expired|unauthorized/i.test(message)?401:/access denied|permission/i.test(message)?403:400;return NextResponse.json({success:false,error:message},{status});}
}

export async function PATCH(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({success:false,error:"Invalid request origin."},{status:403});
    const body=await request.json(); const op=clean(body?.op,30).toLowerCase(); const certificateId=clean(body?.certificateId,60).toUpperCase(); if(!certificateId) throw new Error("Certificate ID is required.");
    const payload:any={registryOp:op,certificateId}; if(body?.reason) payload.reason=clean(body.reason,500); if(body?.status) payload.status=clean(body.status,30); if(body?.certificate) payload.certificate=body.certificate;
    const data=await registryRequest(request,payload); return NextResponse.json({success:true,data},{headers:{"Cache-Control":"no-store"}});
  } catch(error:any){const message=String(error?.message||"Could not update certificate.");const status=/session expired|unauthorized/i.test(message)?401:/access denied|permission/i.test(message)?403:400;return NextResponse.json({success:false,error:message},{status});}
}

export async function PUT(request: NextRequest) {
  try { if(!sameOrigin(request)) return NextResponse.json({success:false,error:"Invalid request origin."},{status:403}); const body=await request.json(); const data=await portalRequest(request,body||{}); return NextResponse.json({success:true,data},{headers:{"Cache-Control":"no-store"}}); }
  catch(error:any){const message=String(error?.message||"Certificate request failed.");const status=/session expired|unauthorized/i.test(message)?401:/access denied|permission/i.test(message)?403:400;return NextResponse.json({success:false,error:message},{status});}
}
