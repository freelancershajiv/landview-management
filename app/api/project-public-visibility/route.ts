import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

function normalizeHost(value: string | null | undefined) {
  return String(value || "").split(":")[0].trim().toLowerCase();
}

function trustedVercelHosts() {
  return new Set(
    [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
      .map(normalizeHost)
      .filter(Boolean)
  );
}

function allowedHost(host: string) {
  return host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1" || trustedVercelHosts().has(host);
}

function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    return allowedHost(normalizeHost(new URL(origin).hostname));
  } catch {
    return false;
  }
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", PROXY_SECRET).update(forwarded).digest("hex").slice(0, 32);
}

async function callBackend(payload: Record<string, unknown>) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "follow",
  });
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(/^\s*</.test(text) ? "Apps Script returned HTML instead of JSON." : "Apps Script returned invalid JSON.");
  }
  return { response, json };
}

function cleanProjectSeed(projectId: string, source: any) {
  const input = source && typeof source === "object" ? source : {};
  const seed: Record<string, string> = {
    Project_ID: projectId,
    Legacy_File_ID: String(input.Legacy_File_ID || projectId.replace(/^LV-/i, "")).trim(),
    Project_Name: String(input.Project_Name || "").trim(),
    Client_Name: String(input.Client_Name || input.Project_Name || "").trim(),
    Phone_Number: String(input.Phone_Number || "").trim(),
    Project_Type: String(input.Project_Type || "").trim(),
    Location: String(input.Location || "").trim(),
    Project_Area: String(input.Project_Area || "").trim(),
    Number_of_Stories: String(input.Number_of_Stories || "").trim(),
  };
  return seed;
}

export async function POST(request: NextRequest) {
  try {
    if (!APPS_SCRIPT_URL || !PROXY_SECRET) {
      return NextResponse.json({ success: false, error: "LAND VIEW backend is not configured." }, { status: 503 });
    }

    const host = normalizeHost(request.headers.get("host"));
    if (!allowedHost(host) || !originAllowed(request)) {
      return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    }

    const token = request.cookies.get(COOKIE_NAME)?.value || "";
    if (!token) {
      return NextResponse.json({ success: false, error: "Your session has expired. Sign in again to change public visibility." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const projectId = String(body?.projectId || "").trim().toUpperCase();
    const publicDisplay = body?.publicDisplay === true;
    if (!projectId) {
      return NextResponse.json({ success: false, error: "Project ID is required." }, { status: 400 });
    }

    const clientFingerprint = clientKey(request);
    const sessionCheck = await callBackend({
      action: "getSession",
      token,
      proxySecret: PROXY_SECRET,
      _clientKey: clientFingerprint,
    });
    if (!sessionCheck.json?.success) {
      return NextResponse.json({ success: false, error: "Your backend session has expired. Sign in again." }, { status: 401 });
    }

    const role = String(sessionCheck.json?.data?.user?.role || sessionCheck.json?.data?.user?.Role || "").trim().toLowerCase();
    if (role !== "admin" && role !== "manager") {
      return NextResponse.json({ success: false, error: "Admin or Manager access is required." }, { status: 403 });
    }

    const updatePayload = {
      action: "updateProject",
      projectId,
      Public_Display: publicDisplay,
      token,
      proxySecret: PROXY_SECRET,
      _clientKey: clientFingerprint,
    };

    let result = await callBackend(updatePayload);
    const initialMessage = String(result.json?.error || result.json?.message || "");

    // Auto Invoice is the master project list. The LAND VIEW Projects sheet only
    // needs a row once portal-specific state (for example Public_Display) exists.
    if (!result.json?.success && /project not found/i.test(initialMessage)) {
      const seed = cleanProjectSeed(projectId, body?.project);
      if (!seed.Project_Name) {
        return NextResponse.json({ success: false, error: `${projectId} is missing a project name in LV - Auto Invoice → File List.` }, { status: 400 });
      }

      const imported = await callBackend({
        action: "importLegacyBillingBatch",
        kind: "projects",
        records: [seed],
        token,
        proxySecret: PROXY_SECRET,
        _clientKey: clientFingerprint,
      });
      if (!imported.json?.success) {
        const message = String(imported.json?.error || imported.json?.message || `Could not register ${projectId} for portal controls.`);
        return NextResponse.json({ success: false, error: message }, { status: 400 });
      }

      result = await callBackend(updatePayload);
    }

    if (!result.json?.success) {
      const message = String(result.json?.error || result.json?.message || "Could not update public visibility.");
      const status = /unauthorized|session expired/i.test(message) ? 401 : /access denied/i.test(message) ? 403 : 400;
      return NextResponse.json({ success: false, error: message }, { status });
    }

    return NextResponse.json(
      { success: true, data: result.json.data ?? { projectId, Public_Display: publicDisplay } },
      { status: result.response.ok ? 200 : result.response.status }
    );
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Could not update public visibility." }, { status: 502 });
  }
}
