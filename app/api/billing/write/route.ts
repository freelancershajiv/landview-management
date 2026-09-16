import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "landview_session";
const QUICK_USER_COOKIE = "landview_quick_user";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

type WorkspaceUser = {
  role?: string;
  Role?: string;
  [key: string]: unknown;
};

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function cleanKey(value: unknown) {
  const key = String(value ?? "").trim();
  return /^[A-Za-z0-9._:-]{12,120}$/.test(key) ? key : "";
}

function secureEqual(a: string, b: string) {
  const aa = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function signedWorkspaceUser(value: string | undefined): WorkspaceUser | null {
  if (!PROXY_SECRET) return null;
  const text = String(value || "");
  const dot = text.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = text.slice(0, dot);
  const signature = text.slice(dot + 1);
  const expected = createHmac("sha256", PROXY_SECRET).update(`quick-user|${payload}`).digest("hex");
  if (!secureEqual(signature, expected)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as WorkspaceUser;
  } catch {
    return null;
  }
}

function roleOf(user: WorkspaceUser | null | undefined) {
  return String(user?.role || user?.Role || "").trim().toLowerCase();
}

async function backendPost(payload: Record<string, unknown>, timeoutMs = 20_000) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(/^\s*</.test(raw) ? "Apps Script returned HTML instead of JSON." : "Apps Script returned invalid JSON.");
  }
  return { response, json };
}

function paymentIdOf(json: any) {
  const data = json?.data || {};
  return String(data.Payment_ID || data["Payment ID"] || data.paymentId || "").trim();
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    if (!APPS_SCRIPT_URL || !PROXY_SECRET) return NextResponse.json({ success: false, error: "LAND VIEW backend is not configured." }, { status: 503 });

    const token = request.cookies.get(SESSION_COOKIE)?.value || "";
    if (!token) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });

    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "").trim();
    if (action !== "saveBill" && action !== "savePayment") {
      return NextResponse.json({ success: false, error: "Unsupported billing write action." }, { status: 400 });
    }

    const idempotencyKey = cleanKey(body.Idempotency_Key || body.idempotencyKey);
    if (!idempotencyKey) return NextResponse.json({ success: false, error: "A valid idempotency key is required." }, { status: 400 });

    const signedUser = signedWorkspaceUser(request.cookies.get(QUICK_USER_COOKIE)?.value);
    const masterAdmin = roleOf(signedUser) === "admin";

    // Money writes are deliberately sent exactly once. They are never retried here.
    const { response: backend, json } = await backendPost({
      ...body,
      action,
      token,
      proxySecret: PROXY_SECRET,
      Idempotency_Key: idempotencyKey,
    });

    const message = String(json?.error || json?.message || "Billing write failed.");
    if (!json?.success) {
      const status = /unauthorized|session/i.test(message) ? 401 : /access denied|permission/i.test(message) ? 403 : backend.ok ? 502 : backend.status;
      return NextResponse.json(json, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    if (action === "savePayment" && masterAdmin) {
      const paymentId = paymentIdOf(json);
      if (!paymentId) {
        return NextResponse.json({
          ...json,
          warning: "Payment was saved, but automatic Master Admin approval could not identify the payment record. Do not enter it again; review the saved payment instead.",
        }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
      }

      try {
        const { json: approval } = await backendPost({
          action: "reviewChairmanPendingApproval",
          approvalKey: `payment:${paymentId}`,
          source: "Payments",
          id: paymentId,
          status: "Approved",
          note: "Auto-approved by Master Admin. Awaiting EMP-0001 acknowledgement.",
          token,
          proxySecret: PROXY_SECRET,
        }, 15_000);

        if (!approval?.success) {
          return NextResponse.json({
            ...json,
            warning: `Payment ${paymentId} was saved, but automatic Master Admin approval did not complete. Do not enter it again; review this payment instead.`,
          }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
        }

        return NextResponse.json({
          ...json,
          data: { ...(json.data || {}), Approval_Status: "Approved", Acknowledgement_Status: "Unseen", Payment_ID: paymentId },
          autoApproved: true,
          acknowledgementRequiredBy: "EMP-0001",
        }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
      } catch {
        return NextResponse.json({
          ...json,
          warning: `Payment ${paymentId} was saved, but automatic Master Admin approval timed out. Do not enter it again; refresh and review this payment.`,
        }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
      }
    }

    return NextResponse.json(json, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "The billing write response timed out. Refresh Billing before trying again so you do not duplicate a transaction."
      : error instanceof Error ? error.message : "Billing write failed.";
    return NextResponse.json({ success: false, error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
