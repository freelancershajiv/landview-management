import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const BACKEND_TIMEOUT_MS = 10_000;

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

function isExplicitSessionFailure(json: any) {
  if (json?.data?.authenticated === false) return true;
  if (json?.success !== false) return false;
  const message = String(json?.error || json?.message || "").trim().toLowerCase();
  return [
    "unauthorized",
    "session expired",
    "session expired.",
    "invalid session",
    "invalid session.",
    "authentication required",
    "authentication required.",
  ].includes(message);
}

function statusForMessage(message: string) {
  const normalized = String(message || "").trim().toLowerCase();
  if (["unauthorized", "session expired", "session expired.", "invalid session", "invalid session.", "authentication required", "authentication required."].includes(normalized)) return 401;
  if (/^access denied\b|permission required|access is required/.test(normalized)) return 403;
  return 400;
}

async function callBackend(payload: Record<string, unknown>) {
  const delays = [0, 250, 700];
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt]) await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
      });
      const text = await response.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        lastError = new Error(/^\s*</.test(text) ? "Apps Script returned HTML instead of JSON." : "Apps Script returned invalid JSON.");
        if (attempt < delays.length - 1) continue;
        throw lastError;
      }
      if (response.status >= 500 && attempt < delays.length - 1) {
        lastError = new Error(`Apps Script returned HTTP ${response.status}.`);
        continue;
      }
      return { response, json };
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error || "Backend request failed."));
      if (attempt >= delays.length - 1) throw lastError;
    }
  }
  throw lastError || new Error("Unable to reach LAND VIEW backend.");
}

function cleanProjectSeed(projectId: string, source: any, drive: any) {
  const input = source && typeof source === "object" ? source : {};
  const driveData = drive && typeof drive === "object" ? drive : {};
  return {
    Project_ID: projectId,
    Legacy_File_ID: String(input.Legacy_File_ID || projectId.replace(/^LV-/i, "")).trim(),
    Project_Name: String(input.Project_Name || driveData.projectFolderName || projectId).trim(),
    Project_Type: String(input.Project_Type || "").trim(),
    Location: String(input.Location || "").trim(),
    Project_Area: String(input.Project_Area || "").trim(),
    Number_of_Stories: String(input.Number_of_Stories || "").trim(),
    Drive_Folder_ID: String(driveData.projectFolderId || "").trim(),
    Drive_Folder_URL: String(driveData.projectFolderUrl || "").trim(),
  };
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
    const commonAuth = {
      token,
      proxySecret: PROXY_SECRET,
      _clientKey: clientFingerprint,
    };

    const sessionCheck = await callBackend({ action: "getSession", ...commonAuth });
    if (!sessionCheck.json?.success || !sessionCheck.json?.data?.authenticated) {
      if (isExplicitSessionFailure(sessionCheck.json)) {
        return NextResponse.json({ success: false, error: "Your backend session has expired. Sign in again." }, { status: 401 });
      }
      return NextResponse.json(
        { success: false, error: String(sessionCheck.json?.error || sessionCheck.json?.message || "Could not validate your session.") },
        { status: 503 }
      );
    }

    const role = String(sessionCheck.json?.data?.user?.role || sessionCheck.json?.data?.user?.Role || "").trim().toLowerCase();
    if (role !== "admin" && role !== "manager") {
      return NextResponse.json({ success: false, error: "Admin or Manager access is required." }, { status: 403 });
    }

    const updatePayload = {
      action: "updateProject",
      projectId,
      Public_Display: publicDisplay,
      ...commonAuth,
    };

    let result = await callBackend(updatePayload);
    const initialMessage = String(result.json?.error || result.json?.message || "");

    // Auto Invoice + Drive are the project sources. The LAND VIEW Projects sheet
    // receives a minimal row only when portal-specific state is first required.
    // Do not use importLegacyBillingBatch here: older live Apps Script deployments
    // do not expose that migration helper.
    if (!result.json?.success && /project not found/i.test(initialMessage)) {
      const driveLookup = await callBackend({
        action: "getProjectServiceFolders",
        projectId,
        ...commonAuth,
      });
      const drive = driveLookup.json?.data || {};
      if (!driveLookup.json?.success || drive?.found === false || !String(drive?.projectFolderUrl || "").trim()) {
        return NextResponse.json(
          { success: false, error: `${projectId} does not have a project folder in LAND VIEW Drive. Create/move the project folder manually first, then refresh Projects.` },
          { status: 400 }
        );
      }

      const seed = cleanProjectSeed(projectId, body?.project, drive);
      const created = await callBackend({
        action: "createProject",
        ...seed,
        ...commonAuth,
      });
      if (!created.json?.success) {
        const message = String(created.json?.error || created.json?.message || `Could not register ${projectId} for portal controls.`);
        return NextResponse.json({ success: false, error: message }, { status: statusForMessage(message) });
      }

      result = await callBackend(updatePayload);
    }

    if (!result.json?.success) {
      const message = String(result.json?.error || result.json?.message || "Could not update public visibility.");
      return NextResponse.json({ success: false, error: message }, { status: statusForMessage(message) });
    }

    return NextResponse.json(
      { success: true, data: result.json.data ?? { projectId, Public_Display: publicDisplay } },
      { status: result.response.ok ? 200 : result.response.status }
    );
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Could not update public visibility." }, { status: 502 });
  }
}
