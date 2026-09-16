import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { signProjectVerification } from "@/lib/billing-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "landview_session";
const QUICK_USER_COOKIE = "landview_quick_user";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const BACKEND_TIMEOUT_MS = 12_000;
const RETRY_DELAYS_MS = [0, 250, 800];

function cleanText(value: unknown, max = 80) {
  return String(value ?? "").trim().slice(0, max);
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

function secureEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readSignedQuickUser(value: string | undefined) {
  if (!value || !PROXY_SECRET) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  const expected = createHmac("sha256", PROXY_SECRET).update(`quick-user|${payload}`).digest("hex");
  if (!secureEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function parseBackendResponse(response: Response) {
  const raw = await response.text();
  let json: any = null;
  try { json = JSON.parse(raw); } catch {}
  return { response, raw, json };
}

async function backend(token: string, action: string, payload: Record<string, unknown> = {}) {
  if (!APPS_SCRIPT_URL || !PROXY_SECRET) throw new Error("LAND VIEW backend is not configured.");
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const signal = AbortSignal.timeout(BACKEND_TIMEOUT_MS);
      const initial = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, proxySecret: PROXY_SECRET, token, ...payload }),
        cache: "no-store",
        redirect: "manual",
        signal,
      });

      let result = await parseBackendResponse(initial);
      if ([301, 302, 303].includes(initial.status)) {
        const location = initial.headers.get("location") || "";
        if (!location) throw new Error("LAND VIEW backend redirect was incomplete.");
        const redirected = await fetch(location, { method: "GET", cache: "no-store", redirect: "follow", signal });
        result = await parseBackendResponse(redirected);
      }

      if (result.json?.success) return result.json.data || {};
      if (result.json) {
        const message = String(result.json?.error || result.json?.message || `LAND VIEW backend request failed (${result.response.status}).`);
        const retryable = result.response.status === 429 || result.response.status >= 500;
        if (!retryable || attempt === RETRY_DELAYS_MS.length - 1) throw new Error(message);
        lastError = new Error(message);
        continue;
      }

      const retryable = result.response.status === 404 || result.response.status === 429 || result.response.status >= 500 || /^\s*</.test(result.raw);
      lastError = new Error("LAND VIEW backend returned an invalid response.");
      if (!retryable || attempt === RETRY_DELAYS_MS.length - 1) throw lastError;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error || "LAND VIEW backend request failed."));
      if (attempt === RETRY_DELAYS_MS.length - 1) throw lastError;
    }
  }

  throw lastError || new Error("LAND VIEW backend request failed.");
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    }

    const sessionToken = request.cookies.get(SESSION_COOKIE)?.value || "";
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }

    const input = await request.json();
    const fileId = cleanText(input?.fileId, 30).toUpperCase();
    if (!/^LV-\d+$/.test(fileId)) {
      return NextResponse.json({ success: false, error: "Invalid File ID." }, { status: 400 });
    }

    // The login route already stores a signed HttpOnly identity snapshot. For
    // internal workspace roles, verify that signature locally rather than doing
    // a fragile Apps Script getSession round trip merely to render the QR.
    let user = readSignedQuickUser(request.cookies.get(QUICK_USER_COOKIE)?.value) as any;
    if (!user) {
      const session = await backend(sessionToken, "getSession");
      user = session?.user || {};
    }
    const role = cleanText(user?.role || user?.Role, 30).toLowerCase().replace(/\s+/g, "");

    if (role === "client") {
      // Client authorization remains live and project-specific.
      const workspace = await backend(sessionToken, "getPublicProjects", { _clientPortal: "1", clientOp: "workspace" });
      const allowed = (workspace?.projects || []).some(
        (item: any) => cleanText(item?.projectId, 30).toUpperCase() === fileId,
      );
      if (!allowed) {
        return NextResponse.json({ success: false, error: "This project is not authorized for your client account." }, { status: 403 });
      }
    } else if (!["admin", "manager", "accounts"].includes(role)) {
      return NextResponse.json({ success: false, error: "Billing verification is not available for this role." }, { status: 403 });
    }

    // Deterministic: same project + same secret = same token forever.
    const token = signProjectVerification(fileId);
    const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const url = `${origin}/verify/${encodeURIComponent(token)}`;

    return NextResponse.json({ success: true, url, fileId, permanent: true }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: any) {
    const message = error?.message || "Could not create verification link.";
    const status = /unauthorized|session expired|authentication required|invalid session/i.test(message)
      ? 401
      : /access|role|authorized/i.test(message) ? 403 : 502;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
