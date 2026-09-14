import { NextRequest, NextResponse } from "next/server";
import { signProjectVerification } from "@/lib/billing-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "landview_session";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

function cleanText(value: unknown, max = 80) {
  return String(value ?? "").trim().slice(0, max);
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

async function backend(token: string, action: string, payload: Record<string, unknown> = {}) {
  if (!APPS_SCRIPT_URL || !PROXY_SECRET) throw new Error("LAND VIEW backend is not configured.");
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, proxySecret: PROXY_SECRET, token, ...payload }),
    cache: "no-store",
    redirect: "follow",
  });
  const raw = await response.text();
  let json: any;
  try { json = JSON.parse(raw); } catch { throw new Error("LAND VIEW backend returned an invalid response."); }
  if (!json?.success) throw new Error(String(json?.error || json?.message || "LAND VIEW backend request failed."));
  return json.data || {};
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

    // Only authenticated LAND VIEW users may generate/print the permanent QR.
    // Scanning the finished QR is public and read-only.
    const session = await backend(sessionToken, "getSession");
    const user = session?.user || {};
    const role = cleanText(user?.role || user?.Role, 30).toLowerCase().replace(/\s+/g, "");

    if (role === "client") {
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
    const status = /unauthorized|session|access|role/i.test(message) ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
