import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const COOKIE_NAME = "landview_session";

function clean(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

async function callAppsScript(request: NextRequest, body: Record<string, unknown>) {
  if (!APPS_SCRIPT_URL || !PROXY_SECRET) throw new Error("Certificate portal backend is not configured.");
  const token = request.cookies.get(COOKIE_NAME)?.value || "";
  if (!token) throw new Error("Session expired.");
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    cache: "no-store",
    redirect: "follow",
    body: JSON.stringify({ action: "getPublicProjects", proxySecret: PROXY_SECRET, token, ...body }),
  });
  const raw = await response.text();
  let json: any;
  try { json = JSON.parse(raw); }
  catch { throw new Error(/^\s*</.test(raw) ? "Apps Script returned HTML instead of JSON." : "Certificate portal returned invalid JSON."); }
  if (!json?.success) throw new Error(String(json?.error || json?.message || "Certificate portal request failed."));
  let data = json.data;
  for (let depth = 0; depth < 2 && data?.success === true && data?.data; depth++) data = data.data;
  return data || {};
}

async function backend(request: NextRequest, certificatePortalOp: string, payload: Record<string, unknown> = {}) {
  return callAppsScript(request, { _certificatePortal: "1", certificatePortalOp, ...payload });
}

async function legacyClientBackend(request: NextRequest, clientOp: string, payload: Record<string, unknown> = {}) {
  return callAppsScript(request, { _clientPortal: "1", clientOp, ...payload });
}

const headers = { "Cache-Control": "no-store, max-age=0" };
const supportedCategories = ["project", "structural_design", "supervision", "building", "employee"];

async function mine(request: NextRequest) {
  const data = await backend(request, "mine");
  if (Array.isArray(data?.requests) && Array.isArray(data?.certificates)) {
    return { ...data, backendMode: "unified", certificatesAvailable: true, categories: supportedCategories };
  }
  // Older gateways ignore an unknown certificate flag and return public-project
  // data with success:true. Only accept the authenticated client workspace shape.
  const workspace = await legacyClientBackend(request, "workspace");
  if (!workspace?.client || !Array.isArray(workspace.projects) ||
      !workspace.projects.every((project: any) => typeof project?.projectId === "string" && Array.isArray(project.certificateRequests))) {
    throw new Error("The certificate backend needs an Apps Script deployment update. Project request history is unavailable.");
  }
  const requests = workspace.projects.flatMap((project: any) => project.certificateRequests.map((row: any) => ({
    ...row, projectId: project.projectId,
    category: row.category || (row.certificateType === "building" ? "building" : "project"),
  })));
  return { requests, certificates: [], backendMode: "legacy", certificatesAvailable: false, categories: ["project", "building"] };
}

async function adminRequests(request: NextRequest) {
  const data = await backend(request, "adminList");
  if (Array.isArray(data?.requests)) return { ...data, backendMode: "unified" };
  const legacy = await legacyClientBackend(request, "adminRequests");
  if (!Array.isArray(legacy?.requests)) throw new Error("Certificate request history is unavailable. Update the Apps Script deployment.");
  return { ...legacy, backendMode: "legacy" };
}

export async function GET(request: NextRequest) {
  const mode = clean(request.nextUrl.searchParams.get("mode"), 30).toLowerCase();
  try {
    const data = mode === "admin" ? await adminRequests(request) : await mine(request);
    return NextResponse.json({ success: true, data }, { headers });
  } catch (error: any) {
    const message = error?.message || "Could not load certificate portal.";
    return NextResponse.json({ success: false, error: message }, { status: /session|access|unauthorized/i.test(message) ? 401 : 502, headers });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const input = await request.json();
    const action = clean(input?.action, 30).toLowerCase();

    if (action === "request") {
      const capability = await mine(request);
      const payload = {
        category: clean(input?.category, 40), projectId: clean(input?.projectId, 60).toUpperCase(),
        subject: clean(input?.subject, 160), details: clean(input?.details, 800),
      };
      if (!capability.categories.includes(payload.category)) return NextResponse.json({ success: false, error: "This certificate category is not supported by the current backend. Refresh certificates to see available categories." }, { status: 400 });
      // Choose before the write; never retry an ambiguous mutation on another backend.
      const data = capability.backendMode === "legacy"
        ? await legacyClientBackend(request, "requestCertificate", { ...payload, certificateType: payload.category })
        : await backend(request, "request", payload);
      if (!data?.request?.requestId) throw new Error("The backend did not confirm a request ID. Refresh request history before trying again.");
      return NextResponse.json({ success: true, data }, { headers });
    }

    if (action === "review") {
      const payload = {
        requestId: clean(input?.requestId, 80), decision: clean(input?.decision, 20), note: clean(input?.note, 400),
      };
      const capability = await adminRequests(request);
      const data = capability.backendMode === "legacy"
        ? await legacyClientBackend(request, "reviewRequest", payload)
        : await backend(request, "review", payload);
      if (!data?.request?.requestId) throw new Error("The backend did not confirm the review. Refresh request history before trying again.");
      return NextResponse.json({ success: true, data }, { headers });
    }

    if (action === "link-issued") {
      const data = await backend(request, "linkIssued", {
        requestId: clean(input?.requestId, 80), certificateId: clean(input?.certificateId, 80).toUpperCase(),
      });
      if (!data?.request?.requestId) throw new Error("The backend did not confirm certificate linkage. Refresh request history before trying again.");
      return NextResponse.json({ success: true, data }, { headers });
    }

    return NextResponse.json({ success: false, error: "Unknown certificate portal action." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Certificate portal request failed." }, { status: 500 });
  }
}
