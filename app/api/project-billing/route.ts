import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const BACKEND_TIMEOUT_MS = 10_000;
const INVOICE_TABS = [
  "Summary",
  "File List",
  "Design Bill",
  "Design Deposit",
  "Supervision Bill",
  "S Deposit",
  "Others Bill",
  "Others Bill Deposit",
] as const;

function requiredEnv() {
  if (!APPS_SCRIPT_URL) throw new Error("LAND_VIEW_API_URL is not configured.");
  if (!PROXY_SECRET) throw new Error("LAND_VIEW_PROXY_SECRET is not configured.");
}

function normalizeProjectId(value: string | null) {
  const match = String(value || "").trim().match(/^(?:LV\s*-?\s*)?0*(\d+)$/i);
  return match ? `LV-${Number(match[1])}` : "";
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", PROXY_SECRET).update(forwarded).digest("hex").slice(0, 32);
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
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error || "Backend request failed."));
      if (attempt >= delays.length - 1) throw lastError;
    }
  }

  throw lastError || new Error("Unable to reach LAND VIEW backend.");
}

function commonPayload(request: NextRequest, token: string) {
  return {
    token,
    proxySecret: PROXY_SECRET,
    _clientKey: clientKey(request),
  };
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

function statusForError(message: string) {
  const normalized = String(message || "").trim().toLowerCase();
  if (["unauthorized", "session expired", "session expired.", "invalid session", "invalid session.", "authentication required", "authentication required."].includes(normalized)) return 401;
  if (/^access denied\b|permission required|access is required/.test(normalized)) return 403;
  return 502;
}

export async function GET(request: NextRequest) {
  try {
    requiredEnv();
    const projectId = normalizeProjectId(request.nextUrl.searchParams.get("fileId"));
    if (!projectId) {
      return NextResponse.json({ success: false, error: "Enter a valid File ID such as LV-209." }, { status: 400 });
    }

    const token = request.cookies.get(COOKIE_NAME)?.value || "";
    if (!token) {
      return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    }

    const common = commonPayload(request, token);

    const bundled = await callBackend({
      ...common,
      action: "getFinanceSheet",
      bundle: "projectBilling",
      projectId,
    });

    if (bundled.json?.success && Array.isArray(bundled.json?.data?.sheets)) {
      return NextResponse.json(
        { success: true, data: { ...bundled.json.data, mode: "project-bundle" } },
        { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
      );
    }

    if (!bundled.json?.success && isExplicitSessionFailure(bundled.json)) {
      return NextResponse.json(
        { success: false, error: String(bundled.json?.error || bundled.json?.message || "Session expired.") },
        { status: 401 },
      );
    }

    const sheetRequests = INVOICE_TABS.map(async (tab) => {
      const { json } = await callBackend({ ...common, action: "getFinanceSheet", tab });
      if (!json?.success || !json?.data) throw new Error(String(json?.error || json?.message || `Could not load ${tab}.`));
      return json.data;
    });
    const paymentsRequest = callBackend({ ...common, action: "getPayments", projectId })
      .then(({ json }) => (json?.success && Array.isArray(json?.data) ? json.data : []))
      .catch(() => []);

    const [sheets, payments] = await Promise.all([
      Promise.all(sheetRequests),
      paymentsRequest,
    ]);

    return NextResponse.json(
      {
        success: true,
        data: {
          projectId,
          sheets,
          payments,
          updatedAt: new Date().toISOString(),
          mode: "compatibility-aggregate",
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load project billing.";
    return NextResponse.json({ success: false, error: message }, { status: statusForError(message) });
  }
}
